/**
 * Client Portal Agentic Routes
 *
 * Comprehensive API routes for client self-service agentic capabilities:
 * - Campaign Order Creation & Management
 * - Voice Simulations (Gemini Live)
 * - Email Generation & Sequences
 * - Image Generation (Imagen 3)
 * - Campaign Reports & Analytics
 * - Agentic Campaign Setup
 * - Billing & Usage
 *
 * All endpoints powered by Vertex AI
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  clientAccounts,
  clientBusinessProfiles,
  clientPortalOrders,
  clientCampaignAccess,
  campaigns,
  virtualAgents,
  clientInvoices,
  clientBillingConfig,
  clientReports,
  leads,
  verificationCampaigns,
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import {
  VertexClientAgenticHub,
  createClientAgenticHub,
  type ClientAgenticContext,
  type CampaignOrderRequest,
  type VoiceSimulationRequest,
  type EmailGenerationRequest,
  type ImageGenerationRequest,
  type ReportRequest,
} from "../services/vertex-ai/vertex-client-agentic-hub";
import { GeminiLiveProvider } from "../services/voice-providers/gemini-live-provider";
import { chat as vertexChat, streamChat, generateJSON } from "../services/vertex-ai";
import { registerContent } from "../services/qa-gate-service";
import {
  generateClientEmailContent,
  generateClientEmailSequence,
  analyzeClientEmail,
  type GeneratedEmailContent,
} from "../lib/deepseek-client-email-service";
import { buildBrandedEmailHtml, type BrandPaletteKey } from "../../client/src/components/email-builder/ai-email-template";

const router = Router();

function escapeHtml(value: string) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

function buildClientPortalBodyHtml(args: { copy: GeneratedEmailContent }) {
  const { copy } = args;

  const bullets = (copy.valueBullets || []).filter(Boolean).slice(0, 3);
  const bulletHtml = bullets.length
    ? `
      <ul>
        ${bullets
          .map(
            (b) =>
              `<li>${escapeHtml(b)}</li>`
          )
          .join("")}
      </ul>
    `
    : "";

  const ctaUrl = "{{campaign.landing_page}}";
  const ctaLabel = escapeHtml(copy.ctaLabel || "Learn more");
  const ctaHtml = `<p><a href="${ctaUrl}">${ctaLabel}</a></p>`;

  const heroTitle = (copy.heroTitle || "").trim();
  const heroSubtitle = (copy.heroSubtitle || "").trim();
  const intro = (copy.intro || "").trim();
  const closingLine = (copy.closingLine || "").trim();

  return `
    <p>Hi {{firstName}},</p>
    ${heroTitle ? `<h2>${escapeHtml(heroTitle)}</h2>` : ""}
    ${heroSubtitle ? `<p>${escapeHtml(heroSubtitle)}</p>` : ""}
    ${intro ? `<p>${nl2br(intro)}</p>` : ""}
    ${bulletHtml}
    ${ctaHtml}
    ${closingLine ? `<p>${escapeHtml(closingLine)}</p>` : ""}
  `.trim();
}

// ==================== MIDDLEWARE ====================

// Extract client context from authenticated request
function getClientContext(req: Request): ClientAgenticContext {
  const clientUser = (req as any).clientUser;

  // Detailed logging for debugging auth issues
  if (!clientUser) {
    console.error("[Client Agentic] getClientContext: clientUser is undefined/null");
    console.error("[Client Agentic] Auth header present:", !!req.headers.authorization);
    throw new Error("Client authentication required - no clientUser on request");
  }

  if (!clientUser.clientAccountId) {
    console.error("[Client Agentic] getClientContext: clientAccountId missing from clientUser:", JSON.stringify(clientUser, null, 2));
    throw new Error("Invalid client session - missing clientAccountId");
  }

  return {
    clientAccountId: clientUser.clientAccountId,
    clientUserId: clientUser.clientUserId,
    clientName: `${clientUser.firstName || ""} ${clientUser.lastName || ""}`.trim() || clientUser.email,
    permissions: ["read", "write", "order", "simulate", "report"],
  };
}

// ==================== VOICE SIMULATION ENDPOINTS ====================

/**
 * Run a text-based voice simulation
 */
router.post("/simulations/voice/run", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const hub = createClientAgenticHub(context);

    const simulationRequest: VoiceSimulationRequest = {
      campaignId: req.body.campaignId || "",
      scenarioType: req.body.scenarioType || "cold_call",
      persona: {
        role: req.body.personaRole || "decision_maker",
        attitude: req.body.personaAttitude || "busy",
        industry: req.body.personaIndustry,
        painPoints: req.body.personaPainPoints,
      },
      customScenario: req.body.customScenario,
      recordSimulation: req.body.recordSimulation,
    };

    const result = await hub.runVoiceSimulation(simulationRequest);
    res.json(result);
  } catch (error: any) {
    console.error("[Client Agentic] Voice simulation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Configure a Gemini Live real-time voice simulation session
 */
router.post("/simulations/voice/live/configure", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const hub = createClientAgenticHub(context);

    const simulationRequest: VoiceSimulationRequest = {
      campaignId: req.body.campaignId || "",
      scenarioType: req.body.scenarioType || "cold_call",
      persona: {
        role: req.body.personaRole || "decision_maker",
        attitude: req.body.personaAttitude || "skeptical",
        industry: req.body.personaIndustry || "Technology",
        painPoints: req.body.personaPainPoints || ["budget constraints", "implementation complexity"],
      },
      customScenario: req.body.customScenario,
    };

    const result = await hub.startLiveVoiceSimulation(simulationRequest);
    res.json(result);
  } catch (error: any) {
    console.error("[Client Agentic] Live simulation config error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get available simulation scenarios
 */
router.get("/simulations/scenarios", async (req: Request, res: Response) => {
  const scenarios = [
    {
      id: "cold_call",
      name: "Cold Call",
      description: "Initial outreach to a prospect with no prior contact",
      difficulty: "medium",
    },
    {
      id: "follow_up",
      name: "Follow-up Call",
      description: "Following up on a previous interaction or email",
      difficulty: "easy",
    },
    {
      id: "qualification",
      name: "Qualification Call",
      description: "BANT qualification conversation",
      difficulty: "medium",
    },
    {
      id: "objection_handling",
      name: "Objection Handling",
      description: "Practice handling common sales objections",
      difficulty: "hard",
    },
    {
      id: "demo_request",
      name: "Demo Request",
      description: "Convert interest into a scheduled demo",
      difficulty: "medium",
    },
  ];

  const personas = [
    { role: "decision_maker", name: "Decision Maker", description: "C-level or VP who can sign off" },
    { role: "gatekeeper", name: "Gatekeeper", description: "Executive assistant or receptionist" },
    { role: "influencer", name: "Influencer", description: "Manager who recommends solutions" },
    { role: "end_user", name: "End User", description: "Day-to-day user of the product" },
  ];

  const attitudes = [
    { id: "friendly", name: "Friendly", description: "Open and receptive" },
    { id: "busy", name: "Busy", description: "Limited time, wants quick value" },
    { id: "skeptical", name: "Skeptical", description: "Questions everything, needs proof" },
    { id: "interested", name: "Interested", description: "Already researching solutions" },
    { id: "hostile", name: "Hostile", description: "Resistant or frustrated" },
  ];

  res.json({ scenarios, personas, attitudes });
});

// ==================== EMAIL GENERATION ENDPOINTS ====================

/**
 * Generate marketing emails using DeepSeek AI
 * Uses the same pattern as admin email templates with branded HTML output
 */
router.post("/emails/generate", async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    if (!clientUser) {
      console.error("[Client Agentic] No clientUser on request");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    console.log("[Client Agentic] Generating emails with DeepSeek for client:", clientUser.email);

    const { campaignId, emailType, tone, variants, brandPalette, companyName: overrideCompanyName } = req.body;

    if (!campaignId) {
      return res.status(400).json({ success: false, message: "Campaign is required" });
    }

    const numVariants = Math.min(Math.max(parseInt(variants) || 1, 1), 3);
    const palette: BrandPaletteKey = brandPalette || 'indigo';

    // Pull business profile data once to avoid placeholder footers.
    const [businessProfile] = await db
      .select()
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, clientUser.clientAccountId))
      .limit(1);

    const [clientAccount] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    const companyName =
      (typeof overrideCompanyName === "string" ? overrideCompanyName.trim() : "") ||
      businessProfile?.dbaName ||
      businessProfile?.legalBusinessName ||
      clientAccount?.name ||
      "";

    const companyAddress = (() => {
      if (!businessProfile?.addressLine1 || !businessProfile?.city || !businessProfile?.state || !businessProfile?.postalCode) {
        return undefined;
      }
      const line1 = businessProfile.addressLine1;
      const line2 = businessProfile.addressLine2 ? `, ${businessProfile.addressLine2}` : '';
      const cityStateZip = `${businessProfile.city}, ${businessProfile.state} ${businessProfile.postalCode}`;
      const country = businessProfile.country && businessProfile.country !== 'United States'
        ? ` - ${businessProfile.country}`
        : '';
      return `${line1}${line2} - ${cityStateZip}${country}`;
    })();

    const emails = [];
    for (let i = 0; i < numVariants; i++) {
      const content = await generateClientEmailContent({
        campaignId,
        clientAccountId: clientUser.clientAccountId,
        emailType: emailType || 'cold_outreach',
        tone: tone || 'professional',
      });

      // Build HTML using the branded template (same as admin templates)
      const html = buildBrandedEmailHtml({
        copy: content,
        brandPalette: palette,
        companyName,
        companyAddress,
        ctaUrl: "{{campaign.landing_page}}",
        includeFooter: true,
      });

      // Client Email Template Builder consumes a body fragment (no wrapper/footer).
      const bodyHtml = buildClientPortalBodyHtml({ copy: content });

      emails.push({
        ...content,
        html,
        bodyHtml,
        body: content.intro, // For backwards compatibility with simple body field
      });
    }

    console.log("[Client Agentic] Generated", emails.length, "emails with DeepSeek");

    res.json({ success: true, data: emails });
  } catch (error: any) {
    console.error("[Client Agentic] Email generation error:", error);
    console.error("[Client Agentic] Error stack:", error.stack);
    res.status(500).json({ success: false, message: error.message || "Failed to generate emails" });
  }
});

/**
 * Generate complete email sequence using DeepSeek AI
 */
router.post("/emails/sequence", async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    if (!clientUser) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { campaignId, sequenceLength, sequenceType, brandPalette, companyName: overrideCompanyName } = req.body;

    if (!campaignId) {
      return res.status(400).json({ success: false, message: "Campaign is required" });
    }

    const palette: BrandPaletteKey = brandPalette || 'indigo';

    const [businessProfile] = await db
      .select()
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, clientUser.clientAccountId))
      .limit(1);

    const [clientAccount] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    const companyName =
      (typeof overrideCompanyName === "string" ? overrideCompanyName.trim() : "") ||
      businessProfile?.dbaName ||
      businessProfile?.legalBusinessName ||
      clientAccount?.name ||
      "";

    const companyAddress = (() => {
      if (!businessProfile?.addressLine1 || !businessProfile?.city || !businessProfile?.state || !businessProfile?.postalCode) {
        return undefined;
      }
      const line1 = businessProfile.addressLine1;
      const line2 = businessProfile.addressLine2 ? `, ${businessProfile.addressLine2}` : '';
      const cityStateZip = `${businessProfile.city}, ${businessProfile.state} ${businessProfile.postalCode}`;
      const country = businessProfile.country && businessProfile.country !== 'United States'
        ? ` - ${businessProfile.country}`
        : '';
      return `${line1}${line2} - ${cityStateZip}${country}`;
    })();

    const sequence = await generateClientEmailSequence({
      campaignId,
      clientAccountId: clientUser.clientAccountId,
      sequenceLength: sequenceLength || 5,
      sequenceType: sequenceType || 'cold',
    });

    // Add HTML to each email in the sequence
    const sequenceWithHtml = sequence.map(email => {
      const html = buildBrandedEmailHtml({
        copy: email,
        brandPalette: palette,
        companyName,
        companyAddress,
        ctaUrl: "{{campaign.landing_page}}",
        includeFooter: true,
      });
      const bodyHtml = buildClientPortalBodyHtml({ copy: email });
      return {
        ...email,
        html,
        bodyHtml,
        body: email.intro, // For backwards compatibility
      };
    });

    res.json({ success: true, data: { sequence: sequenceWithHtml } });
  } catch (error: any) {
    console.error("[Client Agentic] Email sequence error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Analyze and score an email using DeepSeek AI
 */
router.post("/emails/analyze", async (req: Request, res: Response) => {
  try {
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ success: false, message: "Subject and body are required" });
    }

    const result = await analyzeClientEmail({ subject, body });
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[Client Agentic] Email analysis error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Send test email with proper HTML formatting
 * Uses the simple email template structure for campaign-context-aware emails
 */
router.post("/emails/send-test", async (req: Request, res: Response) => {
  try {
    const { to, subject, html, preheader, campaignName, campaignId } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields: to, subject, html" 
      });
    }

    // Validate email address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email address format" 
      });
    }

    // Import and use the bulk email service
    const { sendTestEmail } = await import("../services/bulk-email-service");
    
    const result = await sendTestEmail({
      to: [to],
      subject,
      html,
    });

    if (result.success) {
      console.log(`[Client Portal] Test email sent to ${to} for campaign: ${campaignName || campaignId || 'unknown'}`);
      res.json({
        success: true,
        message: `Test email sent to ${to}`,
        sent: result.sent,
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || "Failed to send test email",
      });
    }
  } catch (error: any) {
    console.error("[Client Agentic] Test email error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== IMAGE GENERATION ENDPOINTS ====================

/**
 * Generate marketing images
 */
router.post("/images/generate", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const hub = createClientAgenticHub(context);

    const imageRequest: ImageGenerationRequest = {
      purpose: req.body.purpose || "social_post",
      style: req.body.style || "professional",
      brandColors: req.body.brandColors,
      description: req.body.description,
      includeText: req.body.includeText,
      aspectRatio: req.body.aspectRatio || "16:9",
      variants: req.body.variants || 1,
    };

    const result = await hub.generateMarketingImages(imageRequest);
    res.json(result);
  } catch (error: any) {
    console.error("[Client Agentic] Image generation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get image generation presets
 */
router.get("/images/presets", (req: Request, res: Response) => {
  const presets = [
    {
      id: "linkedin_banner",
      name: "LinkedIn Banner",
      aspectRatio: "16:9",
      style: "professional",
      description: "Professional banner for LinkedIn company page",
    },
    {
      id: "email_header",
      name: "Email Header",
      aspectRatio: "16:9",
      style: "modern",
      description: "Eye-catching header for marketing emails",
    },
    {
      id: "social_square",
      name: "Social Post (Square)",
      aspectRatio: "1:1",
      style: "bold",
      description: "Engaging social media post",
    },
    {
      id: "ad_creative",
      name: "Ad Creative",
      aspectRatio: "4:3",
      style: "modern",
      description: "Compelling advertisement creative",
    },
    {
      id: "presentation_slide",
      name: "Presentation Slide",
      aspectRatio: "16:9",
      style: "minimalist",
      description: "Clean background for presentations",
    },
  ];

  res.json({ presets });
});

// ==================== REPORTING ENDPOINTS ====================

/**
 * Generate campaign report
 */
router.post("/reports/generate", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const hub = createClientAgenticHub(context);

    const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.body.endDate ? new Date(req.body.endDate) : new Date();

    const reportRequest: ReportRequest = {
      reportType: req.body.reportType || "campaign_performance",
      campaignIds: req.body.campaignIds,
      dateRange: { start: startDate, end: endDate },
      metrics: req.body.metrics,
      format: req.body.format || "summary",
      includeRecommendations: req.body.includeRecommendations !== false,
    };

    const result = await hub.generateCampaignReport(reportRequest);

    if (!result.success || !result.data) {
      return res.status(500).json(result);
    }

    let campaignId: string | undefined;
    let projectId: string | undefined;

    if (Array.isArray(reportRequest.campaignIds) && reportRequest.campaignIds.length === 1) {
      campaignId = reportRequest.campaignIds[0];
      const [campaign] = await db
        .select({ projectId: campaigns.projectId })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);
      projectId = campaign?.projectId || undefined;
    }

    const [reportRecord] = await db
      .insert(clientReports)
      .values({
        clientAccountId: context.clientAccountId,
        campaignId: campaignId || null,
        projectId: projectId || null,
        reportName: result.data.title || `Campaign Report (${reportRequest.reportType})`,
        reportType: reportRequest.reportType || "campaign_performance",
        reportPeriodStart: reportRequest.dateRange?.start || null,
        reportPeriodEnd: reportRequest.dateRange?.end || null,
        reportData: result.data,
        reportSummary: result.data.summary || null,
        generatedBy: context.clientUserId,
      })
      .returning();

    await registerContent('report', reportRecord.id, {
      campaignId: campaignId || undefined,
      clientAccountId: context.clientAccountId,
      projectId: projectId || undefined,
      createdBy: context.clientUserId,
    });

    res.json({
      success: true,
      data: {
        reportId: reportRecord.id,
        status: "pending_review",
      },
      message: "Report generated and submitted for QA review",
    });
  } catch (error: any) {
    console.error("[Client Agentic] Report generation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get available report types
 */
router.get("/reports/types", (req: Request, res: Response) => {
  const reportTypes = [
    {
      id: "campaign_performance",
      name: "Campaign Performance",
      description: "Overall campaign metrics and KPIs",
      metrics: ["leads_delivered", "fulfillment_rate", "order_volume"],
    },
    {
      id: "lead_quality",
      name: "Lead Quality Analysis",
      description: "Deep dive into lead quality and conversion",
      metrics: ["conversion_rate", "qualification_rate", "engagement_score"],
    },
    {
      id: "roi_analysis",
      name: "ROI Analysis",
      description: "Return on investment and cost analysis",
      metrics: ["cost_per_lead", "revenue_generated", "roi_percentage"],
    },
    {
      id: "pipeline_velocity",
      name: "Pipeline Velocity",
      description: "Speed of leads through the funnel",
      metrics: ["time_to_qualify", "time_to_close", "stage_conversion"],
    },
    {
      id: "engagement_metrics",
      name: "Engagement Metrics",
      description: "Email and voice engagement analytics",
      metrics: ["open_rate", "click_rate", "call_connect_rate"],
    },
  ];

  res.json({ reportTypes });
});

/**
 * Get quick analytics snapshot
 */
router.get("/reports/snapshot", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const period = (req.query.period as string) || "30d";
    const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    // Get orders for the period
    const orders = await db
      .select()
      .from(clientPortalOrders)
      .where(
        and(eq(clientPortalOrders.clientAccountId, context.clientAccountId), gte(clientPortalOrders.createdAt, startDate))
      );

    const snapshot = {
      period,
      totalOrders: orders.length,
      totalLeadsRequested: orders.reduce((sum, o) => sum + o.requestedQuantity, 0),
      totalLeadsDelivered: orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0),
      fulfillmentRate:
        orders.length > 0
          ? (
              (orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0) /
                orders.reduce((sum, o) => sum + o.requestedQuantity, 0)) *
              100
            ).toFixed(1) + "%"
          : "N/A",
      completedOrders: orders.filter((o) => o.status === "completed").length,
      pendingOrders: orders.filter((o) => o.status === "submitted" || o.status === "approved").length,
    };

    res.json({ success: true, data: snapshot });
  } catch (error: any) {
    console.error("[Client Agentic] Snapshot error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CAMPAIGN SETUP ENDPOINTS ====================

/**
 * Create campaign from goal (agentic campaign creation)
 */
router.post("/campaigns/create-from-goal", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const hub = createClientAgenticHub(context);

    const { goal, budget } = req.body;

    if (!goal) {
      return res.status(400).json({ success: false, message: "Goal is required" });
    }

    const result = await hub.createCampaignFromGoal(goal, budget ? parseInt(budget) : undefined);
    res.json(result);
  } catch (error: any) {
    console.error("[Client Agentic] Campaign creation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get campaign templates
 */
router.get("/campaigns/templates", (req: Request, res: Response) => {
  const templates = [
    {
      id: "lead_gen_enterprise",
      name: "Enterprise Lead Generation",
      description: "High-quality leads from Fortune 500 companies",
      channels: ["voice", "email"],
      targetAudience: { companySize: "Enterprise", industries: ["Technology", "Finance", "Healthcare"] },
      estimatedResults: { leadsPerMonth: "50-100", qualificationRate: "35%" },
    },
    {
      id: "appointment_setting",
      name: "Appointment Setting",
      description: "Schedule qualified meetings with decision makers",
      channels: ["voice"],
      targetAudience: { titles: ["VP", "Director", "C-Level"], industries: ["Any"] },
      estimatedResults: { meetingsPerMonth: "15-30", showRate: "75%" },
    },
    {
      id: "webinar_registration",
      name: "Webinar Registration",
      description: "Drive registrations for your upcoming webinar",
      channels: ["email"],
      targetAudience: { titles: ["Manager", "Director"], industries: ["Technology"] },
      estimatedResults: { registrationsPerCampaign: "200-500", attendanceRate: "40%" },
    },
    {
      id: "content_syndication",
      name: "Content Syndication",
      description: "Distribute your content to targeted audiences",
      channels: ["email"],
      targetAudience: { companySize: "Mid-Market", industries: ["Any"] },
      estimatedResults: { downloadsPerMonth: "100-300", mqlRate: "25%" },
    },
    {
      id: "account_based",
      name: "Account-Based Campaign",
      description: "Targeted outreach to specific accounts",
      channels: ["voice", "email"],
      targetAudience: { accountList: "Custom", multiThreaded: true },
      estimatedResults: { accountPenetration: "60%", meetingsPerAccount: "2-3" },
    },
  ];

  res.json({ templates });
});

// ==================== CONVERSATIONAL AI ENDPOINT ====================

/**
 * Main conversational interface - process any request
 */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const hub = createClientAgenticHub(context);

    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    const result = await hub.processRequest(message, conversationHistory);

    const newHistory = [
      ...conversationHistory.slice(-18),
      { role: "user", content: message },
      { role: "model", content: result.response },
    ];

    res.json({
      success: true,
      response: result.response,
      actions: result.actions,
      navigateTo: result.navigateTo,
      conversationHistory: newHistory,
    });
  } catch (error: any) {
    console.error("[Client Agentic] Chat error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Stream chat response
 */
router.post("/chat/stream", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const systemPrompt = `You are the DemandGentic.ai By Pivotal B2B assistant for ${context.clientName || "our valued client"}.
Help with B2B demand generation: campaign orders, voice simulations, email generation, image creation, and reporting.
Be helpful, professional, and proactive.`;

    const messages = [...conversationHistory, { role: "user" as const, content: message }];

    for await (const chunk of streamChat(systemPrompt, messages, { temperature: 0.7 })) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("[Client Agentic] Stream chat error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// ==================== CAMPAIGN STATS & ANALYTICS ENDPOINTS ====================

/**
 * Get comprehensive campaign stats for client
 */
router.get("/stats/overview", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const clientAccountId = context.clientAccountId;

    // Get all campaigns client has access to
    const campaignAccessList = await db
      .select()
      .from(clientCampaignAccess)
      .where(eq(clientCampaignAccess.clientAccountId, clientAccountId));

    const regularCampaignIds = campaignAccessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    const verificationCampaignIds = campaignAccessList
      .map(a => a.campaignId)
      .filter((id): id is string => id !== null);

    // Get regular campaign details with lead counts
    let regularCampaignStats: any[] = [];
    if (regularCampaignIds.length > 0) {
      const regularCampaignsData = await db
        .select()
        .from(campaigns)
        .where(
          and(
            inArray(campaigns.id, regularCampaignIds),
            eq(campaigns.approvalStatus, 'published'),
            eq(campaigns.clientAccountId, clientAccountId)
          )
        );

      const publishedRegularCampaignIds = regularCampaignsData.map(campaign => campaign.id);

      if (publishedRegularCampaignIds.length > 0) {
        const leadStats = await db
          .select({
            campaignId: leads.campaignId,
            qaStatus: leads.qaStatus,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .where(inArray(leads.campaignId, publishedRegularCampaignIds))
          .groupBy(leads.campaignId, leads.qaStatus);

        const accountCounts = await db
          .select({
            campaignId: leads.campaignId,
            count: sql<number>`count(DISTINCT ${leads.accountName})::int`,
          })
          .from(leads)
          .where(
            and(
              inArray(leads.campaignId, publishedRegularCampaignIds),
              eq(leads.qaStatus, 'approved')
            )
          )
          .groupBy(leads.campaignId);

        const accountCountMap = accountCounts.reduce((acc, c) => {
          if (c.campaignId) acc[c.campaignId] = c.count;
          return acc;
        }, {} as Record<string, number>);

        const leadStatsByCampaign = leadStats.reduce((acc, stat) => {
          if (!stat.campaignId) return acc;
          if (!acc[stat.campaignId]) {
            acc[stat.campaignId] = {
              total: 0,
              approved: 0,
              pending: 0,
              rejected: 0,
            };
          }
          acc[stat.campaignId].total += stat.count;
          if (stat.qaStatus === 'approved' || stat.qaStatus === 'published') {
            acc[stat.campaignId].approved += stat.count;
          } else if (stat.qaStatus === 'new' || stat.qaStatus === 'under_review') {
            acc[stat.campaignId].pending += stat.count;
          } else if (stat.qaStatus === 'rejected') {
            acc[stat.campaignId].rejected += stat.count;
          }
          return acc;
        }, {} as Record<string, any>);

        regularCampaignStats = regularCampaignsData.map(campaign => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          type: 'regular',
          leads: leadStatsByCampaign[campaign.id] || { total: 0, approved: 0, pending: 0, rejected: 0 },
          accounts: accountCountMap[campaign.id] || 0,
        }));
      }
    }

    // Get verification campaign stats
    let verificationCampaignStats: any[] = [];
    if (verificationCampaignIds.length > 0) {
      const verificationCampaignsData = await db
        .select()
        .from(verificationCampaigns)
        .where(inArray(verificationCampaigns.id, verificationCampaignIds));

      verificationCampaignStats = verificationCampaignsData.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        type: 'verification',
        totalContacts: campaign.totalContacts || 0,
        verifiedContacts: campaign.verifiedContacts || 0,
      }));
    }

    // Calculate totals
    const totalApprovedLeads = regularCampaignStats.reduce((sum, c) => sum + c.leads.approved, 0);
    const totalPendingLeads = regularCampaignStats.reduce((sum, c) => sum + c.leads.pending, 0);
    const totalAccounts = regularCampaignStats.reduce((sum, c) => sum + c.accounts, 0);
    const totalCampaigns = regularCampaignStats.length + verificationCampaignStats.length;

    res.json({
      success: true,
      data: {
        summary: {
          totalCampaigns,
          totalApprovedLeads,
          totalPendingLeads,
          totalUniqueAccounts: totalAccounts,
          regularCampaignCount: regularCampaignStats.length,
          verificationCampaignCount: verificationCampaignStats.length,
        },
        regularCampaigns: regularCampaignStats,
        verificationCampaigns: verificationCampaignStats,
      },
    });
  } catch (error: any) {
    console.error("[Client Agentic] Stats overview error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get AI-powered campaign report with natural language insights
 */
router.post("/reports/ai-generate", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const { reportType = 'summary', campaignId, dateRange } = req.body;

    // Get stats first
    const statsRes = await fetch(`${req.protocol}://${req.get('host')}/api/client-portal/agentic/stats/overview`, {
      headers: req.headers as any,
    });
    const statsData = await statsRes.json();

    if (!statsData.success) {
      throw new Error("Failed to fetch stats");
    }

    const stats = statsData.data;

    // Generate AI report
    const reportPrompt = `You are a B2B demand generation analyst. Generate a comprehensive report for a client based on their campaign data.

CAMPAIGN DATA:
${JSON.stringify(stats, null, 2)}

REPORT TYPE: ${reportType}
${campaignId ? `FOCUS CAMPAIGN: ${campaignId}` : 'All Campaigns'}
${dateRange ? `DATE RANGE: ${dateRange}` : 'All Time'}

Generate a natural language report that includes:
1. Executive Summary - Key metrics and highlights
2. Campaign Performance - Analysis of each campaign
3. Lead Quality Insights - Breakdown of QA-approved vs pending leads
4. Account Penetration - Unique accounts reached
5. Recommendations - Actionable next steps

Return JSON:
{
  "executiveSummary": "paragraph summarizing performance",
  "highlights": [
    { "metric": "name", "value": "value", "trend": "up|down|stable", "insight": "explanation" }
  ],
  "campaignAnalysis": [
    { "campaignName": "name", "performance": "good|average|needs_attention", "summary": "analysis", "recommendations": ["rec1"] }
  ],
  "leadQualityInsights": "paragraph about lead quality",
  "accountPenetration": "paragraph about account reach",
  "recommendations": ["rec1", "rec2", "rec3"],
  "nextSteps": ["step1", "step2"]
}`;

    const report = await generateJSON(reportPrompt, { temperature: 0.4 });

    res.json({
      success: true,
      data: {
        report,
        stats: stats.summary,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[Client Agentic] Report generation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Natural language query for reports
 */
router.post("/reports/query", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, message: "Question is required" });
    }

    // Get all campaign data for context
    const campaignAccessList = await db
      .select()
      .from(clientCampaignAccess)
      .where(eq(clientCampaignAccess.clientAccountId, context.clientAccountId));

    const regularCampaignIds = campaignAccessList
      .map(a => a.regularCampaignId)
      .filter((id): id is string => id !== null);

    // Get lead data summary
    let leadSummary = { total: 0, approved: 0, pending: 0, rejected: 0 };
    let campaignDetails: any[] = [];
    let uniqueAccounts = 0;

    if (regularCampaignIds.length > 0) {
      const campaignsData = await db
        .select()
        .from(campaigns)
        .where(inArray(campaigns.id, regularCampaignIds));

      const leadStats = await db
        .select({
          qaStatus: leads.qaStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(leads)
        .where(inArray(leads.campaignId, regularCampaignIds))
        .groupBy(leads.qaStatus);

      const accountCount = await db
        .select({
          count: sql<number>`count(DISTINCT ${leads.accountName})::int`,
        })
        .from(leads)
        .where(
          and(
            inArray(leads.campaignId, regularCampaignIds),
            eq(leads.qaStatus, 'approved')
          )
        );

      uniqueAccounts = accountCount[0]?.count || 0;

      leadStats.forEach(stat => {
        leadSummary.total += stat.count;
        if (stat.qaStatus === 'approved' || stat.qaStatus === 'published') {
          leadSummary.approved += stat.count;
        } else if (stat.qaStatus === 'new' || stat.qaStatus === 'under_review') {
          leadSummary.pending += stat.count;
        } else if (stat.qaStatus === 'rejected') {
          leadSummary.rejected += stat.count;
        }
      });

      campaignDetails = campaignsData.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
      }));
    }

    // Use AI to answer the question
    const answerPrompt = `You are a helpful data analyst for a B2B lead generation client. Answer their question based on the available data.

CLIENT DATA:
- Total Campaigns: ${campaignDetails.length}
- Campaigns: ${campaignDetails.map(c => c.name).join(', ') || 'None'}
- Total Leads: ${leadSummary.total}
- QA Approved Leads (ready for client): ${leadSummary.approved}
- Pending Review: ${leadSummary.pending}
- Rejected: ${leadSummary.rejected}
- Unique Accounts: ${uniqueAccounts}

CLIENT QUESTION: ${question}

Provide a helpful, concise answer. If you don't have enough data to answer, say so and suggest what data would be needed.

Return JSON:
{
  "answer": "Your natural language answer here",
  "relevantMetrics": [
    { "name": "metric name", "value": "value" }
  ],
  "suggestions": ["suggestion if applicable"],
  "needsMoreData": false
}`;

    const response = await generateJSON(answerPrompt, { temperature: 0.3 });

    res.json({
      success: true,
      data: {
        question,
        response,
        context: {
          campaignCount: campaignDetails.length,
          leadSummary,
          uniqueAccounts,
        },
      },
    });
  } catch (error: any) {
    console.error("[Client Agentic] Query error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== BILLING ENDPOINTS ====================

/**
 * Get billing summary with AI insights
 */
router.get("/billing/summary", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);

    // Get billing config
    const billingConfig = await db.query.clientBillingConfig.findFirst({
      where: eq(clientBillingConfig.clientAccountId, context.clientAccountId),
    });

    // Get invoices
    const invoices = await db
      .select()
      .from(clientInvoices)
      .where(eq(clientInvoices.clientAccountId, context.clientAccountId))
      .orderBy(desc(clientInvoices.createdAt))
      .limit(10);

    const totalSpent = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0);
    const outstanding = invoices
      .filter((inv) => inv.status !== "paid")
      .reduce((sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.amountPaid || 0)), 0);

    // Get orders for usage
    const orders = await db
      .select()
      .from(clientPortalOrders)
      .where(eq(clientPortalOrders.clientAccountId, context.clientAccountId))
      .orderBy(desc(clientPortalOrders.createdAt))
      .limit(20);

    const summary = {
      billingModel: billingConfig?.billingModel || "cpl",
      totalSpent,
      outstanding,
      invoiceCount: invoices.length,
      recentInvoices: invoices.slice(0, 5),
      usage: {
        totalOrders: orders.length,
        totalLeadsOrdered: orders.reduce((sum, o) => sum + o.requestedQuantity, 0),
        totalLeadsDelivered: orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0),
      },
    };

    // Generate AI insights
    const insightPrompt = `Analyze this client billing data and provide insights:

BILLING DATA:
${JSON.stringify(summary, null, 2)}

Provide:
1. Spending trend analysis
2. Cost optimization suggestions
3. Usage patterns
4. Recommendations

Return JSON:
{
  "insights": ["insight1", "insight2"],
  "recommendations": ["rec1", "rec2"],
  "spendingTrend": "increasing|stable|decreasing",
  "costPerLead": number,
  "projectedMonthlySpend": number
}`;

    const insights = await generateJSON(insightPrompt, { temperature: 0.3 });

    res.json({
      success: true,
      data: {
        ...summary,
        aiInsights: insights,
      },
    });
  } catch (error: any) {
    console.error("[Client Agentic] Billing summary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Estimate cost for order
 */
router.post("/billing/estimate", async (req: Request, res: Response) => {
  try {
    const context = getClientContext(req);
    const { volumeRequested, campaignType, deliveryTimeline, channels } = req.body;

    // Get billing config for pricing
    const billingConfig = await db.query.clientBillingConfig.findFirst({
      where: eq(clientBillingConfig.clientAccountId, context.clientAccountId),
    });

    const baseRate = Number(billingConfig?.cplRate) || 50; // Default $50 CPL
    let multiplier = 1;

    // Apply multipliers
    if (deliveryTimeline === "immediate") multiplier *= 1.5; // Rush fee
    if (channels?.includes("voice") && channels?.includes("email")) multiplier *= 1.1; // Multi-channel premium

    const estimatedCost = volumeRequested * baseRate * multiplier;

    res.json({
      success: true,
      data: {
        volumeRequested,
        baseRate,
        multiplier,
        estimatedCost,
        breakdown: {
          basePrice: volumeRequested * baseRate,
          rushFee: deliveryTimeline === "immediate" ? volumeRequested * baseRate * 0.5 : 0,
          multiChannelPremium:
            channels?.includes("voice") && channels?.includes("email") ? volumeRequested * baseRate * 0.1 : 0,
          total: estimatedCost,
        },
      },
    });
  } catch (error: any) {
    console.error("[Client Agentic] Cost estimate error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CAPABILITIES ENDPOINT ====================

/**
 * Get all available agentic capabilities
 */
router.get("/capabilities", (req: Request, res: Response) => {
  const capabilities = {
    campaignOrders: {
      name: "Campaign Orders",
      description: "Create and manage campaign orders with AI-powered optimization",
      features: ["Order creation", "AI recommendations", "Cost estimation", "Volume optimization"],
    },
    voiceSimulations: {
      name: "Voice Simulations",
      description: "Practice sales calls with AI-powered realistic simulations",
      features: [
        "Text-based simulations",
        "Gemini Live real-time voice",
        "Multiple scenarios",
        "Performance analysis",
      ],
    },
    emailGeneration: {
      name: "Email Generation",
      description: "Generate high-converting B2B sales emails",
      features: ["Single emails", "Complete sequences", "A/B variants", "Spam analysis"],
    },
    imageGeneration: {
      name: "Image Generation",
      description: "Create marketing visuals with Imagen 3",
      features: ["Multiple formats", "Brand alignment", "Style presets", "Batch generation"],
    },
    reporting: {
      name: "Campaign Reporting",
      description: "AI-powered analytics and insights",
      features: ["Performance reports", "ROI analysis", "Trend detection", "Recommendations"],
    },
    campaignSetup: {
      name: "Agentic Campaign Setup",
      description: "Create complete campaigns from goals",
      features: ["Goal-based creation", "Strategy generation", "Agent configuration", "Sequence planning"],
    },
    billing: {
      name: "Billing & Usage",
      description: "Track spending and get cost insights",
      features: ["Usage tracking", "Cost estimation", "AI insights", "Invoice management"],
    },
  };

  res.json({ success: true, capabilities });
});

export default router;
