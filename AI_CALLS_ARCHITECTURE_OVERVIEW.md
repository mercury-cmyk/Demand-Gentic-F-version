# AI Calls Architecture Overview

## Executive Summary
DemandGentic_AI uses a **hybrid calling architecture** where AI calls can be initiated through two primary paths:
1. **Browser-based calling** via WebRTC (Campaign Runner)
2. **Server-side SIP calling** via Drachtio (fallback when browser unavailable)

The system is designed for **browser-first execution** with optional server-side backup calling capability.

---

## 🎯 High-Level Call Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INITIATES CALL                     │
│           (Campaign Runner, Manual Test, or API)             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │    Campaign Runner WebSocket       │
        │   (Browser-based call execution)   │
        └────────────────┬───────────────────┘
                         │
                ┌────────┴────────┐
                │                 │
                ▼                 ▼
        ┌──────────────┐   ┌──────────────┐
        │   Telnyx     │   │   OpenAI     │
        │   WebRTC     │   │   Realtime   │
        │   (Signaling)│   │   (Audio AI) │
        └──────────────┘   └──────────────┘
                │                 │
                └────────┬────────┘
                         ▼
                ┌────────────────────┐
                │  Browser Softphone │
                │  (Audio I/O)       │
                └────────────────────┘
                         │
                         ▼
                ┌────────────────────┐
                │   Contact Phone    │
                │   Number           │
                └────────────────────┘
```

---

## 📱 Architecture Components

### 1. **Campaign Runner WebSocket Service**
**File:** `server/services/campaign-runner-ws.ts`
**Purpose:** Distributes calling tasks to browser clients

**Key Features:**
- Maintains persistent WebSocket connection to browser runners
- Queues campaign items per campaign
- Manages task assignment and distribution
- Tracks runner capacity and heartbeats
- Handles disposition reporting from browser

**Data Flow:**
```
Runner Register
    ↓
Load Campaign Tasks
    ↓
Send Task to Browser
    ↓
Browser Makes Call (WebRTC)
    ↓
Browser Reports Disposition
    ↓
Update Queue & Database
    ↓
Next Task
```

### 2. **Telnyx WebRTC Integration**
**File:** `server/routes/telnyx-webrtc.ts`
**Purpose:** Manages Telnyx SIP credentials and WebRTC signaling

**WebSocket Events:**
- `call:initiated` - Call started
- `call:answered` - Contact answered
- `call:ended` - Call terminated
- `call:failed` - Call failed
- `call:speaking` - Voice activity detection

### 3. **OpenAI Realtime WebRTC**
**File:** `server/routes/openai-webrtc.ts`
**Purpose:** Connects browser to OpenAI Realtime API for AI conversation

**Features:**
- Bidirectional audio streaming
- Real-time speech recognition
- Real-time text generation
- Voice synthesis
- Function calling for dispositions

### 4. **SIP Dialer Service (Server-side Fallback)**
**File:** `server/services/sip/sip-dialer.ts`
**Purpose:** Server-side calling when browser unavailable

**Components:**
- **Drachtio SIP Server** - Call signaling
- **RTP Bridge** - Audio streaming to Gemini
- **Feature Flag:** `USE_SIP_CALLING` environment variable

---

## 🔄 Call Initiation Flows

### Path 1: Browser-Based Campaign Runner (Primary)

```typescript
// 1. BROWSER CONNECTS & REGISTERS
browser -> WebSocket /campaign-runner/ws
  register {
    userId: string,
    username: string,
    campaignIds: string[],
    maxConcurrent: number
  }

// 2. SERVER LOADS CAMPAIGN TASKS
for each campaignId:
  - Query campaign_queue table
  - Filter: status='queued', business_hours_valid=true
  - Sort by: priority, created_at
  - Populate task queue for campaign

// 3. SERVER PUSHES TASK TO BROWSER
server -> browser
  task {
    taskId: uuid,
    campaignId: string,
    queueItemId: string,
    contactId: string,
    contactFirstName: string,
    contactLastName: string,
    phoneNumber: string,
    aiSettings: { persona, objective, handoff },
    fromNumber: string
  }

// 4. BROWSER MAKES WEBRTC CALL
browser:
  a) Get Telnyx credentials via /api/telnyx-webrtc/token
  b) Create Telnyx WebRTC connection
  c) Initiate call to phoneNumber
  d) When answered, connect to OpenAI Realtime API
  e) Stream audio bidirectionally

// 5. BROWSER REPORTS DISPOSITION
browser -> server
  task_completed {
    taskId: string,
    disposition: 'qualified' | 'not_qualified' | 'no_answer' | etc,
    callDurationSeconds: number,
    transcript: Array<{ role, text }>,
    recordingUrl?: string
  }

// 6. SERVER UPDATES DATABASE
  - Mark campaign_queue item with disposition
  - Save transcript to call_transcripts
  - Create lead if qualified
  - Update campaign statistics
```

**Advantages:**
- ✅ Browser handles all signaling & audio
- ✅ No server bandwidth consumption
- ✅ Multiple concurrent calls per browser
- ✅ Better latency (direct peer-to-peer)

### Path 2: Server-Side SIP Calling (Fallback)

```typescript
// 1. ROUTE: POST /api/ai-calls/initiate
{
  campaignId: string,
  queueItemId: string,
  contactId: string
}

// 2. VALIDATION IN ai-calls.ts
  - Get campaign & AI settings
  - Get contact & account info
  - Preflight validation (required variables)
  - Business hours check
  - Extract phone number & system prompt

// 3. CHECK SIP DIALER READINESS
if (USE_SIP_CALLING && isReady()) {
  // Use server-side SIP
} else {
  // Use Telnyx API bridge (REST-based)
}

// 4. INITIATE VIA TELNYX AI BRIDGE
getTelnyxAiBridge().initiateAiCall(
  phoneNumber,
  fromNumber,
  aiSettings,
  context
)

// 5. TELNYX AI BRIDGE FLOW
  a) Make REST call to Telnyx API
  b) Create media connection (WebRTC/RTP)
  c) Connect to Gemini via RTP bridge
  d) Conversation happens
  e) Webhook: POST /texml/call-status -> dispositions

// 6. SYSTEM POLLS FOR COMPLETION
  - Query call status periodically
  - Save disposition & transcript
  - Update queue item
```

**When Used:**
- Campaign runner browser disconnected
- SIP_CALLING=true & Drachtio available
- Manual test call via dashboard
- API-triggered call

---

## 📊 Campaign Task Queue Processing

### Queue Item Lifecycle

```
1. QUEUED
   ↓ (Campaign starts)
2. READY_TO_CALL
   ↓ (Business hours + country enabled)
3. TASK_SENT_TO_BROWSER
   ↓ (Task pushed to campaign runner)
4. IN_PROGRESS
   ↓ (Browser initiated call)
5. COMPLETED / REMOVED
   ↓ (Disposition set)
6. NEXT_ITEM
   (Repeat for remaining queue items)
```

### Business Hours & Country Validation

**Location:** `server/services/campaign-runner-ws.ts` (lines 25-75)

**Enabled Regions:**
- 🇦🇺 Australia
- 🌍 Middle East (UAE, Saudi Arabia, Israel, Qatar, Kuwait, Bahrain, Oman)
- 🇺🇸 🇨🇦 North America (US, Canada)
- 🇬🇧 United Kingdom

**Business Hours Logic:**
```typescript
getContactCallPriority(contact) {
  // 1. Detect contact timezone from: country/state/timezone field
  // 2. Get business hours config for country
  // 3. Check if current time is within business hours
  // 4. Return:
  //    - canCallNow: boolean
  //    - priority: 0-100
  //    - timezone: string
}
```

**Default Business Hours:** 9 AM - 5 PM in contact's local timezone

---

## 🎙️ AI Agent Configuration

### AI Settings Structure

```typescript
{
  persona: {
    name: "Sarah Mitchell",
    companyName: "Company Name",
    systemPrompt: "You are a friendly B2B sales agent...",
    voice: "Juniper" // Gemini voice option
  },
  objective: {
    type: "qualification" | "demo" | "followup",
    qualificationQuestions: ["question1", "question2"],
    meetingLink?: "https://calendly.com/..."
  },
  handoff: {
    enabled: boolean,
    transferNumber?: "+1234567890",
    handoffTriggers: ["talk_to_human", "escalate"]
  },
  callRecording: {
    enabled: boolean
  },
  businessHours: {
    enabled: boolean,
    timezone: "America/New_York",
    operatingDays: "Mon-Fri",
    startTime: "09:00",
    endTime: "17:00",
    respectContactTimezone: true
  }
}
```

### Supported Gemini Voices
- Juniper
- Ember
- Lyra
- Orion
- Bamboo
- Jade
- Pumice

---

## 📞 Call Lifecycle Management

### Call Tracking

**Call Attempt Record:**
```typescript
dialerCallAttempts {
  id: string,
  queueItemId: string,
  campaignId: string,
  contactId: string,
  phoneNumber: string,
  fromNumber: string,
  callStatus: string,
  disposition: CanonicalDisposition,
  callDurationSeconds: number,
  recordingUrl?: string,
  transcript?: JSON,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Supported Dispositions

```typescript
type CanonicalDisposition = 
  | "qualified"           // Contact is a good fit
  | "not_qualified"       // Contact not interested
  | "voicemail"           // Left voicemail
  | "call_back_later"     // Schedule for later
  | "invalid_number"      // Bad phone number
  | "busy"                // Line busy
  | "no_answer"           // No one answered
  | "call_declined"       // Declined the call
  | "transferred"         // Transferred to human
  | "meeting_booked"      // Meeting scheduled
  | "error"               // System error
```

---

## 🔌 WebSocket Message Protocol

### From Server (Outgoing)

```typescript
// Task assignment
{
  type: 'task',
  task: {
    taskId, campaignId, queueItemId, contactId,
    contactFirstName, contactLastName, phoneNumber,
    aiSettings, fromNumber
  }
}

// No tasks available
{
  type: 'no_tasks',
  campaignId: string
}

// Campaign completed
{
  type: 'campaign_complete',
  campaignId: string
}

// Stats update
{
  type: 'stats',
  stats: {
    activeCampaigns: number,
    queuedItems: number,
    activeRunners: number
  }
}

// Error
{
  type: 'error',
  error: string
}

// Heartbeat ack
{
  type: 'heartbeat_ack'
}
```

### From Browser (Incoming)

```typescript
// Register runner
{
  type: 'register',
  userId: string,
  username: string,
  campaignIds: string[],
  maxConcurrent: number
}

// Runner ready for tasks
{
  type: 'ready'
}

// Request next task
{
  type: 'request_task'
}

// Task started
{
  type: 'task_started',
  taskId: string
}

// Task completed
{
  type: 'task_completed',
  taskId: string,
  disposition: string,
  callDurationSeconds: number,
  transcript: Array<{ role, text }>,
  recordingUrl?: string
}

// Task failed
{
  type: 'task_failed',
  taskId: string,
  error: string
}

// Heartbeat
{
  type: 'heartbeat'
}

// Stop campaign
{
  type: 'stop_campaign',
  campaignId: string
}
```

---

## 🔐 Preflight Validation

**Location:** `server/services/preflight-validator.ts`

Validates that all required variables are available BEFORE initiating a call:

```typescript
preflightData = {
  agent: { name },
  org: { name },
  contact: { full_name, first_name, job_title, email },
  account: { name },
  system: { caller_id, called_number, time_utc },
  callContext: { followUpEnabled }
}
```

**Response on missing variables:**
```json
{
  "statusCode": 400,
  "body": {
    "message": "Preflight validation failed",
    "missingVariables": ["contact.job_title", "account.name"],
    "suggestions": [...]
  }
}
```

---

## 🔄 Cooldown & Back-to-Back Prevention

When a call fails, the system applies a **5-minute cooldown** before retry:

```sql
UPDATE campaign_queue
SET status = 'queued',
    next_attempt_at = NOW() + INTERVAL '5 minutes',
    updated_at = NOW()
WHERE id = ?
```

This prevents rapid retry loops from overwhelming the contact or call providers.

---

## 📈 Error Handling

### Recoverable Errors (with retry)
- Network timeouts
- Provider temporary unavailability
- Rate limiting

### Non-Recoverable Errors (removed from queue)
- Invalid phone number format
- Country not whitelisted (stored in: `campaign_queue.removed_reason = 'country_not_whitelisted'`)
- Permanent contact suppression
- Missing required variables

---

## 🚀 Environment Configuration

### Critical Variables

```bash
# Calling Mode
USE_SIP_CALLING=false                    # Server-side SIP calling enabled?

# Telnyx
TELNYX_FROM_NUMBER=+1234567890          # Outbound caller ID
TELNYX_API_KEY=key_xxx                  # Telnyx API auth
TELNYX_CONNECTION_ID=conn_xxx           # SIP connection ID

# Gemini
GOOGLE_GENERATIVE_AI_API_KEY=key_xxx    # Gemini API key
GEMINI_MODEL=gemini-2.0-flash-exp       # Model selection

# Drachtio (SIP Server)
DRACHTIO_SERVER_HOST=localhost
DRACHTIO_SERVER_PORT=9022
DRACHTIO_AGENT_HOST=localhost
DRACHTIO_AGENT_PORT=9023
```

---

## 📊 Key Files Reference

| File | Purpose |
|------|---------|
| `server/services/campaign-runner-ws.ts` | Browser task distribution & WebSocket |
| `server/routes/ai-calls.ts` | API call initiation & preflight validation |
| `server/routes/telnyx-webrtc.ts` | Telnyx WebRTC credential management |
| `server/routes/openai-webrtc.ts` | OpenAI Realtime API integration |
| `server/services/sip/sip-dialer.ts` | Server-side SIP calling (fallback) |
| `server/services/telnyx-ai-bridge.ts` | Telnyx REST API calling (fallback) |
| `server/services/disposition-engine.ts` | Disposition processing & lead creation |
| `client/src/hooks/useCampaignRunner.ts` | Browser campaign runner state management |
| `client/src/hooks/useUnifiedWebRTC.ts` | Unified audio I/O for calls |

---

## 🎯 Call Flow Decision Tree

```
User initiates call
    │
    ├─ Is browser campaign runner connected?
    │   ├─ YES → Push task via WebSocket
    │   │        Browser makes WebRTC call
    │   │        (Preferred path)
    │   │
    │   └─ NO → Check USE_SIP_CALLING
    │           ├─ YES & Drachtio ready → Server SIP call
    │           │                         (Fallback #1)
    │           │
    │           └─ NO → Use Telnyx REST API
    │                   (Fallback #2)
    │
    └─ All paths converge at disposition reporting
       Update database & next task
```

---

## ✅ Health Checks

**Browser Connection Status:**
- Check: WebSocket connection open
- Heartbeat: Every 30 seconds
- Timeout: 60 seconds without heartbeat → mark offline

**SIP Dialer Status:**
- Check: Drachtio connected && canMakeOutboundCalls
- Returns: `{ connected, canMakeOutboundCalls, statsLastUpdated }`

**Campaign Queue Status:**
- Check: Items queued, within business hours, country enabled
- Returns: Count by status, disposition breakdown

---

## 🔍 Debugging Tips

### To see active campaign runners:
```typescript
// server/services/campaign-runner-ws.ts
getCampaignRunnerService()?.getStats()
// Returns: { activeRunners, activeCampaigns, queuedItems }
```

### To see SIP dialer status:
```typescript
// server/services/sip/drachtio-server.ts
drachtioServer.getStats()
// Returns: { connected, canMakeOutboundCalls, lastConnectionError }
```

### To monitor queue processing:
```sql
SELECT status, COUNT(*) as count 
FROM campaign_queue 
GROUP BY status
ORDER BY count DESC;
```

---

## 📝 Notes

1. **Browser-first design:** The system is optimized for browser-based calling to reduce server bandwidth
2. **Fallback chain:** If browser unavailable, system gracefully falls back to server-side options
3. **Business hours enforcement:** Calls respecting contact's local timezone
4. **Whitelist validation:** Only enabled regions can be called
5. **Cooldown protection:** Failed calls get 5-minute cooldown before retry
6. **Preflight validation:** Catches missing variables early, prevents silent failures

---

*Last Updated: January 29, 2026*
