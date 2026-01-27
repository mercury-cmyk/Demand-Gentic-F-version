# Unified Call Router Implementation Summary

## Overview

All call types now route through a **unified call router** that enforces SIP-exclusive calling when `USE_SIP_CALLING=true`.

## Affected Call Types

### ✅ All call types now use SIP infrastructure:

1. **AI Calls** (Gemini Live, OpenAI Realtime)
   - Routes through `gemini-live-sip-gateway.ts`
   - Uses Gemini Live SIP Provider for media bridging
   - Transcodes RTP/G.711 ↔ PCM for AI processing

2. **Campaign Calls** (Auto-dialer, Predictive dialer)
   - Routes through same SIP infrastructure
   - Enforces SIP-only routing
   - Maintains campaign context and tracking

3. **Agent Console Calls** (Human-initiated)
   - Routes through SIP instead of Telnyx WebRTC
   - Uses same SIP server for consistency
   - Records and tracks like any other call

4. **Test Calls**
   - Also routes through SIP
   - Ensures testing matches production behavior

## Implementation Files

### Core Router
- **`unified-call-router.ts`** (280 lines)
  - `routeUnifiedCall()` - Main routing function
  - `routeViaSIP()` - SIP-specific routing
  - `endUnifiedCall()` - Call termination
  - `getCallRoutingStatus()` - Status check
  - `initializeUnifiedCallRouter()` - Startup initialization

### Enforcement Stack
- **`gemini-live-sip-gateway.ts`** - AI call gateway
- **`gemini-live-sip-provider.ts`** - Media bridge
- **`gemini-live-sip-enforcement.ts`** - Enforcement layer

### Configuration
- **`server/index.ts`** - Initializes SIP + unified router on startup
- **`.env.sip`** - Contains `USE_SIP_CALLING=true` flag

## Usage Examples

### Example 1: AI Call (Gemini Live)

```typescript
import { routeUnifiedCall } from './services/unified-call-router';

const result = await routeUnifiedCall({
  callType: 'gemini_live_ai',
  toNumber: '+1234567890',
  fromNumber: '+0987654321',
  campaignId: 'campaign-123',
  contactId: 'contact-456',
  queueItemId: 'queue-789',
  systemPrompt: 'You are a helpful sales assistant...',
  voiceName: 'Puck',
  maxCallDurationSeconds: 600,
  enableRecording: true,
});

if (result.success) {
  console.log(`Call initiated: ${result.sipCallId}`);
} else {
  console.error(`Call failed: ${result.error}`);
}
```

### Example 2: Campaign Auto-Dialer Call

```typescript
import { routeUnifiedCall } from './services/unified-call-router';

const result = await routeUnifiedCall({
  callType: 'campaign_auto',
  toNumber: contact.phone,
  fromNumber: campaign.fromNumber,
  campaignId: campaign.id,
  contactId: contact.id,
  queueItemId: queue.id,
  enableRecording: true,
  callContext: {
    contactName: contact.name,
    campaignName: campaign.name,
  },
});
```

### Example 3: Agent Console Click-to-Call

```typescript
import { routeUnifiedCall } from './services/unified-call-router';

const result = await routeUnifiedCall({
  callType: 'agent_console',
  toNumber: '+1234567890',
  fromNumber: agent.callbackPhone,
  agentId: agent.id,
  contactId: contactId,
  campaignId: campaignId,
  enableRecording: true,
  callContext: {
    agentName: agent.name,
    manualCall: true,
  },
});
```

### Example 4: Test Call

```typescript
import { routeUnifiedCall } from './services/unified-call-router';

const result = await routeUnifiedCall({
  callType: 'test_call',
  toNumber: '+1234567890',
  fromNumber: '+0987654321',
  systemPrompt: 'Test system prompt',
  enableRecording: false,
});
```

## Migration Guide

### Before (Multiple call paths):
```typescript
// AI calls
await initiateGeminiCall(...);

// Campaign calls  
await telnyxDialer.dial(...);

// Agent console
await telnyxWebRTC.makeCall(...);
```

### After (Unified router):
```typescript
// All calls
await routeUnifiedCall({
  callType: '<type>',
  toNumber: '...',
  fromNumber: '...',
  ...
});
```

## Configuration

### Enable SIP Calling (`.env.sip`):
```env
# Master switch - enables SIP for ALL call types
USE_SIP_CALLING=true

# SIP Server Configuration
PUBLIC_IP=39.58.167.123
DRACHTIO_HOST=drachtio
DRACHTIO_PORT=9022
SIP_LISTEN_PORT=5060
SIP_LISTEN_HOST=0.0.0.0
AUTO_INIT_SIP=true

# STUN/TURN for NAT traversal
STUN_SERVERS=stun:stun.l.google.com:19302
TURN_SERVERS=[{"urls":["turn:coturn:3478"],"username":"turnuser","credential":"turnpass"}]

# RTP Media Ports
RTP_PORT_MIN=10000
RTP_PORT_MAX=20000
```

## Health Checks

### Check Router Status:
```typescript
import { getCallRoutingStatus } from './services/unified-call-router';

const status = getCallRoutingStatus();
console.log(status);
// {
//   sipEnabled: true,
//   provider: 'sip',
//   ready: true
// }
```

### Check SIP Health:
```bash
curl http://localhost:5000/api/health
```

Response:
```json
{
  "status": "ok",
  "sip": {
    "drachtio": true,
    "stun": true,
    "turn": true,
    "activeCalls": 0,
    "portsAvailable": 10001
  },
  "routing": {
    "sipEnabled": true,
    "provider": "sip"
  }
}
```

## Enforcement Rules

### ✅ Golden Rules:
1. **SIP ONLY** when `USE_SIP_CALLING=true`
2. **No Fallback** to Telnyx/WebRTC/other providers
3. **Pre-flight Check** before every call
4. **Unified Interface** for all call types
5. **Consistent Configuration** across all environments

### ❌ Violations Prevented:
- Direct Telnyx API calls
- WebRTC calls bypassing SIP
- Mixed provider usage
- Non-SIP Gemini Live calls
- Untracked call attempts

## Monitoring

### Call Routing Metrics:
```typescript
// Get stats from unified router
const stats = await getCallRoutingStats();
// {
//   totalCalls: 150,
//   sipCalls: 150,
//   legacyCalls: 0,
//   failedCalls: 2,
//   activeCallsByType: {
//     gemini_live_ai: 5,
//     campaign_auto: 10,
//     agent_console: 2
//   }
// }
```

## Deployment Checklist

### Before Production:
- [ ] `USE_SIP_CALLING=true` in `.env.sip`
- [ ] `PUBLIC_IP` configured correctly
- [ ] Drachtio server running
- [ ] Coturn (STUN/TURN) configured
- [ ] Firewall rules applied (5060, 10000-20000/UDP)
- [ ] Unified router initialized on startup
- [ ] Pre-flight checks passing
- [ ] Test calls working
- [ ] Campaign calls routed through SIP
- [ ] Agent console calls routed through SIP
- [ ] Monitoring and alerts configured

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│ All Call Initiators                            │
│ (AI, Campaign, Agent Console, Test)            │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Unified Call Router                             │
│ • routeUnifiedCall()                            │
│ • Enforces SIP when enabled                     │
│ • Pre-flight validation                         │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ SIP Infrastructure                              │
│ ├─ Gemini Live SIP Gateway                      │
│ ├─ Gemini Live SIP Provider                     │
│ ├─ Drachtio SIP Server                          │
│ └─ Coturn (STUN/TURN)                           │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
            ┌──────┴──────┐
            │             │
            ▼             ▼
      SIP Signaling   RTP Media
      (5060/UDP)      (10K-20K/UDP)
```

## Benefits

### ✅ Consistency:
- All calls use the same infrastructure
- Identical audio quality and timing
- Unified monitoring and logging

### ✅ Simplicity:
- Single configuration point
- One routing decision
- Easy to test and debug

### ✅ Scalability:
- Dedicated SIP server
- Port pool management (10,001 concurrent calls)
- Cloud-native deployment

### ✅ Reliability:
- No fallback confusion
- Clear error messages
- Automatic reconnection

## Support

**Documentation:**
- [GEMINI_LIVE_SIP_INTEGRATION.md](./GEMINI_LIVE_SIP_INTEGRATION.md)
- [SIP_DEPLOYMENT_GUIDE.md](./SIP_DEPLOYMENT_GUIDE.md)

**Status:** ✅ All call types route through SIP  
**Modified:** January 27, 2026
