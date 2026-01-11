import { Router } from "express";
import OpenAI, { InvalidWebhookSignatureError } from "openai";
import WebSocket from "ws";
import { db } from "../db";
import { virtualAgents } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  initiateOpenAISipCall,
  handleCallAnswered,
  endCall,
  handleTelnyxWebhookEvent,
  getSession,
  getSessionByTelnyxId,
  getActiveSessionsCount,
} from "../services/openai-sip-dialer";

const router = Router();

const LOG_PREFIX = "[OpenAI SIP]";
const WEBHOOK_TTL_MS = 10 * 60 * 1000;
const ACCEPTED_CALL_TTL_MS = 60 * 60 * 1000;

type SipHeader = { name: string; value: string };

type SipAcceptPayload = {
  type: "realtime";
  model?: string;
  instructions?: string;
  max_output_tokens?: number | "inf";
  tool_choice?: string;
  audio?: {
    output?: {
      voice?: string;
    };
  };
};

const recentWebhookIds = new Map<string, NodeJS.Timeout>();
const acceptedCallIds = new Map<string, NodeJS.Timeout>();
const activeSockets = new Map<string, WebSocket>();

function parseBool(value: string | undefined, defaultValue = false): boolean {
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(",");
    }
  }
  return normalized;
}

function rememberId(store: Map<string, NodeJS.Timeout>, id: string, ttlMs: number) {
  if (store.has(id)) return;
  const timeout = setTimeout(() => store.delete(id), ttlMs);
  store.set(id, timeout);
}

function getSipHeader(headers: SipHeader[] | undefined, headerName: string): string | null {
  if (!headers?.length) return null;
  const match = headers.find((header) => header.name.toLowerCase() === headerName.toLowerCase());
  return match?.value ?? null;
}

function extractSipNumber(value: string | null): string | null {
  if (!value) return null;
  const sipMatch = value.match(/sip:([^@;>]+)/i);
  if (sipMatch?.[1]) return sipMatch[1];
  const telMatch = value.match(/tel:([+0-9]+)/i);
  if (telMatch?.[1]) return telMatch[1];
  return null;
}

function normalizeNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\D/g, "");
  return normalized ? normalized : null;
}

function parseAllowedNumbers(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const numbers = raw
    .split(",")
    .map((entry) => normalizeNumber(entry.trim()))
    .filter((entry): entry is string => Boolean(entry));
  return numbers.length ? new Set(numbers) : null;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured.");
  }
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET || null;
  return new OpenAI({ apiKey, webhookSecret });
}

async function resolveVirtualAgentConfig() {
  const virtualAgentId = process.env.OPENAI_SIP_VIRTUAL_AGENT_ID;
  if (!virtualAgentId) return null;

  const [agent] = await db
    .select({
      systemPrompt: virtualAgents.systemPrompt,
      firstMessage: virtualAgents.firstMessage,
      voice: virtualAgents.voice,
    })
    .from(virtualAgents)
    .where(eq(virtualAgents.id, virtualAgentId))
    .limit(1);

  if (!agent) {
    console.warn(`${LOG_PREFIX} Virtual agent not found: ${virtualAgentId}`);
    return null;
  }

  return {
    instructions: agent.systemPrompt || null,
    greeting: agent.firstMessage || null,
    voice: agent.voice || null,
  };
}

function parseMaxOutputTokens(raw: string | undefined): number | "inf" | undefined {
  if (!raw) return undefined;
  if (raw === "inf") return "inf";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

type SidebandConfig = {
  greeting: string | null;
  instructions?: string;
  toolChoice?: string;
  maxOutputTokens?: number | "inf";
};

function openRealtimeMonitor(callId: string, apiKey: string, config: SidebandConfig) {
  if (activeSockets.has(callId)) return;

  const logEvents = parseBool(process.env.OPENAI_SIP_LOG_EVENTS);
  const sendSessionUpdate = parseBool(process.env.OPENAI_SIP_SIDEBAND_UPDATE, true);
  const timeoutSeconds = Number.parseInt(process.env.OPENAI_SIP_SESSION_TIMEOUT_SECONDS || "900", 10);
  const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 900_000;

  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  activeSockets.set(callId, ws);

  const timeout = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "session timeout");
    }
  }, timeoutMs);

  ws.on("open", () => {
    console.log(`${LOG_PREFIX} Sideband connection established for call ${callId}`);

    if (sendSessionUpdate && (config.instructions || config.toolChoice || typeof config.maxOutputTokens !== "undefined")) {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            ...(config.instructions ? { instructions: config.instructions } : {}),
            ...(config.toolChoice ? { tool_choice: config.toolChoice } : {}),
            ...(typeof config.maxOutputTokens !== "undefined" ? { max_output_tokens: config.maxOutputTokens } : {}),
            // Configure turn detection per OpenAI Realtime API best practices
            audio: {
              input: {
                turn_detection: {
                  type: "semantic_vad",
                  eagerness: "high",
                  create_response: true,
                  interrupt_response: true,
                },
              },
            },
          },
        })
      );
      console.log(`${LOG_PREFIX} Sent session.update for call ${callId}`);
    }

    if (config.greeting) {
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: { instructions: config.greeting },
        })
      );
      console.log(`${LOG_PREFIX} Sent greeting for call ${callId}`);
    }
  });

  ws.on("message", (data) => {
    try {
      const payload = typeof data === "string" ? JSON.parse(data) : JSON.parse(data.toString());
      const eventType = payload?.type || payload?.event || "unknown";

      // Log events if enabled
      if (logEvents) {
        console.log(`${LOG_PREFIX} Event from ${callId}: ${eventType}`);
      }

      // Handle function calls from the model
      // Per OpenAI Realtime API docs: "responding to tool calls" is a key sideband use case
      if (eventType === "response.function_call_arguments.done") {
        const functionName = payload?.name;
        const callIdArg = payload?.call_id;
        const args = payload?.arguments;

        if (logEvents) {
          console.log(`${LOG_PREFIX} Function call from ${callId}: ${functionName}`, args);
        }

        // Example: Handle function calls here
        // You can add your business logic to execute functions and send results back
        // ws.send(JSON.stringify({
        //   type: "conversation.item.create",
        //   item: {
        //     type: "function_call_output",
        //     call_id: callIdArg,
        //     output: JSON.stringify({ result: "..." })
        //   }
        // }));
        // ws.send(JSON.stringify({ type: "response.create" }));
      }

      // Handle rate limits
      if (eventType === "rate_limits.updated" && logEvents) {
        const limits = payload?.rate_limits;
        console.log(`${LOG_PREFIX} Rate limits updated for ${callId}:`, limits);
      }

      // Handle errors
      if (eventType === "error") {
        console.error(`${LOG_PREFIX} Error event from ${callId}:`, payload?.error);
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to parse WS event for ${callId}:`, error);
    }
  });

  ws.on("close", (code, reason) => {
    clearTimeout(timeout);
    activeSockets.delete(callId);
    console.log(`${LOG_PREFIX} Sideband connection closed for call ${callId} (code: ${code}, reason: ${reason.toString()})`);
  });

  ws.on("error", (error) => {
    console.error(`${LOG_PREFIX} Sideband WebSocket error for ${callId}:`, error);
  });
}

router.post("/webhook", async (req, res) => {
  const rawBody = (req as { rawBody?: string }).rawBody || JSON.stringify(req.body ?? {});
  const headers = normalizeHeaders(req.headers);
  const webhookId = headers["webhook-id"];
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  if (webhookId && recentWebhookIds.has(webhookId)) {
    return res.status(200).json({ status: "duplicate" });
  }

  if (webhookId) {
    rememberId(recentWebhookIds, webhookId, WEBHOOK_TTL_MS);
  }

  let event: any;
  let openai: OpenAI;

  try {
    openai = getOpenAIClient();
    if (openai.webhookSecret) {
      event = await openai.webhooks.unwrap(rawBody, headers);
    } else {
      console.warn(`${LOG_PREFIX} OPENAI_WEBHOOK_SECRET not configured, skipping signature verification`);
      event = JSON.parse(rawBody);
    }
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      console.warn(`${LOG_PREFIX} Invalid webhook signature`);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
    console.error(`${LOG_PREFIX} Failed to parse webhook`, error);
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  if (event?.type !== "realtime.call.incoming") {
    return res.status(200).json({ status: "ignored" });
  }

  const callId = event?.data?.call_id as string | undefined;
  if (!callId) {
    return res.status(400).json({ error: "Missing call_id" });
  }

  if (acceptedCallIds.has(callId)) {
    return res.status(200).json({ status: "already-accepted" });
  }

  const sipHeaders = event?.data?.sip_headers as SipHeader[] | undefined;
  const toHeader = getSipHeader(sipHeaders, "To");
  const fromHeader = getSipHeader(sipHeaders, "From");
  const toNumber = normalizeNumber(extractSipNumber(toHeader));
  const fromNumber = normalizeNumber(extractSipNumber(fromHeader));

  const allowedTo = parseAllowedNumbers(process.env.OPENAI_SIP_ALLOWED_TO);
  if (allowedTo && (!toNumber || !allowedTo.has(toNumber))) {
    console.warn(`${LOG_PREFIX} Rejecting call ${callId} to ${toNumber ?? "unknown"} (not allowed)`);
    await openai.realtime.calls.reject(callId, { status_code: 603 });
    return res.status(200).json({ status: "rejected", reason: "to_not_allowed" });
  }

  const virtualAgentConfig = await resolveVirtualAgentConfig();
  const instructions =
    process.env.OPENAI_SIP_INSTRUCTIONS ||
    virtualAgentConfig?.instructions ||
    "You are a helpful voice assistant.";
  const greeting = process.env.OPENAI_SIP_GREETING || virtualAgentConfig?.greeting || null;
  const voice = process.env.OPENAI_SIP_VOICE || virtualAgentConfig?.voice || "marin";
  const maxOutputTokens = parseMaxOutputTokens(process.env.OPENAI_SIP_MAX_OUTPUT_TOKENS);
  const toolChoice = process.env.OPENAI_SIP_TOOL_CHOICE;
  const model = process.env.OPENAI_SIP_MODEL || "gpt-realtime";

  const acceptPayload: SipAcceptPayload = {
    type: "realtime",
    model,
    instructions,
  };

  if (typeof maxOutputTokens !== "undefined") {
    acceptPayload.max_output_tokens = maxOutputTokens;
  }

  if (toolChoice?.trim()) {
    acceptPayload.tool_choice = toolChoice.trim();
  }

  if (voice) {
    acceptPayload.audio = { output: { voice } };
  }

  try {
    await openai.realtime.calls.accept(callId, acceptPayload);
    rememberId(acceptedCallIds, callId, ACCEPTED_CALL_TTL_MS);
    console.log(`${LOG_PREFIX} Accepted call ${callId} from ${fromNumber ?? "unknown"} to ${toNumber ?? "unknown"}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to accept call ${callId}:`, error);
    return res.status(500).json({ error: "Failed to accept call" });
  }

  const sidebandEnabled = parseBool(process.env.OPENAI_SIP_SIDEBAND, true);
  const monitorEnabled = parseBool(process.env.OPENAI_SIP_MONITOR);

  if (sidebandEnabled || monitorEnabled || greeting) {
    openRealtimeMonitor(callId, apiKey, {
      greeting,
      instructions,
      toolChoice: toolChoice?.trim() || undefined,
      maxOutputTokens,
    });
  }

  return res.status(200).json({ status: "accepted" });
});

/**
 * POST /api/openai/sip/call
 * Initiate an outbound call via OpenAI SIP
 */
router.post("/call", async (req, res) => {
  try {
    const {
      toNumber,
      fromNumber,
      runId,
      campaignId,
      queueItemId,
      callAttemptId,
      contactId,
      virtualAgentId,
      isTestSession,
      systemPromptOverride,
      firstMessageOverride,
      voiceOverride,
      agentSettingsOverride,
    } = req.body;

    if (!toNumber || !fromNumber) {
      return res.status(400).json({ error: "toNumber and fromNumber are required" });
    }

    const result = await initiateOpenAISipCall({
      toNumber,
      fromNumber: fromNumber || process.env.TELNYX_FROM_NUMBER,
      runId: runId || `run-${Date.now()}`,
      campaignId: campaignId || "",
      queueItemId: queueItemId || "",
      callAttemptId: callAttemptId || "",
      contactId: contactId || "",
      virtualAgentId,
      isTestSession: isTestSession || false,
      systemPromptOverride,
      firstMessageOverride,
      voiceOverride,
      agentSettingsOverride,
    });

    console.log(`${LOG_PREFIX} Outbound SIP call initiated: ${result.callId}`);

    res.json({
      success: true,
      callId: result.callId,
      telnyxCallControlId: result.telnyxCallControlId,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initiate outbound call:`, error);
    res.status(500).json({
      error: "Failed to initiate call",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/openai/sip/call-events
 * Handle Telnyx webhook events for SIP calls
 */
router.post("/call-events", async (req, res) => {
  try {
    const event = req.body;
    const eventType = event?.data?.event_type || event?.event_type;

    console.log(`${LOG_PREFIX} Telnyx event received: ${eventType}`);

    await handleTelnyxWebhookEvent(event);

    res.status(200).json({ status: "processed" });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to process Telnyx event:`, error);
    res.status(500).json({ error: "Failed to process event" });
  }
});

/**
 * POST /api/openai/sip/hangup
 * Hang up an active SIP call
 */
router.post("/hangup", async (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({ error: "callId is required" });
    }

    const session = getSession(callId);
    if (!session) {
      return res.status(404).json({ error: "Call not found" });
    }

    await endCall(callId, "user_hangup");

    res.json({ success: true, callId });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to hangup call:`, error);
    res.status(500).json({ error: "Failed to hangup call" });
  }
});

/**
 * GET /api/openai/sip/status
 * Get status of SIP dialer
 */
router.get("/status", (req, res) => {
  res.json({
    activeCalls: getActiveSessionsCount(),
    sipEndpoint: `sip:${process.env.OPENAI_PROJECT_ID || "YOUR_PROJECT_ID"}@sip.api.openai.com;transport=tls`,
    configured: !!process.env.OPENAI_PROJECT_ID,
  });
});

/**
 * GET /api/openai/sip/call/:callId
 * Get status of a specific call
 */
router.get("/call/:callId", (req, res) => {
  const { callId } = req.params;
  const session = getSession(callId);

  if (!session) {
    return res.status(404).json({ error: "Call not found" });
  }

  res.json({
    callId: session.callId,
    telnyxCallControlId: session.telnyxCallControlId,
    isActive: session.isActive,
    startTime: session.startTime,
    transcripts: session.transcripts,
    disposition: session.detectedDisposition,
    callSummary: session.callSummary,
  });
});

export default router;
