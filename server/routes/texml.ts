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
  const clientState = req.body.client_state || req.body.ClientState;
  
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
  const finalWsUrl = clientState ? `${wsUrl}?client_state=${clientState}` : wsUrl;

  console.log(`[TeXML] Responding with Stream to: ${finalWsUrl}`);

  res.set("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${finalWsUrl}" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
});

/**
 * Incoming call handler for TeXML Application
 */
router.post("/incoming", (req, res) => {
  console.log("[TeXML] Received incoming call:", req.body);
  
  res.set("Content-Type", "application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Connecting you to the Demand Earn AI assistant.</Say>
    <Connect>
        <Stream url="wss://${req.get('host')}/openai-realtime-dialer" bidirectionalMode="rtp" />
    </Connect>
</Response>`);
});

export default router;
