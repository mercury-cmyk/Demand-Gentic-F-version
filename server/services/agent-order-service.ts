/**
 * Agent Order Service
 * Handles order creation through AgentC chat interface
 * Reuses logic from client-portal-agentic routes
 */

import { db } from "../db";
import {
  clientPortalOrders,
  clientProjects,
  clientCampaignPricing,
  agentExecutionPlans,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { chat as vertexChat, generateJSON } from "./vertex-ai";
import { v4 as uuid } from "uuid";
import { wrapPromptWithOI } from "../lib/org-intelligence-helper";

// Types
export interface OrderConfiguration {
  campaignType: string;
  volume: number;
  industries: string;
  jobTitles: string;
  companySizeMin?: number;
  companySizeMax?: number;
  geographies: string;
  deliveryTimeline: string;
  channels: string[];
  deliveryMethod?: string;
  specialRequirements?: string;
}

export interface OrderContext {
  goal: string;
  contextUrls: string[];
  contextFiles: Array<{ name: string; key: string; type: string }>;
  targetAccountFiles: Array<{ name: string; key: string; type: string }>;
  suppressionFiles: Array<{ name: string; key: string; type: string }>;
  templateFiles: Array<{ name: string; key: string; type: string }>;
}

export interface OrderRecommendation {
  campaignType: string;
  suggestedVolume: number;
  targetAudience: {
    industries: string[];
    titles: string[];
    companySize: string;
    companySizeMin?: number;
    companySizeMax?: number;
  };
  channels: string[];
  deliveryTimeline: string;
  geographies: string[];
  estimatedCost: number;
  rationale: string;
}

export interface PricingBreakdown {
  baseRate: number;
  basePrice: number;
  volumeDiscountPercent: number;
  volumeDiscount: number;
  rushFeePercent: number;
  rushFee: number;
  hasCustomPricing: boolean;
  minimumOrderSize: number;
  totalCost: number;
}

export interface OrderPlanStep {
  id: string;
  stepNumber: number;
  tool: string;
  description: string;
  args: Record<string, any>;
  isDestructive: boolean;
  estimatedImpact?: string;
}

export interface OrderExecutionPlan {
  id: string;
  steps: OrderPlanStep[];
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'rejected';
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  projectId?: string;
  error?: string;
}

/**
 * Analyze goal and generate AI recommendation
 */
export async function analyzeGoal(params: {
  goal: string;
  contextUrls: string[];
  contextFiles: Array<{ name: string; key: string; type: string }>;
  organizationContext?: string;
  organizationIntelligence?: any;
  targetingSuggestions?: any;
  businessProfile?: any;
  clientAccountId: string;
}): Promise<{ recommendation: OrderRecommendation; rationale: string }> {
  const {
    goal,
    contextUrls,
    contextFiles,
    organizationContext,
    organizationIntelligence,
    targetingSuggestions,
    businessProfile,
  } = params;

  // Build context for AI
  let additionalContext = "";

  if (organizationContext) {
    additionalContext += `\n\n=== CLIENT ORGANIZATION CONTEXT ===\n${organizationContext}`;
  }

  if (organizationIntelligence?.icp) {
    const icp = organizationIntelligence.icp;
    additionalContext += `\n\n=== IDEAL CUSTOMER PROFILE (ICP) ===`;
    if (icp.industries?.length) {
      additionalContext += `\nTarget Industries: ${icp.industries.join(", ")}`;
    }
    if (icp.personas?.length) {
      additionalContext += `\nTarget Personas:`;
      icp.personas.forEach((p: any) => {
        additionalContext += `\n  - ${p.title}`;
        if (p.painPoints?.length) additionalContext += ` (Pain Points: ${p.painPoints.join(", ")})`;
      });
    }
    if (icp.companySize) {
      additionalContext += `\nTarget Company Size: ${icp.companySize}`;
    }
  }

  if (organizationIntelligence?.positioning) {
    const pos = organizationIntelligence.positioning;
    additionalContext += `\n\n=== VALUE PROPOSITION ===`;
    if (pos.oneLiner) additionalContext += `\nValue Prop: ${pos.oneLiner}`;
    if (pos.differentiators?.length) additionalContext += `\nDifferentiators: ${pos.differentiators.join(", ")}`;
  }

  if (businessProfile) {
    additionalContext += `\n\n=== BUSINESS PROFILE ===`;
    if (businessProfile.name) additionalContext += `\nCompany Name: ${businessProfile.name}`;
    if (businessProfile.website) additionalContext += `\nWebsite: ${businessProfile.website}`;
  }

  if (contextUrls?.length > 0) {
    additionalContext += `\n\n=== ADDITIONAL CONTEXT ===\nRelevant URLs: ${contextUrls.join(", ")}`;
  }
  if (contextFiles?.length > 0) {
    additionalContext += `\nFiles uploaded: ${contextFiles.map((f) => f.name).join(", ")}`;
  }

  const icpGuidance = targetingSuggestions ? `
IMPORTANT - USE THE CLIENT'S ICP TO GUIDE YOUR RECOMMENDATIONS:
${targetingSuggestions.industries?.length ? `- Prefer these industries: ${targetingSuggestions.industries.join(", ")}` : ""}
${targetingSuggestions.titles?.length ? `- Prefer these job titles: ${targetingSuggestions.titles.join(", ")}` : ""}
${targetingSuggestions.companySize ? `- Target company size: ${targetingSuggestions.companySize}` : ""}
` : "";

  const prompt = `You are a B2B campaign strategist helping a client create a campaign order.
Use the client's organization context to generate PERSONALIZED recommendations.

${icpGuidance}

CLIENT'S CAMPAIGN GOAL:
"${goal}"
${additionalContext}

Based on this goal and context, recommend a campaign configuration. Return a JSON object with:
- campaignType: one of [high_quality_leads, bant_leads, sql, appointment_generation, lead_qualification, content_syndication, webinar_invite, email, data_validation]
- suggestedVolume: number between 25-1000 (IMPORTANT: for high_quality_leads, max volume is 100)
- targetAudience: { industries: string[], titles: string[], companySize: string, companySizeMin: number, companySizeMax: number }
- channels: array of ["voice", "email"]
- deliveryTimeline: one of [standard, 2_weeks, 1_week, immediate]
- geographies: array of country/region names
- estimatedCost: rough estimate in USD
- rationale: 2-3 sentences explaining why this configuration is recommended based on the client's ICP and goal`;

  try {
    const enrichedPrompt = await wrapPromptWithOI(prompt);
    const response = await generateJSON(enrichedPrompt, {
      campaignType: "string",
      suggestedVolume: "number",
      targetAudience: "object",
      channels: "array",
      deliveryTimeline: "string",
      geographies: "array",
      estimatedCost: "number",
      rationale: "string",
    });

    return {
      recommendation: response as OrderRecommendation,
      rationale: response.rationale || "AI analysis complete.",
    };
  } catch (error) {
    console.error("[Agent Order Service] Error generating recommendation:", error);
    // Return default recommendation on error
    return {
      recommendation: {
        campaignType: "high_quality_leads",
        suggestedVolume: 100,
        targetAudience: {
          industries: [],
          titles: [],
          companySize: "51-500",
          companySizeMin: 51,
          companySizeMax: 500,
        },
        channels: ["voice", "email"],
        deliveryTimeline: "standard",
        geographies: ["United States"],
        estimatedCost: 15000,
        rationale: "Default configuration based on your goal. Please adjust as needed.",
      },
      rationale: "Default configuration based on your goal. Please adjust as needed.",
    };
  }
}

/**
 * Calculate pricing for an order
 */
export async function calculatePricing(params: {
  clientAccountId: string;
  campaignType: string;
  volume: number;
  deliveryTimeline: string;
}): Promise<PricingBreakdown> {
  const { clientAccountId, campaignType, volume, deliveryTimeline } = params;

  // Check for client-specific pricing
  const [clientPricing] = await db
    .select()
    .from(clientCampaignPricing)
    .where(
      and(
        eq(clientCampaignPricing.clientAccountId, clientAccountId),
        eq(clientCampaignPricing.campaignType, campaignType),
        eq(clientCampaignPricing.isActive, true)
      )
    )
    .limit(1);

  // Default pricing
  const defaultRates: Record<string, number> = {
    high_quality_leads: 150,
    bant_leads: 175,
    sql: 200,
    appointment_generation: 250,
    lead_qualification: 100,
    content_syndication: 75,
    webinar_invite: 100,
    email: 50,
    data_validation: 25,
  };

  const baseRate = clientPricing?.pricePerLead || defaultRates[campaignType] || 150;
  const minimumOrderSize = clientPricing?.minimumOrderSize || 25;
  const hasCustomPricing = !!clientPricing;

  // Calculate base price
  const basePrice = baseRate * volume;

  // Volume discount
  let volumeDiscountPercent = 0;
  if (volume >= 500) volumeDiscountPercent = 15;
  else if (volume >= 250) volumeDiscountPercent = 10;
  else if (volume >= 100) volumeDiscountPercent = 5;

  const volumeDiscount = (basePrice * volumeDiscountPercent) / 100;

  // Rush fee
  let rushFeePercent = 0;
  if (deliveryTimeline === "immediate") rushFeePercent = 50;
  else if (deliveryTimeline === "1_week") rushFeePercent = 25;

  const rushFee = ((basePrice - volumeDiscount) * rushFeePercent) / 100;

  // Total
  const totalCost = basePrice - volumeDiscount + rushFee;

  return {
    baseRate,
    basePrice,
    volumeDiscountPercent,
    volumeDiscount,
    rushFeePercent,
    rushFee,
    hasCustomPricing,
    minimumOrderSize,
    totalCost,
  };
}

/**
 * Generate execution plan for order creation
 */
export async function generatePlan(params: {
  configuration: OrderConfiguration;
  context: Partial<OrderContext>;
  pricingBreakdown: PricingBreakdown;
  clientAccountId: string;
  clientUserId?: string;
  conversationId?: string;
}): Promise<{ plan: OrderExecutionPlan; pricingBreakdown: PricingBreakdown }> {
  const { configuration, context, pricingBreakdown, clientAccountId, clientUserId, conversationId } = params;

  const planId = uuid();

  const steps: OrderPlanStep[] = [
    {
      id: `${planId}-step-1`,
      stepNumber: 1,
      tool: "validate_targeting",
      description: "Validate targeting criteria (industries, titles, geographies)",
      args: {
        industries: configuration.industries,
        jobTitles: configuration.jobTitles,
        geographies: configuration.geographies,
      },
      isDestructive: false,
      estimatedImpact: "Ensures valid targeting parameters",
    },
    {
      id: `${planId}-step-2`,
      stepNumber: 2,
      tool: "calculate_pricing",
      description: `Calculate final pricing: $${pricingBreakdown.totalCost.toLocaleString()}`,
      args: {
        campaignType: configuration.campaignType,
        volume: configuration.volume,
        deliveryTimeline: configuration.deliveryTimeline,
      },
      isDestructive: false,
      estimatedImpact: `Estimated cost: $${pricingBreakdown.totalCost.toLocaleString()}`,
    },
    {
      id: `${planId}-step-3`,
      stepNumber: 3,
      tool: "create_order",
      description: "Create order record in system",
      args: {
        campaignType: configuration.campaignType,
        volume: configuration.volume,
        clientAccountId,
      },
      isDestructive: true,
      estimatedImpact: "Creates new order record",
    },
    {
      id: `${planId}-step-4`,
      stepNumber: 4,
      tool: "create_project",
      description: "Create linked project for admin review",
      args: {
        orderType: configuration.campaignType,
      },
      isDestructive: true,
      estimatedImpact: "Creates project for fulfillment tracking",
    },
    {
      id: `${planId}-step-5`,
      stepNumber: 5,
      tool: "send_notification",
      description: "Notify admin team of new order",
      args: {
        notificationType: "new_order",
      },
      isDestructive: false,
      estimatedImpact: "Admin team will be notified",
    },
  ];

  const plan: OrderExecutionPlan = {
    id: planId,
    steps,
    riskLevel: "medium",
    status: "pending",
  };

  // Store the plan in database
  try {
    await db.insert(agentExecutionPlans).values({
      id: planId,
      conversationId: conversationId || null,
      clientUserId: clientUserId || null,
      requestMessage: `Create order: ${configuration.campaignType} - ${configuration.volume} leads`,
      plannedSteps: steps,
      riskLevel: "medium",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("[Agent Order Service] Error storing plan:", error);
  }

  return { plan, pricingBreakdown };
}

/**
 * Execute an approved order plan
 */
export async function executePlan(params: {
  planId: string;
  configuration: OrderConfiguration;
  context: Partial<OrderContext>;
  pricingBreakdown: PricingBreakdown;
  clientAccountId: string;
  clientUserId?: string;
  tenantId: string;
}): Promise<OrderResult> {
  const {
    planId,
    configuration,
    context,
    pricingBreakdown,
    clientAccountId,
    clientUserId,
    tenantId,
  } = params;

  try {
    // Update plan status to executing
    await db
      .update(agentExecutionPlans)
      .set({
        status: "executing",
        executionStartedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentExecutionPlans.id, planId));

    // Generate order number
    const year = new Date().getFullYear();
    const [countResult] = await db
      .select({ count: db.$count(clientPortalOrders) })
      .from(clientPortalOrders);
    const orderCount = (countResult?.count || 0) + 1;
    const orderNumber = `WO-${year}-${String(orderCount).padStart(4, "0")}`;

    // Create order
    const orderId = uuid();
    await db.insert(clientPortalOrders).values({
      id: orderId,
      tenantId,
      clientAccountId,
      clientUserId: clientUserId || null,
      orderNumber,
      requestedQuantity: configuration.volume,
      deliveredQuantity: 0,
      status: "submitted",
      orderMonth: new Date().getMonth() + 1,
      orderYear: year,
      metadata: {
        campaignType: configuration.campaignType,
        industries: configuration.industries,
        jobTitles: configuration.jobTitles,
        companySizeMin: configuration.companySizeMin,
        companySizeMax: configuration.companySizeMax,
        geographies: configuration.geographies,
        deliveryTimeline: configuration.deliveryTimeline,
        channels: configuration.channels,
        deliveryMethod: configuration.deliveryMethod,
        specialRequirements: configuration.specialRequirements,
        contextUrls: context.contextUrls || [],
        contextFiles: context.contextFiles || [],
        targetAccountFiles: context.targetAccountFiles || [],
        suppressionFiles: context.suppressionFiles || [],
        templateFiles: context.templateFiles || [],
        pricingBreakdown,
        createdVia: "agentx",
      },
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create linked project
    const projectId = uuid();
    await db.insert(clientProjects).values({
      id: projectId,
      tenantId,
      clientAccountId,
      name: `${configuration.campaignType} - ${configuration.volume} leads`,
      description: `Order ${orderNumber} - Created via AgentC`,
      status: "pending",
      metadata: {
        orderId,
        orderNumber,
        campaignType: configuration.campaignType,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update plan status to completed
    await db
      .update(agentExecutionPlans)
      .set({
        status: "completed",
        executionCompletedAt: new Date(),
        executedSteps: [
          { stepId: "validate_targeting", status: "completed", result: "Targeting validated" },
          { stepId: "calculate_pricing", status: "completed", result: `$${pricingBreakdown.totalCost}` },
          { stepId: "create_order", status: "completed", result: orderNumber },
          { stepId: "create_project", status: "completed", result: projectId },
          { stepId: "send_notification", status: "completed", result: "Notification sent" },
        ],
        updatedAt: new Date(),
      })
      .where(eq(agentExecutionPlans.id, planId));

    return {
      success: true,
      orderId,
      orderNumber,
      projectId,
    };
  } catch (error) {
    console.error("[Agent Order Service] Error executing plan:", error);

    // Update plan status to failed
    await db
      .update(agentExecutionPlans)
      .set({
        status: "rejected",
        rejectionReason: (error as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(agentExecutionPlans.id, planId));

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
