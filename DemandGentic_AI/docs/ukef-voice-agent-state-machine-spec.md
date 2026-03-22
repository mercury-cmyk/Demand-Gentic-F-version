# UKEF Voice Agent State Machine Spec

## Objective
Enforce fast purpose delivery, real-time voicemail abort, and stable turn-taking under latency.

## States
- `S0_CALL_ANSWERED`
- `S1_CLASSIFY_RESPONDER`
- `S2_IDENTITY_REQUEST`
- `S3_VALUE_PIVOT`
- `S4_ENGAGE_OR_CONSENT`
- `S5_CLOSE`
- `SX_VOICEMAIL_EXIT`
- `SX_TECH_RECOVERY`
- `SX_DATA_QUALITY_FLAG`

## Transition Rules
| From | Trigger | To | Required Action |
|---|---|---|---|
| S0_CALL_ANSWERED | Answer event | S1_CLASSIFY_RESPONDER | Start 3s classifier window. |
| S1_CLASSIFY_RESPONDER | Voicemail cue/beep/automated phrase | SX_VOICEMAIL_EXIT | Abort live script immediately; execute voicemail policy. |
| S1_CLASSIFY_RESPONDER | Human speech detected | S2_IDENTITY_REQUEST | Speak contact request line only. |
| S2_IDENTITY_REQUEST | Correct identity confirmed | S3_VALUE_PIVOT | Start purpose within 700ms. |
| S2_IDENTITY_REQUEST | Name corrected by respondent | S3_VALUE_PIVOT | Acknowledge correction, then purpose. |
| S2_IDENTITY_REQUEST | "Unknown contact" signal | SX_DATA_QUALITY_FLAG | Flag record and close politely. |
| S2_IDENTITY_REQUEST | Audio issue or long silence | SX_TECH_RECOVERY | Use recovery phrase once; restart at S2. |
| S3_VALUE_PIVOT | Purpose delivered | S4_ENGAGE_OR_CONSENT | Ask concise engagement/consent follow-up. |
| S3_VALUE_PIVOT | Prospect asks identity/connectivity question | S3_VALUE_PIVOT | Immediate direct answer, then continue purpose. |
| S4_ENGAGE_OR_CONSENT | Agreement/decline/close cue | S5_CLOSE | Confirm next action and end call. |
| SX_TECH_RECOVERY | Recovery successful | S2_IDENTITY_REQUEST | Retry once only. |
| SX_TECH_RECOVERY | Recovery failed | S5_CLOSE | Close politely and end. |

## Timing SLAs
- Voicemail detection decision: ` {
  enter(S3_VALUE_PIVOT);
  speakWithin(700, "This is {agentName} calling on behalf of UK Export Finance. Quick reason for my call: we are offering a free 'Leading with Finance' white paper.");
});

onDirectQuestion("who is this" | "are you there", () => {
  respondImmediately();
  resumeCurrentState();
});

onUnknownContact(() => {
  enter(SX_DATA_QUALITY_FLAG);
  flagDataQuality();
  closeCall();
});
```

## Runtime Instrumentation
- `state.entered`
- `state.exited`
- `state.transition_reason`
- `timer.identity_to_purpose_ms`
- `timer.vm_detection_ms`
- `timer.max_dead_air_ms`
- `counter.opening_restarts`
- `counter.recovery_attempts`

## Implementation Entry Points
- Provider turn detection and barge-in: `server/services/voice-providers/openai-realtime-provider.ts`
- Gemini live behavior parity: `server/services/voice-providers/gemini-live-provider.ts`
- Voicemail execution path: `server/services/voicemail-policy-executor.ts`
- Call quality and latency KPI ingestion: `server/services/call-quality-tracker.ts`