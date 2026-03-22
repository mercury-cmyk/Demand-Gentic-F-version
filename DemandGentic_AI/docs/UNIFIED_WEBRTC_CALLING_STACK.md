# Unified WebRTC Calling Stack

## Overview

This document describes the unified calling stack that enables both Human Agents and AI Agents to make and receive calls using the **exact same Telnyx WebRTC calling path**. The AI adds intelligence by connecting to OpenAI Realtime via WebRTC and bridging audio inside the client.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Client                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────────────┐ │
│  │  Telnyx WebRTC     │       │   OpenAI Realtime WebRTC    │ │
│  │  Peer Connection   │       │   Peer Connection           │ │
│  │                    │       │                             │ │
│  │  - PSTN/SIP calls  │       │  - AI voice model           │ │
│  │  - @telnyx/webrtc  │       │  - Data channel for events  │ │
│  │  - Track: mic/out  │       │  - Track: AI audio in/out   │ │
│  └────────┬───────────┘       └──────────┬──────────────────┘ │
│           │                              │                     │
│           └──────────┬───────────────────┘                     │
│                      │                                         │
│            ┌─────────▼─────────┐                               │
│            │  Audio Bridge     │                               │
│            │  Controller       │                               │
│            │                   │                               │
│            │  Human Mode:      │                               │
│            │  Mic → Telnyx     │                               │
│            │                   │                               │
│            │  AI Mode:         │                               │
│            │  Telnyx → OpenAI  │                               │
│            │  OpenAI → Telnyx  │                               │
│            └───────────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Hard Constraints (Non-Negotiable)

| Constraint | Status | Details |
|------------|--------|---------|
| ✅ Telnyx WebRTC | Required | `@telnyx/webrtc` SDK only |
| ✅ OpenAI WebRTC | Required | Realtime API over WebRTC peer connection |
| ❌ No WebSockets | Forbidden | No `new WebSocket()`, no `socket.io`, no WS fallback |
| ❌ No Server Audio Bridge | Forbidden | No server-side PCM/audio proxy over WS |
| ✅ One Simple Setup | Required | Shared device handling, call controls, UI |

## Components

### 1. Telnyx WebRTC Client (`client/src/lib/webrtc/telnyx-webrtc-client.ts`)

Wraps the `@telnyx/webrtc` SDK for unified call management.

```typescript
import { TelnyxWebRTCClient } from '@/lib/webrtc';

const client = new TelnyxWebRTCClient({
  credentials: { username: 'user', password: 'pass' },
  callerIdNumber: '+15551234567',
  onCallStateChange: (state) => console.log('Call state:', state),
  onRemoteStream: (stream) => console.log('Remote audio received'),
});

await client.connect();
await client.call({ destinationNumber: '+15559876543' });
```

**Key Methods:**
- `connect()` - Initialize and connect to Telnyx
- `call(options)` - Place outbound call
- `answer()` - Answer incoming call
- `hangup()` - End call
- `toggleMute()` / `toggleHold()` - Call controls
- `getRemoteAudioTrack()` - Get other party's audio (for AI bridging)
- `replaceLocalAudioTrack(track)` - Inject AI audio into call

### 2. OpenAI Realtime WebRTC Client (`client/src/lib/webrtc/openai-realtime-webrtc-client.ts`)

Connects to OpenAI Realtime API using pure WebRTC (no WebSockets).

```typescript
import { OpenAIRealtimeWebRTCClient } from '@/lib/webrtc';

const openai = new OpenAIRealtimeWebRTCClient({
  ephemeralTokenEndpoint: '/api/openai/webrtc/ephemeral-token',
  model: 'gpt-4o-realtime-preview-2024-12-17',
  voice: 'alloy',
  instructions: 'You are a helpful sales assistant.',
  onAudioOutput: (track) => console.log('AI audio track received'),
  onTranscript: (t) => console.log(`${t.role}: ${t.text}`),
});

await openai.connect(inputAudioTrack);
```

**Key Methods:**
- `connect(inputTrack?)` - Connect to OpenAI with optional audio input
- `setInputAudioTrack(track)` - Set/replace input audio
- `getOutputAudioTrack()` - Get AI generated audio
- `sendMessage(text)` - Send text to AI (via data channel)
- `cancelResponse()` - Interrupt AI response

### 3. Audio Bridge Controller (`client/src/lib/webrtc/audio-bridge-controller.ts`)

Manages audio routing between Telnyx and OpenAI.

```typescript
import { createAudioBridge } from '@/lib/webrtc';

const bridge = createAudioBridge(telnyxClient, {
  openaiEphemeralEndpoint: '/api/openai/webrtc/ephemeral-token',
  openaiVoice: 'nova',
  openaiInstructions: 'You are a professional agent.',
  onTranscript: (t) => updateUI(t),
});

// Initialize after Telnyx call becomes active
await bridge.initialize();

// Switch to AI mode (OpenAI handles the call)
await bridge.switchToAIMode();

// Switch back to human mode
await bridge.switchToHumanMode();
```

**Modes:**

| Mode | Description | Audio Flow |
|------|-------------|------------|
| **Human** | Agent speaks directly | Mic → Telnyx, Telnyx → Speakers |
| **AI** | AI handles conversation | Telnyx → OpenAI, OpenAI → Telnyx |

### 4. Unified Softphone Component (`client/src/components/softphone/UnifiedSoftphone.tsx`)

Ready-to-use React component for calling.

```tsx
import { UnifiedSoftphone } from '@/components/softphone';

 console.log('Called:', num)}
  onModeChange={(mode) => console.log('Mode:', mode)}
/>
```

### 5. React Hook (`client/src/hooks/useUnifiedWebRTC.ts`)

Hook for custom UI implementations.

```typescript
import { useUnifiedWebRTC } from '@/hooks/useUnifiedWebRTC';

const [state, actions] = useUnifiedWebRTC({
  telnyxCredentials: { username, password },
  openaiEphemeralEndpoint: '/api/openai/webrtc/ephemeral-token',
});

// State
state.isReady       // Telnyx connected
state.callState     // 'idle' | 'connecting' | 'ringing' | 'active' | ...
state.bridgeMode    // 'human' | 'ai'
state.transcripts   // Live transcripts in AI mode

// Actions
actions.connect()
actions.makeCall('+15551234567')
actions.toggleMode()  // Switch between human/AI
actions.hangup()
```

## Server Endpoints

### Ephemeral Token Endpoint

`POST /api/openai/webrtc/ephemeral-token`

Mints short-lived OpenAI credentials for WebRTC connection.

```typescript
// Request
{ model?: string, voice?: string, instructions?: string }

// Response
{ token: string, expires_at: number }
```

### Telnyx Credentials

`GET /api/telnyx/webrtc/credentials`

Returns Telnyx WebRTC credentials for authenticated user.

```typescript
// Response
{ username: string, password: string, callerIdNumber?: string }
```

## Security

| Concern | Solution |
|---------|----------|
| OpenAI API Key exposure | Server mints ephemeral tokens (60s TTL) |
| Telnyx credentials | Served via authenticated endpoint |
| User authentication | All endpoints require auth |

## CI/CD Compliance Check

GitHub Actions workflow (`/.github/workflows/webrtc-compliance.yml`) enforces:

1. **No WebSocket usage** in WebRTC calling components
2. **Telnyx SDK import** verification
3. **RTCPeerConnection usage** verification
4. **Track replacement** for audio bridging

Run locally:
```bash
./scripts/check-webrtc-compliance.sh
```

## Forbidden Patterns

These will fail CI:

```typescript
// ❌ FORBIDDEN
new WebSocket('wss://...')
import io from 'socket.io-client'
import WebSocket from 'ws'
```

## Allowed Patterns

```typescript
// ✅ ALLOWED - WebRTC only
new RTCPeerConnection(config)
peerConnection.createDataChannel('events')
sender.replaceTrack(newAudioTrack)

// ✅ ALLOWED - REST for tokens only
fetch('/api/openai/webrtc/ephemeral-token', { method: 'POST' })
```

## Audio Bridging Implementation

### Human Mode (Default)
```
[Microphone] → [Telnyx PC] → [PSTN/SIP]
[PSTN/SIP] → [Telnyx PC] → [Speakers]
```

### AI Mode
```
[PSTN/SIP] → [Telnyx Remote Track] → [OpenAI Input]
[OpenAI Output Track] → [replaceTrack] → [Telnyx Outbound]
```

### Echo Prevention
- OpenAI output is NOT played to speakers by default
- Optional monitoring mode available (explicit enable)
- AI input comes from Telnyx remote (not local mic)

## Testing Checklist

### Functional Tests
- [ ] Human call placed via Telnyx WebRTC works
- [ ] AI call placed via Telnyx WebRTC works (AI speaks/hears via OpenAI)
- [ ] Switch Human→AI mid-call without dropping
- [ ] Switch AI→Human mid-call without dropping
- [ ] Incoming calls can be answered by Human
- [ ] Incoming calls can be answered by AI

### Compliance Tests
- [ ] Network inspection: Telnyx uses WebRTC only
- [ ] Network inspection: OpenAI uses WebRTC only
- [ ] No WebSocket connections at any time
- [ ] Repo scan: no `new WebSocket(` anywhere in WebRTC stack

### Quality Tests
- [ ] No echo loop (AI doesn't respond to itself)
- [ ] Track replacement stable across hold/mute/unmute
- [ ] Audio quality acceptable in both modes

## Troubleshooting

### Issue: "No remote audio from Telnyx"
- Check Telnyx credentials are valid
- Verify `onRemoteStream` callback fires
- Check audio element is not muted

### Issue: "OpenAI not responding"
- Verify ephemeral token endpoint returns valid token
- Check data channel opens (console log: "Data channel opened")
- Verify input audio track is connected

### Issue: "AI mode audio is one-way"
- Check `replaceTrack` succeeds (console log)
- Verify OpenAI output track is received
- Check audio context isn't suspended

## File Structure

```
client/src/
├── lib/webrtc/
│   ├── index.ts                      # Module exports
│   ├── telnyx-webrtc-client.ts       # Telnyx SDK wrapper
│   ├── openai-realtime-webrtc-client.ts  # OpenAI WebRTC client
│   └── audio-bridge-controller.ts    # Audio routing
├── hooks/
│   └── useUnifiedWebRTC.ts           # React hook
└── components/softphone/
    ├── index.ts
    └── UnifiedSoftphone.tsx          # UI component

server/routes/
├── openai-webrtc.ts                  # Ephemeral token endpoint
└── telnyx-webrtc.ts                  # Credentials endpoint

.github/workflows/
└── webrtc-compliance.yml             # CI check

scripts/
└── check-webrtc-compliance.sh        # Local compliance check
```