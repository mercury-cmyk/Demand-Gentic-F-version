import { Router } from "express";
import { requireAuth, requireDualAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  campaignTestCalls,
  campaigns,
  virtualAgents,
  campaignAgentAssignments,
  insertCampaignTestCallSchema,
  type CampaignTestCall,
  workOrders, // Import workOrders
} from "@shared/schema";
import { AiAgentSettings, CallContext } from "../services/ai-voice-agent";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { env } from "../env";
import { getOrganizationById } from "../services/problem-intelligence/organization-service";
// number-pool-integration only needed for production calls; test calls bypass it
import { releaseNumberWithoutOutcome } from "../services/number-pool-integration";
// CRITICAL: Use unified call context builder to ensure test and queue calls are identical
import {
  buildUnifiedCallContext,
  contextToClientStateParams,
  storeCallSession,
  resolveAgentAssignment,
  type UnifiedCallContext,
} from "../services/unified-call-context";


const router = Router();

/**
 * Detect if a phone number is international (non-US/Canada)
 * Returns codec preference and region info for diagnostics
 */
function getInternationalCallInfo(phoneNumber: string): {
  isInternational: boolean;
  codec: 'PCMA' | 'PCMU';
  region: string;
  countryCode: string;
} {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  const digits = cleaned.startsWith('+') ? cleaned.substring(1) : cleaned;

  // µ-law regions
  if (digits.startsWith('1')) return { isInternational: false, codec: 'PCMU', region: 'US/Canada', countryCode: '1' };
  if (digits.startsWith('81')) return { isInternational: true, codec: 'PCMU', region: 'Japan', countryCode: '81' };

  // A-law regions (international)
  const regionMap: Record<string, string> = {
    '44': 'UK', '49': 'Germany', '33': 'France', '61': 'Australia',
    '91': 'India', '971': 'UAE', '86': 'China', '55': 'Brazil',
    '966': 'Saudi Arabia', '974': 'Qatar', '973': 'Bahrain', '968': 'Oman',
    '965': 'Kuwait', '962': 'Jordan', '961': 'Lebanon', '27': 'South Africa',
  };

  for (const [prefix, region] of Object.entries(regionMap)) {
    if (digits.startsWith(prefix)) {
      return { isInternational: true, codec: 'PCMA', region, countryCode: prefix };
    }
  }

  return { isInternational: true, codec: 'PCMA', region: 'International', countryCode: digits.substring(0, 3) };
}

// Schema for initiating a test call
const initiateTestCallSchema = z.object({
  campaignId: z.string(),
  testPhoneNumber: z.string().min(10, "Valid phone number required"),
  testContactName: z.string().min(1, "Contact name required"),
  testCompanyName: z.string().optional(),
  testJobTitle: z.string().optional(),
  testContactEmail: z.string().email().optional().or(z.literal('')).transform(val => val || undefined),
  customVariables: z.record(z.unknown()).optional(),
  // Default to Google for Google-native platform
  voiceProvider: z.enum(["openai", "google"]).optional().default("google"),
});

/**
 * POST /api/campaigns/:campaignId/test-call
 * Initiate a test call for a specific campaign
 * This uses the campaign's actual AI agent and queue system to validate real behavior
 */
router.post("/:campaignId/test-call", requireDualAuth, requireRole("admin", "campaign_manager", "client"), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user?.userId;
    const isClient = req.user?.role === 'client';
    const clientAccountId = isClient ? (req.user as any).clientAccountId || (req.user as any).tenantId : null;
    const isWorkOrderSource = req.query.source === 'work_order';

    console.log("[Campaign Test Call] Request received:", { campaignId, userId, isClient, isWorkOrderSource, body: req.body });

    // Guard: calls blocked by default — only enabled after clicking "Switch to Dev" in Telephony settings
    if (process.env.CALL_EXECUTION_ENABLED !== 'true') {
      return res.status(403).json({
        message: "Call execution is not enabled. Go to Settings > Telephony and click 'Switch to Dev' to enable calls on this server."
      });
    }

    // Validate request body
    const validatedData = initiateTestCallSchema.parse({
      campaignId,
      ...req.body,
    });

    console.log("[Campaign Test Call] Validated data:", validatedData);

    let campaign: any;
    let assignment: any;
    let campaignOrganizationName: string | undefined;

    if (isWorkOrderSource) {
      // Logic for Test Call from Campaign Creation Wizard (Draft Work Order)
      const [workOrder] = await db.select().from(workOrders).where(eq(workOrders.id, campaignId)).limit(1);
      
      if (!workOrder) {
        return res.status(404).json({ message: "Work Order draft not found", requestedId: campaignId });
      }

      // CLIENT OWNERSHIP CHECK (Work Order)
      if (isClient && workOrder.clientAccountId !== clientAccountId) {
        console.warn(`[Campaign Test Call] Client ${clientAccountId} attempted to access work order ${workOrder.id} owned by ${workOrder.clientAccountId}`);
        return res.status(403).json({ message: "Access denied: work order does not belong to your account" });
      }

      // Construct Mock Campaign Object
      campaign = {
        id: workOrder.id,
        type: 'call',
        dialMode: 'ai_agent',
        status: 'draft',
        // Mock organization ID lookup if needed, or null
        problemIntelligenceOrgId: null, 
      };

      // Construct Mock Agent Assignment from Work Order Config
      const config = workOrder.campaignConfig as any;
      
      // Safety check for empty aiAgent config
      const aiConfig = config.aiAgent || {};
      const agentPersona = aiConfig.persona || 'Helpful Assistant';
      const agentTone = aiConfig.tone || 'professional';
      const openingScript = aiConfig.openingScript || 'Hello, this is a test call.';
      const voiceId = aiConfig.voice || 'Fenrir';

      // Build system prompt dynamically
      const basePrompt = `You are ${agentPersona}. Tone: ${agentTone}. Objective: ${config.objective || 'N/A'}.`;
      
      // In a real scenario, we might want to use the same rigorous prompt builder as the main campaigns
      let systemPrompt = basePrompt;
      try {
         systemPrompt = await buildAgentSystemPrompt(basePrompt);
      } catch (err) {
         console.warn("[Campaign Test Call] Failed to build full system prompt for Work Order, using base:", err);
      }

      assignment = {
        virtualAgentId: 'temp_work_order_agent',
        agentName: agentPersona,
        systemPrompt: systemPrompt,
        firstMessage: openingScript,
        voice: voiceId,
        settings: {}, // Default settings
      };
      
      console.log("[Campaign Test Call] Using Work Order Configuration for Test.");

    } else {
        // Standard Logic: Get the campaign from DB
        campaign = await storage.getCampaign(campaignId);
        console.log("[Campaign Test Call] Campaign lookup result:", campaign ? { id: campaign.id, type: campaign.type, dialMode: campaign.dialMode } : null);
        
        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found", requestedId: campaignId });
        }

        // CLIENT OWNERSHIP CHECK (Campaign)
        if (isClient && campaign.clientAccountId !== clientAccountId) {
           console.warn(`[Campaign Test Call] Client ${clientAccountId} attempted to access campaign ${campaign.id} owned by ${campaign.clientAccountId}`);
           return res.status(403).json({ message: "Access denied: campaign does not belong to your account" });
        }

        // Verify campaign is a phone-capable campaign with AI agent mode (ai_agent or hybrid)
        // All campaign types that support voice/phone calls
        const PHONE_CAPABLE_TYPES = [
          'call', 'telemarketing', 'sql',
          'content_syndication', 'appointment_generation', 'high_quality_leads',
          'live_webinar', 'on_demand_webinar', 'executive_dinner',
          'leadership_forum', 'conference'
        ];

        const isPhoneCapable = PHONE_CAPABLE_TYPES.includes(campaign.type) ||
                              campaign.dialMode === 'ai_agent' ||
                              campaign.dialMode === 'hybrid';

        if (!isPhoneCapable) {
          return res.status(400).json({
            message: "Test calls are only available for phone-capable campaigns",
            campaignType: campaign.type,
            dialMode: campaign.dialMode,
            supportedTypes: PHONE_CAPABLE_TYPES
          });
        }

        if (campaign.dialMode !== "ai_agent" && campaign.dialMode !== "hybrid") {
          return res.status(400).json({
            message: "Test calls are only available for AI Agent or Hybrid campaigns",
            dialMode: campaign.dialMode,
            requiredDialMode: "ai_agent or hybrid"
          });
        }
      }

        // Check environment configuration
        const telnyxApiKey = env.TELNYX_API_KEY;
        const openaiApiKey = env.OPENAI_API_KEY;
        const googleApiKey = env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY;
        const googleProjectId = env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT_ID;
        const texmlAppId = env.TELNYX_TEXML_APP_ID;

        // Validate provider-specific credentials
        if (validatedData.voiceProvider === 'google') {
          if (!googleApiKey && !googleProjectId) {
            return res.status(500).json({
              message: "Google/Gemini credentials not configured. Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY in your .env.local file.",
              provider: "google"
            });
          }
          console.log("[Campaign Test Call] Using Google Gemini voice provider");
        } else {
          if (!openaiApiKey) {
            return res.status(500).json({ message: "OpenAI API key not configured" });
          }
          console.log("[Campaign Test Call] Using OpenAI voice provider");
        }

        // Normalize phone number to E.164
        let normalizedPhone = validatedData.testPhoneNumber.replace(/[^\d+]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          if (normalizedPhone.startsWith('0')) {
            normalizedPhone = '+44' + normalizedPhone.substring(1);
          } else {
            normalizedPhone = '+' + normalizedPhone;
          }
        }

        // TEST CALLS: Skip number pool enforcement entirely for immediate execution.
        let fromNumber: string = env.TELNYX_FROM_NUMBER || '';
        let callerNumberId: string | undefined;
        let callerNumberDecisionId: string | undefined;

        if (!fromNumber) {
          return res.status(500).json({
            message: "No phone number configured. Please set TELNYX_FROM_NUMBER in your .env.local file."
          });
        }
        console.log(`[Campaign Test Call] ⚡ Using direct number (no pool): ${fromNumber}`);

        // Build Unified Context
        // This ensures test calls use the EXACT same context logic as production queue calls
        const ctx = await buildUnifiedCallContext({
          campaignId,
          isTestCall: true,
          provider: (validatedData.voiceProvider === 'google') ? 'google' : 'openai',
          calledNumber: normalizedPhone,
          fromNumber: fromNumber,
          callerNumberId,
          callerNumberDecisionId,
          contactName: validatedData.testContactName,
          contactFirstName: validatedData.testContactName?.split(' ')[0],
          contactEmail: validatedData.testContactEmail,
          contactJobTitle: validatedData.testJobTitle,
          accountName: validatedData.testCompanyName,
        });

        if (!ctx) {
           return res.status(400).json({
              message: "No AI voice configuration found for this campaign",
              suggestion: "Please configure AI voice settings in the campaign wizard before testing"
           });
        }

        // Create test call record in database
        const isInlineCampaignAgent = ctx.virtualAgentId?.startsWith('campaign-') && ctx.virtualAgentId?.includes('-inline');
        const dbVirtualAgentId = isInlineCampaignAgent ? null : ctx.virtualAgentId;

        const [testCallRecord] = await db.insert(campaignTestCalls).values({
          id: ctx.testCallId!,
          campaignId,
          virtualAgentId: dbVirtualAgentId,
          testPhoneNumber: normalizedPhone,
          testContactName: validatedData.testContactName,
          testCompanyName: validatedData.testCompanyName || null,
          testJobTitle: validatedData.testJobTitle || null,
          testContactEmail: validatedData.testContactEmail || null,
          customVariables: validatedData.customVariables || null,
          status: 'pending',
          testedBy: userId,
        }).returning();

        const testCallId = testCallRecord.id;

        // Store session in Redis
        await storeCallSession(ctx);

        // Generate client state params
        const customParams = contextToClientStateParams(ctx);
        
        // HACK: Explicitly include system_prompt in customParams because existing voice-dialer.ts 
        // logic (lines 1172+) looks for it there. Ideally, voice-dialer should read from Redis.
        // We include it here to ensure test calls work with current voice-dialer implementation.
        if (ctx.systemPrompt) {
            customParams.system_prompt = ctx.systemPrompt;
        }

        const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');
        const providerForClientState = (ctx.provider === 'google') ? 'gemini_live' : 'openai_realtime';

    // Prepare webhook URL - include client_state as query param so it's available at the TeXML endpoint
    // DEVELOPMENT: Use ngrok tunnel (PUBLIC_WEBHOOK_HOST) - this is set by dev-with-ngrok.ts
    // PRODUCTION: Use PUBLIC_TEXML_HOST or TELNYX_WEBHOOK_URL
    let webhookHost = '';
    
    // In development, prefer the ngrok tunnel host
    if (process.env.NODE_ENV !== 'production' && process.env.PUBLIC_WEBHOOK_HOST) {
      webhookHost = process.env.PUBLIC_WEBHOOK_HOST;
      console.log(`[Campaign Test Call] Using ngrok tunnel host: ${webhookHost}`);
    } else {
      // Production or fallback
      webhookHost = env.PUBLIC_TEXML_HOST || env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || '';
      if (!webhookHost && process.env.TELNYX_WEBHOOK_URL) {
        try {
          const u = new URL((process.env.TELNYX_WEBHOOK_URL || "").trim());
          webhookHost = u.host;
        } catch {}
      }
    }
    
    // Ensure host doesn't have protocol
    webhookHost = (webhookHost || 'localhost:5000').replace(/^https?:\/\//, '');
    
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    // Pass client_state in URL so TeXML endpoint can forward it to WebSocket
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call?client_state=${encodeURIComponent(clientStateB64)}`;
    
    // Detect international call routing info
    const callInfo = getInternationalCallInfo(normalizedPhone);

    console.log("=".repeat(60));
    console.log(`[Campaign Test Call] 🔧 CRITICAL CONFIGURATION CHECK:`);
    console.log(`[Campaign Test Call] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[Campaign Test Call] PUBLIC_WEBHOOK_HOST: ${process.env.PUBLIC_WEBHOOK_HOST}`);
    console.log(`[Campaign Test Call] PUBLIC_TEXML_HOST: ${process.env.PUBLIC_TEXML_HOST}`);
    console.log(`[Campaign Test Call] webhookHost (resolved): ${webhookHost}`);
    console.log(`[Campaign Test Call] TeXML URL that Telnyx will fetch: ${texmlUrl}`);
    console.log(`[Campaign Test Call] Target Provider: ${providerForClientState}`);
    console.log(`[Campaign Test Call] 🌍 International: ${callInfo.isInternational ? `YES - ${callInfo.region} (+${callInfo.countryCode})` : 'NO (US/Canada)'}`);
    console.log(`[Campaign Test Call] 🎧 Codec: ${callInfo.codec} (${callInfo.codec === 'PCMA' ? 'A-law' : 'µ-law'})`);
    if (callInfo.isInternational) {
      console.log(`[Campaign Test Call] 📋 International call notes:`);
      console.log(`[Campaign Test Call]   - TeXML will use ${callInfo.codec} codec to minimize transcoding`);
      console.log(`[Campaign Test Call]   - Krisp noise suppression will be enabled automatically`);
      console.log(`[Campaign Test Call]   - A-law optimized audio path will be used for transcoding`);
    }
    console.log(`[Campaign Test Call] ⚠️ If ngrok is not running, Telnyx cannot reach ${webhookHost}!`);
    console.log("=".repeat(60));

    const payload = {
      texml_application_id: texmlAppId,
      to: normalizedPhone,
      from: fromNumber,
      url: texmlUrl, // Point to our TeXML endpoint with client_state
    };

    console.log('[Campaign Test Call] Sending TeXML payload to Telnyx:', JSON.stringify(payload, null, 2));

    // Initiate the Telnyx TeXML call using the path-based endpoint
    // API format: POST /v2/texml/calls/{application_id}
    const telnyxEndpoint = `https://api.telnyx.com/v2/texml/calls/${texmlAppId}`;
    console.log('[Campaign Test Call] Telnyx endpoint:', telnyxEndpoint);

    const telnyxResponse = await fetch(telnyxEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        To: payload.to,
        From: payload.from,
        Url: payload.url,
        // Prefer explicit webhook URL secret if provided; fallback to resolved host
        // Prefer explicit webhook URL override if available, else fallback to TeXML host
        StatusCallback: (process.env.TELNYX_WEBHOOK_URL || "").trim() || `https://${webhookHost}/api/webhooks/telnyx`,
      }),
    });

    if (!telnyxResponse.ok) {
      releaseNumberWithoutOutcome(callerNumberId || null);
      const errorText = await telnyxResponse.text();
      console.error(`[Campaign Test Call] Telnyx API error: ${telnyxResponse.status} - ${errorText}`);

      let friendlyMessage = `Telnyx API error: ${telnyxResponse.status}`;
      let diagnosticHints: string[] = [];
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors && errorJson.errors.length > 0) {
           const firstError = errorJson.errors[0];
           if (firstError.code === '90041') {
             friendlyMessage = "Call limit reached. Your Telnyx account has exceeded its concurrent call limit. Please try again later or upgrade your plan.";
           } else if (firstError.code === '10010') {
             friendlyMessage = `International routing error: Destination country (+${callInfo.countryCode} ${callInfo.region}) is not in your Telnyx whitelisted countries.`;
             diagnosticHints.push("Add this country to your Telnyx International Dialing whitelist in Mission Control");
             diagnosticHints.push("Check your Telnyx Messaging Profile for international permissions");
           } else if (firstError.code === '40300' || firstError.code === '40301') {
             friendlyMessage = `Carrier routing failure to ${callInfo.region} (+${callInfo.countryCode}). The destination carrier rejected the call.`;
             diagnosticHints.push("This may be a temporary carrier issue - retry in a few minutes");
             diagnosticHints.push("Contact Telnyx support for alternate routing options to this region");
           } else {
             friendlyMessage = firstError.detail || firstError.title || friendlyMessage;
           }
        }
      } catch (e) {
        // ignore parse error
      }

      // Add international-specific diagnostics
      if (callInfo.isInternational && diagnosticHints.length === 0) {
        diagnosticHints.push(`International call to ${callInfo.region} (+${callInfo.countryCode})`);
        diagnosticHints.push("Ensure your Telnyx account has international calling enabled for this country");
        diagnosticHints.push("Short-duration failures (<500ms) typically indicate routing/carrier issues, not codec problems");
      }

      const failureNotes = diagnosticHints.length > 0
        ? `${friendlyMessage}\n\nDiagnostics:\n- ${diagnosticHints.join('\n- ')}`
        : friendlyMessage;

      // Update test call status to failed
      await db.update(campaignTestCalls)
        .set({
          status: 'failed',
          testNotes: failureNotes,
          updatedAt: new Date()
        })
        .where(eq(campaignTestCalls.id, testCallId));

      return res.status(400).json({
        message: friendlyMessage,
        error: errorText,
        status: telnyxResponse.status,
        diagnostics: diagnosticHints.length > 0 ? diagnosticHints : undefined,
        callInfo: callInfo.isInternational ? {
          region: callInfo.region,
          countryCode: callInfo.countryCode,
          codec: callInfo.codec,
        } : undefined,
      });
    }

    const telnyxResult = await telnyxResponse.json();
    const callControlId = telnyxResult.data?.call_control_id;

    // Update test call record with call control ID
    await db.update(campaignTestCalls)
      .set({
        callControlId,
        updatedAt: new Date()
      })
      .where(eq(campaignTestCalls.id, testCallId));

    console.log(`[Campaign Test Call] Call initiated successfully:
  - Call Control ID: ${callControlId}
  - Test Call ID: ${testCallId}`);

    res.json({
      success: true,
      message: callInfo.isInternational
        ? `Test call initiated to ${callInfo.region} (+${callInfo.countryCode}) - your phone should ring shortly. Using ${callInfo.codec === 'PCMA' ? 'A-law' : 'µ-law'} codec with Krisp noise suppression.`
        : "Test call initiated - your phone should ring shortly",
      testCallId,
      callControlId,
      phoneNumber: normalizedPhone,
      campaignName: campaign.name,
      agentName: assignment?.agentName || ctx?.agentName || campaign?.name || 'AI Agent',
      callInfo: callInfo.isInternational ? {
        region: callInfo.region,
        countryCode: callInfo.countryCode,
        codec: callInfo.codec,
        isInternational: true,
        noiseSuppression: 'Krisp',
      } : undefined,
    });

  } catch (error) {
    console.error("[Campaign Test Call] Error:", error);
    if (error instanceof z.ZodError) {
      console.error("[Campaign Test Call] Validation errors:", JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to initiate test call", error: String(error) });
  }
});


/**
 * GET /api/campaigns/:campaignId/test-calls
 * Get all test calls for a campaign
 */
router.get("/:campaignId/test-calls", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = '20', offset = '0' } = req.query;

    const testCalls = await db
      .select({
        id: campaignTestCalls.id,
        campaignId: campaignTestCalls.campaignId,
        virtualAgentId: campaignTestCalls.virtualAgentId,
        testPhoneNumber: campaignTestCalls.testPhoneNumber,
        testContactName: campaignTestCalls.testContactName,
        testCompanyName: campaignTestCalls.testCompanyName,
        testJobTitle: campaignTestCalls.testJobTitle,
        status: campaignTestCalls.status,
        initiatedAt: campaignTestCalls.initiatedAt,
        answeredAt: campaignTestCalls.answeredAt,
        endedAt: campaignTestCalls.endedAt,
        durationSeconds: campaignTestCalls.durationSeconds,
        disposition: campaignTestCalls.disposition,
        testResult: campaignTestCalls.testResult,
        callSummary: campaignTestCalls.callSummary,
        aiPerformanceMetrics: campaignTestCalls.aiPerformanceMetrics,
        detectedIssues: campaignTestCalls.detectedIssues,
        recordingUrl: campaignTestCalls.recordingUrl,
        createdAt: campaignTestCalls.createdAt,
        agentName: virtualAgents.name,
      })
      .from(campaignTestCalls)
      .leftJoin(virtualAgents, eq(virtualAgents.id, campaignTestCalls.virtualAgentId))
      .where(eq(campaignTestCalls.campaignId, campaignId))
      .orderBy(desc(campaignTestCalls.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaignTestCalls)
      .where(eq(campaignTestCalls.campaignId, campaignId));

    res.json({
      testCalls,
      total: countResult?.count || 0,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error("[Campaign Test Calls] Error fetching test calls:", error);
    res.status(500).json({ message: "Failed to fetch test calls" });
  }
});

/**
 * GET /api/campaigns/:campaignId/test-calls/:testCallId
 * Get a specific test call with full details
 */
router.get("/:campaignId/test-calls/:testCallId", requireAuth, async (req, res) => {
  try {
    const { campaignId, testCallId } = req.params;

    const [testCall] = await db
      .select()
      .from(campaignTestCalls)
      .where(
        and(
          eq(campaignTestCalls.id, testCallId),
          eq(campaignTestCalls.campaignId, campaignId)
        )
      )
      .limit(1);

    if (!testCall) {
      return res.status(404).json({ message: "Test call not found" });
    }

    // Get virtual agent details
    let agentDetails = null;
    if (testCall.virtualAgentId) {
      const [agent] = await db
        .select()
        .from(virtualAgents)
        .where(eq(virtualAgents.id, testCall.virtualAgentId))
        .limit(1);
      agentDetails = agent;
    }

    res.json({
      ...testCall,
      agentDetails,
    });
  } catch (error) {
    console.error("[Campaign Test Calls] Error fetching test call:", error);
    res.status(500).json({ message: "Failed to fetch test call details" });
  }
});

/**
 * POST /api/campaigns/:campaignId/test-calls/:testCallId/analyze
 * Analyze a completed test call and generate improvement suggestions
 */
router.post("/:campaignId/test-calls/:testCallId/analyze", requireAuth, requireRole("admin", "campaign_manager"), async (req, res) => {
  try {
    const { campaignId, testCallId } = req.params;

    // Get the test call
    const [testCall] = await db
      .select()
      .from(campaignTestCalls)
      .where(
        and(
          eq(campaignTestCalls.id, testCallId),
          eq(campaignTestCalls.campaignId, campaignId)
        )
      )
      .limit(1);

    if (!testCall) {
      return res.status(404).json({ message: "Test call not found" });
    }

    if (testCall.status !== 'completed') {
      return res.status(400).json({
        message: "Can only analyze completed test calls",
        currentStatus: testCall.status
      });
    }

    if (!testCall.fullTranscript && !testCall.transcriptTurns) {
      return res.status(400).json({
        message: "No transcript available for analysis",
        suggestion: "Test call must have a transcript to analyze"
      });
    }

    // Get the virtual agent for context
    let agentPrompt = '';
    if (testCall.virtualAgentId) {
      const [agent] = await db
        .select()
        .from(virtualAgents)
        .where(eq(virtualAgents.id, testCall.virtualAgentId))
        .limit(1);
      if (agent) {
        agentPrompt = agent.systemPrompt || '';
      }
    }

    // Use Gemini for analysis (fallback from OpenAI to avoid quota issues)
    const geminiKey = env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY;
    if (!geminiKey) {
      return res.status(503).json({
        message: "Gemini API key is not configured. Cannot perform transcript analysis."
      });
    }

    // Check transcript quality
    const transcriptText = testCall.fullTranscript || JSON.stringify(testCall.transcriptTurns, null, 2);
    const hasAgentTurns = /\b(Agent|AI|Assistant):/i.test(transcriptText);
    const hasContactTurns = /\b(Contact|Prospect|User|Customer):/i.test(transcriptText);
    const transcriptQualityWarning = !hasAgentTurns ? `
⚠️ TRANSCRIPT QUALITY WARNING: The transcript appears to be missing AGENT turns. 
This is a data capture issue - the agent's responses were not recorded.
Flag this as "transcript_data_gap" issue with HIGH severity.
` : '';

    const analysisPrompt = `You are an expert B2B sales call analyst. Analyze this B2B cold call transcript and provide actionable feedback for improving the AI agent's performance.

AGENT SYSTEM PROMPT (for context):
${agentPrompt}

CALL TRANSCRIPT:
${transcriptText}
${transcriptQualityWarning}

CALL OUTCOME:
- Duration: ${testCall.durationSeconds || 'Unknown'} seconds
- Disposition: ${testCall.disposition || 'Unknown'}
- Summary: ${testCall.callSummary || 'None'}

ANALYSIS RULES:
1. If the transcript is missing agent turns, flag this as a HIGH severity "transcript_data_gap" issue
2. If the summary claims "interest" but disposition is "not_interested", flag as "summary_inaccuracy" issue
3. Skeptical questions ("Why are you calling?", "Who is this?") are NOT interest signals
4. A call ending with the prospect hanging up or being dismissive is "not_interested", not "qualified"
5. Be critical - this analysis is used to improve the AI agent

Analyze the call and return a JSON object with:
{
  "overallScore": <1-10>,
  "testResult": "success" | "needs_improvement" | "failed",
  "performanceMetrics": {
    "identityConfirmed": <boolean>,
    "gatekeeperHandled": <boolean>,
    "pitchDelivered": <boolean>,
    "objectionHandled": <boolean>,
    "closingAttempted": <boolean>,
    "conversationFlow": "natural" | "scripted" | "awkward",
    "rapportBuilding": "excellent" | "good" | "needs_work" | "poor"
  },
  "detectedIssues": [
    {
      "type": "<issue_type: transcript_data_gap | summary_inaccuracy | objection_handling_failure | purpose_delivery_ineffectiveness | premature_ending | etc>",
      "severity": "low" | "medium" | "high",
      "description": "<what went wrong>",
      "suggestion": "<how to fix it>"
    }
  ],
  "promptImprovementSuggestions": [
    {
      "category": "opening" | "gatekeeper" | "pitch" | "objection_handling" | "closing" | "tone" | "pacing",
      "currentBehavior": "<what the agent currently does>",
      "suggestedChange": "<specific prompt modification>",
      "expectedImprovement": "<what will improve>"
    }
  ],
  "summary": "<2-3 sentence summary of the analysis - must be consistent with disposition>"
}

Return ONLY valid JSON, no other text.`;

    // Use Gemini for analysis
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genai = new GoogleGenerativeAI(geminiKey);

    // Try multiple Gemini models in order of preference
    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let analysisContent: string | null = null;
    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`[Campaign Test Calls] Trying Gemini ${modelName} for analysis...`);
        const model = genai.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          }
        });
        const result = await model.generateContent(analysisPrompt);
        analysisContent = result.response?.text() || null;
        if (analysisContent) {
          console.log(`[Campaign Test Calls] Gemini ${modelName} succeeded`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.log(`[Campaign Test Calls] Gemini ${modelName} failed: ${err.message}`);
        continue;
      }
    }

    if (!analysisContent) {
      throw lastError || new Error("All Gemini models failed to analyze the call");
    }

    // Parse JSON - handle potential markdown code blocks
    let jsonStr = analysisContent.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const analysis = JSON.parse(jsonStr.trim());

    // Update the test call record with analysis results
    await db.update(campaignTestCalls)
      .set({
        aiPerformanceMetrics: analysis.performanceMetrics,
        detectedIssues: analysis.detectedIssues,
        promptImprovementSuggestions: analysis.promptImprovementSuggestions,
        testResult: analysis.testResult,
        updatedAt: new Date(),
      })
      .where(eq(campaignTestCalls.id, testCallId));

    res.json({
      success: true,
      analysis: {
        overallScore: analysis.overallScore,
        testResult: analysis.testResult,
        performanceMetrics: analysis.performanceMetrics,
        detectedIssues: analysis.detectedIssues,
        promptImprovementSuggestions: analysis.promptImprovementSuggestions,
        summary: analysis.summary,
      },
    });
  } catch (error: any) {
    console.error("[Campaign Test Calls] Error analyzing test call:", error);
    // Include stack trace in development or strict detailed error
    res.status(500).json({ 
      message: "Failed to analyze test call", 
      error: String(error),
      details: error.message || "Unknown error",
      stack: env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/test-calls/:testCallId
 * Update a test call (e.g., add notes, mark result)
 */
router.patch("/:campaignId/test-calls/:testCallId", requireAuth, requireRole("admin", "campaign_manager"), async (req, res) => {
  try {
    const { campaignId, testCallId } = req.params;
    const { testResult, testNotes } = req.body;

    const [updated] = await db.update(campaignTestCalls)
      .set({
        testResult,
        testNotes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaignTestCalls.id, testCallId),
          eq(campaignTestCalls.campaignId, campaignId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Test call not found" });
    }

    res.json({ success: true, testCall: updated });
  } catch (error) {
    console.error("[Campaign Test Calls] Error updating test call:", error);
    res.status(500).json({ message: "Failed to update test call" });
  }
});

/**
 * POST /api/campaign-test-calls/webhook
 * DEPRECATED: This webhook endpoint is kept for backwards compatibility.
 * All Telnyx webhooks should use /api/webhooks/telnyx instead.
 * The main webhook handler now processes test call events automatically.
 */
router.post("/webhook", async (req, res) => {
  try {
    // Always respond immediately
    res.status(200).send("OK");

    console.log(`[Test Call Webhook] ⚠️ DEPRECATED: Received event on /api/campaign-test-calls/webhook - should use /api/webhooks/telnyx`);

    const event = req.body;
    const eventData = event.data || event;
    const eventType = eventData.event_type || (event as any).event_type;
    const payload = eventData.payload || eventData;

    // Decode client_state to get test call ID
    let clientState: any = null;
    if (payload?.client_state) {
      try {
        clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
      } catch (e) {
        // Ignore decode errors
      }
    }

    if (!clientState?.is_test_call || !clientState?.test_call_id) {
      console.log(`[Test Call Webhook] Not a test call. Skipping.`);
      return;
    }

    const testCallId = clientState.test_call_id;
    console.log(`[Test Call Webhook] Processing legacy webhook for test call ${testCallId}`);

    // Handle the event (same logic as main webhook)
    switch (eventType) {
      case 'call.initiated':
        console.log(`[Test Call Webhook] Test call ${testCallId} initiated`);
        break;

      case 'call.answered':
        console.log(`[Test Call Webhook] Test call ${testCallId} answered`);
        await db.update(campaignTestCalls)
          .set({
            status: 'in_progress',
            answeredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(campaignTestCalls.id, testCallId));
        break;

      case 'call.hangup':
      case 'call.ended':
        console.log(`[Test Call Webhook] Test call ${testCallId} ended`);

        // Calculate duration
        const [testCall] = await db
          .select({ answeredAt: campaignTestCalls.answeredAt, testPhoneNumber: campaignTestCalls.testPhoneNumber })
          .from(campaignTestCalls)
          .where(eq(campaignTestCalls.id, testCallId))
          .limit(1);

        let durationSeconds = 0;
        if (testCall?.answeredAt) {
          durationSeconds = Math.floor((Date.now() - new Date(testCall.answeredAt).getTime()) / 1000);
        }

        // Detect short-duration international call failures (sub-500ms / no media exchange)
        // These indicate routing or carrier issues, not codec problems
        const hangupCause = payload?.hangup_cause || payload?.sip_hangup_cause || '';
        const sipCode = payload?.sip_response_code || '';
        const endedCallInfo = getInternationalCallInfo(testCall?.testPhoneNumber || '');

        let failureNote = '';
        if (durationSeconds === 0 && !testCall?.answeredAt) {
          // Call never answered - routing failure
          failureNote = `Call failed without being answered.`;
          if (endedCallInfo.isInternational) {
            failureNote += ` International call to ${endedCallInfo.region} (+${endedCallInfo.countryCode}).`;
            failureNote += ` This typically indicates a carrier routing issue. SIP cause: ${hangupCause || sipCode || 'unknown'}.`;
            failureNote += ` Recommendation: Contact Telnyx support with this call ID for routing investigation.`;
          }
          if (hangupCause) failureNote += ` Hangup cause: ${hangupCause}.`;
          console.warn(`[Test Call Webhook] ⚠️ Short-duration failure for ${testCallId}: ${failureNote}`);
        }

        await db.update(campaignTestCalls)
          .set({
            status: 'completed',
            endedAt: new Date(),
            durationSeconds,
            testNotes: failureNote || undefined,
            disposition: durationSeconds === 0 && !testCall?.answeredAt
              ? (endedCallInfo.isInternational ? 'routing_failure' : 'no_answer')
              : undefined,
            updatedAt: new Date(),
          })
          .where(eq(campaignTestCalls.id, testCallId));
        break;

      case 'call.machine.detection.ended': {
        // Handle machine/voicemail detection - enforce "NEVER leave voicemail" rule
        const amdResult = payload?.result || payload?.machine_detection_result;
        console.log(`[Test Call Webhook] Machine detection result for test call ${testCallId}: ${amdResult}`);
        
        // CRITICAL: Use startsWith('machine') to catch ALL machine results (machine, machine_start, machine_end_*)
        if (amdResult?.startsWith('machine') || amdResult === 'voicemail' || amdResult === 'fax') {
          // Mark as machine detected and hang up immediately
          await db.update(campaignTestCalls)
            .set({
              status: 'completed',
              disposition: 'voicemail',
              testResult: 'failed',
              callSummary: 'Call reached voicemail/answering machine - automatically disconnected per "no voicemail" policy',
              endedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(campaignTestCalls.id, testCallId));
          
          // Hang up immediately to avoid leaving voicemail
          const callControlId = payload?.call_control_id;
          if (callControlId) {
            try {
              const telnyxApiKey = env.TELNYX_API_KEY;
              await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${telnyxApiKey}`,
                },
                body: JSON.stringify({ client_state: payload?.client_state }),
              });
              console.log(`[Test Call Webhook] Hung up machine-detected call ${testCallId}`);
            } catch (hangupErr) {
              console.error(`[Test Call Webhook] Failed to hang up machine-detected call:`, hangupErr);
            }
          }
        }
        break;
      }

      case 'call.recording.saved':
        const recordingUrl = payload?.recording?.url;
        if (recordingUrl) {
          console.log(`[Test Call Webhook] Recording saved for test call ${testCallId}`);
          await db.update(campaignTestCalls)
            .set({
              recordingUrl,
              updatedAt: new Date(),
            })
            .where(eq(campaignTestCalls.id, testCallId));
        }
        break;

      default:
        // Log for traceability but don't treat as error
        console.log(`[Test Call Webhook] Event type: ${eventType} (no handler)`);
        break;
    }
  } catch (error) {
    console.error("[Test Call Webhook] Error:", error);
  }
});

/**
 * GET /api/campaigns/:campaignId/test-calls/summary
 * Get summary statistics for test calls in a campaign
 */
router.get("/:campaignId/test-calls-summary", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`count(*) filter (where ${campaignTestCalls.status} = 'completed')`,
        successful: sql<number>`count(*) filter (where ${campaignTestCalls.testResult} = 'success')`,
        needsImprovement: sql<number>`count(*) filter (where ${campaignTestCalls.testResult} = 'needs_improvement')`,
        failed: sql<number>`count(*) filter (where ${campaignTestCalls.testResult} = 'failed')`,
        avgDuration: sql<number>`avg(${campaignTestCalls.durationSeconds})`,
      })
      .from(campaignTestCalls)
      .where(eq(campaignTestCalls.campaignId, campaignId));

    // Get common issues
    const recentTestCalls = await db
      .select({
        detectedIssues: campaignTestCalls.detectedIssues,
      })
      .from(campaignTestCalls)
      .where(
        and(
          eq(campaignTestCalls.campaignId, campaignId),
          eq(campaignTestCalls.status, 'completed')
        )
      )
      .orderBy(desc(campaignTestCalls.createdAt))
      .limit(10);

    // Aggregate common issues
    const issueFrequency: Record<string, number> = {};
    for (const tc of recentTestCalls) {
      const issues = tc.detectedIssues as any[] || [];
      for (const issue of issues) {
        const key = issue.type || 'unknown';
        issueFrequency[key] = (issueFrequency[key] || 0) + 1;
      }
    }

    const commonIssues = Object.entries(issueFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    res.json({
      stats: stats[0] || {
        total: 0,
        completed: 0,
        successful: 0,
        needsImprovement: 0,
        failed: 0,
        avgDuration: 0,
      },
      commonIssues,
    });
  } catch (error) {
    console.error("[Campaign Test Calls] Error fetching summary:", error);
    res.status(500).json({ message: "Failed to fetch test calls summary" });
  }
});

export default router;
