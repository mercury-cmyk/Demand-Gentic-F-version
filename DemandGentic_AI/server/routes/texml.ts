import { Router } from "express";
import { storePendingCallState } from "../services/pending-call-state";
import { getPreferredCodecForDestination } from "../services/audio-configuration";

const router = Router();
const VERBOSE_TEXML_LOGS = process.env.TEXML_VERBOSE_LOGS === 'true';

// Hardcoded production WebSocket host - env vars get overwritten by dev scripts
const PRODUCTION_WS_HOST = 'wss://demandgentic.ai';

/**
 * Determine the optimal codec for a destination phone number
 *
 * International carriers use different codecs:
 * - PCMU (G.711 µ-law): US, Canada, Japan
 * - PCMA (G.711 A-law): UK, Europe, Middle East, Australia, most of the world
 *
 * Using the correct codec AVOIDS transcoding at Telnyx, which:
 * - Eliminates noise and distortion from double transcoding
 * - Reduces latency
 * - Improves audio quality significantly for international calls
 *
 * @param phoneNumber - The destination phone number (E.164 format preferred)
 * @returns 'PCMA' for A-law regions, 'PCMU' for µ-law regions
 */
function getCodecForDestination(phoneNumber?: string): 'PCMA' | 'PCMU' {
  if (!phoneNumber) return 'PCMU'; // Default to µ-law (US standard)

  // Clean the phone number - keep only digits and leading +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // Extract country code (handle both +XX and just digits)
  const withoutPlus = cleaned.startsWith('+') ? cleaned.substring(1) : cleaned;

  // µ-law (PCMU) regions - North America and Japan
  const muLawPrefixes = [
    '1',    // USA, Canada, Caribbean
    '81',   // Japan
  ];

  // Check if it's a µ-law region
  for (const prefix of muLawPrefixes) {
    if (withoutPlus.startsWith(prefix)) {
      return 'PCMU';
    }
  }

  // Everything else uses A-law (PCMA)
  // This includes: UK (44), UAE (971), Germany (49), France (33),
  // Australia (61), India (91), and most international destinations
  return 'PCMA';
}

/**
 * Get a human-readable description of the codec choice
 */
function getCodecDescription(codec: 'PCMA' | 'PCMU', phoneNumber?: string): string {
  const cleaned = phoneNumber?.replace(/[^\d+]/g, '') || '';
  const countryCode = cleaned.startsWith('+') ? cleaned.substring(1, 4) : cleaned.substring(0, 3);

  const countryNames: Record = {
    '1': 'US/Canada',
    '44': 'UK',
    '971': 'UAE',
    '49': 'Germany',
    '33': 'France',
    '61': 'Australia',
    '91': 'India',
    '81': 'Japan',
    '86': 'China',
    '55': 'Brazil',
  };

  const matchedCountry = Object.entries(countryNames).find(([prefix]) =>
    cleaned.startsWith('+' + prefix) || cleaned.startsWith(prefix)
  );

  const country = matchedCountry ? matchedCountry[1] : `+${countryCode}`;
  return `${codec} (${codec === 'PCMA' ? 'A-law' : 'µ-law'}) for ${country}`;
}

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
const aiCallHandler = async (req: any, res: any) => {
  if (VERBOSE_TEXML_LOGS) {
    console.log("=".repeat(60));
    console.log("[TeXML] 🔔 RECEIVED REQUEST");
    console.log("[TeXML] Method:", req.method);
    console.log("[TeXML] Headers:", JSON.stringify(req.headers, null, 2));
    console.log("[TeXML] Body:", JSON.stringify(req.body, null, 2));
    console.log("[TeXML] Query:", JSON.stringify(req.query, null, 2));
    console.log("=".repeat(60));
  } else {
    console.log(`[TeXML] Request received method=${req.method} host=${req.get('host') || 'unknown'}`);
  }

  // Extract parameters from either body (POST) or query (GET)
  const params = req.method === 'GET' ? req.query : req.body;

  // Extract parameters from the request
  // Telnyx sends parameters as form-encoded by default in TeXML
  const callId = params.call_id || params.CallSid;
  // client_state comes from URL query param (since TeXML doesn't forward it from API call)
  const clientState = req.query.client_state as string || params.client_state || params.ClientState;

  // Extract destination phone number for codec selection
  // Telnyx provides this in various fields depending on the call direction
  const destinationNumber = params.To || params.to || params.Called || params.called ||
                           params.dialed_number || params.destination || null;

  if (VERBOSE_TEXML_LOGS) {
    console.log("[TeXML] Client state from query:", req.query.client_state ? "present" : "missing");
    console.log("[TeXML] Destination number:", destinationNumber || "unknown");
  }

  // Determine if we have custom parameters passed from the initiation
  // These might be in ClientState (base64) or directly in the body if we added them to the URL
  // Use PUBLIC_WEBSOCKET_URL if set, otherwise fall back to production constant
  // This ensures production calls always route to the correct WebSocket host
  // even if env vars were overwritten by dev scripts
  const rawWsUrl = process.env.PUBLIC_WEBSOCKET_URL?.trim().split('/voice-dialer')[0]?.split('/gemini-live-dialer')[0] || '';
  const host = rawWsUrl || PRODUCTION_WS_HOST;

  // CRITICAL FIX: Store full client_state in memory and only pass call_id in URL
  // This avoids URL length limits (~3KB base64 client_state was breaking ngrok WebSocket upgrades)
  // Gemini-only routing: all TeXML calls go through the voice dialer
  let dialerPath = '/voice-dialer';
  let finalWsUrl = '';
  let actualCallId: string | null = null;
  let contextData: Record | null = null;
  let phoneNumberForCodec: string | null = destinationNumber;

  if (clientState) {
    try {
      // Decode base64 client_state to extract call_id, provider, and store full context
      const decoded = Buffer.from(clientState, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid client_state JSON');
      contextData = parsed;
      actualCallId = contextData!.call_id;

      // Extract phone number from context for codec selection
      // This is more reliable than the TeXML params for outbound calls
      if (!phoneNumberForCodec) {
        phoneNumberForCodec = contextData!.phone_number || contextData!.to_number ||
                              contextData!.destination || contextData!.dialed_number || null;
      }

      const provider = contextData!.provider?.toLowerCase() || 'gemini_live';
      dialerPath = '/voice-dialer';
      if (VERBOSE_TEXML_LOGS) {
        console.log(`[TeXML] Provider: ${provider} → routing to /voice-dialer (Gemini-only)`);
      }

      // Build WebSocket URL with correct dialer path
      const wsUrl = host.startsWith('wss://') || host.startsWith('ws://')
        ? `${host}${dialerPath}`
        : `wss://${host}${dialerPath}`;

      if (actualCallId) {
        // Only pass call_id in URL (short, safe for WebSocket upgrade)
        finalWsUrl = `${wsUrl}?call_id=${encodeURIComponent(actualCallId)}`;
        if (VERBOSE_TEXML_LOGS) {
          console.log(`[TeXML] Stored context for call ${actualCallId}, URL length now: ${finalWsUrl.length}`);
        }
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

  if (VERBOSE_TEXML_LOGS) {
    console.log(`[TeXML] Client state length: ${clientState?.length || 0}`);
    console.log(`[TeXML] Final WS URL length: ${finalWsUrl.length}`);
    console.log(`[TeXML] Dialer path: ${dialerPath}`);
    console.log(`[TeXML] Responding with Stream to: ${finalWsUrl.replace(/\?.*$/, '')}`);
  }

  // Escape any XML special characters in the URL
  const escapedWsUrl = finalWsUrl.replace(/&/g, '&amp;');

  // DYNAMIC CODEC SELECTION for international calls
  // Use PCMA (A-law) for UK, UAE, Europe, etc. to avoid transcoding noise
  // Use PCMU (µ-law) for US/Canada
  const codec = getCodecForDestination(phoneNumberForCodec || undefined);
  const codecDescription = getCodecDescription(codec, phoneNumberForCodec || undefined);

  // BIDIRECTIONAL CODEC FIX (Feb 2026):
  // Telnyx has TWO separate codec parameters on :
  //   - codec="PCMA"             → controls the INBOUND track (callee → us)
  //   - bidirectionalCodec="PCMA" → controls the BIDIRECTIONAL WebSocket stream (both directions)
  // Previously we only set `codec`, so the bidirectional stream defaulted to PCMU.
  // This caused double transcoding on UK/UAE calls: PCMA↔PCMU at Telnyx + wrong decoder on our side.
  // Now we set BOTH to ensure the WebSocket stream matches the SIP leg codec.
  //
  // FUTURE: Consider using bidirectionalCodec="L16" (Linear PCM 16kHz) which:
  //   - Eliminates ALL G.711 encoding/decoding on our server
  //   - Only requires linear resampling (16kHz ↔ 24kHz for Gemini)
  //   - Telnyx handles L16↔G.711 conversion on their media servers
  //   - Doubles bandwidth (256kbps vs 128kbps) — acceptable for WebSocket
  // To enable: set UNIFIED_AUDIO_CONFIG.enableL16Bidirectional = true
  const bidirectionalCodec = codec; // Match SIP leg codec for zero-transcoding path

  // FUTURE: G.722 / OPUS support (per Telnyx support recommendation Feb 2026)
  // Telnyx bidirectional supports: PCMU, PCMA, G722, OPUS, AMR-WB, L16
  const preferredWideband = getPreferredCodecForDestination(phoneNumberForCodec || undefined);
  if (preferredWideband) {
    console.log(`[TeXML] 🎵 Wideband codec available: ${preferredWideband} (using ${codec} until L16/wideband enabled)`);
  }

  // Persist codec selection into pending call state so the dialer can
  // use it if Telnyx omits media_format in the start message.
  if (contextData && actualCallId) {
    contextData.texml_codec = codec;
    contextData.audio_format = codec === 'PCMA' ? 'g711_alaw' : 'g711_ulaw';
    void storePendingCallState(actualCallId, contextData).catch((error) => {
      console.error(`[TeXML] Failed to persist pending call state for ${actualCallId}:`, error);
    });
  }
  console.log(`[TeXML] 🎧 Codec selection: ${codecDescription}`);

  res.set("Content-Type", "application/xml");

  // Determine if this is an international call (non-US/Canada)
  // International calls need Telnyx noise suppression due to longer network paths
  // and codec transcoding that can introduce artifacts
  const isInternationalCall = codec === 'PCMA'; // A-law = international (UK, EU, UAE, etc.)

  // Build the TeXML response with dynamic codec
  // TWO codec attributes on :
  //   - codec: Controls inbound track (callee audio sent to us)
  //   - bidirectionalCodec: Controls bidirectional WebSocket stream (both directions)
  // BOTH must be set, otherwise bidirectional defaults to PCMU regardless of SIP codec.
  //
  // For INTERNATIONAL CALLS: Add Telnyx Suppression verb to reduce noise from:
  // - Network latency/jitter on long routes
  // - Background noise on the prospect's side that becomes more audible after compression
  //
  // CRITICAL FIX (Feb 2026): Use direction="inbound" (NOT "both")
  // The AI agent's outbound audio is already clean synthesized speech from Gemini.
  // Only suppress the inbound (prospect) side.
  const texmlResponse = isInternationalCall
    ? `

    
        
    
    
        
    
`
    : `

    
        
    
`;

  if (VERBOSE_TEXML_LOGS) {
    console.log("[TeXML] ✅ Sending TeXML response to Telnyx:");
    console.log("[TeXML] Full WebSocket URL:", finalWsUrl);
    console.log(`[TeXML] 🌍 International call: ${isInternationalCall ? 'YES (Krisp noise suppression enabled)' : 'NO (US/Canada)'}`);
    console.log("[TeXML] XML Response:", texmlResponse);
    console.log("[TeXML] Telnyx should now connect to this WebSocket URL");
    console.log("=".repeat(60));
  }

  res.send(texmlResponse);
};

// Register handler for both GET and POST
router.get("/ai-call", aiCallHandler);
router.post("/ai-call", aiCallHandler);

/**
 * Incoming call handler for TeXML Application
 */
router.post("/incoming", (req, res) => {
  console.log("[TeXML] Received incoming call:", req.body);

  // For incoming calls, the caller's number determines the codec
  // This is the opposite of outbound calls where we look at the destination
  const callerNumber = req.body.From || req.body.from || req.body.Caller || req.body.caller || null;
  const codec = getCodecForDestination(callerNumber);
  const codecDescription = getCodecDescription(codec, callerNumber);
  console.log(`[TeXML] 🎧 Incoming call codec: ${codecDescription}`);
  console.log(`[TeXML] 🌍 International caller: ${codec === 'PCMA' ? 'YES (Krisp noise suppression enabled)' : 'NO (US/Canada)'}`);

  res.set("Content-Type", "application/xml");
  // CRITICAL FIX: Remove AMD blocking from incoming calls too
  // Connect directly to stream without AMD delays
  // Use dynamic codec based on caller's region

  // For international callers (A-law regions), enable noise suppression
  // This helps with network artifacts on long-distance calls
  const isInternationalIncoming = codec === 'PCMA';

  // CRITICAL FIX (Feb 2026): Use direction="inbound" for incoming calls too.
  // For incoming calls: inbound = caller audio, outbound = our AI response.
  // Our AI response is clean synthesized speech; running Krisp on it causes
  // artifacts (same issue as outbound AI calls).
  // Only suppress the international caller's audio (network noise, background).
  const incomingTexmlResponse = isInternationalIncoming
    ? `

    
        
    
    Connecting you to the DemandGentic.ai By Pivotal B2B assistant.
    
        
    
`
    : `

    Connecting you to the DemandGentic.ai By Pivotal B2B assistant.
    
        
    
`;

  res.send(incomingTexmlResponse);
});

export default router;