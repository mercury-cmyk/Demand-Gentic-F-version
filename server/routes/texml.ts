import { Router } from "express";
import { storePendingCallState } from "../services/pending-call-state";

const router = Router();

/**
 * TeXML endpoint for AI voice calls
 * This returns the XML instructions Telnyx needs to bridge the call to our AI WebSocket
 * 
 * Supports both GET and POST for flexibility with different TeXML invocation methods:
 * - GET: Used when Telnyx fetches instructions from URL directly
 * - POST: Used when Telnyx sends form-encoded data with call details
 * 
 * IMPORTANT: We store the full client_state in memory and only pass call_id in the URL
 * to avoid URL length limits that can cause ngrok/proxy WebSocket upgrade failures.
 */
const aiCallHandler = (req: any, res: any) => {
  console.log("[TeXML] Received request:", req.method, req.body, req.query);

  // Extract parameters from either body (POST) or query (GET)
  const params = req.method === 'GET' ? req.query : req.body;

  // Extract parameters from the request
  // Telnyx sends parameters as form-encoded by default in TeXML
  const callId = params.call_id || params.CallSid;
  // client_state comes from URL query param (since TeXML doesn't forward it from API call)
  const clientState = req.query.client_state as string || params.client_state || params.ClientState;

  console.log("[TeXML] Client state from query:", req.query.client_state ? "present" : "missing");

  // Determine if we have custom parameters passed from the initiation
  // These might be in ClientState (base64) or directly in the body if we added them to the URL
  const host = process.env.PUBLIC_WEBSOCKET_URL?.split('/voice-dialer')[0]?.split('/gemini-live-dialer')[0] ||
               req.get('host') ||
               'localhost:8080';

  // CRITICAL FIX: Store full client_state in memory and only pass call_id in URL
  // This avoids URL length limits (~3KB base64 client_state was breaking ngrok WebSocket upgrades)
  // Gemini-only routing: all TeXML calls go through the voice dialer
  let dialerPath = '/voice-dialer';
  let finalWsUrl = '';
  let actualCallId: string | null = null;

  if (clientState) {
    try {
      // Decode base64 client_state to extract call_id, provider, and store full context
      const decoded = Buffer.from(clientState, 'base64').toString('utf-8');
      const contextData = JSON.parse(decoded);
      actualCallId = contextData.call_id;

      const provider = contextData.provider?.toLowerCase() || 'gemini_live';
      dialerPath = '/voice-dialer';
      console.log(`[TeXML] Provider: ${provider} → routing to /voice-dialer (Gemini-only)`);

      // Build WebSocket URL with correct dialer path
      const wsUrl = host.startsWith('wss://') || host.startsWith('ws://')
        ? `${host}${dialerPath}`
        : `wss://${host}${dialerPath}`;

      if (actualCallId) {
        // Store full context for retrieval when WebSocket connects
        storePendingCallState(actualCallId, contextData);
        // Only pass call_id in URL (short, safe for WebSocket upgrade)
        finalWsUrl = `${wsUrl}?call_id=${encodeURIComponent(actualCallId)}`;
        console.log(`[TeXML] Stored context for call ${actualCallId}, URL length now: ${finalWsUrl.length}`);
      } else {
        // Fallback: no call_id found, use legacy behavior (may fail with long URLs)
        console.warn("[TeXML] No call_id in client_state, using legacy URL encoding");
        finalWsUrl = `${wsUrl}?client_state=${encodeURIComponent(clientState)}`;
      }
    } catch (e) {
      console.error("[TeXML] Failed to parse client_state:", e);
      // Fallback: use legacy behavior with default dialer
      const wsUrl = host.startsWith('wss://') || host.startsWith('ws://')
        ? `${host}${dialerPath}`
        : `wss://${host}${dialerPath}`;
      finalWsUrl = `${wsUrl}?client_state=${encodeURIComponent(clientState)}`;
    }
  } else {
    // No client_state - use default dialer
    const wsUrl = host.startsWith('wss://') || host.startsWith('ws://')
      ? `${host}${dialerPath}`
      : `wss://${host}${dialerPath}`;
    finalWsUrl = wsUrl;
  }

  console.log(`[TeXML] Client state length: ${clientState?.length || 0}`);
  console.log(`[TeXML] Final WS URL length: ${finalWsUrl.length}`);
  console.log(`[TeXML] Dialer path: ${dialerPath}`);
  console.log(`[TeXML] Responding with Stream to: ${finalWsUrl.replace(/\?.*$/, '')}`);

  // Escape any XML special characters in the URL
  const escapedWsUrl = finalWsUrl.replace(/&/g, '&amp;');

  res.set("Content-Type", "application/xml");
  // CRITICAL FIX for early disconnects:
  // 1. Remove AMD blocking - it was preventing stream setup
  // 2. Connect directly to WebSocket stream - let AI handle voicemail detection
  // 3. For test calls, avoid AMD timeouts that can kill calls before they ring

  // Note: Machine detection can still be done via WebSocket stream data if needed,
  // but doesn't block the <Stream> connection from establishing
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${escapedWsUrl}" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
};

// Register handler for both GET and POST
router.get("/ai-call", aiCallHandler);
router.post("/ai-call", aiCallHandler);

/**
 * Incoming call handler for TeXML Application
 */
router.post("/incoming", (req, res) => {
  console.log("[TeXML] Received incoming call:", req.body);

  res.set("Content-Type", "application/xml");
  // CRITICAL FIX: Remove AMD blocking from incoming calls too
  // Connect directly to stream without AMD delays
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Connecting you to the DemandGentic.ai By Pivotal B2B assistant.</Say>
    <Connect>
        <Stream url="wss://${req.get('host')}/voice-dialer" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
});

export default router;
