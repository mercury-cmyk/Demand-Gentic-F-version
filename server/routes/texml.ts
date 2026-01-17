import { Router } from "express";

const router = Router();

/**
 * TeXML endpoint for AI voice calls
 * This returns the XML instructions Telnyx needs to bridge the call to our AI WebSocket
 */
router.post("/ai-call", (req, res) => {
  console.log("[TeXML] Received request:", req.body);
  
  // Extract parameters from the request
  // Telnyx sends parameters as form-encoded by default in TeXML
  const callId = req.body.call_id || req.body.CallSid;
  // client_state comes from URL query param (since TeXML doesn't forward it from API call)
  const clientState = req.query.client_state as string || req.body.client_state || req.body.ClientState;
  
  console.log("[TeXML] Client state from query:", req.query.client_state ? "present" : "missing");
  
  // Determine if we have custom parameters passed from the initiation
  // These might be in ClientState (base64) or directly in the body if we added them to the URL
  
  const host = process.env.PUBLIC_WEBSOCKET_URL?.split('/openai-realtime-dialer')[0] || 
               req.get('host') || 
               'localhost:8080';
               
  const wsUrl = host.startsWith('wss://') || host.startsWith('ws://') 
    ? `${host}/openai-realtime-dialer`
    : `wss://${host}/openai-realtime-dialer`;

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
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${escapedWsUrl}" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
});

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
    <Say>Connecting you to the DemandGentic AI assistant.</Say>
    <Connect>
        <Stream url="wss://${req.get('host')}/openai-realtime-dialer" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
});

export default router;
