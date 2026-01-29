/**
 * Agent Call Control Routes
 *
 * Provides Call Control API endpoints for the agent console.
 * These endpoints allow agents to make calls via Telnyx Call Control
 * when WebRTC is not available (fallback mode).
 *
 * Endpoints:
 * - POST /api/calls/start - Start a new call
 * - GET /api/calls/:callControlId/status - Get call status
 * - POST /api/calls/hangup - Hang up an active call
 */

import { Router, Request, Response as ExpressResponse } from "express";
import { requireAuth } from "../auth";
import { z } from "zod";

const router = Router();
const LOG_PREFIX = "[AgentCallControl]";

// In-memory store for active agent calls (for status tracking)
// In production with multiple instances, this should use Redis
interface AgentCallSession {
  callControlId: string;
  callSessionId?: string;
  agentId: string;
  prospectPhone: string;
  fromNumber: string;
  status: 'initiating' | 'ringing' | 'active' | 'held' | 'ended';
  campaignId?: string;
  contactId?: string;
  queueItemId?: string;
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
}

const activeAgentCalls = new Map<string, AgentCallSession>();

// Helper to get Telnyx API key
function getTelnyxApiKey(): string | undefined {
  return process.env.TELNYX_API_KEY;
}

// Helper to make Telnyx API requests
async function telnyxFetch(url: string, options: RequestInit = {}): Promise<globalThis.Response> {
  const apiKey = getTelnyxApiKey();
  if (!apiKey) {
    throw new Error("TELNYX_API_KEY not configured");
  }

  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// Validation schemas
const startCallSchema = z.object({
  to: z.string().min(1, "Phone number required"),
  campaignId: z.string().optional(),
  contactId: z.string().optional(),
  queueItemId: z.string().optional(),
  mode: z.enum(['callback', 'direct']).default('direct'),
});

const hangupSchema = z.object({
  callControlId: z.string().min(1, "Call control ID required"),
});

/**
 * POST /api/calls/start
 * Start a new outbound call via Telnyx Call Control API
 */
router.post("/start", requireAuth, async (req: Request, res: ExpressResponse) => {
  try {
    const agentId = (req as any).user?.userId;
    if (!agentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = startCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.errors
      });
    }

    const { to, campaignId, contactId, queueItemId, mode } = parsed.data;

    // Get Telnyx configuration
    const apiKey = getTelnyxApiKey();
    if (!apiKey) {
      console.error(`${LOG_PREFIX} TELNYX_API_KEY not configured`);
      return res.status(500).json({ message: "Telnyx not configured" });
    }

    const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID || process.env.TELNYX_CONNECTION_ID;
    if (!connectionId) {
      console.error(`${LOG_PREFIX} No Telnyx connection ID configured`);
      return res.status(500).json({ message: "Telnyx connection not configured" });
    }

    const fromNumber = process.env.TELNYX_FROM_NUMBER;
    if (!fromNumber) {
      console.error(`${LOG_PREFIX} TELNYX_FROM_NUMBER not configured`);
      return res.status(500).json({ message: "Telnyx from number not configured" });
    }

    // For direct mode, we dial the prospect directly
    // The agent will hear audio via their WebRTC connection (if connected)
    // Note: Without WebRTC, there's no audio path to the browser!

    console.log(`${LOG_PREFIX} Starting call:`, {
      to,
      from: fromNumber,
      mode,
      agentId,
      campaignId,
      contactId,
    });

    // Build client state for tracking
    const clientState = Buffer.from(JSON.stringify({
      agentId,
      campaignId,
      contactId,
      queueItemId,
      mode,
      startedAt: new Date().toISOString(),
    })).toString('base64');

    // Determine webhook URL
    const webhookUrl = process.env.TELNYX_WEBHOOK_URL ||
      `https://${process.env.PUBLIC_WEBHOOK_HOST || 'localhost'}/api/webhooks/telnyx`;

    // Make the call via Telnyx Call Control API
    const response = await telnyxFetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      body: JSON.stringify({
        connection_id: connectionId,
        to: to,
        from: fromNumber,
        client_state: clientState,
        webhook_url: webhookUrl,
        // For agent calls, we want to know when call is answered
        answering_machine_detection: "disabled", // Agents handle this manually
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Telnyx API error:`, response.status, errorText);

      let errorMessage = "Failed to start call";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.errors?.[0]?.detail || errorJson.message || errorMessage;
      } catch (e) {
        // Use default error message
      }

      return res.status(response.status >= 500 ? 502 : 400).json({
        message: errorMessage,
        code: response.status,
      });
    }

    const result = await response.json();
    const callControlId = result.data?.call_control_id;
    const callSessionId = result.data?.call_session_id;

    if (!callControlId) {
      console.error(`${LOG_PREFIX} Missing call_control_id in response:`, result);
      return res.status(500).json({ message: "Telnyx returned no call ID" });
    }

    console.log(`${LOG_PREFIX} Call initiated:`, {
      callControlId,
      callSessionId,
      to,
      from: fromNumber,
    });

    // Store session for status tracking
    const session: AgentCallSession = {
      callControlId,
      callSessionId,
      agentId,
      prospectPhone: to,
      fromNumber,
      status: 'initiating',
      campaignId,
      contactId,
      queueItemId,
      startedAt: new Date(),
    };
    activeAgentCalls.set(callControlId, session);

    // Return call details to client
    res.json({
      callControlId,
      callSessionId,
      mode,
      status: 'calling_prospect',
      from: fromNumber,
      to,
      agentPhone: null, // No callback for direct mode
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Start call error:`, error);
    res.status(500).json({
      message: "Failed to start call",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/calls/:callControlId/status
 * Get the current status of a call
 */
router.get("/:callControlId/status", requireAuth, async (req: Request, res: ExpressResponse) => {
  try {
    const { callControlId } = req.params;
    const agentId = (req as any).user?.userId;

    if (!callControlId) {
      return res.status(400).json({ message: "Call control ID required" });
    }

    // First check our local session cache
    const cachedSession = activeAgentCalls.get(callControlId);

    // Query Telnyx for current call status
    const response = await telnyxFetch(`https://api.telnyx.com/v2/calls/${callControlId}`);

    if (!response.ok) {
      if (response.status === 404) {
        // Call no longer exists - it ended
        if (cachedSession) {
          cachedSession.status = 'ended';
          cachedSession.endedAt = new Date();
        }

        return res.json({
          callControlId,
          status: 'ended',
          isAlive: false,
          endedAt: cachedSession?.endedAt || new Date().toISOString(),
        });
      }

      console.error(`${LOG_PREFIX} Status check failed:`, response.status);
      return res.status(response.status).json({
        message: "Failed to get call status"
      });
    }

    const result = await response.json();
    const callData = result.data || result;

    // Map Telnyx state to our status
    let status: AgentCallSession['status'] = 'initiating';
    const telnyxState = callData.state;
    const isAlive = callData.is_alive !== false;

    switch (telnyxState) {
      case 'ringing':
      case 'early':
        status = 'ringing';
        break;
      case 'answered':
      case 'bridged':
      case 'active':
        status = 'active';
        break;
      case 'held':
        status = 'held';
        break;
      case 'hangup':
      case 'done':
        status = 'ended';
        break;
    }

    // Update cached session
    if (cachedSession) {
      cachedSession.status = status;
      if (status === 'active' && !cachedSession.answeredAt) {
        cachedSession.answeredAt = new Date();
      }
      if (status === 'ended') {
        cachedSession.endedAt = new Date();
      }
    }

    res.json({
      callControlId,
      callSessionId: callData.call_session_id || cachedSession?.callSessionId,
      status,
      telnyxState,
      isAlive,
      from: callData.from || cachedSession?.fromNumber,
      to: callData.to || cachedSession?.prospectPhone,
      answeredAt: cachedSession?.answeredAt?.toISOString(),
      startedAt: cachedSession?.startedAt?.toISOString(),
      endedAt: cachedSession?.endedAt?.toISOString(),
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Status check error:`, error);
    res.status(500).json({
      message: "Failed to get call status",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/calls/hangup
 * Hang up an active call
 */
router.post("/hangup", requireAuth, async (req: Request, res: ExpressResponse) => {
  try {
    const agentId = (req as any).user?.userId;
    if (!agentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = hangupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation error",
        errors: parsed.error.errors
      });
    }

    const { callControlId } = parsed.data;

    console.log(`${LOG_PREFIX} Hanging up call:`, { callControlId, agentId });

    // Send hangup command to Telnyx
    const response = await telnyxFetch(
      `https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`,
      { method: "POST" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${LOG_PREFIX} Hangup failed:`, response.status, errorText);

      // 404 means call already ended - treat as success
      if (response.status === 404) {
        const session = activeAgentCalls.get(callControlId);
        if (session) {
          session.status = 'ended';
          session.endedAt = new Date();
        }
        return res.json({
          success: true,
          message: "Call already ended",
          callControlId,
        });
      }

      return res.status(response.status).json({
        message: "Failed to hang up call"
      });
    }

    // Update session
    const session = activeAgentCalls.get(callControlId);
    if (session) {
      session.status = 'ended';
      session.endedAt = new Date();
    }

    console.log(`${LOG_PREFIX} Call hung up successfully:`, callControlId);

    res.json({
      success: true,
      callControlId,
      message: "Call ended",
    });

  } catch (error) {
    console.error(`${LOG_PREFIX} Hangup error:`, error);
    res.status(500).json({
      message: "Failed to hang up call",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Cleanup old sessions periodically
 * Sessions older than 1 hour are removed
 */
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const entriesToDelete: string[] = [];
  activeAgentCalls.forEach((session, callControlId) => {
    if (session.startedAt < oneHourAgo) {
      entriesToDelete.push(callControlId);
    }
  });

  entriesToDelete.forEach(id => activeAgentCalls.delete(id));
}, 15 * 60 * 1000); // Run every 15 minutes

export default router;
