import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
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
} from "@shared/schema";
import { AiAgentSettings, CallContext } from "../services/ai-voice-agent";
import openai from "../lib/openai";

const router = Router();

// Schema for initiating a test call
const initiateTestCallSchema = z.object({
  campaignId: z.string(),
  testPhoneNumber: z.string().min(10, "Valid phone number required"),
  testContactName: z.string().min(1, "Contact name required"),
  testCompanyName: z.string().optional(),
  testJobTitle: z.string().optional(),
  testContactEmail: z.string().email().optional().or(z.literal('')).transform(val => val || undefined),
  customVariables: z.record(z.unknown()).optional(),
  voiceProvider: z.enum(["openai", "google"]).optional().default("openai"),
});

/**
 * POST /api/campaigns/:campaignId/test-call
 * Initiate a test call for a specific campaign
 * This uses the campaign's actual AI agent and queue system to validate real behavior
 */
router.post("/:campaignId/test-call", requireAuth, requireRole("admin", "campaign_manager"), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;

    console.log("[Campaign Test Call] Request received:", { campaignId, userId, body: req.body });

    // Validate request body
    const validatedData = initiateTestCallSchema.parse({
      campaignId,
      ...req.body,
    });

    console.log("[Campaign Test Call] Validated data:", validatedData);

    // Get the campaign
    const campaign = await storage.getCampaign(campaignId);
    console.log("[Campaign Test Call] Campaign lookup result:", campaign ? { id: campaign.id, type: campaign.type, dialMode: campaign.dialMode } : null);
    
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found", requestedId: campaignId });
    }

    // Verify campaign is a call campaign with AI agent mode
    if (campaign.type !== "call") {
      return res.status(400).json({ message: "Test calls are only available for call campaigns" });
    }

    if (campaign.dialMode !== "ai_agent") {
      return res.status(400).json({
        message: "Test calls are only available for AI Agent campaigns",
        dialMode: campaign.dialMode,
        requiredDialMode: "ai_agent"
      });
    }

    // Get the virtual agent assigned to this campaign
    const [assignment] = await db
      .select({
        virtualAgentId: campaignAgentAssignments.virtualAgentId,
        agentName: virtualAgents.name,
        systemPrompt: virtualAgents.systemPrompt,
        firstMessage: virtualAgents.firstMessage,
        voice: virtualAgents.voice,
        settings: virtualAgents.settings,
      })
      .from(campaignAgentAssignments)
      .innerJoin(virtualAgents, eq(virtualAgents.id, campaignAgentAssignments.virtualAgentId))
      .where(
        and(
          eq(campaignAgentAssignments.campaignId, campaignId),
          eq(campaignAgentAssignments.agentType, "ai"),
          eq(campaignAgentAssignments.isActive, true)
        )
      )
      .limit(1);

    if (!assignment) {
      return res.status(400).json({
        message: "No AI agent assigned to this campaign",
        suggestion: "Please assign a virtual agent to the campaign before testing"
      });
    }

    // Check environment configuration
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.TELNYX_FROM_NUMBER;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const googleApiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const googleProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    // For TeXML outbound calls, use ONLY TELNYX_TEXML_APP_ID
    const texmlAppId = process.env.TELNYX_TEXML_APP_ID;

    if (!telnyxApiKey || !fromNumber || telnyxApiKey.startsWith('REPLACE_ME')) {
      return res.status(500).json({ message: "Telnyx not configured. Please set TELNYX_API_KEY and TELNYX_FROM_NUMBER in your .env.local file." });
    }
    if (!texmlAppId) {
      return res.status(500).json({ message: "Telnyx TeXML Application ID not configured. Please set TELNYX_TEXML_APP_ID in your .env.local file." });
    }

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
      // Assume UK if starts with 0, otherwise assume +1 for US
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+44' + normalizedPhone.substring(1);
      } else {
        normalizedPhone = '+' + normalizedPhone;
      }
    }

    // Create test call record in database
    const testCallId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const runId = `run-test-${Date.now()}`;

    const [testCallRecord] = await db.insert(campaignTestCalls).values({
      id: testCallId,
      campaignId,
      virtualAgentId: assignment.virtualAgentId,
      testPhoneNumber: normalizedPhone,
      testContactName: validatedData.testContactName,
      testCompanyName: validatedData.testCompanyName || null,
      testJobTitle: validatedData.testJobTitle || null,
      testContactEmail: validatedData.testContactEmail || null,
      customVariables: validatedData.customVariables || null,
      status: 'pending',
      testedBy: userId,
    }).returning();

    // Build WebSocket URL for OpenAI Realtime dialer
    const wsHost = process.env.PUBLIC_WEBSOCKET_URL?.split('/openai-realtime-dialer')[0] ||
                   process.env.REPLIT_DEV_DOMAIN ||
                   req.get('X-Public-Host') ||
                   req.get('host') ||
                   'localhost:5000';

    const wsUrl = wsHost.startsWith('wss://') || wsHost.startsWith('ws://')
      ? `${wsHost}/openai-realtime-dialer`
      : `wss://${wsHost}/openai-realtime-dialer`;

    // Prepare system prompt with test contact variables
    const agentSettings = assignment.settings as any || {};
    let systemPrompt = assignment.systemPrompt || agentSettings.systemPrompt || '';

    // Add test contact context to system prompt if not already included
    const testContext = `
[TEST CALL CONTEXT]
This is a test call to validate AI agent behavior.
Contact Name: ${validatedData.testContactName}
Company: ${validatedData.testCompanyName || 'Not specified'}
Job Title: ${validatedData.testJobTitle || 'Not specified'}
${validatedData.customVariables ? `Custom Variables: ${JSON.stringify(validatedData.customVariables)}` : ''}
`;

    // Custom parameters for the WebSocket connection
    // Support both OpenAI and Gemini voices
    const openaiVoices = new Set(['alloy', 'ash', 'coral', 'marin', 'verse', 'cedar', 'echo', 'fable', 'nova', 'shimmer', 'onyx']);
    const geminiVoices = new Set(['aoede', 'charon', 'fenrir', 'kore', 'puck', 'orion', 'vega', 'pegasus', 'ursa', 'nova', 'dipper', 'capella', 'orbit', 'lyra', 'eclipse']);

    const rawVoice = `${assignment.voice || ''}`.trim().toLowerCase();

    // Determine provider - default to Google Gemini Live
    const defaultProvider = process.env.VOICE_PROVIDER?.toLowerCase() || 'google';
    const isGoogleDefault = !defaultProvider.includes('openai');
    const effectiveProvider = validatedData.voiceProvider || (isGoogleDefault ? 'google' : 'openai');

    // Select appropriate voice based on provider
    let voice: string;
    if (effectiveProvider === 'google') {
      // Use Gemini voice if specified, otherwise default to 'Kore' (natural, friendly)
      voice = geminiVoices.has(rawVoice) ? rawVoice : (openaiVoices.has(rawVoice) ? rawVoice : 'kore');
    } else {
      // Use OpenAI voice
      voice = openaiVoices.has(rawVoice) ? rawVoice : 'marin';
    }

    // Map provider selection to internal format
    // client_state uses openai_realtime for legacy compatibility, session store uses openai
    const providerForClientState = effectiveProvider === 'google' ? 'google' : 'openai_realtime';
    const providerForSession = effectiveProvider === 'google' ? 'google' : 'openai';
    console.log(`[Campaign Test Call] Using voice provider: ${effectiveProvider} (voice: ${voice})`);

    const customParams = {
      call_id: testCallId,
      run_id: runId,
      campaign_id: campaignId,
      queue_item_id: `test-queue-${testCallId}`,
      call_attempt_id: `test-attempt-${testCallId}`,
      contact_id: `test-contact-${testCallId}`,
      virtual_agent_id: assignment.virtualAgentId,
      is_test_call: true,
      test_call_id: testCallId,
      // Store large data in Redis, not in URL
      // system_prompt will be fetched from virtual_agent in openai-realtime-dialer
      first_message: assignment.firstMessage,
      voice,
      agent_name: assignment.agentName,
      test_contact: {
        name: validatedData.testContactName,
        company: validatedData.testCompanyName,
        title: validatedData.testJobTitle,
        email: validatedData.testContactEmail,
      },
      provider: providerForClientState,
    };

    // Store full session data in Redis for retrieval by WebSocket handler
    const { callSessionStore } = await import("../services/call-session-store");
    await callSessionStore.setSession(testCallId, {
      call_id: testCallId,
      run_id: runId,
      campaign_id: campaignId,
      queue_item_id: customParams.queue_item_id,
      call_attempt_id: customParams.call_attempt_id,
      contact_id: customParams.contact_id,
      virtual_agent_id: assignment.virtualAgentId || undefined,
      is_test_call: true,
      test_call_id: testCallId,
      first_message: assignment.firstMessage || undefined,
      voice,
      agent_name: assignment.agentName || undefined,
      test_contact: customParams.test_contact,
      provider: providerForSession,
      system_prompt: systemPrompt, // Store full prompt in Redis
    });

    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

    // Prepare webhook URL - include client_state as query param so it's available at the TeXML endpoint
    const webhookHost = process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || 'localhost:5000';
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    // Pass client_state in URL so TeXML endpoint can forward it to WebSocket
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call?client_state=${encodeURIComponent(clientStateB64)}`;
    
    console.log(`[Campaign Test Call] TeXML URL: ${texmlUrl}`);
    console.log(`[Campaign Test Call] Target Provider: ${providerForClientState}`);

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
        StatusCallback: `https://${process.env.PUBLIC_WEBHOOK_HOST || 'localhost'}/api/webhooks/telnyx`,
      }),
    });

    if (!telnyxResponse.ok) {
      const errorText = await telnyxResponse.text();
      console.error(`[Campaign Test Call] Telnyx API error: ${telnyxResponse.status} - ${errorText}`);

      let friendlyMessage = `Telnyx API error: ${telnyxResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors && errorJson.errors.length > 0) {
           const firstError = errorJson.errors[0];
           if (firstError.code === '90041') {
             friendlyMessage = "Call limit reached. Your Telnyx account has exceeded its concurrent call limit. Please try again later or upgrade your plan.";
           } else {
             friendlyMessage = firstError.detail || firstError.title || friendlyMessage;
           }
        }
      } catch (e) {
        // ignore parse error
      }

      // Update test call status to failed
      await db.update(campaignTestCalls)
        .set({
          status: 'failed',
          testNotes: friendlyMessage,
          updatedAt: new Date()
        })
        .where(eq(campaignTestCalls.id, testCallId));

      return res.status(400).json({
        message: friendlyMessage,
        error: errorText,
        status: telnyxResponse.status
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
      message: "Test call initiated - your phone should ring shortly",
      testCallId,
      callControlId,
      phoneNumber: normalizedPhone,
      campaignName: campaign.name,
      agentName: assignment.agentName,
      wsUrl,
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

    // Use OpenAI to analyze the transcript
    const hasOpenAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
    if (!hasOpenAI) {
      return res.status(503).json({
        message: "OpenAI is not configured. Cannot perform transcript analysis."
      });
    }

    const analysisPrompt = `Analyze this B2B cold call transcript and provide actionable feedback for improving the AI agent's performance.

AGENT SYSTEM PROMPT (for context):
${agentPrompt}

CALL TRANSCRIPT:
${testCall.fullTranscript || JSON.stringify(testCall.transcriptTurns, null, 2)}

CALL OUTCOME:
- Duration: ${testCall.durationSeconds || 'Unknown'} seconds
- Disposition: ${testCall.disposition || 'Unknown'}
- Summary: ${testCall.callSummary || 'None'}

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
      "type": "<issue_type>",
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
  "summary": "<2-3 sentence summary of the analysis>"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert B2B sales call analyst. Provide specific, actionable feedback." },
        { role: "user", content: analysisPrompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const analysisContent = response.choices[0]?.message?.content;
    if (!analysisContent) {
      throw new Error("No analysis response from AI");
    }

    const analysis = JSON.parse(analysisContent);

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
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
 * Webhook handler for test call events from Telnyx
 */
router.post("/webhook", async (req, res) => {
  try {
    // Always respond immediately
    res.status(200).send("OK");

    const event = req.body;
    const eventData = event.data || event;
    const eventType = eventData.event_type || (event as any).event_type;
    const payload = eventData.payload || eventData;

    // Log the full incoming payload for traceability
    console.log(`[Test Call Webhook] Raw event payload:`, JSON.stringify(event, null, 2));
    console.log(`[Test Call Webhook] EventType: ${eventType}`);
    if (payload) {
      console.log(`[Test Call Webhook] Payload:`, JSON.stringify(payload, null, 2));
    }

    // Decode client_state to get test call ID
    let clientState: any = null;
    if (payload?.client_state) {
      try {
        clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
        console.log(`[Test Call Webhook] Decoded client_state:`, clientState);
      } catch (e) {
        console.log(`[Test Call Webhook] Could not decode client_state`);
      }
    }

    if (!clientState?.is_test_call || !clientState?.test_call_id) {
      // Not a test call or missing test call ID - skip
      console.log(`[Test Call Webhook] Not a test call or missing test_call_id. Skipping.`);
      return;
    }

    const testCallId = clientState.test_call_id;

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
          .select({ answeredAt: campaignTestCalls.answeredAt })
          .from(campaignTestCalls)
          .where(eq(campaignTestCalls.id, testCallId))
          .limit(1);

        let durationSeconds = 0;
        if (testCall?.answeredAt) {
          durationSeconds = Math.floor((Date.now() - new Date(testCall.answeredAt).getTime()) / 1000);
        }

        await db.update(campaignTestCalls)
          .set({
            status: 'completed',
            endedAt: new Date(),
            durationSeconds,
            updatedAt: new Date(),
          })
          .where(eq(campaignTestCalls.id, testCallId));
        break;

      case 'call.machine.detection.ended': {
        // Handle machine/voicemail detection - enforce "NEVER leave voicemail" rule
        const amdResult = payload?.result || payload?.machine_detection_result;
        console.log(`[Test Call Webhook] Machine detection result for test call ${testCallId}: ${amdResult}`);
        
        if (amdResult === 'machine' || amdResult === 'voicemail') {
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
              const telnyxApiKey = process.env.TELNYX_API_KEY;
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
