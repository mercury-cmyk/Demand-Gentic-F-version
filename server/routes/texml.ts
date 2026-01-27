import { Router } from "express";

const router = Router();

/**
 * TeXML endpoint for AI voice calls
 * This returns the XML instructions Telnyx needs to bridge the call to our AI WebSocket
 * 
 * Supports both GET and POST for flexibility with different TeXML invocation methods:
 * - GET: Used when Telnyx fetches instructions from URL directly
 * - POST: Used when Telnyx sends form-encoded data with call details
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

  // CRITICAL: Determine dialer path based on provider in client_state
  // This ensures test calls use the SAME workflow as actual campaign calls
  let dialerPath = '/gemini-live-dialer'; // Default to Gemini Live (same as production)

  if (clientState) {
    try {
      const config = JSON.parse(Buffer.from(clientState, 'base64').toString('utf-8'));
      const provider = config.provider || 'google';

      // Route to correct dialer based on provider
      // OpenAI variants go to /voice-dialer, Google/Gemini variants go to /gemini-live-dialer
      if (provider === 'openai_realtime' || provider === 'openai') {
        dialerPath = '/voice-dialer';
      } else if (provider === 'google' || provider === 'gemini_live' || provider === 'gemini') {
        dialerPath = '/gemini-live-dialer';
      } else {
        // Default to Gemini Live for unknown providers (matches production behavior)
        dialerPath = '/gemini-live-dialer';
      }
      console.log(`[TeXML] Detected provider: ${provider}, using dialer: ${dialerPath}`);
    } catch (e) {
      console.log("[TeXML] Could not parse client_state, defaulting to Gemini Live dialer");
    }
  }

  const envWsUrl = process.env.PUBLIC_WEBSOCKET_URL;
  // Remove any existing dialer path from the env URL
  let host = envWsUrl?.replace(/\/(voice-dialer|gemini-live-dialer).*$/, '');

  // If no env var, try to determine from request properly handling ngrok/proxies
  if (!host) {
     const forwardedHost = req.get('x-forwarded-host');
     const requestHost = req.get('host');
     host = forwardedHost || requestHost || 'localhost:5000';
  }

  const wsUrl = host.startsWith('wss://') || host.startsWith('ws://')
    ? `${host}${dialerPath}`
    : `wss://${host}${dialerPath}`;

  console.log(`[TeXML] Resolved Host: ${host}`);
  console.log(`[TeXML] Final WS URL: ${wsUrl}`);

  // We can pass the same parameters we were using before
  // If we have clientState, we should pass it along to the WebSocket
  // Note: client_state is already base64 encoded, we only URL-encode it for safe URL transport
  const finalWsUrl = clientState ? `${wsUrl}?client_state=${encodeURIComponent(clientState)}` : wsUrl;

  console.log(`[TeXML] Client state length: ${clientState?.length || 0}`);
  console.log(`[TeXML] Final WS URL length: ${finalWsUrl.length}`);
  console.log(`[TeXML] Responding with Stream to: ${wsUrl}`);

  // Escape any XML special characters in the URL
  const escapedWsUrl = finalWsUrl.replace(/&/g, '&amp;');

  res.set("Content-Type", "application/xml");
  // CRITICAL FIX for early disconnects:
  // 1. Remove AMD blocking - it was preventing stream setup
  // 2. Connect directly to WebSocket stream - let AI handle voicemail detection
  // 3. For test calls, avoid AMD timeouts that can kill calls before they ring

  // Note: Machine detection can still be done via WebSocket stream data if needed,
  // but doesn't block the <Stream> connection from establishing
  // CRITICAL: Do NOT use track="inbound_track" - it prevents outbound audio playback!
  // bidirectionalMode="rtp" enables full duplex audio by default
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
  
  // Resolve WebSocket URL using the same robust logic as ai-call
  const envWsUrl = process.env.PUBLIC_WEBSOCKET_URL;
  let host = envWsUrl?.split('/voice-dialer')[0];
  
  if (!host) {
     const forwardedHost = req.get('x-forwarded-host');
     const requestHost = req.get('host');
     host = forwardedHost || requestHost || 'localhost:5000';
  }

  const wsUrl = host.startsWith('wss://') || host.startsWith('ws://') 
    ? `${host}/voice-dialer`
    : `wss://${host}/voice-dialer`;

  console.log(`[TeXML] Incoming Call - Stream URL: ${wsUrl}`);

  res.set("Content-Type", "application/xml");
  // CRITICAL FIX: Remove AMD blocking from incoming calls too
  // Connect directly to stream without AMD delays
  // CRITICAL: Do NOT use track="inbound_track" - it prevents outbound audio playback!
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Connecting you to the DemandGentic.ai By Pivotal B2B assistant.</Say>
    <Connect>
        <Stream url="${wsUrl}" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
});

export default router;
