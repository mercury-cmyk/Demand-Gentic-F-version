# RTP Media Handling Implementation Guide

## Overview

This document describes the complete RTP media handling implementation for bridging SIP calls with Gemini Live AI. The system architecture is designed to handle real-time bidirectional audio streaming between PSTN/SIP callers and Google's Gemini Live API.

## Architecture Diagram

```
┌─────────────────┐
│   SIP Caller    │
│  (PSTN/Telnyx)  │
└────────┬────────┘
         │ RTP (G.711)
         │ UDP Port 10000-20000
         │
    ┌────▼─────┐
    │ Drachtio │
    │   SIP    │
    │  Server  │
    └────┬─────┘
         │ SDP negotiation
         │ (RTP endpoint exchange)
         │
    ┌────▼─────────────────────┐
    │  GeminiLiveSIPProvider    │
    │  ─────────────────────── │
    │  • RTP UDP Listener       │
    │  • G.711→PCM Transcoding  │
    │  • WebSocket Connection   │
    │  • PCM→G.711 Transcoding  │
    │  • Health Monitoring      │
    └────┬─────────────────────┘
         │ WebSocket
         │ Bidirectional audio
         │
    ┌────▼──────────────────┐
    │ Gemini Live API       │
    │ (Google Cloud)        │
    └───────────────────────┘
```

## Components

### 1. SDP Parser (`server/services/sip/sdp-parser.ts`)

**Purpose:** Extract media endpoint information from SDP (Session Description Protocol) bodies.

**Key Functions:**
- `parseSDP(sdpBody)` - Parse complete SDP and extract all media sections
- `getAudioEndpoint(sdpBody)` - Get first audio media endpoint (address and port)
- `getSessionConnectionAddress(sdpBody)` - Get session-level connection address

**Usage in Drachtio Server:**
```typescript
const remoteEndpoint = getAudioEndpoint(call.req.body);
// Result: { address: "192.168.1.100", port: 5000 }
```

**SDP Format:**
```
v=0
o=- 1234567890 1234567890 IN IP4 192.168.1.100
s=Test Session
c=IN IP4 192.168.1.100              ← Connection address
m=audio 5000 RTP/AVP 0 8            ← Media line (type, port, protocol)
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
```

### 2. Gemini Live SIP Provider (`server/services/gemini-live-sip-provider.ts`)

**Purpose:** Bidirectional media bridge between SIP RTP and Gemini Live WebSocket.

**Architecture:**
- Single-call media processor
- In-process UDP socket for RTP
- WebSocket connection to Gemini Live
- Real-time transcoding (G.711 ↔ PCM)
- Health monitoring with 30-second keep-alive pings

**Key Classes:**
- `GeminiLiveSIPProvider` - Main media bridge class

**Key Methods:**
- `constructor(callId, rtpPort, remoteAddress, remotePort, config, toPhoneNumber)`
- `start(): Promise` - Start media bridge
- `stop(): Promise` - Stop and cleanup

**Configuration:**
```typescript
interface GeminiLiveSIPProviderConfig {
  geminiApiKey: string;
  model?: string;                    // Default: "models/gemini-2.5-flash-native-audio-preview"
  voiceName?: string;                // Default: "Puck"
  systemPrompt: string;              // Required: AI behavior instructions
}
```

**Internal Components:**
1. **RTP Receiver** (lines 101-126)
   - UDP socket bound to allocated RTP port
   - Handles incoming RTP packets from SIP caller
   - Parses RTP header (version, payload type, sequence, timestamp, SSRC)

2. **Transcoding Pipeline** (lines 170-198)
   - Inbound: G.711 (mulaw/alaw) → PCM 16-bit 16kHz
   - Outbound: PCM 16-bit 16kHz → G.711 (mulaw/alaw)
   - Uses existing `audio-transcoder` module

3. **Gemini Live Connection** (lines 200-313)
   - WebSocket connection to Gemini Live API
   - Retry logic with exponential backoff (3 attempts)
   - Timeout handling
   - Graceful error recovery

4. **Bidirectional Streaming** (lines 315-395)
   - Sends PCM audio to Gemini in real-time
   - Receives text and audio responses
   - Maintains conversation state
   - Handles mid-stream corrections

5. **RTP Sender** (lines 397-435)
   - Constructs RTP headers (V=2, PT=0 for PCMU)
   - Manages sequence numbers and timestamps
   - Sends UDP datagrams back to caller

6. **Health Monitoring** (lines 353-373)
   - 30-second keep-alive pings to Gemini
   - Detects connection issues
   - Automatic reconnection on failure

### 3. Drachtio SIP Server Integration (`server/services/sip/drachtio-server.ts`)

**Purpose:** Orchestrate SIP call handling and media provider lifecycle.

**Integration Points:**

#### A. Media Provider Tracking (lines 176-211)
```typescript
class MediaProviderTracker {
  set(callId: string, provider: GeminiLiveSIPProvider): void
  get(callId: string): GeminiLiveSIPProvider | undefined
  async remove(callId: string): Promise
}
```

#### B. INVITE Handler (lines 338-407)
- Accepts inbound SIP calls
- Allocates RTP port
- Generates local SDP with allocated port
- Sends 180 Ringing + 200 OK
- **Calls `setupMediaHandlers()` after call answered**

#### C. Setup Media Handlers (lines 478-560)
**Flow:**
1. Parse remote SDP to extract caller's RTP endpoint
2. Get Gemini API configuration from environment
3. Extract phone number from destination (for codec detection)
4. Create `GeminiLiveSIPProvider` instance
5. Start provider (initializes RTP listener + Gemini connection)
6. Track provider for cleanup
7. Detailed error handling and logging

**Configuration via Environment Variables:**
```bash
GEMINI_API_KEY=
GEMINI_MODEL=models/gemini-2.5-flash-native-audio-preview
GEMINI_VOICE_NAME=Puck
GEMINI_SYSTEM_PROMPT="You are a helpful sales representative..."
```

#### D. BYE Handler (lines 406-410)
- Triggered when caller hangs up
- **Stops media provider** (cleans up WebSocket, UDP socket)
- Releases RTP port
- Removes call tracking

#### E. CANCEL Handler (lines 412-416)
- Handles call cancellation mid-ringing
- Same cleanup as BYE handler

## Data Flow

### Incoming Audio (Caller → Gemini)
```
Caller → RTP (G.711 mulaw/alaw)
        → UDP Port (e.g., 10000)
        → GeminiLiveSIPProvider.startRtpReceiver()
        → Parse RTP header
        → Extract audio payload
        → Transcode G.711 → PCM
        → Send via WebSocket to Gemini Live
```

### Outgoing Audio (Gemini → Caller)
```
Gemini Live API → WebSocket message (PCM audio data)
               → GeminiLiveSIPProvider.handleGeminiMessage()
               → Transcode PCM → G.711
               → Build RTP packet (header + payload)
               → Send UDP to caller (original source IP:port)
```

## Configuration & Deployment

### Environment Variables Required
```bash
# Gemini API
GEMINI_API_KEY=
GEMINI_MODEL=models/gemini-2.5-flash-native-audio-preview
GEMINI_VOICE_NAME=Puck
GEMINI_SYSTEM_PROMPT="Your custom prompt here"

# Drachtio SIP Server
DRACHTIO_HOST=localhost
DRACHTIO_PORT=9022
DRACHTIO_SECRET=cymru
SIP_LISTEN_HOST=0.0.0.0
SIP_LISTEN_PORT=5060
PUBLIC_IP=     # Required for SDP
RTP_PORT_MIN=10000
RTP_PORT_MAX=20000

# Optional
STUN_SERVERS=stun:stun.l.google.com:19302
TURN_SERVERS=[]
```

### Codec Detection
The system automatically detects which G.711 variant to use:
- **ULAW (mulaw)** - North America, Japan (default)
- **ALAW (alaw)** - Europe, Asia Pacific

Detection is based on destination phone number. The `audio-transcoder` module handles this.

## Call Lifecycle

### Timeline
```
0.000s  │ Incoming INVITE from caller
        ├─ Parse SDP (extract remote RTP: 192.168.1.100:5000)
        ├─ Allocate local RTP port (e.g., 10001)
        ├─ Generate local SDP with port 10001
        ├─ Send 180 Ringing
        ├─ Send 200 OK with SDP
        │
0.500s  │ setupMediaHandlers() called
        ├─ Create GeminiLiveSIPProvider
        ├─ Start RTP listener on port 10001
        ├─ Connect WebSocket to Gemini Live
        ├─ Send model/voice config to Gemini
        │
1.000s  │ Caller hears phone ringing sound generated locally
        │
2.000s  │ Caller starts speaking
        ├─ RTP packets arrive at 10001
        ├─ Parsed, decoded, transcoded to PCM
        ├─ Sent via WebSocket to Gemini Live
        │
2.500s  │ Gemini processes audio and responds
        ├─ PCM audio received via WebSocket
        ├─ Transcoded to G.711
        ├─ RTP packets constructed
        ├─ Sent back to 192.168.1.100:5000
        │
...     │ Continue bidirectional streaming
        │
45.000s │ Caller hangs up (BYE)
        ├─ Stop media provider
        ├─ Close UDP socket
        ├─ Close WebSocket
        ├─ Release RTP port
        ├─ Remove call tracking
```

## Error Handling

### RTP Receiver Failures
- **UDP bind error:** Logged, media provider marked inactive
- **Invalid RTP packet:** Skipped with warning
- **Transoding error:** Logged, packet dropped, stream continues

### Gemini Connection Failures
- **Initial connection fail:** Retry up to 3 times with exponential backoff
- **WebSocket disconnect:** Logged, no automatic reconnect (call terminates gracefully)
- **API errors:** Logged with error code, call terminates gracefully

### Cleanup
- Ensures no resource leaks on error
- RTP port always released on call end (BYE/CANCEL)
- All sockets and WebSockets properly closed
- Memory freed in `MediaProviderTracker.remove()`

## Monitoring & Logging

### Log Messages
All operations log to console with timestamps and component prefix.

```
[Drachtio SIP] 2025-01-15T10:30:00.000Z INVITE received: sip:+12025551234@provider.com -> sip:+19175556789@drachtio-server
[Drachtio SIP] 2025-01-15T10:30:00.100Z Setting up media handlers for call  on port 10001
[Drachtio SIP] 2025-01-15T10:30:00.100Z Remote RTP endpoint: 192.168.1.100:5000
[Gemini Live SIP Provider] 2025-01-15T10:30:00.200Z Provider created:  (RTP: 10001, Remote: 192.168.1.100:5000, Format: ulaw)
[Gemini Live SIP Provider] 2025-01-15T10:30:00.300Z ✓ Media bridge started for call 
[Gemini Live SIP Provider] 2025-01-15T10:30:00.400Z ✓ Gemini Live WebSocket connected
[Drachtio SIP] 2025-01-15T10:30:00.500Z ✓ Media handlers initialized for call 
```

### Monitoring Endpoints
To be added:
- `/api/calls` - List active calls with media provider status
- `/api/calls/` - Details for specific call
- `/api/media-providers` - RTP provider statistics
- `/api/health/drachtio` - SIP server health
- `/api/health/gemini` - Gemini Live connection status

## Performance Considerations

### RTP Packet Processing
- Incoming packets: ~50 packets/sec (20ms ptime)
- Each packet: ~160 bytes payload (PCM)
- Transcoding: Real-time with minimal latency (<5ms)
- WebSocket send: Non-blocking, batched when possible

### Memory Usage
- Per call: ~2MB (RTP buffers, WebSocket, state)
- 100 concurrent calls: ~200MB
- Scales linearly within CPU constraints

### Network Requirements
- **SIP signaling:** <5 Kbps per call
- **RTP media:** 64 Kbps per direction (G.711 + overhead)
- **Gemini WebSocket:** 64 Kbps per direction (PCM + protocol overhead)
- **Total per call:** ~128 Kbps bidirectional

## Testing Checklist

- [ ] Verify Drachtio server connects to drachtio daemon
- [ ] Test inbound SIP call with known SIP client (e.g., Zoiper, Jami)
- [ ] Verify RTP port allocated and within range
- [ ] Verify local SDP generated correctly
- [ ] Verify remote SDP parsed correctly (endpoint extracted)
- [ ] Verify Gemini WebSocket connection established
- [ ] Test bidirectional audio (caller → Gemini → caller)
- [ ] Verify call terminates cleanly on BYE
- [ ] Verify RTP port released after call
- [ ] Verify media provider cleaned up
- [ ] Test with 5+ concurrent calls (no port conflicts)
- [ ] Test error scenarios (Gemini connection fail, timeout, etc.)
- [ ] Verify logging output is detailed but not excessive
- [ ] Monitor memory/CPU usage under load

## Future Enhancements

1. **Call Recording** - Record both sides of audio for auditing
2. **Advanced Error Recovery** - Automatic Gemini reconnection on failure
3. **Call Transfer** - Bridge to other agents or systems
4. **Analytics** - Track call quality, duration, success metrics
5. **Custom LLM Integration** - Support alternative AI providers
6. **DTMF Handling** - Support touch-tone keypads
7. **Conference Calls** - Bridge multiple callers to Gemini
8. **Silence Detection** - Optimize bandwidth with VAD (Voice Activity Detection)
9. **Custom Voice Models** - Use fine-tuned Gemini models
10. **Webhook Callbacks** - Notify external systems of call events

## Troubleshooting

### "No available RTP ports"
- Check that RTP_PORT_MIN and RTP_PORT_MAX are set correctly
- Verify no firewall blocking UDP range
- Check for port conflicts with other services
- Restart server if ports not released properly

### "Could not connect to Gemini Live"
- Verify GEMINI_API_KEY is set and valid
- Check internet connectivity to Google Cloud
- Verify API quotas and region settings
- Check Gemini API status page

### "RTP packet parsing errors"
- Record affected packets with tcpdump
- Verify remote SDP specifies compatible codec
- Check for NAT/firewall rewriting RTP headers
- Monitor remote endpoint for packet loss

### "Audio quality degraded"
- Check network latency and jitter (aim for <50ms)
- Monitor Gemini WebSocket latency
- Verify no packet loss (aim for <1%)
- Check CPU usage (throttling can cause skip)

## References

- [Drachtio-SRF Documentation](https://drachtio.org/)
- [SIP RFCs - RFC 3261](https://tools.ietf.org/html/rfc3261)
- [RTP RFC 3550](https://tools.ietf.org/html/rfc3550)
- [G.711 Codec RFC 3551](https://tools.ietf.org/html/rfc3551)
- [Gemini Live API Docs](https://ai.google.dev/live)