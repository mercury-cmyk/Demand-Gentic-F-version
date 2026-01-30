# Enabling Gemini Live Calls

## ✅ Current Status
Gemini Live calling is **fully implemented and ready to use**. The system has:
- ✅ Gemini Live API integration (`gemini-live-dialer.ts`)
- ✅ SIP server integration (Drachtio)
- ✅ Audio transcoding (G.711 ↔ PCM 16kHz)
- ✅ WebSocket bidirectional streaming
- ✅ Vertex AI configuration

## 🎯 Quick Enable Checklist

### 1. **Environment Variables** ✅ Already Configured
The following are already set in `.env`:
```bash
# Gemini API Configuration
GEMINI_API_KEY="AIzaSyDUR_YL9JpSeuOroMhC1kFh7dK9g9gOubA"
GEMINI_LIVE_MODEL="gemini-live-2.5-flash-native-audio"

# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT="pivotalb2b-2026"
GCP_PROJECT_ID="pivotalb2b-2026"
USE_VERTEX_AI="true"
VERTEX_AI_LOCATION="us-central1"

# Voice Provider (Gemini is enforced as default)
VOICE_PROVIDER="openai"  # ← Can be switched to "google" but Gemini Live is system default

# Telnyx Configuration (required for SIP)
TELNYX_API_KEY="KEY019BAF87FBC50E72BA2631B8EFEEE182_hXPCwJyx4zFUeNxXG3bCSn"
TELNYX_FROM_NUMBER="+12094571966"
TELNYX_CALL_CONTROL_APP_ID="2853482451592807572"
```

### 2. **Start the Server**
```bash
npm run dev
```

### 3. **Check Server Startup Logs**
Look for these initialization lines:
```
[Gemini Live Dialer] Initialized successfully
[WebSocket Upgrade] Gemini Live WebSocket handler registered
[STARTUP] Audio configuration initialized
[STARTUP] SIP server initialization starting
```

### 4. **Verify Gemini Live is Ready**
Check the health endpoint:
```bash
curl -X GET http://localhost:8080/api/health
```

Should include Gemini Live status:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "services": {
    "geminiLive": {
      "ready": true,
      "model": "gemini-live-2.5-flash-native-audio",
      "provider": "Vertex AI"
    }
  }
}
```

---

## 🚀 Making Your First Gemini Live Call

### Option A: Via Browser Campaign Runner (Preferred)

1. **Create a Campaign** with AI Agent mode enabled:
   - Campaign → AI Settings → Enable "AI Agent Mode"
   - Set AI persona/prompt
   - Set "Use Gemini Live" = true

2. **Add Contacts** to the campaign queue

3. **Connect a Browser Runner**:
   - Open browser console
   - Connect to `/campaign-runner/ws`
   - Register as a runner
   - Request tasks

4. **Calls automatically initiate** via Gemini Live

### Option B: Via Server SIP Calling (Fallback)

1. **Ensure SIP Server is Ready**:
   ```bash
   # Check Drachtio connection
   curl -X GET http://localhost:8080/api/debug/sip-status
   ```

2. **Initiate Call via API**:
   ```bash
   POST /api/ai-calls/initiate
   {
     "campaignId": "campaign_123",
     "queueItemId": "queue_item_456",
     "contactId": "contact_789"
   }
   ```

3. **System automatically uses Gemini Live** SIP transport

### Option C: Via Test Endpoint

```bash
POST /api/test-gemini-live
{
  "toNumber": "+14155552671",        # Test contact number
  "fromNumber": "+12094571966",      # Your caller ID
  "systemPrompt": "You are a friendly sales agent. Introduce yourself and ask how they're doing.",
  "voiceName": "Juniper",            # Optional voice
  "campaignId": "test-campaign-123",
  "contactId": "test-contact-456"
}
```

---

## 🔧 Configuration Details

### Gemini Live Provider Selection

The system uses an **enforced provider resolution** model:

**Location:** `server/services/voice-providers/provider-resolver.ts`

```typescript
/**
 * ENFORCED PROVIDER: Google Gemini Live
 * This is the ONLY voice provider. OpenAI Realtime is completely disabled.
 */
const ENFORCED_PROVIDER: VoiceProviderType = 'google';

/**
 * Fallback is PERMANENTLY DISABLED
 * All calls must use Gemini Live - no exceptions
 */
const FALLBACK_ENABLED = false;
```

This means:
- ✅ ALL voice calls use Gemini Live
- ✅ No fallback to OpenAI
- ✅ No fallback to Telnyx API
- ✅ Consistent behavior across all call types

### Audio Configuration

**Gemini Live Audio Format:**
- **Input:** PCM 16kHz, 16-bit
- **Output:** PCM 24kHz, 16-bit (natural prosody)
- **Transcoding:** G.711 (from Telnyx SIP) → PCM 16kHz → Gemini Live

**Supported Gemini Voices:**
```
Juniper, Ember, Lyra, Orion, Bamboo, Jade, Pumice
```

**Location:** `server/services/voice-providers/gemini-types.ts`

### SIP Configuration

**Drachtio SIP Server Integration:**
- **WebSocket Path:** `/gemini-live-dialer`
- **Port:** 9022 (drachtio agent)
- **Protocol:** WebSocket → Telnyx → Gemini Live

**Location:** `server/services/gemini-live-sip-gateway.ts`

---

## 📊 Monitoring Gemini Live Calls

### View Active Calls

```bash
GET /api/debug/gemini-live-calls
```

Response:
```json
{
  "activeCalls": [
    {
      "callId": "uuid-123",
      "sipCallId": "sip-456",
      "toNumber": "+14155552671",
      "status": "connected",
      "startTime": "2026-01-29T10:30:00Z",
      "duration": "00:01:23"
    }
  ],
  "totalActive": 1
}
```

### Check Gemini Live Dialer Status

```bash
GET /api/debug/gemini-live-status
```

Response:
```json
{
  "ready": true,
  "websocketConnected": true,
  "model": "gemini-live-2.5-flash-native-audio",
  "provider": "Vertex AI",
  "location": "us-central1",
  "activeSessions": 1,
  "uptime": "2h 15m"
}
```

### View Call Logs

**Location:** `server/services/gemini-live-dialer.ts`

Logs include:
```
[Gemini Live] 📞 Incoming call from: +14155552671
[Gemini Live] ✓ Gemini setup complete
[Gemini Live] 🎙️ Contact is speaking...
[Gemini Live] 🤖 AI response: "Thank you for calling..."
[Gemini Live] 👋 Hanging up call. Reason: contact_requested_transfer
```

---

## 🔍 Troubleshooting

### Issue: "Gemini Live not ready"

**Check 1:** Environment variables
```bash
echo $GEMINI_API_KEY
echo $GOOGLE_CLOUD_PROJECT
echo $TELNYX_API_KEY
```

**Check 2:** Server startup logs
```bash
npm run dev 2>&1 | grep -i "gemini\|error\|failed"
```

**Check 3:** Restart server
```bash
pkill -f "npm run dev"
npm run dev
```

### Issue: "Cannot establish SIP connection"

**Check 1:** Drachtio is running
```bash
curl -X GET http://localhost:8080/api/debug/sip-status
```

**Check 2:** Telnyx API is accessible
```bash
curl -X GET https://api.telnyx.com/v2/calls \
  -H "Authorization: Bearer $TELNYX_API_KEY"
```

**Check 3:** Firewall/NAT issues
- Verify port 9022 (Drachtio) is accessible
- Check if Telnyx can reach your server (check webhook URL)

### Issue: "Audio not flowing"

**Check 1:** Audio configuration
```bash
curl -X GET http://localhost:8080/api/debug/audio-config
```

**Check 2:** RTP bridge status
```bash
curl -X GET http://localhost:8080/api/debug/rtp-bridge-status
```

**Check 3:** Check audio logs
```bash
grep -i "audio\|transcod\|rtp" server.log
```

### Issue: "Call disconnects after 30 seconds"

**Common causes:**
1. AMD (Answering Machine Detection) timeout
2. Audio quality issues
3. Gemini API connection drop
4. Telnyx SIP session timeout

**Fix:**
```bash
# Check AMD settings in campaign config
# Increase audio buffer thresholds
# Check Gemini keepalive settings
```

---

## 🎯 Advanced: Forcing Gemini Live for Specific Calls

### Campaign-Level Override

In campaign AI settings:
```json
{
  "voiceProvider": "google",
  "useGeminiLive": true,
  "enforceGemini": true,
  "fallbackProvider": null
}
```

### Queue Item Override

```sql
UPDATE campaign_queue 
SET meta = jsonb_set(
  meta, 
  '{voiceProvider}', 
  '"google"'::jsonb
)
WHERE id = 'queue_item_123';
```

### Call-Time Override

```typescript
// In ai-calls.ts route
const aiSettings = {
  ...campaign.aiAgentSettings,
  voiceProvider: 'google',  // Force Gemini
  useGeminiLive: true,
  enforceGemini: true,
};
```

---

## 🚨 Critical Features Enabled

### 1. **Native Audio Output**
- Gemini Live 2.5 Flash provides native audio (not synthesized)
- Natural prosody and emotion in voice
- 24kHz sampling for high fidelity

### 2. **Function Calling**
Gemini Live can call these functions during calls:
```typescript
// From system prompt, Gemini can trigger:
- submit_disposition()      // Classify call outcome
- transfer_to_human()       // Transfer to live agent
- schedule_callback()       // Schedule follow-up
- end_call()               // Terminate call
```

### 3. **Answering Machine Detection (AMD)**
- Automatic detection of voicemail
- Waits 3-5 seconds for answer before speaking
- Prevents leaving voicemail messages

### 4. **Call Recording**
- All calls recorded to GCS
- Transcripts saved to database
- Available in lead details

### 5. **Disposition Classification**
Automatically classifies outcomes:
```
qualified | not_qualified | voicemail | callback_requested | transfer_requested | error
```

---

## 📈 Performance Metrics

Once Gemini Live calls are running, monitor:

```bash
# Active calls
SELECT COUNT(*) FROM dialer_call_attempts WHERE status = 'active';

# Call success rate
SELECT 
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  ROUND(100.0 * COUNT(CASE WHEN status = 'completed' THEN 1 END) / COUNT(*), 2) as success_rate
FROM dialer_call_attempts;

# Average call duration
SELECT 
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) / 60 as avg_duration_minutes,
  MIN(EXTRACT(EPOCH FROM (updated_at - created_at))) / 60 as min_duration_minutes,
  MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) / 60 as max_duration_minutes
FROM dialer_call_attempts
WHERE status = 'completed';

# Disposition breakdown
SELECT disposition, COUNT(*) as count
FROM dialer_call_attempts
GROUP BY disposition
ORDER BY count DESC;
```

---

## ✅ Verification Checklist

- [ ] Environment variables set (GEMINI_API_KEY, GOOGLE_CLOUD_PROJECT)
- [ ] Server started successfully
- [ ] Gemini Live WebSocket handler registered
- [ ] SIP server initialized (Drachtio)
- [ ] Health check endpoint responds with Gemini Live status
- [ ] Test call completes successfully
- [ ] Call recording saved to GCS
- [ ] Disposition classified correctly
- [ ] Database updated with call attempt
- [ ] Logs show proper audio transcoding
- [ ] Monitoring dashboard shows active call

---

## 📞 Support & Debugging

### Enable Debug Logging
```typescript
// In gemini-live-dialer.ts, set:
const DEBUG_MODE = true;  // Enables verbose logging
const LOG_AUDIO_FRAMES = true;  // Log every audio frame
const LOG_GEMINI_MESSAGES = true;  // Log all Gemini messages
```

### Get Diagnostic Report
```bash
curl -X GET http://localhost:8080/api/debug/gemini-live-diagnostic
```

### Check Recent Errors
```bash
curl -X GET http://localhost:8080/api/debug/gemini-live-errors?limit=10
```

---

## 🎓 Architecture Overview

```
User Initiates Call
        ↓
    Campaign Queue
        ↓
Gemini Live SIP Gateway
        ↓
    Drachtio SIP Server
        ↓
    Telnyx Platform
        ↓
    PSTN / Called Number
        ↓
    Gemini Live API (WebSocket)
        ↓
    RTP Audio Bridge
        ↓
    Natural Conversation
        ↓
    Disposition Classification
        ↓
    Save to Database
```

---

*Last Updated: January 29, 2026*
*Gemini Live Status: ✅ Fully Implemented & Ready*
