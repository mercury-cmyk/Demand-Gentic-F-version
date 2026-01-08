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

const router = Router();

// Schema for initiating a test call
const initiateTestCallSchema = z.object({
  campaignId: z.string(),
  testPhoneNumber: z.string().min(10, "Valid phone number required"),
  testContactName: z.string().min(1, "Contact name required"),
  testCompanyName: z.string().optional(),
  testJobTitle: z.string().optional(),
  testContactEmail: z.string().email().optional(),
  customVariables: z.record(z.unknown()).optional(),
});

/**
 * POST /api/campaigns/:campaignId/test-call
 * Initiate a test call for a specific campaign
 * This uses the campaign's actual AI agent and queue system to validate real behavior
 */
router.post("/:campaignId/test-call", requireAuth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;

    // Validate request body
    const validatedData = initiateTestCallSchema.parse({
      campaignId,
      ...req.body,
    });

    // Get the campaign
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
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
    const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID;

    if (!telnyxApiKey || !fromNumber) {
      return res.status(500).json({ message: "Telnyx not configured (missing API key or from number)" });
    }
    if (!openaiApiKey) {
      return res.status(500).json({ message: "OpenAI API key not configured" });
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
      system_prompt: systemPrompt,
      first_message: assignment.firstMessage,
      voice: assignment.voice,
      agent_name: assignment.agentName,
      test_contact: {
        name: validatedData.testContactName,
        company: validatedData.testCompanyName,
        title: validatedData.testJobTitle,
        email: validatedData.testContactEmail,
      },
      provider: 'openai_realtime',
    };

    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

    // Prepare webhook URL
    const webhookHost = process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || 'localhost:5000';
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';

    console.log(`[Campaign Test Call] Initiating test call:
  - Campaign: ${campaign.name} (${campaignId})
  - To: ${normalizedPhone}
  - From: ${fromNumber}
  - Agent: ${assignment.agentName} (${assignment.virtualAgentId})
  - Test Call ID: ${testCallId}
  - WebSocket URL: ${wsUrl}`);

    // DEBUG: Log connection_id being used
    console.log(`[Campaign Test Call] Using connection_id: ${connectionId} (from TELNYX_CALL_CONTROL_APP_ID=${process.env.TELNYX_CALL_CONTROL_APP_ID}, TELNYX_CONNECTION_ID=${process.env.TELNYX_CONNECTION_ID})`);

    // Initiate the Telnyx call
    const telnyxResponse = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        connection_id: connectionId,
        to: normalizedPhone,
        from: fromNumber,
        answering_machine_detection: "detect",
        stream_url: wsUrl,
        stream_track: "both_tracks",
        stream_bidirectional_mode: "rtp",
        custom_parameters: customParams,
        client_state: clientStateB64,
        webhook_url: `${webhookProtocol}://${webhookHost}/api/campaign-test-calls/webhook`,
      }),
    });

    if (!telnyxResponse.ok) {
      const errorText = await telnyxResponse.text();
      console.error(`[Campaign Test Call] Telnyx API error: ${telnyxResponse.status} - ${errorText}`);

      // Update test call status to failed
      await db.update(campaignTestCalls)
        .set({
          status: 'failed',
          testNotes: `Telnyx API error: ${telnyxResponse.status} - ${errorText}`,
          updatedAt: new Date()
        })
        .where(eq(campaignTestCalls.id, testCallId));

      return res.status(500).json({
        message: "Failed to initiate test call via Telnyx",
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
router.post("/:campaignId/test-calls/:testCallId/analyze", requireAuth, requireRole("admin", "manager"), async (req, res) => {
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

    const openai = await import("../lib/" + "openai").then(m => m.default);

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
  } catch (error) {
    console.error("[Campaign Test Calls] Error analyzing test call:", error);
    res.status(500).json({ message: "Failed to analyze test call", error: String(error) });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/test-calls/:testCallId
 * Update a test call (e.g., add notes, mark result)
 */
router.patch("/:campaignId/test-calls/:testCallId", requireAuth, requireRole("admin", "manager"), async (req, res) => {
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

    console.log(`[Test Call Webhook] Event: ${eventType}`);

    // Decode client_state to get test call ID
    let clientState: any = null;
    if (payload?.client_state) {
      try {
        clientState = JSON.parse(Buffer.from(payload.client_state, 'base64').toString('utf-8'));
      } catch (e) {
        console.log(`[Test Call Webhook] Could not decode client_state`);
      }
    }

    if (!clientState?.is_test_call || !clientState?.test_call_id) {
      // Not a test call or missing test call ID - skip
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
