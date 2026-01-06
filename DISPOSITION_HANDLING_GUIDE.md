# Call Disposition Handling System

## Overview

The platform implements a **unified disposition system** where both Manual agents and AI agents use the same 6 canonical dispositions. Dispositions are standardized, non-customizable, and automatically enforce system actions through a centralized **Disposition Engine**.

---

## Canonical Dispositions

All calls—whether handled by humans or AI—must be assigned one of these 6 dispositions:

| Disposition | Code | Purpose | System Action |
|---|---|---|---|
| **Qualified Lead** | `qualified_lead` | Contact expressed interest, qualifies for sales | Route to QA, create lead, suppress from dialing, enforce leads cap |
| **Not Interested** | `not_interested` | Contact declined or rejected | Remove from this campaign permanently |
| **Do Not Call** | `do_not_call` | Contact requested global opt-out | Add to global DNC, remove from ALL campaigns |
| **Voicemail** | `voicemail` | Reached voicemail system | Schedule retry in 3-7 days, increment attempts |
| **No Answer** | `no_answer` | Call connected but no human response | Schedule retry in 3-7 days, increment attempts |
| **Invalid Data** | `invalid_data` | Wrong number, disconnected, or bad data | Suppress from campaign, mark phone invalid |

---

## Disposition Submission Flow

### Manual Agents (Human Agents)

**Where dispositions are selected:**
- [client/src/pages/agent-console.tsx](client/src/pages/agent-console.tsx#L1802) - Disposition dropdown in wrap-up phase
- Required field when call status is 'wrap-up'
- Agent selects from dropdown menu before ending call

**Submission endpoint:**
```
POST /api/call-attempts/:id/disposition
{
  disposition: 'qualified_lead' | 'not_interested' | 'do_not_call' | 'voicemail' | 'no_answer' | 'invalid_data',
  notes: string (optional)
}
```

**Recording:**
- [server/routes/dialer-runs.ts](server/routes/dialer-runs.ts#L625) - `/call-attempts/:id/disposition` endpoint
- Validates disposition is one of 6 canonical values
- Prevents re-submission (already_submitted check)
- Records who submitted and when:
  - `dispositionSubmittedAt`: timestamp
  - `dispositionSubmittedBy`: user ID
  - `notes`: optional agent notes

**Schema fields in** [shared/schema.ts](shared/schema.ts#L5967):
```typescript
export const dialerCallAttempts = pgTable("dialer_call_attempts", {
  // ...
  disposition: canonicalDispositionEnum("disposition"),          // The selected disposition
  dispositionSubmittedAt: timestamp("disposition_submitted_at"), // When agent submitted
  dispositionSubmittedBy: varchar("disposition_submitted_by"),   // Which agent submitted
  // ...
  dispositionProcessed: boolean("disposition_processed").notNull().default(false),
  dispositionProcessedAt: timestamp("disposition_processed_at"),
  // ...
});
```

---

### AI Agents (Autonomous Voice Agents)

When AI agent using OpenAI Realtime determines call outcome:

**Tool definition** in [server/services/openai-realtime-dialer.ts](server/services/openai-realtime-dialer.ts#L147):
```typescript
{
  name: "submit_disposition",
  description: "Submit the call disposition based on conversation outcome",
  parameters: {
    disposition: {
      enum: ["qualified_lead", "not_interested", "do_not_call", "voicemail", "no_answer", "invalid_data"],
      description: "The disposition code for this call"
    },
    confidence: { type: "number", min: 0, max: 1 },
    reason: { type: "string" }
  }
}
```

**AI Decision Process:**
- AI analyzes conversation in real-time during the call
- Determines call outcome based on prospect responses
- Calls the `submit_disposition` tool with decision
- Includes confidence score (0-1)
- Includes brief reason for disposition

**Recording:**
- Same `dialerCallAttempts` table as manual agents
- `agentType: 'ai'` field indicates AI agent
- `virtualAgentId` references the specific AI agent
- `dispositionSubmittedBy` is marked as 'ai_system'
- [server/services/disposition-engine.ts](server/services/disposition-engine.ts#L60) processes the disposition automatically

**Submission Flow:**
- Tool invocation during call → stored in `call_sessions`
- Triggers unified Disposition Engine processing
- No manual review needed for disposition determination
- Applies same outcomes as manual agents (lead creation, DNC enforcement, etc.)

---

## Disposition Processing (Disposition Engine)

Once a disposition is submitted, the **Disposition Engine** automatically enforces outcomes.

**Entry point:** [server/services/disposition-engine.ts](server/services/disposition-engine.ts#L60) - `processDisposition()`

**Unified processing regardless of agent type:**

### 1. QUALIFIED_LEAD Processing
```typescript
async function processQualifiedLead(callAttempt, rules, result)
```

**Actions:**
- ✅ Update `campaign_queue` status → `'done'`
- ✅ Release all locks on queue item
- ✅ Create **lead record** in `leads` table with:
  - `qaStatus: 'new'` (waiting for QA review)
  - `agentId`: human agent ID (if human agent), or null if AI
  - `dialedNumber`, `recordingUrl`, `callDuration` from call attempt
  - For AI agents: `customFields` includes:
    - `aiAgentCall: true`
    - `aiAgentName`: AI persona name
    - `aiDisposition`: original disposition label
    - `aiCallSessionId`: reference to call session
    - `aiAnalysis`: any AI analysis data
- ✅ Route to QA queue (insert into `qcWorkQueue`)
- ✅ Suppress from further dialing (queue status = done)
- ✅ Enforce campaign leads cap (optional)

**Result:**
- Lead appears in [Leads Portal](client/src/pages/leads.tsx) for review
- Shows AI agent name if call was by AI (via `customFields`)
- QA team member reviews and approves/rejects

### 2. NOT_INTERESTED Processing
```typescript
async function processNotInterested(callAttempt, result)
```

**Actions:**
- ✅ Update `campaign_queue` status → `'removed'`
- ✅ Set `removedReason: 'not_interested'`
- ✅ Release all locks
- ✅ Clear `agentId` and `virtualAgentId`

**Result:**
- Contact removed from this campaign permanently
- Not contacted again for this specific campaign
- Can still be dialed for other campaigns

### 3. DO_NOT_CALL Processing
```typescript
async function processDoNotCall(callAttempt, result)
```

**Actions:**
- ✅ Insert phone into `global_dnc` (global suppression table)
- ✅ Idempotent insert (no duplicates)
- ✅ Update current `campaign_queue` item → `'removed'`
- ✅ Remove from ALL campaign queues for this contact
- ✅ Clear all locks globally
- ✅ Set `removedReason: 'global_dnc'` on all items

**Result:**
- Contact globally opt-out
- Phone number on DNC list
- NEVER called again (any campaign, any agent)
- Compliance enforced

### 4. VOICEMAIL / NO_ANSWER Processing
```typescript
async function processVoicemailOrNoAnswer(callAttempt, rules, result, type)
```

**Actions:**
- ✅ Check attempt count against `maxAttemptsPerContact` (default: 3)
- ✅ If max attempts NOT reached:
  - Update `campaign_queue` status → `'waiting_retry'`
  - Calculate `nextAttemptAt`:
    - Random window: 3-7 days (configurable)
    - Respects business hours if configured
    - Example: if called on Monday 2pm, retry window starts Thursday
  - Increment `attemptNumber`
  - Release locks so it can be picked up by another agent
- ✅ If max attempts reached:
  - Update `campaign_queue` status → `'removed'`
  - Set `removedReason: 'max_attempts_voicemail'`

**Result:**
- Contact automatically recycled back into queue after delay
- Appears in agent queues after `nextAttemptAt` time
- Prevents over-dialing (max 3 attempts)

### 5. INVALID_DATA Processing
```typescript
async function processInvalidData(callAttempt, result)
```

**Actions:**
- ✅ Mark contact phone as invalid in `contacts` table
- ✅ Update `campaign_queue` status → `'removed'`
- ✅ Set `removedReason: 'invalid_data'`
- ✅ Optionally suppress from other campaigns
- ✅ Release all locks

**Result:**
- Phone number flagged as bad/disconnected
- Not dialed again (for this or other campaigns)
- Contact remains in system with flag

---

## Key Differences Between Manual & AI Agents

### Submission Mechanism

| Aspect | Manual Agents | AI Agents |
|---|---|---|
| **Selection** | Manual dropdown in agent console | Automatic from transcript OR AI tool decision |
| **Timing** | At end of call (wrap-up phase) | Real-time during call OR immediately after |
| **Interface** | UI dropdown in agent-console.tsx | Webhook endpoint or tool invocation |
| **Override** | Agent can change before submitting | No override (system-determined) |

### Storage & Attribution

| Aspect | Manual Agents | AI Agents |
|---|---|---|
| **Agent reference** | `humanAgentId` | `virtualAgentId` |
| **Agent Type** | `agentType: 'human'` | `agentType: 'ai'` |
| **Submitted by** | User ID in `dispositionSubmittedBy` | System/AI system in same field |
| **Notes** | Agent-entered notes | AI-generated summary (optional) |
| **Lead metadata** | Lead.agentId = human agent ID | Lead.customFields includes AI metadata |

### Lead Processing

| Aspect | Manual Agents | AI Agents |
|---|---|---|
| **Lead creation** | When disposition = qualified | When disposition = qualified |
| **QA assignment** | Standard QA workflow | Standard QA workflow |
| **Lead display** | Shows human agent name | Shows AI agent name (from customFields) |
| **Transcript** | Optionally recorded | Automatic from call session |
| **Analysis** | Human notes only | AI analysis stored in customFields |

### Quality Assurance

| Aspect | Manual Agents | AI Agents |
|---|---|---|
| **QA review** | All leads reviewed by QA team | All leads reviewed by QA team |
| **Criteria** | Manual review | Automated AI-QA analysis + manual review |
| **Handling** | Approved/rejected/returned | Approved/rejected/returned + AI auto-score |

---

## Disposition Engine Outcomes

All dispositions produce a **DispositionResult**:

```typescript
interface DispositionResult {
  success: boolean;
  actions: string[];           // List of actions taken
  errors: string[];            // Any errors during processing
  leadId?: string;             // If qualified lead created
  nextAttemptAt?: Date;        // If scheduled for retry
  queueState?: CampaignContactState; // New queue state
}
```

**Example for QUALIFIED_LEAD:**
```json
{
  "success": true,
  "actions": [
    "Updated queue item to done",
    "Created lead lead-abc123",
    "Added to QC queue"
  ],
  "errors": [],
  "leadId": "lead-abc123",
  "queueState": "qualified"
}
```

---

## Campaign Rules

The Disposition Engine respects campaign-level rules:

```typescript
interface CampaignRules {
  maxAttemptsPerContact: number;        // Default: 3
  minHoursBetweenAttempts: number;      // Default: 24
  retryWindowDaysMin: number;           // Default: 3
  retryWindowDaysMax: number;           // Default: 7
  leadsCapPerCampaign: number | null;   // Optional
  businessHoursStart: string;           // "09:00"
  businessHoursEnd: string;             // "17:00"
  timezone: string;                     // "America/New_York"
}
```

Rules are:
- Stored in `campaigns.config` JSON field
- Applied per campaign (different campaigns can have different rules)
- Used during voicemail/no_answer retry scheduling
- Enforce leads cap for qualified leads

---

## Governance & Compliance

All disposition actions are logged:

**Governance Action Log** entries include:
- `campaignId`, `contactId`, `callSessionId`
- `triggerRuleId`: which rule triggered
- `actionType`: disposition type
- `producerType`: 'human' or 'ai'
- `actionPayload`: full disposition details
- `result`: 'success' or 'partial'
- `errorMessage`: if any errors
- `executedBy`: user ID or 'system'

**DNC Tracking** is idempotent:
- Phone stored in `global_dnc` with source
- Can be queried for compliance reports
- Multiple dispositions of same phone don't cause errors

---

## API Endpoints

### Submit Disposition (Manual)
```
POST /api/call-attempts/:id/disposition
{
  disposition: string,    // One of 6 canonical values
  notes?: string         // Optional agent notes
}
```

### List Valid Dispositions
```
GET /api/dialer-runs/dispositions/list

Returns:
{
  dispositions: [
    {
      code: 'qualified_lead',
      label: 'Qualified Lead',
      description: '...',
      systemAction: '...'
    },
    // ... 6 total
  ]
}
```

### Mark Call Started
```
PATCH /api/call-attempts/:id/start
{
  callSessionId: string,
  connected: boolean,
  voicemailDetected: boolean
}
```

### Mark Call Ended
```
PATCH /api/call-attempts/:id/end
{
  callEndedAt: ISO string,
  callDurationSeconds: number,
  recordingUrl?: string
}
```

---

## Summary Table

| Phase | Manual Agent | AI Agent (OpenAI Realtime) |
|---|---|---|
| **Call** | Agent calls contact manually | OpenAI Realtime AI calls contact |
| **Disposition Source** | Agent selects dropdown | AI determines during call via tool |
| **Submission** | POST /disposition endpoint | Tool invocation (real-time) |
| **Processing** | Disposition Engine processes | Disposition Engine processes |
| **Outcomes** | Identical to AI agents | Identical to manual agents |
| **Lead Creation** | Creates lead + QA entry | Creates lead + QA entry + AI metadata |

---

## Next Steps / Configuration

To customize dispositions or processing:

1. **Change max attempts:** Update `campaignConfig.maxAttemptsPerContact`
2. **Change retry window:** Update `retryWindowDaysMin/Max` in campaign rules
3. **Add disposition:** Update `canonicalDispositionEnum` in schema (database migration required)
4. **Custom logic:** Extend `disposition-engine.ts` with new disposition handlers
5. **Compliance:** Monitor `governanceActionsLog` for DNC/compliance audits
