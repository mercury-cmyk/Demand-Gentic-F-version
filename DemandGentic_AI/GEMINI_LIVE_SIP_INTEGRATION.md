# Gemini Live + SIP Server Integration Guide

## Overview

Gemini Live AI calls now **exclusively use the drachtio-srf SIP server** as the transport layer. This ensures:

✅ Dedicated SIP infrastructure for media handling  
✅ No fallback to other providers (Telnyx, WebRTC)  
✅ Guaranteed SIP-based call routing  
✅ Consistent media quality and timing  
✅ Production-grade TURN/NAT traversal  

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Campaign / Voice Dialer                             │
│ (initiates AI calls)                                │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Gemini Live SIP Enforcement                         │
│ • Validates SIP required                            │
│ • Pre-flight checks                                 │
│ • Guards non-SIP attempts                           │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Gemini Live SIP Gateway                             │
│ • Routes through SIP only                           │
│ • Tracks calls                                      │
│ • Rejects non-SIP transports                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌──────────────────┬──────────────────┬───────────────┐
│                  │                  │               │
▼                  ▼                  ▼               ▼
SIP Server    Gemini Live      RTP Media      TURN Server
(Drachtio)    (WebSocket)      (UDP 10K-20K)  (Coturn)
```

---

## Implementation Files

### Core Components

1. **`gemini-live-sip-gateway.ts`** (210 lines)
   - Enforced SIP-only gateway for all Gemini Live calls
   - Prevents fallback to other transports
   - Tracks active calls
   - Health checks

2. **`gemini-live-sip-provider.ts`** (380 lines)
   - Media bridge between SIP (RTP/G.711) and Gemini Live (WebSocket/PCM)
   - Handles audio transcoding
   - Manages RTP packets
   - Controls Gemini WebSocket connection

3. **`gemini-live-sip-enforcement.ts`** (330 lines)
   - Pre-flight validation
   - Middleware for HTTP enforcement
   - Guard functions to prevent non-SIP calls
   - Status monitoring

### Modified Components

- `server/index.ts` - Add initialization call
- `server/services/voice-dialer.ts` - Route through SIP gateway
- `package.json` - Updated with SIP dependencies

---

## Environment Configuration

Required for SIP-only Gemini Live:

```env
# CRITICAL: Enable SIP calling
USE_SIP_CALLING=true

# Auto-initialize on startup
AUTO_INIT_SIP=true

# Drachtio Configuration
DRACHTIO_HOST=localhost  # or your Drachtio server
DRACHTIO_PORT=9022

# SIP Listening
SIP_LISTEN_PORT=5060
SIP_LISTEN_HOST=0.0.0.0

# RTP Media Ports
RTP_PORT_MIN=10000
RTP_PORT_MAX=20000

# Public IP (REQUIRED for SDP)
PUBLIC_IP=

# STUN/TURN (NAT Traversal)
STUN_SERVERS=stun:stun.l.google.com:19302
TURN_SERVERS=[{"urls":["turn:coturn:3478"],"username":"turnuser","credential":"turnpass"}]

# Gemini Configuration
GEMINI_API_KEY=
GEMINI_LIVE_MODEL=models/gemini-2.5-flash-native-audio-preview

# Database & Cache
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

---

## Usage Guide

### 1. Server Initialization

In `server/index.ts`:

```typescript
import { initializeGeminiLiveSIPEnforcement } from './services/gemini-live-sip-enforcement';
import { drachtioServer } from './services/sip/drachtio-server';

// During startup
async function initializeApplication() {
  // Initialize SIP infrastructure
  await drachtioServer.initialize();

  // Initialize Gemini Live SIP enforcement
  const enforced = await initializeGeminiLiveSIPEnforcement();
  if (!enforced) {
    console.error('CRITICAL: Failed to enforce SIP-only for Gemini Live');
    process.exit(1);
  }

  console.log('✓ Gemini Live SIP enforcement active');
}
```

### 2. Initiating a Gemini Live Call

Use the SIP-only gateway:

```typescript
import { createGeminiLiveSIPCallInitiator } from './services/gemini-live-sip-enforcement';

const initiateCall = createGeminiLiveSIPCallInitiator();

const result = await initiateCall({
  toNumber: '+1234567890',
  fromNumber: '+0987654321',
  campaignId: 'campaign-123',
  contactId: 'contact-456',
  queueItemId: 'queue-789',
  systemPrompt: 'You are a helpful sales assistant...',
  voiceName: 'Puck', // Gemini voice
  maxCallDurationSeconds: 600,
});

if (result.success) {
  console.log(`Call initiated: ${result.sipCallId}`);
} else {
  console.error(`Call failed: ${result.error}`);
}
```

### 3. Campaign Integration

In campaign orchestrator:

```typescript
import { preflightGeminiLiveSIPCheck } from './services/gemini-live-sip-enforcement';

async function dispatchGeminiLiveCall(campaign, contact) {
  // Pre-flight SIP check
  const preflight = await preflightGeminiLiveSIPCheck();
  if (!preflight.ready) {
    console.error('SIP not ready:', preflight.issues);
    return;
  }

  // Initiate through SIP gateway only
  const result = await initiateCall({
    toNumber: contact.phone,
    fromNumber: campaign.fromNumber,
    campaignId: campaign.id,
    contactId: contact.id,
    queueItemId: queue.id,
    systemPrompt: campaign.systemPrompt,
  });

  // Track in database
  await saveCallAttempt(result.sipCallId, campaign.id);
}
```

### 4. Middleware Integration

Apply enforcement to HTTP handlers:

```typescript
import { enforceGeminiLiveSIPMiddleware } from './services/gemini-live-sip-enforcement';
import express from 'express';

const app = express();

// Apply middleware
app.use(enforceGeminiLiveSIPMiddleware());

// Handler
app.post('/api/calls/gemini-live', async (req, res) => {
  // Middleware already enforced SIP requirement
  // req.body.useSIPOnly will be true
  
  const result = await initiateGeminiLiveCall(req.body);
  res.json(result);
});
```

---

## API Reference

### `initiateGeminiLiveCall(request: GeminiLiveCallRequest)`

Initiates a Gemini Live call via SIP.

**Parameters:**
```typescript
{
  toNumber: string;           // Destination phone number
  fromNumber: string;         // Caller ID
  campaignId: string;         // Campaign identifier
  contactId: string;          // Contact identifier
  queueItemId: string;        // Queue item identifier
  voiceName?: string;         // Gemini voice (Puck, Charon, etc.)
  systemPrompt: string;       // AI system instructions
  model?: string;             // Gemini model (optional)
  maxCallDurationSeconds?: number;
  enableRecording?: boolean;
  callContext?: Record;
}
```

**Returns:**
```typescript
{
  success: boolean;
  callId?: string;           // Unique call ID
  sipCallId?: string;        // SIP call ID
  status?: 'initiating' | 'ringing' | 'connected';
  error?: string;
  timestamp: Date;
}
```

### `preflightGeminiLiveSIPCheck()`

Validates SIP infrastructure before call initiation.

**Returns:**
```typescript
{
  ready: boolean;
  issues: string[];  // List of problems if not ready
}
```

### `enforceGeminiLiveSIPOnly()`

Guard function - throws error if SIP not enforced.

```typescript
try {
  enforceGeminiLiveSIPOnly();
  // SIP is enforced, safe to proceed
} catch (error) {
  // SIP not properly configured
}
```

---

## Validation & Testing

### 1. Verify SIP Initialization

```bash
curl http://localhost:5000/api/health
```

Response should show:
```json
{
  "status": "ok",
  "sip": {
    "drachtio": true,
    "stun": true,
    "turn": true,
    "activeCalls": 0
  }
}
```

### 2. Test Gemini Live Status

```bash
curl http://localhost:5000/api/gemini-live/status
```

Expected response:
```json
{
  "enforcement": {
    "enabled": true,
    "required": true,
    "status": "ready",
    "issues": []
  },
  "sipServer": {
    "initialized": true,
    "healthy": true,
    "stats": { ... }
  }
}
```

### 3. Validate Enforcement

Test that non-SIP attempts are rejected:

```bash
# This should fail - no SIP available
curl -X POST http://localhost:5000/api/calls/gemini-live \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "telnyx",
    "toNumber": "+1234567890"
  }'
```

---

## Error Handling

### Common Issues

**"Drachtio SIP server not initialized"**
- Solution: Ensure `USE_SIP_CALLING=true` and drachtio daemon is running

**"SIP server unhealthy"**
- Solution: Check drachtio logs, verify port 9022 is open

**"No available RTP ports"**
- Solution: Increase `RTP_PORT_MAX` or check for port leaks

**"TURN server connection failed"**
- Solution: Verify TURN credentials and ports 3478, 5349 are open

### Monitoring Calls

```typescript
import { getGeminiLiveSIPStatus } from './services/gemini-live-sip-enforcement';

// Get current status
const status = await getGeminiLiveSIPStatus();
console.log(status);

// Get SIP stats
const stats = drachtioServer.getStats();
console.log(`Active calls: ${stats.calls.total}`);
console.log(`RTP ports used: ${stats.rtpPorts.used}/${stats.rtpPorts.total}`);
```

---

## Performance Considerations

### Call Limits

| Configuration | Max Concurrent Calls |
|---|---|
| e2-medium | 10-20 |
| e2-standard-4 | 50-100 |
| e2-standard-8 | 200-400 |

### Optimize

1. **Increase RTP ports**: Adjust `RTP_PORT_MAX` (each call uses 2 ports)
2. **Scale machine**: Use larger instance or multiple instances
3. **Enable autoscaling**: GCP can add instances based on load

### Monitoring

```typescript
// Every minute, log capacity
setInterval(() => {
  const stats = drachtioServer.getStats();
  const calls = stats.calls;
  const ports = stats.rtpPorts;
  
  console.log(`Calls: ${calls.total}, Ports: ${ports.percentage}%`);
  
  if (ports.percentage > 80) {
    console.warn('RTP port exhaustion approaching!');
  }
}, 60000);
```

---

## Enforcement Rules

### Golden Rules

1. **SIP ONLY**: Gemini Live calls MUST use SIP transport
2. **No Fallback**: No fallback to Telnyx, WebRTC, or other providers
3. **Pre-flight Check**: Always run pre-flight before initiating calls
4. **Health Monitoring**: Monitor SIP server health continuously
5. **Error Rejection**: Reject any non-SIP Gemini Live call attempts

### Guard Clauses

```typescript
// WRONG - Bypasses SIP enforcement
await initiateCall({
  provider: 'telnyx',
  toNumber: '+1234567890'
});

// CORRECT - Uses SIP gateway only
const result = await initiateGeminiLiveCall({
  toNumber: '+1234567890',
  fromNumber: '+0987654321',
  campaignId: 'camp-123',
  contactId: 'contact-123',
  queueItemId: 'queue-123',
  systemPrompt: 'You are helpful...'
});
```

---

## Debugging

### Enable Debug Logging

```env
LOG_LEVEL=debug
DEBUG=gemini-live*,sip*
```

### Common Debug Checks

```typescript
// 1. Verify SIP server connection
const drachtioHealth = await drachtioServer.healthCheck();
console.log('Drachtio:', drachtioHealth);

// 2. Check SIP stats
const stats = drachtioServer.getStats();
console.log('Stats:', stats);

// 3. Verify TURN connectivity
import { generateFirewallRules } from './services/sip/port-config';
const rules = generateFirewallRules(portConfig);
console.log('Required ports:', rules);

// 4. Test RTP port availability
import { checkPortAvailable } from './services/sip/port-config';
const avail = await checkPortAvailable(10000, 'udp');
console.log('Port 10000 available:', avail);
```

---

## Migration Guide

### From Telnyx-only to SIP-only

1. **Add SIP configuration** to `.env`:
   ```env
   USE_SIP_CALLING=true
   AUTO_INIT_SIP=true
   ```

2. **Update call initiation**:
   ```typescript
   // OLD
   await dialTelnyx(phoneNumber);
   
   // NEW
   await initiateGeminiLiveCall({
     toNumber: phoneNumber,
     ...
   });
   ```

3. **Test thoroughly**:
   - Verify calls connect
   - Check audio quality
   - Monitor SIP ports
   - Test with TURN/STUN

4. **Monitor metrics**:
   - Call success rate
   - Average call duration
   - Error rates
   - Port utilization

---

## Checklist: Before Production

- [ ] `USE_SIP_CALLING=true` set
- [ ] `PUBLIC_IP` configured correctly
- [ ] Drachtio server running and healthy
- [ ] Coturn server configured and running
- [ ] Firewall ports open (5060, 3478, 10000-20000/UDP)
- [ ] STUN/TURN servers accessible
- [ ] Pre-flight checks passing
- [ ] Test calls connecting successfully
- [ ] Audio quality acceptable
- [ ] Monitoring and alerting set up
- [ ] Rollback plan in place

---

## Support

**Documentation:**
- [SIP_DEPLOYMENT_GUIDE.md](./SIP_DEPLOYMENT_GUIDE.md)
- [SIP_QUICK_REFERENCE.md](./SIP_QUICK_REFERENCE.md)

**Resources:**
- Drachtio: https://drachtio.org/
- Gemini Live: https://ai.google.dev/
- RFC 3261 (SIP): https://tools.ietf.org/html/rfc3261

---

**Status**: ✅ SIP-only enforcement ACTIVE  
**Transport**: 🔒 SIP exclusive  
**Fallback**: ❌ None allowed  
**Modified**: January 27, 2026