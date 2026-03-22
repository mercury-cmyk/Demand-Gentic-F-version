# Voice Agent Training Pipeline - Usage Guide

## How to Use the Training Pipeline in Your Application

---

## 1. Utterance Classification (Real-time)

Classify prospect responses as they come in during calls.

### Basic Usage

```typescript
import { classifyUtterance } from "../services/utterance-classifier";

const transcript = "Speaking.";
const result = await classifyUtterance(transcript);

console.log(result.labels);        // { entry: "RIGHT_PARTY", identity: "CONFIRMED_RIGHT_PARTY" }
console.log(result.action.type);   // "STATE_ADVANCE_RIGHT_PARTY_INTRO"
console.log(result.confidence);    // 0.95
console.log(result.reasoning);     // "Short affirmative detected: 'Speaking.'"
```

### Advanced Usage with Context

```typescript
const result = await classifyUtterance("Not available right now", {
  previousAction: SystemAction.REQUEST_TRANSFER_TO_CONTACT,
  gatekeeperAttempts: 1,
  unclearAttempts: 0,
  isFirstResponse: false,
});

// Result: GATEKEEPER_BLOCKED_SOFT
// Suggested action: ASK_FOR_BEST_EXTENSION_OR_TIME
```

### Use Cases

**In Telnyx Bridge:**
```typescript
// When receiving transcript from speech recognition
const classification = await classifyUtterance(transcript);
if (classification.action.type === SystemAction.STATE_ADVANCE_RIGHT_PARTY_INTRO) {
  session.state = "RIGHT_PARTY_INTRO";
  // Agent proceeds to acknowledgment + question
}
```

**In OpenAI Realtime:**
```typescript
// When checking for voicemail (NOW WITH CLARITY CHECK)
const classification = await classifyUtterance(transcript);
if (classification.labels.entry === CallEntryLabel.VOICEMAIL_PERSONAL) {
  // Guaranteed: audio quality already checked
  await endCall(session.callId, 'voicemail');
}
```

---

## 2. Preflight Validation (Before Call)

Block incomplete calls before they waste resources.

### Basic Usage

```typescript
import { validatePreflight, generatePreflightErrorResponse } from "../services/preflight-validator";

const preflightData = {
  agent: { name: "John Agent" },
  org: { name: "Your Company" },
  contact: {
    full_name: "Jane Prospect",
    first_name: "Jane",
    job_title: "VP Sales",
    email: "jane@company.com",
  },
  account: { name: "Prospect Inc" },
  system: {
    caller_id: "1234567890",
    called_number: "5551234567",
    time_utc: new Date().toISOString(),
  },
  callContext: { followUpEnabled: true },
};

const validation = validatePreflight(preflightData);

if (!validation.isValid) {
  const error = generatePreflightErrorResponse(validation);
  // Returns: { statusCode: 400, body: { ... missingVariables: [...] } }
}
```

### In Express Route

```typescript
router.post("/api/ai/calls/initiate", async (req, res) => {
  const { campaignId, contactId } = req.body;
  
  // Build preflight data from request
  const preflightData = {
    agent: { name: campaign.aiAgentSettings.agentName },
    org: { name: org.name },
    contact: {
      full_name: contact.full_name,
      first_name: contact.firstName,
      job_title: contact.jobTitle,
      email: contact.email,
    },
    account: { name: account.name },
    system: {
      caller_id: campaign.aiAgentSettings.callerId,
      called_number: contact.phone,
      time_utc: new Date().toISOString(),
    },
    callContext: { followUpEnabled: campaign.aiAgentSettings.followUpEnabled },
  };

  // Validate
  const validation = validatePreflight(preflightData);
  if (!validation.isValid) {
    return res.status(400).json(generatePreflightErrorResponse(validation).body);
  }

  // Proceed with call
  // ... rest of call initiation logic
});
```

### Get Required Variables Dynamically

```typescript
import { getRequiredVariables } from "../services/preflight-validator";

const required = getRequiredVariables(true); // with followUp enabled
console.log(required);
// [
//   "agent.name",
//   "org.name", 
//   "contact.full_name",
//   "contact.first_name",
//   "contact.job_title",
//   "account.name",
//   "system.caller_id",
//   "system.called_number",
//   "system.time_utc",
//   "contact.email"
// ]
```

---

## 3. Learning Loop (After Call)

Record outcomes and extract learnings for future improvements.

### Record Call Outcome

```typescript
import { recordCallOutcome, generateCoachingMessage } from "../services/learning-loop";

await recordCallOutcome({
  callId: "call_abc123",
  campaignId: "camp_xyz",
  contactId: "cont_123",
  outcome: "RIGHT_PARTY_ENGAGED",
  signals: {
    engagement_level: "high",
    sentiment: "positive",
    time_pressure: "none",
    clarity: "clear",
    right_party_confirmed: true,
    response_time_ms: 2100,
  },
  timestamp: new Date(),
  agentName: "AI Agent v2",
  agentVersion: "v2.1.0",
});

// System automatically analyzes signals and stores adjustments
// For success: will reinforce short_intro, patient_silence, clear_communication
```

### Outcomes You Can Record

```typescript
type CallOutcome =
  | "RIGHT_PARTY_ENGAGED"
  | "RIGHT_PARTY_TIME_CONSTRAINED"
  | "GATEKEEPER_BLOCKED_SOFT"
  | "GATEKEEPER_BLOCKED_HARD"
  | "VOICEMAIL_DROPPED"
  | "WRONG_NUMBER"
  | "UNCLEAR_AUDIO"
  | "HARD_REFUSAL";
```

### Signals to Extract

```typescript
interface CallOutcomeSignals {
  // Engagement & sentiment
  engagement_level?: "high" | "medium" | "low";
  sentiment?: "positive" | "neutral" | "negative";
  interest_level?: "high_interest" | "maybe" | "not_interested";

  // Time & pacing
  time_pressure?: "explicit" | "implied" | "none";
  duration_seconds?: number;
  response_time_ms?: number;

  // Response quality
  clarity?: "clear" | "ambiguous" | "garbled";

  // Outcome confirmation
  right_party_confirmed?: boolean;
  gatekeeper_blocked?: "soft" | "hard" | false;
  voicemail_detected?: boolean;
  wrong_number?: boolean;

  // Objection/resistance
  objection_type?: "clarity" | "deflection" | "time" | "none";
  objection_intensity?: "soft" | "medium" | "hard";
  discomfort_level?: number; // 0-10
  pushback_intensity?: "none" | "mild" | "moderate" | "strong";
}
```

### Generate Coaching Messages

```typescript
import { generateCoachingMessage } from "../services/learning-loop";

// After RIGHT_PARTY_ENGAGED
const coaching = generateCoachingMessage("RIGHT_PARTY_ENGAGED", {
  engagement_level: "high",
  sentiment: "positive",
  clarity: "clear",
});

console.log(coaching);
// Output:
// "✓ Right party engaged successfully!
//  → Behaviors that worked: high_engagement_achieved, positive_sentiment, clear_communication
//  → Reinforce these in next similar calls."
```

### Get Historical Learnings for Contact

```typescript
import { getLearningRecommendations } from "../services/learning-loop";

const recommendations = await getLearningRecommendations(contactId);
// Returns:
// {
//   previousOutcomes: ["RIGHT_PARTY_ENGAGED", "GATEKEEPER_BLOCKED_SOFT"],
//   recommendedAdjustments: ["shorter_intro", "delay_asks"],
//   suppressionStatus: false
// }
```

---

## 4. System Prompt Auto-Injection

Training rules are automatically injected into all agent prompts.

### How It Works

```typescript
// In your agent initialization
const systemPrompt = await buildAgentSystemPrompt("Your custom opening...");

// systemPrompt now contains:
// 1. Your custom opening
// 2. Organization intelligence
// 3. Campaign learnings
// 4. Compliance policy
// 5. Platform policies
// 6. Agent voice defaults
// 7. B2B calling methodology
// 8. ✨ TRAINING RULES & TAXONOMY (automatically injected)
```

### What Training Rules Include

The injected section includes:

```
## Canonical Voice Agent Training Rules

### Hard Constraints (MUST OBEY)
- Never call without required variables
- Gatekeeper-first opening
- Identity confirmation rules
- Audio quality BEFORE disposition
- Voicemail handling
- IVR navigation
- Time pressure acknowledgment

### Learning-Based Adjustments
- On Success: reinforce short_intro, pacing, question_type
- On Failure: shorten, delay, exit (never increase pressure)

### Preflight Requirements
- 10 required variables must exist
```

### No Action Needed

Agent automatically receives training rules - no manual configuration required.

---

## 5. Practical Integration Example

### Full Call Flow with Training Pipeline

```typescript
import { Router } from "express";
import { validatePreflight, generatePreflightErrorResponse } from "../services/preflight-validator";
import { classifyUtterance } from "../services/utterance-classifier";
import { recordCallOutcome, generateCoachingMessage } from "../services/learning-loop";

const router = Router();

// ============================================================================
// CALL INITIATION (with preflight validation)
// ============================================================================
router.post("/api/calls/initiate", async (req, res) => {
  const { campaignId, contactId } = req.body;
  
  // 1. PREFLIGHT VALIDATION
  const preflightData = buildPreflightData(campaign, contact, account);
  const validation = validatePreflight(preflightData);
  
  if (!validation.isValid) {
    return res.status(400).json(
      generatePreflightErrorResponse(validation).body
    );
  }

  // 2. BUILD AGENT PROMPT (with training rules auto-injected)
  const systemPrompt = await buildAgentSystemPrompt(basePrompt);
  // systemPrompt now includes training taxonomy + hard constraints

  // 3. INITIATE CALL
  const callSession = await initiateCall(contact.phone, systemPrompt);
  
  res.json({ callId: callSession.id });
});

// ============================================================================
// LIVE CALL TRANSCRIPT PROCESSING (real-time classification)
// ============================================================================
router.post("/api/calls/:callId/transcript", async (req, res) => {
  const { transcript, speakerId } = req.body;
  
  if (speakerId === "prospect") {
    // CLASSIFY PROSPECT RESPONSE
    const classification = await classifyUtterance(transcript, {
      previousAction: callSession.lastAction,
      gatekeeperAttempts: callSession.gatekeeperAttempts,
      unclearAttempts: callSession.unclearAttempts,
    });

    // EXECUTE RECOMMENDED ACTION
    if (classification.action.type === "STATE_ADVANCE_RIGHT_PARTY_INTRO") {
      callSession.state = "RIGHT_PARTY_INTRO";
      callSession.lastAction = classification.action.type;
    }

    res.json({
      classification: classification.labels,
      action: classification.action,
      confidence: classification.confidence,
    });
  }
});

// ============================================================================
// CALL COMPLETION (outcome recording + learning)
// ============================================================================
router.post("/api/calls/:callId/complete", async (req, res) => {
  const { outcome, signals } = req.body;
  
  // RECORD OUTCOME
  await recordCallOutcome({
    callId: req.params.callId,
    campaignId: callSession.campaignId,
    contactId: callSession.contactId,
    outcome,
    signals,
    timestamp: new Date(),
    agentName: callSession.agentName,
  });

  // GENERATE COACHING
  const coaching = generateCoachingMessage(outcome, signals);
  
  // STORE COACHING FOR AGENT TRAINING
  await storeCoachingMessage(req.params.callId, coaching);

  res.json({
    outcome,
    coaching,
    message: "Call outcome recorded and learning extracted",
  });
});

export default router;
```

---

## 6. Common Patterns

### Pattern 1: Check for Unclear Audio Early

```typescript
const classification = await classifyUtterance(transcript);

if (classification.labels.entry === CallEntryLabel.UNKNOWN &&
    classification.labels.identity === RightPartyConfirmationLabel.AMBIGUOUS_IDENTITY) {
  // Unclear audio - ask for repetition
  agentSays("Sorry, I didn't catch that—could you say it again?");
  unclearAttempts++;
  
  if (unclearAttempts > 2) {
    // Exit gracefully after max attempts
    await endCall("Could not establish connection clarity");
  }
}
```

### Pattern 2: Right-Party Confirmation Without Deadlock

```typescript
const classification = await classifyUtterance(transcript);

if (classification.labels.identity === RightPartyConfirmationLabel.CONFIRMED_RIGHT_PARTY) {
  // Immediately advance to right-party intro
  // No "Am I speaking with...?" follow-up needed
  callSession.state = "RIGHT_PARTY_INTRO";
  return;
}
```

### Pattern 3: Gatekeeper Soft Block Handling

```typescript
const classification = await classifyUtterance(transcript);

if (classification.labels.gatekeeper_outcome === GatekeeperOutcomeLabel.GATEKEEPER_BLOCKED_SOFT) {
  // Record soft block
  await recordCallOutcome({
    callId: session.id,
    outcome: "GATEKEEPER_BLOCKED_SOFT",
    signals: { gatekeeper_blocked: "soft", response_time_ms: elapsed },
    timestamp: new Date(),
  });

  // Ask for best time/extension
  agentSays("What's the best time to reach them?");
  
  // Exit after getting info
}
```

### Pattern 4: Time Pressure Response

```typescript
import { checkForTimePressure } from "../services/utterance-classifier";

const timeLimit = checkForTimePressure(transcript);
if (timeLimit) {
  // Prospect has X seconds
  callSession.timeLimitSeconds = timeLimit;
  
  // Compress flow: ack time, skip permission, one question only
  agentSays("I know you're busy—quick question...");
  skipPermissionRequest = true;
  maxQuestions = 1;
}
```

---

## 7. Testing Your Integration

### Unit Test: Utterance Classification

```typescript
import { classifyUtterance } from "../services/utterance-classifier";

describe("Utterance Classifier", () => {
  it("should classify garbled audio as unclear, not voicemail", async () => {
    const result = await classifyUtterance("how how could you answer");
    expect(result.labels.entry).toBe("UNKNOWN");
    expect(result.action.type).toBe("ASK_CLARIFY_IDENTITY");
  });

  it("should classify short affirmative as right-party confirmed", async () => {
    const result = await classifyUtterance("Yes.");
    expect(result.labels.identity).toBe("CONFIRMED_RIGHT_PARTY");
    expect(result.action.type).toBe("STATE_ADVANCE_RIGHT_PARTY_INTRO");
  });
});
```

### Unit Test: Preflight Validation

```typescript
import { validatePreflight } from "../services/preflight-validator";

describe("Preflight Validator", () => {
  it("should block call with missing email when followUp enabled", () => {
    const data = {
      // ... all fields except email
      callContext: { followUpEnabled: true },
    };
    const result = validatePreflight(data);
    expect(result.isValid).toBe(false);
    expect(result.missingFields).toContain("contact.email");
  });

  it("should pass with all required fields", () => {
    const data = {
      agent: { name: "Agent" },
      org: { name: "Org" },
      contact: {
        full_name: "John",
        first_name: "John",
        job_title: "VP",
        email: "john@company.com",
      },
      account: { name: "Acme" },
      system: {
        caller_id: "1234567890",
        called_number: "5551234567",
        time_utc: new Date().toISOString(),
      },
    };
    const result = validatePreflight(data);
    expect(result.isValid).toBe(true);
  });
});
```

---

## 8. Troubleshooting

### Issue: Garbled audio still triggers voicemail logic

**Solution:** Verify `checkForUnclearAudio` runs BEFORE `checkForVoicemail` in classifier

```typescript
// ✅ Correct order (in utterance-classifier.ts)
const unclearResult = checkForUnclearAudio(transcript);
if (unclearResult) return unclearResult;

const voicemailResult = checkForVoicemail(transcript);
if (voicemailResult) return voicemailResult;
```

### Issue: Short affirmatives not advancing state

**Solution:** Verify affirmative patterns list is complete

```typescript
const affirmatives = [
  "yes", "yeah", "yep", "speaking", "that's me", "this is me", 
  "uh-huh", "mmhmm", "affirmative", "correct", "right", ...
];
```

### Issue: Preflight not blocking bad calls

**Solution:** Verify validator is called in `/initiate` route BEFORE call setup

```typescript
// In server/routes/ai-calls.ts, line 140+
const validation = validatePreflight(preflightData);
if (!validation.isValid) {
  return res.status(400).json(generatePreflightErrorResponse(validation).body);
}
// Only proceed if validation passed
```

### Issue: Training rules not in agent prompt

**Solution:** Verify buildAgentSystemPrompt imports and uses TRAINING_RULES_FOR_PROMPT

```typescript
// In org-intelligence-helper.ts
import { TRAINING_RULES_FOR_PROMPT } from "../training/taxonomy";

export async function buildAgentSystemPrompt(basePrompt: string) {
  const promptParts = [ basePrompt, ... ];
  promptParts.push(TRAINING_RULES_FOR_PROMPT); // Must be added
  return promptParts.join('\n');
}
```

---

## ✅ Quick Checklist

- [ ] Utterance classifier imported and tested
- [ ] Preflight validator wired into /initiate endpoint
- [ ] buildAgentSystemPrompt includes training rules injection
- [ ] Learning loop recording outcomes after calls
- [ ] Coaching messages being generated and logged
- [ ] Garbled audio test case passing (not triggering voicemail)
- [ ] Short affirmative test case passing (advancing state)
- [ ] Missing variables test case passing (blocking call)
- [ ] Training data JSONL file created and referenced
- [ ] Integration tests running and passing

---

## Need Help?

Refer to these files for implementation details:
- **Classifier:** `server/services/utterance-classifier.ts`
- **Validator:** `server/services/preflight-validator.ts`
- **Learning Loop:** `server/services/learning-loop.ts`
- **Taxonomy:** `server/training/taxonomy.ts`
- **Full Documentation:** `TRAINING_PIPELINE_INTEGRATION.md`
- **Integration Tests:** `integration-test.ts`