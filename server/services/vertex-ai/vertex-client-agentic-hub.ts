/**
 * Vertex AI Client Agentic Hub
 *
 * Comprehensive agentic services for client self-service capabilities:
 * - Campaign Order Agent: Autonomous campaign ordering
 * - Voice Simulation Agent: Campaign-level voice simulations with Gemini Live
 * - Email Generation Agent: AI-powered email creation
 * - Image Generation Agent: Agentic creative asset generation
 * - Reporting Agent: Client-specific campaign analysis & reports
 * - Campaign Setup Agent: Agentic campaign creation from goals
 * - Billing Agent: Usage tracking and invoice generation
 *
 * Powered by Google Cloud Vertex AI (Gemini 3 Flash, Gemini Live, Imagen 3)
 */

import { EventEmitter } from "events";
import {
  chat,
  generateJSON,
  reason,
  generateWithFunctions,
  generateImage,
  streamChat,
  type ChatMessage,
  type FunctionDeclaration,
  type GenerationOptions,
} from "./vertex-client";
import { db } from "../../db";
import { enrichCampaignQADefaults } from "../../lib/campaign-qa-defaults";
import {
  campaigns,
  accounts,
  contacts,
  clientAccounts,
  clientPortalOrders,
  clientCampaignAccess,
  virtualAgents,
  clientProjects,
  verificationCampaigns,
  campaignIntakeRequests,
} from "@shared/schema";
import { eq, and, or, desc, sql, gte, lte, count, sum } from "drizzle-orm";
import { notificationService } from "../notification-service";
import { notificationService as mercuryNotificationService } from "../mercury";
import { wrapPromptWithOI } from "../../lib/org-intelligence-helper";

// ==================== TYPES ====================

export interface ClientAgenticContext {
  clientAccountId: string;
  clientUserId: string;
  clientName?: string;
  permissions?: string[];
}

export interface AgentResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  reasoning?: string;
  suggestedActions?: string[];
  navigateTo?: string;
}

// Campaign Order Types
export interface CampaignOrderRequest {
  campaignType: string;
  targetAudience: TargetAudienceCriteria;
  volumeRequested: number;
  deliveryTimeline: "immediate" | "1_week" | "2_weeks" | "1_month" | "custom";
  customTimeline?: string;
  budget?: number;
  specialRequirements?: string;
  channels: ("voice" | "email" | "both")[];
  contextUrls?: string[];
  contextFiles?: { name: string; key: string; url?: string }[];
  targetAccountFiles?: { name: string; key: string; url?: string }[];
  suppressionFiles?: { name: string; key: string; url?: string }[];
}

export interface TargetAudienceCriteria {
  industries?: string[];
  jobTitles?: string[];
  companySizeMin?: number;
  companySizeMax?: number;
  geographies?: string[];
  excludeCompetitors?: string[];
  additionalCriteria?: string;
}

export interface CampaignOrderResult {
  orderId: string;
  orderNumber: string;
  estimatedDeliveryDate: Date;
  estimatedCost: number;
  breakdown: {
    basePrice: number;
    volumeDiscount?: number;
    rushFee?: number;
    total: number;
  };
  status: "pending_approval" | "approved" | "processing" | "completed";
}

// Voice Simulation Types
export interface VoiceSimulationRequest {
  campaignId: string;
  scenarioType: "cold_call" | "follow_up" | "qualification" | "objection_handling" | "demo_request";
  persona: SimulationPersona;
  customScenario?: string;
  recordSimulation?: boolean;
}

export interface SimulationPersona {
  role: "decision_maker" | "gatekeeper" | "influencer" | "end_user";
  attitude: "friendly" | "busy" | "skeptical" | "interested" | "hostile";
  industry?: string;
  painPoints?: string[];
}

export interface VoiceSimulationResult {
  simulationId: string;
  transcript: string;
  audioUrl?: string;
  analysis: {
    objectionCount: number;
    successfulResponses: number;
    missedOpportunities: string[];
    strengthAreas: string[];
    improvementAreas: string[];
    overallScore: number;
  };
  recommendations: string[];
}

// Email Generation Types
export interface EmailGenerationRequest {
  campaignId?: string;
  emailType: "cold_outreach" | "follow_up" | "nurture" | "event_invite" | "case_study" | "product_announcement";
  tone: "professional" | "friendly" | "urgent" | "consultative";
  targetPersona?: {
    title: string;
    industry: string;
    painPoints: string[];
  };
  valueProposition?: string;
  callToAction?: string;
  personalizationLevel?: 1 | 2 | 3;
  generateVariants?: number;
}

export interface GeneratedEmail {
  subject: string;
  preheader?: string;
  body: string;
  personalizationTokens: string[];
  estimatedReadTime: string;
  spamScore: number;
}

// Image Generation Types
export interface ImageGenerationRequest {
  purpose: "email_header" | "social_post" | "ad_creative" | "landing_page" | "presentation";
  style: "professional" | "modern" | "minimalist" | "bold" | "creative";
  brandColors?: string[];
  description: string;
  includeText?: string;
  aspectRatio: "16:9" | "1:1" | "4:3" | "9:16";
  variants?: number;
}

export interface GeneratedImage {
  imageId: string;
  imageUrl: string;
  prompt: string;
  refinedPrompt: string;
}

// Report Types
export interface ReportRequest {
  reportType: "campaign_performance" | "lead_quality" | "roi_analysis" | "pipeline_velocity" | "engagement_metrics" | "custom";
  campaignIds?: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  metrics?: string[];
  format: "summary" | "detailed" | "executive";
  includeRecommendations?: boolean;
}

export interface CampaignReport {
  reportId: string;
  title: string;
  generatedAt: Date;
  summary: string;
  metrics: Record<string, any>;
  charts: ChartData[];
  insights: ReportInsight[];
  recommendations: string[];
  rawData?: any;
}

export interface ChartData {
  type: "line" | "bar" | "pie" | "funnel";
  title: string;
  data: any[];
}

export interface ReportInsight {
  type: "positive" | "negative" | "neutral";
  insight: string;
  impact: "high" | "medium" | "low";
  actionable: boolean;
}

// ==================== CLIENT AGENTIC HUB CLASS ====================

export class VertexClientAgenticHub extends EventEmitter {
  private context: ClientAgenticContext;
  private conversationHistory: ChatMessage[] = [];

  constructor(context: ClientAgenticContext) {
    super();
    this.context = context;
  }

  private async assertCampaignAccess(campaignId: string) {
    // 1. Try regular campaigns via clientCampaignAccess (both regularCampaignId and campaignId)
    const [regularRecord] = await db
      .select({ campaign: campaigns })
      .from(campaigns)
      .innerJoin(
        clientCampaignAccess,
        and(
          eq(clientCampaignAccess.clientAccountId, this.context.clientAccountId),
          or(
            eq(clientCampaignAccess.regularCampaignId, campaigns.id),
            eq(clientCampaignAccess.campaignId, campaigns.id)
          )
        )
      )
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (regularRecord) {
      return regularRecord.campaign;
    }

    // 2. Try direct campaign ownership (campaigns.clientAccountId)
    const [directRecord] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.clientAccountId, this.context.clientAccountId)))
      .limit(1);

    if (directRecord) {
      return directRecord;
    }

    // 3. Try verification campaigns
    const [verificationRecord] = await db
      .select({ campaign: verificationCampaigns })
      .from(verificationCampaigns)
      .innerJoin(
        clientCampaignAccess,
        and(
          eq(clientCampaignAccess.clientAccountId, this.context.clientAccountId),
          eq(clientCampaignAccess.campaignId, verificationCampaigns.id)
        )
      )
      .where(eq(verificationCampaigns.id, campaignId))
      .limit(1);

    if (verificationRecord) {
      return verificationRecord.campaign;
    }

    throw new Error("Campaign not found or access denied");
  }

  private formatCampaignValue(value: unknown): string {
    if (!value) return "Not specified";

    if (Array.isArray(value)) {
      const items = value
        .map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item;
          if (typeof item === "object") {
            const objection = (item as { objection?: string }).objection;
            const response = (item as { response?: string }).response;
            if (objection) {
              return response ? `${objection} -> ${response}` : objection;
            }
            return JSON.stringify(item);
          }
          return String(item);
        })
        .filter(Boolean);

      return items.length ? items.join(", ") : "Not specified";
    }

    if (typeof value === "string") return value;

    return JSON.stringify(value);
  }

  // ==================== CAMPAIGN ORDER AGENT ====================

  /**
   * Create a campaign order with AI-powered optimization
   */
  async createCampaignOrder(request: CampaignOrderRequest): Promise<AgentResponse<CampaignOrderResult>> {
    this.emit("agent:action", "campaign_order", "Creating campaign order...");

    try {
      // Step 1: Analyze and validate the request
      const analysisPrompt = `You are a B2B demand generation strategist. Analyze this campaign order request and provide recommendations.

REQUEST:
- Campaign Type: ${request.campaignType}
- Target Audience:
  - Industries: ${request.targetAudience.industries?.join(", ") || "Not specified"}
  - Job Titles: ${request.targetAudience.jobTitles?.join(", ") || "Not specified"}
  - Company Size: ${request.targetAudience.companySizeMin || "Any"} - ${request.targetAudience.companySizeMax || "Any"}
  - Geographies: ${request.targetAudience.geographies?.join(", ") || "Not specified"}
- Volume Requested: ${request.volumeRequested}
- Delivery Timeline: ${request.deliveryTimeline}
- Budget: ${request.budget ? `$${request.budget}` : "Not specified"}
- Channels: ${request.channels.join(", ")}
- Special Requirements: ${request.specialRequirements || "None"}

ANALYZE:
1. Is the volume realistic for the audience criteria?
2. Is the timeline achievable?
3. What are the estimated costs?
4. Any recommendations for optimization?

Return JSON:
{
  "isValid": true/false,
  "validationNotes": "any issues or concerns",
  "estimatedCost": number,
  "costBreakdown": {
    "basePrice": number,
    "volumeDiscount": number,
    "rushFee": number,
    "total": number
  },
  "estimatedDeliveryDays": number,
  "recommendations": ["recommendation 1", "recommendation 2"],
  "optimizedCriteria": { ... any suggested improvements }
}`;

      const enrichedAnalysisPrompt = await wrapPromptWithOI(analysisPrompt);
      let analysis = await generateJSON<{
        isValid: boolean;
        validationNotes: string;
        estimatedCost: number;
        costBreakdown: { basePrice: number; volumeDiscount: number; rushFee: number; total: number };
        estimatedDeliveryDays: number;
        recommendations: string[];
        optimizedCriteria?: any;
      }>(enrichedAnalysisPrompt, { temperature: 0.2 });

      console.log('[VertexClientAgenticHub] Order analysis result:', JSON.stringify(analysis, null, 2));

      // Handle potential array response from LLM
      if (Array.isArray(analysis)) {
        // @ts-ignore
        analysis = analysis[0];
      }

      if (!analysis.isValid) {
        return {
          success: false,
          message: `Order validation failed: ${analysis.validationNotes || "No specific validation notes provided."}`,
          reasoning: analysis.validationNotes || "Order deemed invalid by AI analysis.",
          suggestedActions: analysis.recommendations || [],
        };
      }

      // Step 2: Create the order in the database
      const orderNumber = `ORD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const estimatedDeliveryDate = new Date();
      estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + analysis.estimatedDeliveryDays);

      // Map campaign type to schema enum
      let mappedCampaignType = request.campaignType; 
      switch (request.campaignType) {
        case 'lead_generation': mappedCampaignType = 'high_quality_leads'; break;
        case 'event_registration': mappedCampaignType = 'webinar_invite'; break;
        case 'demo_booking': mappedCampaignType = 'appointment_generation'; break;
        case 'market_research': mappedCampaignType = 'data_validation'; break;
      }

      // Determine Project Type
      let projectType = 'custom';
      if (request.channels.includes('voice') && request.channels.includes('email')) projectType = 'combo';
      else if (request.channels.includes('voice')) projectType = 'call_campaign';
      else if (request.channels.includes('email')) projectType = 'email_campaign';

      // 1. Create Client Project
      const [project] = await db.insert(clientProjects).values({
        clientAccountId: this.context.clientAccountId,
        name: `Agentic Request: ${request.campaignType} - ${orderNumber}`,
        description: `PENDING APPROVAL - Auto-generated from Order #${orderNumber}. 
        Target Audience: ${request.targetAudience.industries?.join(', ') || 'N/A'} - ${request.targetAudience.jobTitles?.join(', ') || 'N/A'}
        Budget: ${request.budget || 'N/A'}, Volume: ${request.volumeRequested}`,
        status: 'pending',
        requestedLeadCount: request.volumeRequested,
        budgetAmount: request.budget ? request.budget.toString() : null,
        startDate: new Date(),
        endDate: estimatedDeliveryDate,
        projectType: projectType as any
      }).returning();

      // 2. Create Agentic Campaign with auto-generated QA defaults
      const [campaign] = await db.insert(campaigns).values(enrichCampaignQADefaults({
        type: mappedCampaignType as any,
        name: `Campaign - ${orderNumber}`,
        clientAccountId: this.context.clientAccountId,
        projectId: project.id,
        status: 'draft',
        approvalStatus: 'in_review',
        targetQualifiedLeads: request.volumeRequested,
        dialMode: 'ai_agent',
        startDate: new Date(),
      })).returning();

      // 3. Create Verification Campaign (to satisfy default schema FK)
      const [verifCampaign] = await db.insert(verificationCampaigns).values({
        name: `Order ${orderNumber} - Verification`,
        status: 'active',
        monthlyTarget: request.volumeRequested
      }).returning();

      const [order] = await db
        .insert(clientPortalOrders)
        .values({
          clientAccountId: this.context.clientAccountId,
          orderNumber,
          campaignId: verifCampaign.id,
          requestedQuantity: request.volumeRequested,
          deliveredQuantity: 0,
          status: "submitted",
          orderMonth: new Date().getMonth() + 1,
          orderYear: new Date().getFullYear(),
          clientUserId: this.context.clientUserId,
          clientNotes: JSON.stringify({
            request,
            analysis: analysis.recommendations,
            estimatedCost: analysis.estimatedCost,
            projectId: project.id,
            agenticCampaignId: campaign.id
          }),
        })
        .returning();

      // 5. Create Campaign Intake Request for Admin Review
      const [intakeRequest] = await db.insert(campaignIntakeRequests).values({
        sourceType: 'client_agentic',
        clientAccountId: this.context.clientAccountId,
        clientOrderId: order.id,
        rawInput: JSON.stringify({
          campaignType: request.campaignType,
          targetAudience: request.targetAudience,
          specialRequirements: request.specialRequirements,
          channels: request.channels,
        }),
        extractedContext: {
          objective: request.campaignType,
          targetIndustries: request.targetAudience.industries || [],
          targetTitles: request.targetAudience.jobTitles || [],
          geographies: request.targetAudience.geographies || [],
          channels: request.channels,
          specialRequirements: request.specialRequirements,
        },
        contextSources: {
          urls: request.contextUrls || [],
          documents: request.contextFiles || [],
          targetAccountFiles: request.targetAccountFiles || [],
          suppressionFiles: request.suppressionFiles || [],
        },
        status: 'pending',
        priority: 'normal',
        campaignId: campaign.id,
        projectId: project.id,
        requestedStartDate: new Date(),
        requestedLeadCount: request.volumeRequested,
        estimatedCost: analysis.estimatedCost.toString(),
      }).returning();

      // Update project with intake request reference
      await db.update(clientProjects)
        .set({ intakeRequestId: intakeRequest.id })
        .where(eq(clientProjects.id, project.id));

      // 6. Notify admins of new order request
      try {
        const [clientAccount] = await db
          .select({ name: clientAccounts.name })
          .from(clientAccounts)
          .where(eq(clientAccounts.id, this.context.clientAccountId))
          .limit(1);

        await notificationService.notifyAdminOfNewOrder(
          order,
          clientAccount?.name || this.context.clientName || 'Unknown Client'
        );

        // Keep Agentic orders aligned with the Mercury notification bridge
        // used by other client order submission flows.
        mercuryNotificationService.dispatch({
          eventType: 'campaign_order_submitted',
          tenantId: this.context.clientAccountId,
          actorUserId: this.context.clientUserId || undefined,
          payload: {
            orderNumber: order.orderNumber,
            clientName: clientAccount?.name || this.context.clientName || 'Unknown Client',
            orderTitle: order.orderNumber,
            orderType: request.campaignType || 'campaign_order',
            priority: 'normal',
            targetLeadCount: String(order.requestedQuantity || ''),
            budget: request.budget ? `$${request.budget}` : '',
            description: request.specialRequirements || '',
            submittedAt: new Date().toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            }),
            adminLink: `${process.env.APP_BASE_URL || 'https://demandgentic.ai'}/admin/project-requests`,
          },
        }).catch(err => {
          console.error('[Client Agentic Hub] Mercury campaign_order_submitted error:', err.message);
        });
      } catch (notifyError) {
        console.error('[Client Agentic Hub] Failed to send admin order notification:', notifyError);
      }

      this.emit("agent:completed", "campaign_order", { order, intakeRequest });

      return {
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          intakeRequestId: intakeRequest.id,
          projectId: project.id,
          campaignId: campaign.id,
          estimatedDeliveryDate,
          estimatedCost: analysis.estimatedCost,
          breakdown: analysis.costBreakdown,
          status: "pending_approval",
        },
        message: `Campaign order ${orderNumber} created successfully. Your request has been submitted to the DemandGentic team for review. Estimated delivery: ${analysis.estimatedDeliveryDays} days. Estimated cost: $${analysis.estimatedCost.toLocaleString()}`,
        reasoning: analysis.validationNotes,
        suggestedActions: analysis.recommendations,
      };
    } catch (error: any) {
      this.emit("agent:error", "campaign_order", error);
      return {
        success: false,
        message: `Failed to create campaign order: ${error.message}`,
      };
    }
  }

  // ==================== VOICE SIMULATION AGENT ====================

  /**
   * Run a voice simulation for campaign testing with Gemini
   */
  async runVoiceSimulation(request: VoiceSimulationRequest): Promise<AgentResponse<VoiceSimulationResult>> {
    this.emit("agent:action", "voice_simulation", "Starting voice simulation...");

    try {
      // Fetch campaign details if provided (and accessible)
      let campaignContext = "";
      if (request.campaignId) {
        try {
          const campaign = await this.assertCampaignAccess(request.campaignId);
          campaignContext = `
CAMPAIGN CONTEXT:
- Name: ${campaign.name}
- Type: ${campaign.type}
- Description: ${campaign.description || "N/A"}
`;
        } catch (err: any) {
          return {
            success: false,
            message: err.message,
          };
        }
      }

      // Generate simulation scenario
      const scenarioPrompt = `You are a B2B sales simulation trainer. Create a realistic phone call simulation scenario.

${campaignContext}

SIMULATION TYPE: ${request.scenarioType}
PROSPECT PERSONA:
- Role: ${request.persona.role}
- Attitude: ${request.persona.attitude}
- Industry: ${request.persona.industry || "Technology"}
- Pain Points: ${request.persona.painPoints?.join(", ") || "Efficiency, Cost Reduction"}

${request.customScenario ? `CUSTOM SCENARIO: ${request.customScenario}` : ""}

Generate a complete phone call simulation script with:
1. Opening (prospect answers)
2. Introduction exchange
3. Initial response (based on persona attitude)
4. Key objections (2-3 relevant objections)
5. Agent responses
6. Outcome

Return JSON:
{
  "scenario": {
    "prospectName": "name",
    "company": "company name",
    "title": "job title"
  },
  "dialogue": [
    { "speaker": "agent|prospect", "text": "dialogue line", "tone": "neutral|objection|interest|closing" }
  ],
  "objections": [
    { "objection": "text", "category": "price|timing|competition|authority|need", "difficulty": 1-5 }
  ],
  "expectedOutcome": "qualified|callback|not_interested|referred",
  "coachingPoints": ["point 1", "point 2"]
}`;

      const enrichedScenarioPrompt = await wrapPromptWithOI(scenarioPrompt);
      let simulation = await generateJSON<{
        scenario: { prospectName: string; company: string; title: string };
        dialogue: { speaker: string; text: string; tone: string }[];
        objections: { objection: string; category: string; difficulty: number }[];
        expectedOutcome: string;
        coachingPoints: string[];
      }>(enrichedScenarioPrompt, { temperature: 0.7 });

      // Handle potential array output from LLM
      if (Array.isArray(simulation)) {
        // @ts-ignore
        simulation = simulation[0];
      }

      // Generate transcript from dialogue
      const transcript = simulation.dialogue.map((d) => `${d.speaker.toUpperCase()}: ${d.text}`).join("\n");

      // Analyze the simulation
      const analysisPrompt = `Analyze this sales call simulation and provide coaching feedback.

TRANSCRIPT:
${transcript}

OBJECTIONS HANDLED:
${simulation.objections.map((o) => `- ${o.objection} (${o.category}, difficulty: ${o.difficulty}/5)`).join("\n")}

Analyze:
1. How well were objections handled?
2. What opportunities were missed?
3. Strengths of the conversation
4. Areas for improvement
5. Overall effectiveness score (0-100)

Return JSON:
{
  "objectionCount": number,
  "successfulResponses": number,
  "missedOpportunities": ["opportunity 1"],
  "strengthAreas": ["strength 1"],
  "improvementAreas": ["area 1"],
  "overallScore": number,
  "detailedFeedback": "paragraph of coaching feedback"
}`;

      const enrichedSimAnalysisPrompt = await wrapPromptWithOI(analysisPrompt);
      let analysis = await generateJSON<{
        objectionCount: number;
        successfulResponses: number;
        missedOpportunities: string[];
        strengthAreas: string[];
        improvementAreas: string[];
        overallScore: number;
        detailedFeedback: string;
      }>(enrichedSimAnalysisPrompt, { temperature: 0.3 });

      // Handle potential array output from LLM
      if (Array.isArray(analysis)) {
        // @ts-ignore
        analysis = analysis[0];
      }

      const simulationId = `SIM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      this.emit("agent:completed", "voice_simulation", { simulationId, score: analysis.overallScore });

      return {
        success: true,
        data: {
          simulationId,
          transcript,
          analysis: {
            objectionCount: analysis.objectionCount,
            successfulResponses: analysis.successfulResponses,
            missedOpportunities: analysis.missedOpportunities,
            strengthAreas: analysis.strengthAreas,
            improvementAreas: analysis.improvementAreas,
            overallScore: analysis.overallScore,
          },
          recommendations: [...simulation.coachingPoints, ...analysis.improvementAreas.slice(0, 2)],
        },
        message: `Voice simulation completed. Overall score: ${analysis.overallScore}/100. ${analysis.objectionCount} objections encountered, ${analysis.successfulResponses} handled successfully.`,
        reasoning: analysis.detailedFeedback,
      };
    } catch (error: any) {
      this.emit("agent:error", "voice_simulation", error);
      return {
        success: false,
        message: `Voice simulation failed: ${error.message}`,
      };
    }
  }

  /**
   * Run a real-time voice simulation with Gemini Live (returns configuration for frontend)
   */
  async startLiveVoiceSimulation(request: VoiceSimulationRequest): Promise<
    AgentResponse<{
      sessionId: string;
      systemPrompt: string;
      voiceSettings: { voice: string; style: string };
      scenarioContext: any;
    }>
  > {
    this.emit("agent:action", "live_voice_simulation", "Configuring Gemini Live voice simulation...");

    try {
      if (request.campaignId) {
        try {
          await this.assertCampaignAccess(request.campaignId);
        } catch (err: any) {
          return {
            success: false,
            message: err.message,
          };
        }
      }

      // Generate the AI persona prompt for Gemini Live
      const personaPrompt = `Create a detailed AI persona for a live voice simulation.

PROSPECT PERSONA:
- Role: ${request.persona.role}
- Attitude: ${request.persona.attitude}
- Industry: ${request.persona.industry || "Technology"}
- Pain Points: ${request.persona.painPoints?.join(", ") || "Not specified"}

SIMULATION TYPE: ${request.scenarioType}
${request.customScenario ? `CUSTOM SCENARIO: ${request.customScenario}` : ""}

Create a system prompt that will make the AI act as this prospect in a realistic phone call. Include:
1. Character background and personality
2. Common objections they would raise
3. Response patterns based on their attitude
4. Decision-making criteria
5. Specific phrases and speech patterns

Return JSON:
{
  "systemPrompt": "detailed system prompt for the AI prospect",
  "voiceStyle": "professional|casual|formal|friendly",
  "suggestedVoice": "Kore|Vega|Pegasus|Orion",
  "scenarioSetup": {
    "prospectName": "name",
    "company": "company",
    "title": "title",
    "openingLine": "how they answer the phone",
    "keyObjections": ["objection 1", "objection 2"],
    "buyingSignals": ["signal 1", "signal 2"]
  }
}`;

      const enrichedPersonaPrompt = await wrapPromptWithOI(personaPrompt);
      let persona = await generateJSON<{
        systemPrompt: string;
        voiceStyle: string;
        suggestedVoice: string;
        scenarioSetup: {
          prospectName: string;
          company: string;
          title: string;
          openingLine: string;
          keyObjections: string[];
          buyingSignals: string[];
        };
      }>(enrichedPersonaPrompt, { temperature: 0.6 });

      // Handle potential array output from LLM
      if (Array.isArray(persona)) {
        // @ts-ignore
        persona = persona[0];
      }

      const sessionId = `LIVE-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      return {
        success: true,
        data: {
          sessionId,
          systemPrompt: persona.systemPrompt,
          voiceSettings: {
            voice: persona.suggestedVoice,
            style: persona.voiceStyle,
          },
          scenarioContext: persona.scenarioSetup,
        },
        message: `Live voice simulation ready. Session: ${sessionId}. Prospect: ${persona.scenarioSetup.prospectName} (${persona.scenarioSetup.title} at ${persona.scenarioSetup.company})`,
        suggestedActions: [
          "Connect to Gemini Live WebSocket",
          "Start speaking to begin the simulation",
          `Expect objections about: ${persona.scenarioSetup.keyObjections.slice(0, 2).join(", ")}`,
        ],
      };
    } catch (error: any) {
      this.emit("agent:error", "live_voice_simulation", error);
      return {
        success: false,
        message: `Failed to configure live simulation: ${error.message}`,
      };
    }
  }

  // ==================== EMAIL GENERATION AGENT ====================

  /**
   * Generate AI-powered emails for campaigns
   */
  async generateEmails(request: EmailGenerationRequest): Promise<AgentResponse<GeneratedEmail[]>> {
    this.emit("agent:action", "email_generation", "Generating emails...");

    try {
      const variantCount = request.generateVariants || 1;
      const personalizationLevel = request.personalizationLevel || 2;
      let campaign: typeof campaigns.$inferSelect | null = null;

      if (request.campaignId) {
        try {
          campaign = await this.assertCampaignAccess(request.campaignId);
        } catch (err: any) {
          return {
            success: false,
            message: err.message,
          };
        }
      }

      const targetPersona = request.targetPersona || {
        title: "Decision Maker",
        industry: "B2B",
        painPoints: ["efficiency", "growth"],
      };

      const valueProposition =
        request.valueProposition ||
        campaign?.productServiceInfo ||
        campaign?.campaignObjective ||
        "Drive qualified pipeline";

      const callToAction =
        request.callToAction ||
        campaign?.successCriteria ||
        "Book a meeting";

      const campaignContext = campaign
        ? `CAMPAIGN CONTEXT:
- Name: ${campaign.name}
- Objective: ${campaign.campaignObjective || "Not specified"}
- Product/Service: ${campaign.productServiceInfo || "Not specified"}
- Target Audience: ${campaign.targetAudienceDescription || "Not specified"}
- Talking Points: ${this.formatCampaignValue(campaign.talkingPoints)}
- Objections: ${this.formatCampaignValue(campaign.campaignObjections)}
- Success Criteria: ${campaign.successCriteria || "Not specified"}
- Context Brief: ${campaign.campaignContextBrief || "Not specified"}`
        : `TARGET PERSONA:
- Title: ${targetPersona.title}
- Industry: ${targetPersona.industry}
- Pain Points: ${targetPersona.painPoints.join(", ")}`;

      const contextRules = campaign
        ? "Use the campaign context as the source of truth. Do not invent product or audience details beyond what is provided."
        : "Use the target persona and value proposition provided.";

      const emailPrompt = `You are an expert B2B email copywriter. Generate ${variantCount} high-converting ${request.emailType} email(s).

${campaignContext}

EMAIL PARAMETERS:
- Type: ${request.emailType}
- Tone: ${request.tone}
- Value Proposition: ${valueProposition}
- Call to Action: ${callToAction}
- Personalization Level: ${personalizationLevel} (1=basic, 2=contextual, 3=deep)

CONTEXT RULES:
${contextRules}

EMAIL BEST PRACTICES:
- Subject lines: 40-60 characters, create curiosity, avoid spam triggers
- Preheader: 40-100 characters, complement subject
- Body: 50-150 words, short paragraphs, mobile-friendly
- Include personalization tokens: {{firstName}}, {{companyName}}, {{title}}, {{industry}}
- One clear CTA per email
- P.S. line for urgency (optional)

Return JSON:
{
  "emails": [
    {
      "subject": "subject line with {{tokens}}",
      "preheader": "preheader text",
      "body": "full email body with {{personalization}} tokens",
      "personalizationTokens": ["firstName", "companyName"],
      "estimatedReadTime": "30 seconds",
      "spamScore": 0-10 (lower is better)
    }
  ],
  "copywritingNotes": "explanation of approach and A/B testing recommendations"
}`;

      console.log("[ClientAgenticHub] Generating email with Vertex AI...");

      const enrichedEmailPrompt = await wrapPromptWithOI(emailPrompt);
      const rawResult = await generateJSON<{
        emails: GeneratedEmail[];
        copywritingNotes: string;
      }>(enrichedEmailPrompt, { temperature: 0.7 });

      const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

      console.log("[ClientAgenticHub] Email generation result:", JSON.stringify(result, null, 2));

      if (!result || !result.emails || !Array.isArray(result.emails)) {
        console.error("[ClientAgenticHub] Invalid result structure:", result);
        return {
          success: false,
          message: "Email generation returned invalid structure",
        };
      }

      this.emit("agent:completed", "email_generation", { count: result.emails.length });

      return {
        success: true,
        data: result.emails,
        message: `Generated ${result.emails.length} email variant(s). Average spam score: ${(result.emails.reduce((sum, e) => sum + (e.spamScore || 0), 0) / result.emails.length).toFixed(1)}/10`,
        reasoning: result.copywritingNotes,
        suggestedActions: [
          "A/B test subject lines for best open rates",
          "Personalize {{companyName}} with account research",
          "Send during optimal hours (Tuesday-Thursday, 9-11am)",
        ],
      };
    } catch (error: any) {
      console.error("[ClientAgenticHub] Email generation error:", error);
      console.error("[ClientAgenticHub] Error stack:", error.stack);
      this.emit("agent:error", "email_generation", error);
      return {
        success: false,
        message: `Email generation failed: ${error.message}`,
      };
    }
  }

  /**
   * Generate a complete email sequence for a campaign
   */
  async generateEmailSequence(
    campaignId: string,
    sequenceLength: number = 5,
    sequenceType: "cold" | "warm" | "nurture" = "cold"
  ): Promise<
    AgentResponse<{
      sequenceId: string;
      emails: (GeneratedEmail & { order: number; sendDelay: number })[];
      sequenceStrategy: string;
    }>
  > {
    this.emit("agent:action", "email_sequence_generation", "Generating email sequence...");

    try {
      // Fetch campaign details with access control
      let campaignContext = "";
      try {
        const campaign = await this.assertCampaignAccess(campaignId);
        campaignContext = `CAMPAIGN CONTEXT:
- Name: ${campaign.name}
- Type: ${campaign.type}
- Objective: ${campaign.campaignObjective || "Not specified"}
- Product/Service: ${campaign.productServiceInfo || "Not specified"}
- Target Audience: ${campaign.targetAudienceDescription || "Not specified"}
- Talking Points: ${this.formatCampaignValue(campaign.talkingPoints)}
- Success Criteria: ${campaign.successCriteria || "Not specified"}
- Context Brief: ${campaign.campaignContextBrief || "Not specified"}`;
      } catch (err: any) {
        return {
          success: false,
          message: err.message,
        };
      }

      const sequencePrompt = `You are an email sequence architect. Create a ${sequenceLength}-email ${sequenceType} outreach sequence.

${campaignContext}

SEQUENCE REQUIREMENTS:
- Type: ${sequenceType}
- Length: ${sequenceLength} emails
- Goal: Generate qualified meetings/demos

EMAIL STRATEGY BY POSITION:
1. Email 1: Hook - establish relevance and credibility
2. Email 2: Value - share insight or resource
3. Email 3: Social proof - case study or testimonial
4. Email 4: Urgency - limited opportunity or timeline
5. Email 5: Breakup - final attempt with clear CTA

For each email include:
- Subject line (with A/B variant)
- Preheader
- Body (50-150 words)
- Optimal send delay from previous email
- Personalization tokens

Return JSON:
{
  "sequenceStrategy": "overall strategy explanation",
  "emails": [
    {
      "order": 1,
      "subject": "subject",
      "subjectVariant": "A/B variant",
      "preheader": "preheader",
      "body": "email body",
      "sendDelay": 0,
      "personalizationTokens": ["token1"],
      "estimatedReadTime": "30 seconds",
      "spamScore": 2,
      "emailPurpose": "hook|value|proof|urgency|breakup"
    }
  ]
}`;

      const enrichedSequencePrompt = await wrapPromptWithOI(sequencePrompt);
      const rawResult = await generateJSON<{
        sequenceStrategy: string;
        emails: (GeneratedEmail & { order: number; sendDelay: number; subjectVariant?: string; emailPurpose: string })[];
      }>(enrichedSequencePrompt, { temperature: 0.6 });

      const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

      const sequenceId = `SEQ-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      return {
        success: true,
        data: {
          sequenceId,
          emails: result.emails,
          sequenceStrategy: result.sequenceStrategy,
        },
        message: `Generated ${result.emails.length}-email ${sequenceType} sequence. Total sequence duration: ${result.emails.reduce((sum, e) => sum + e.sendDelay, 0)} days.`,
        reasoning: result.sequenceStrategy,
      };
    } catch (error: any) {
      this.emit("agent:error", "email_sequence_generation", error);
      return {
        success: false,
        message: `Sequence generation failed: ${error.message}`,
      };
    }
  }

  // ==================== IMAGE GENERATION AGENT ====================

  /**
   * Generate marketing images using Imagen 3
   */
  async generateMarketingImages(request: ImageGenerationRequest): Promise<AgentResponse<GeneratedImage[]>> {
    this.emit("agent:action", "image_generation", "Generating marketing images...");

    try {
      // First, refine the prompt for better results
      const promptRefinementPrompt = `You are an expert at crafting prompts for AI image generation (Imagen 3).

ORIGINAL REQUEST:
- Purpose: ${request.purpose}
- Style: ${request.style}
- Brand Colors: ${request.brandColors?.join(", ") || "Not specified"}
- Description: ${request.description}
- Text to Include: ${request.includeText || "None"}
- Aspect Ratio: ${request.aspectRatio}

Create an optimized prompt for photorealistic, professional marketing image generation.

Guidelines:
- Be specific about composition, lighting, and mood
- Include style keywords: professional, corporate, modern, clean
- Specify camera angle and depth of field if relevant
- Mention color palette
- Avoid text in images (AI struggles with text)

Return JSON:
{
  "refinedPrompt": "detailed image generation prompt",
  "styleKeywords": ["keyword1", "keyword2"],
  "technicalSpecs": "technical details for the image"
}`;

      const enrichedImagePrompt = await wrapPromptWithOI(promptRefinementPrompt);
      const rawResult = await generateJSON<{
        refinedPrompt: string;
        styleKeywords: string[];
        technicalSpecs: string;
      }>(enrichedImagePrompt, { temperature: 0.4 });

      const promptResult = Array.isArray(rawResult) ? rawResult[0] : rawResult;

      const variantCount = request.variants || 1;
      const generatedImages: GeneratedImage[] = [];

      for (let i = 0; i < variantCount; i++) {
        const imageUrl = await generateImage(promptResult.refinedPrompt, request.aspectRatio);

        if (imageUrl) {
          generatedImages.push({
            imageId: `IMG-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            imageUrl,
            prompt: request.description,
            refinedPrompt: promptResult.refinedPrompt,
          });
        }
      }

      if (generatedImages.length === 0) {
        return {
          success: false,
          message: "Failed to generate images. Please try again with a different description.",
        };
      }

      this.emit("agent:completed", "image_generation", { count: generatedImages.length });

      return {
        success: true,
        data: generatedImages,
        message: `Generated ${generatedImages.length} marketing image(s) for ${request.purpose}.`,
        reasoning: `Style: ${promptResult.styleKeywords.join(", ")}. ${promptResult.technicalSpecs}`,
        suggestedActions: [
          "Review images for brand alignment",
          "Add text overlays in design software",
          "A/B test variants for engagement",
        ],
      };
    } catch (error: any) {
      this.emit("agent:error", "image_generation", error);
      return {
        success: false,
        message: `Image generation failed: ${error.message}`,
      };
    }
  }

  // ==================== REPORTING AGENT ====================

  /**
   * Generate comprehensive campaign reports
   */
  async generateCampaignReport(request: ReportRequest): Promise<AgentResponse<CampaignReport>> {
    this.emit("agent:action", "report_generation", "Generating campaign report...");

    try {
      // Fetch campaign data
      const campaignData: any[] = [];

      if (request.campaignIds && request.campaignIds.length > 0) {
        const allowedCampaignIds: string[] = [];
        for (const campaignId of request.campaignIds) {
          try {
            await this.assertCampaignAccess(campaignId);
            allowedCampaignIds.push(campaignId);
          } catch (err) {
            // Silently skip unauthorized campaigns to avoid leaking existence
          }
        }

        if (allowedCampaignIds.length === 0) {
          return {
            success: false,
            message: "No accessible campaigns found for this account",
          };
        }

        for (const campaignId of allowedCampaignIds) {
          const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

          if (campaign) {
            // Get order data for this campaign
            const orders = await db
              .select()
              .from(clientPortalOrders)
              .where(
                and(
                  eq(clientPortalOrders.clientAccountId, this.context.clientAccountId),
                  eq(clientPortalOrders.campaignId, campaignId),
                  gte(clientPortalOrders.createdAt, request.dateRange.start),
                  lte(clientPortalOrders.createdAt, request.dateRange.end)
                )
              );

            campaignData.push({
              campaign,
              orders,
              metrics: {
                totalOrders: orders.length,
                totalRequested: orders.reduce((sum, o) => sum + o.requestedQuantity, 0),
                totalDelivered: orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0),
                completedOrders: orders.filter((o) => o.status === "completed").length,
              },
            });
          }
        }
      } else {
        // Get all campaigns for this client
        const accessRecords = await db
          .select()
          .from(clientCampaignAccess)
          .where(eq(clientCampaignAccess.clientAccountId, this.context.clientAccountId));

        for (const access of accessRecords) {
          const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, access.campaignId)).limit(1);

          if (campaign) {
            const orders = await db
              .select()
              .from(clientPortalOrders)
              .where(
                and(
                  eq(clientPortalOrders.clientAccountId, this.context.clientAccountId),
                  eq(clientPortalOrders.campaignId, campaign.id),
                  gte(clientPortalOrders.createdAt, request.dateRange.start),
                  lte(clientPortalOrders.createdAt, request.dateRange.end)
                )
              );

            campaignData.push({
              campaign,
              orders,
              metrics: {
                totalOrders: orders.length,
                totalRequested: orders.reduce((sum, o) => sum + o.requestedQuantity, 0),
                totalDelivered: orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0),
                completedOrders: orders.filter((o) => o.status === "completed").length,
              },
            });
          }
        }
      }

      // Generate AI analysis
      const analysisPrompt = `You are a B2B marketing analyst. Analyze this campaign performance data and generate a ${request.format} report.

REPORT TYPE: ${request.reportType}
DATE RANGE: ${request.dateRange.start.toISOString().split("T")[0]} to ${request.dateRange.end.toISOString().split("T")[0]}
FORMAT: ${request.format}

CAMPAIGN DATA:
${JSON.stringify(campaignData, null, 2)}

Generate a comprehensive analysis including:
1. Executive summary
2. Key metrics and KPIs
3. Trend analysis
4. Insights (positive, negative, neutral)
5. ${request.includeRecommendations ? "Actionable recommendations" : ""}
6. Data for charts (line, bar, pie as appropriate)

Return JSON:
{
  "title": "report title",
  "summary": "executive summary paragraph",
  "keyMetrics": {
    "totalLeadsDelivered": number,
    "fulfillmentRate": "percentage",
    "averageOrderSize": number,
    "totalOrders": number,
    "activeOrders": number
  },
  "charts": [
    {
      "type": "line|bar|pie|funnel",
      "title": "chart title",
      "data": [{ "label": "x", "value": 0 }]
    }
  ],
  "insights": [
    {
      "type": "positive|negative|neutral",
      "insight": "insight text",
      "impact": "high|medium|low",
      "actionable": true/false
    }
  ],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "trends": {
    "volumeTrend": "increasing|stable|decreasing",
    "qualityTrend": "improving|stable|declining"
  }
}`;

      const enrichedReportPrompt = await wrapPromptWithOI(analysisPrompt);
      let analysis = await generateJSON<{
        title: string;
        summary: string;
        keyMetrics: Record<string, any>;
        charts: ChartData[];
        insights: ReportInsight[];
        recommendations: string[];
        trends: { volumeTrend: string; qualityTrend: string };
      }>(enrichedReportPrompt, { temperature: 0.3 });

      // Handle potential array response from LLM
      if (Array.isArray(analysis)) {
        // @ts-ignore
        analysis = analysis[0];
      }

      const reportId = `RPT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      this.emit("agent:completed", "report_generation", { reportId });

      return {
        success: true,
        data: {
          reportId,
          title: analysis.title,
          generatedAt: new Date(),
          summary: analysis.summary,
          metrics: analysis.keyMetrics,
          charts: analysis.charts,
          insights: analysis.insights,
          recommendations: request.includeRecommendations ? analysis.recommendations : [],
          rawData: request.format === "detailed" ? campaignData : undefined,
        },
        message: `${request.format.charAt(0).toUpperCase() + request.format.slice(1)} report generated. ${analysis.insights.filter((i) => i.type === "positive").length} positive insights, ${analysis.insights.filter((i) => i.type === "negative").length} areas for improvement.`,
        reasoning: `Volume trend: ${analysis.trends.volumeTrend}. Quality trend: ${analysis.trends.qualityTrend}.`,
      };
    } catch (error: any) {
      this.emit("agent:error", "report_generation", error);
      return {
        success: false,
        message: `Report generation failed: ${error.message}`,
      };
    }
  }

  // ==================== CAMPAIGN SETUP AGENT ====================

  /**
   * Create a campaign from a goal description (agentic campaign creation)
   */
  async createCampaignFromGoal(
    goal: string,
    budget?: number
  ): Promise<
    AgentResponse<{
      campaignPlan: any;
      voiceAgentConfig?: any;
      emailSequenceConfig?: any;
      estimatedResults: any;
    }>
  > {
    this.emit("agent:action", "campaign_setup", "Creating campaign from goal...");

    try {
      // Use reasoning model for complex planning
      const campaignPlanPrompt = await wrapPromptWithOI(`You are a B2B demand generation strategist. Create a complete campaign plan from this goal.`);
      const { thinking, answer } = await reason(campaignPlanPrompt + `

CLIENT GOAL: "${goal}"
BUDGET: ${budget ? `$${budget}` : "Flexible"}

Create a comprehensive campaign plan including:
1. Campaign strategy and positioning
2. Target audience criteria
3. Channel mix (voice, email, or both)
4. Voice agent persona and script outline
5. Email sequence strategy
6. Success metrics and KPIs
7. Timeline and milestones
8. Estimated results based on industry benchmarks

Return JSON:
{
  "campaignPlan": {
    "name": "campaign name",
    "strategy": "strategy description",
    "positioning": "value proposition",
    "targetAudience": {
      "industries": ["industry1"],
      "titles": ["title1"],
      "companySize": "SMB|Mid-Market|Enterprise",
      "geography": ["region1"]
    },
    "channels": ["voice", "email"],
    "timeline": {
      "setup": "X days",
      "launch": "date",
      "initialResults": "X weeks"
    }
  },
  "voiceAgentConfig": {
    "personaName": "agent name",
    "personaRole": "role",
    "tone": "professional|consultative|friendly",
    "openingScript": "opening script",
    "keyTalkingPoints": ["point1", "point2"],
    "objectionResponses": {
      "price": "response",
      "timing": "response",
      "competition": "response"
    }
  },
  "emailSequenceConfig": {
    "sequenceType": "cold|warm|nurture",
    "emailCount": number,
    "themes": ["theme1", "theme2"],
    "cadence": "every X days"
  },
  "estimatedResults": {
    "leadsGenerated": "X-Y range",
    "qualifiedLeads": "X-Y range",
    "expectedMeetings": "X-Y range",
    "timeToFirstResults": "X weeks",
    "confidenceLevel": "high|medium|low"
  },
  "successMetrics": {
    "primary": ["metric1"],
    "secondary": ["metric2"]
  }
}`);

      const plan = JSON.parse(answer);

      this.emit("agent:completed", "campaign_setup", plan.campaignPlan);

      return {
        success: true,
        data: {
          campaignPlan: plan.campaignPlan,
          voiceAgentConfig: plan.voiceAgentConfig,
          emailSequenceConfig: plan.emailSequenceConfig,
          estimatedResults: plan.estimatedResults,
        },
        message: `Campaign plan created: "${plan.campaignPlan.name}". Estimated ${plan.estimatedResults.qualifiedLeads} qualified leads via ${plan.campaignPlan.channels.join(" + ")}.`,
        reasoning: thinking,
        suggestedActions: [
          "Review target audience criteria",
          "Customize voice agent scripts",
          "Approve campaign for launch",
        ],
      };
    } catch (error: any) {
      this.emit("agent:error", "campaign_setup", error);
      return {
        success: false,
        message: `Campaign setup failed: ${error.message}`,
      };
    }
  }

  // ==================== CONVERSATIONAL INTERFACE ====================

  /**
   * Process a natural language request and route to appropriate agent
   */
  async processRequest(
    message: string,
    history: ChatMessage[] = []
  ): Promise<{
    response: string;
    actions: { action: string; result: any }[];
    navigateTo?: string;
  }> {
    this.conversationHistory = history;

    const functions: FunctionDeclaration[] = [
      {
        name: "create_campaign_order",
        description: "Create a new campaign order for leads/contacts",
        parameters: {
          type: "object",
          properties: {
            campaignType: { type: "string", description: "Type of campaign" },
            volumeRequested: { type: "string", description: "Number of leads requested" },
            targetIndustries: { type: "string", description: "Target industries (comma-separated)" },
            targetTitles: { type: "string", description: "Target job titles (comma-separated)" },
            channels: { type: "string", description: "Channels: voice, email, or both" },
          },
          required: ["volumeRequested"],
        },
      },
      {
        name: "run_voice_simulation",
        description: "Run a voice call simulation to test agent scripts",
        parameters: {
          type: "object",
          properties: {
            scenarioType: {
              type: "string",
              description: "Type of call scenario",
              enum: ["cold_call", "follow_up", "qualification", "objection_handling", "demo_request"],
            },
            personaRole: {
              type: "string",
              description: "Prospect role",
              enum: ["decision_maker", "gatekeeper", "influencer", "end_user"],
            },
            personaAttitude: {
              type: "string",
              description: "Prospect attitude",
              enum: ["friendly", "busy", "skeptical", "interested", "hostile"],
            },
          },
          required: ["scenarioType"],
        },
      },
      {
        name: "generate_emails",
        description: "Generate marketing emails for campaigns",
        parameters: {
          type: "object",
          properties: {
            emailType: {
              type: "string",
              description: "Type of email",
              enum: ["cold_outreach", "follow_up", "nurture", "event_invite", "case_study", "product_announcement"],
            },
            tone: {
              type: "string",
              description: "Email tone",
              enum: ["professional", "friendly", "urgent", "consultative"],
            },
            targetTitle: { type: "string", description: "Target job title" },
            targetIndustry: { type: "string", description: "Target industry" },
            valueProposition: { type: "string", description: "Main value proposition" },
            variants: { type: "string", description: "Number of variants to generate" },
          },
          required: ["emailType", "valueProposition"],
        },
      },
      {
        name: "generate_images",
        description: "Generate marketing images using AI",
        parameters: {
          type: "object",
          properties: {
            purpose: {
              type: "string",
              description: "Image purpose",
              enum: ["email_header", "social_post", "ad_creative", "landing_page", "presentation"],
            },
            style: {
              type: "string",
              description: "Visual style",
              enum: ["professional", "modern", "minimalist", "bold", "creative"],
            },
            description: { type: "string", description: "Image description" },
            aspectRatio: {
              type: "string",
              description: "Aspect ratio",
              enum: ["16:9", "1:1", "4:3", "9:16"],
            },
          },
          required: ["description"],
        },
      },
      {
        name: "generate_report",
        description: "Generate campaign performance reports and analytics",
        parameters: {
          type: "object",
          properties: {
            reportType: {
              type: "string",
              description: "Type of report",
              enum: ["campaign_performance", "lead_quality", "roi_analysis", "pipeline_velocity", "engagement_metrics"],
            },
            format: {
              type: "string",
              description: "Report format",
              enum: ["summary", "detailed", "executive"],
            },
            period: {
              type: "string",
              description: "Time period",
              enum: ["7d", "30d", "90d", "1y"],
            },
          },
          required: ["reportType"],
        },
      },
      {
        name: "create_campaign_from_goal",
        description: "Create a complete campaign plan from a business goal",
        parameters: {
          type: "object",
          properties: {
            goal: { type: "string", description: "Business goal or objective" },
            budget: { type: "string", description: "Budget in dollars" },
          },
          required: ["goal"],
        },
      },
    ];

    const baseAgentCPrompt = `You are AgentC, the Agentic Operator for DemandGentic.ai By Pivotal.

You are equipped with:
1. Agentic CRM Actions (create/manage campaigns, orders)
2. ImageGen Capabilities (create marketing assets)
3. Organization Aware Chat Bot (context-aware assistance)
4. Creative Content Generation (emails, plans, scripts)

You can help clients:
1. Create campaign orders for leads
2. Run voice call simulations to test scripts
3. Generate marketing emails
4. Create marketing images
5. Generate performance reports and analytics
6. Create complete campaign plans from goals

Be helpful, professional, and proactive. When users describe what they need, use the appropriate function to help them.

Client: ${this.context.clientName || "Valued Client"}
Account ID: ${this.context.clientAccountId}`;

    const systemPrompt = await wrapPromptWithOI(baseAgentCPrompt);

    const { text, functionCalls } = await generateWithFunctions(systemPrompt, message, functions, {
      temperature: 0.5,
      maxTokens: 2000,
    });

    const actions: { action: string; result: any }[] = [];
    let navigateTo: string | undefined;

    // Process function calls
    for (const fc of functionCalls) {
      let result: any;

      switch (fc.name) {
        case "create_campaign_order":
          result = await this.createCampaignOrder({
            campaignType: fc.args.campaignType || "lead_generation",
            targetAudience: {
              industries: fc.args.targetIndustries?.split(",").map((s: string) => s.trim()),
              jobTitles: fc.args.targetTitles?.split(",").map((s: string) => s.trim()),
            },
            volumeRequested: parseInt(fc.args.volumeRequested) || 100,
            deliveryTimeline: "2_weeks",
            channels: [fc.args.channels || "both"],
          });
          break;

        case "run_voice_simulation":
          result = await this.runVoiceSimulation({
            campaignId: "",
            scenarioType: fc.args.scenarioType || "cold_call",
            persona: {
              role: fc.args.personaRole || "decision_maker",
              attitude: fc.args.personaAttitude || "busy",
            },
          });
          break;

        case "generate_emails":
          result = await this.generateEmails({
            emailType: fc.args.emailType || "cold_outreach",
            tone: fc.args.tone || "professional",
            targetPersona: {
              title: fc.args.targetTitle || "VP of Marketing",
              industry: fc.args.targetIndustry || "Technology",
              painPoints: ["efficiency", "growth", "cost reduction"],
            },
            valueProposition: fc.args.valueProposition || "Drive qualified pipeline",
            callToAction: "Schedule a quick call",
            personalizationLevel: 2,
            generateVariants: parseInt(fc.args.variants) || 1,
          });
          break;

        case "generate_images":
          result = await this.generateMarketingImages({
            purpose: fc.args.purpose || "social_post",
            style: fc.args.style || "professional",
            description: fc.args.description,
            aspectRatio: fc.args.aspectRatio || "16:9",
          });
          break;

        case "generate_report":
          const periodDays =
            fc.args.period === "7d" ? 7 : fc.args.period === "30d" ? 30 : fc.args.period === "90d" ? 90 : 365;
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - periodDays);
          result = await this.generateCampaignReport({
            reportType: fc.args.reportType || "campaign_performance",
            dateRange: { start: startDate, end: new Date() },
            format: fc.args.format || "summary",
            includeRecommendations: true,
          });
          break;

        case "create_campaign_from_goal":
          result = await this.createCampaignFromGoal(fc.args.goal, fc.args.budget ? parseInt(fc.args.budget) : undefined);
          break;
      }

      if (result) {
        actions.push({ action: fc.name, result });
      }
    }

    // Generate follow-up response if actions were taken
    let finalResponse = text;
    if (actions.length > 0) {
      const actionSummary = actions
        .map(
          (a) =>
            `${a.action}: ${a.result.success ? "Success" : "Failed"} - ${a.result.message}${a.result.data ? `\nData: ${JSON.stringify(a.result.data, null, 2).substring(0, 500)}...` : ""}`
        )
        .join("\n\n");

      const followUpResponse = await chat(
        systemPrompt,
        [
          ...this.conversationHistory,
          { role: "user", content: message },
          {
            role: "model",
            content: `I executed these actions:\n${actionSummary}\n\nLet me summarize the results for you.`,
          },
        ],
        { temperature: 0.7 }
      );

      finalResponse = followUpResponse;
    }

    return {
      response: finalResponse,
      actions,
      navigateTo,
    };
  }
}

// ==================== FACTORY FUNCTION ====================

export function createClientAgenticHub(context: ClientAgenticContext): VertexClientAgenticHub {
  return new VertexClientAgenticHub(context);
}

export default {
  VertexClientAgenticHub,
  createClientAgenticHub,
};
