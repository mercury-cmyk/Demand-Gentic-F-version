/**
 * Voice Agent Training Taxonomy
 * Label definitions, rules, and classification schemas
 * Single source of truth for agent behavior training
 */

// ============================================================================
// A. CALL ENTRY CLASSIFICATION (what answered?)
// ============================================================================
export enum CallEntryLabel {
  IVR_MENU = "IVR_MENU",
  RECEPTIONIST_SWITCHBOARD = "RECEPTIONIST_SWITCHBOARD",
  RIGHT_PARTY = "RIGHT_PARTY",
  GATEKEEPER_HUMAN = "GATEKEEPER_HUMAN",
  VOICEMAIL_PERSONAL = "VOICEMAIL_PERSONAL",
  VOICEMAIL_GENERIC = "VOICEMAIL_GENERIC",
  WRONG_NUMBER = "WRONG_NUMBER",
  UNKNOWN = "UNKNOWN",
}

// ============================================================================
// B. RIGHT-PARTY CONFIRMATION
// ============================================================================
export enum RightPartyConfirmationLabel {
  CONFIRMED_RIGHT_PARTY = "CONFIRMED_RIGHT_PARTY",
  AMBIGUOUS_IDENTITY = "AMBIGUOUS_IDENTITY",
  NOT_RIGHT_PARTY = "NOT_RIGHT_PARTY",
}

// ============================================================================
// C. GATEKEEPER OUTCOME
// ============================================================================
export enum GatekeeperOutcomeLabel {
  GATEKEEPER_CONNECTED = "GATEKEEPER_CONNECTED",
  GATEKEEPER_BLOCKED_SOFT = "GATEKEEPER_BLOCKED_SOFT",
  GATEKEEPER_BLOCKED_HARD = "GATEKEEPER_BLOCKED_HARD",
}

// ============================================================================
// D. VOICEMAIL OUTCOME
// ============================================================================
export enum VoicemailOutcomeLabel {
  LEAVE_VM = "LEAVE_VM",
  NO_VM_DROP = "NO_VM_DROP",
}

// ============================================================================
// E. SYSTEM ACTIONS (what the system should do)
// ============================================================================
export enum SystemAction {
  SEND_DTMF = "SEND_DTMF",
  ASK_CLARIFY_IDENTITY = "ASK_CLARIFY_IDENTITY",
  REQUEST_TRANSFER_TO_CONTACT = "REQUEST_TRANSFER_TO_CONTACT",
  STATE_ADVANCE_RIGHT_PARTY_INTRO = "STATE_ADVANCE_RIGHT_PARTY_INTRO",
  STATE_ENTER_GATEKEEPER_MODE = "STATE_ENTER_GATEKEEPER_MODE",
  GATEKEEPER_BLOCKED_SOFT = "GATEKEEPER_BLOCKED_SOFT",
  GATEKEEPER_BLOCKED_HARD = "GATEKEEPER_BLOCKED_HARD",
  STATE_ENTER_IVR_MODE = "STATE_ENTER_IVR_MODE",
  STATE_ENTER_VOICEMAIL_MODE = "STATE_ENTER_VOICEMAIL_MODE",
  END_CALL_POLITE = "END_CALL_POLITE",
  SUPPRESS_CONTACT = "SUPPRESS_CONTACT",
  ASK_FOR_MISSING_VARIABLES_FORM = "ASK_FOR_MISSING_VARIABLES_FORM",
  RESPOND_NEUTRAL_REASON = "RESPOND_NEUTRAL_REASON",
  MINIMAL_IDENTITY_ONLY = "MINIMAL_IDENTITY_ONLY",
  COMPRESS_FLOW_ONE_QUESTION = "COMPRESS_FLOW_ONE_QUESTION",
  ASK_PERMISSION_AND_CONFIRM_EMAIL = "ASK_PERMISSION_AND_CONFIRM_EMAIL",
  ASK_FOR_BEST_EXTENSION_OR_TIME = "ASK_FOR_BEST_EXTENSION_OR_TIME",
}

// ============================================================================
// HARD RULES & POLICIES
// ============================================================================
export const TRAINING_RULES = {
  // Hard constraints that must not be violated
  hardConstraints: {
    // Never start a call if required variables are missing
    neverCallWithoutVariables: true,
    requiredVariables: [
      "contact.full_name",
      "contact.first_name",
      "contact.job_title",
      "account.name",
      "system.caller_id",
      "system.called_number",
      "system.time_utc",
    ],
    requiredIfFollowupEnabled: ["contact.email"],

    // Opening line for unknown answerer is gatekeeper-first
    gatekeeperFirstOpening:
      "May I speak with {{contact_full_name}}, the {{contact_job_title}} at {{account.name}}?",

    // Rules for identity confirmation
    doNotExplainPurposeUntilIdentityConfirmed: true,
    shortAffirmativesConfirmIdentity: ["yes", "speaking", "that's me", "this is me", "yeah"],
    singleClarificationAttempt:
      "Am I speaking with {{contact_full_name}}?",

    // Gatekeeper constraints
    gatekeeperMaxPoliteAttempts: 2,
    doNotPitchToGatekeeper: true,
    doNotOverExplainToGatekeeper: true,

    // IVR constraints
    onlyPressKeysWhenExplicitlyPrompted: true,
    preferDirectoryOrOperatorPaths: true,

    // Voicemail constraints
    maxVoicemailLength: 18, // seconds
    followGlobalVoicemailPolicy: true,

    // Unclear audio handling
    maxUnclearAudioAttempts: 2,
    thenAskToClarify: "Sorry, I didn't catch that—could you say it again?",
    afterMaxAttempts: "Sorry, I think I may have reached the wrong extension...",
  },

  // Learning-based adjustments
  learningRules: {
    onSuccess: {
      action: "REINFORCE_BEHAVIORS",
      behaviors: [
        "short_intro",
        "pacing",
        "question_type",
        "silence_patience",
        "time_acknowledgment",
      ],
      storeSignals: ["engagement_level", "time_pressure", "sentiment", "consent"],
    },
    onFailure: {
      action: "ADJUST_STRATEGY",
      strategy: [
        "SHORTEN_NEXT_ATTEMPT",
        "DELAY_ASKS",
        "EXIT_EARLIER",
        "NEVER_INCREASE_PRESSURE",
      ],
      storeSignals: ["failure_reason", "gatekeeper_type", "objection", "sentiment"],
    },
    learningStorageLocation: "call_learning_records",
  },
};

// ============================================================================
// RIGHT-PARTY INTRO FLOW (after confirmation)
// ============================================================================
export const RIGHT_PARTY_INTRO_FLOW = {
  step1: "ACKNOWLEDGE_TIME_CONSTRAINT",
  step2: "CLARIFY_NOT_SALES_CALL",
  step3: "ASK_ONE_REFLECTIVE_QUESTION",
  maxDuration: 60, // seconds
  mustIncludePermissionReason: true,
};

// ============================================================================
// GATEKEEPER RESPONSE STRATEGIES
// ============================================================================
export const GATEKEEPER_STRATEGIES = {
  neutralReasonNoPitch:
    "It's about a brief business question for {{contact_first_name}} — could you connect me through?",
  maxAttempts: 2,
  softBlockResponse: "What's the best extension or the best time to reach them?",
  hardBlockAction: "SUPPRESS_CONTACT",
};

// ============================================================================
// VOICEMAIL DETECTION RULES (Updated with clarity check)
// ============================================================================
export const VOICEMAIL_DETECTION_RULES = {
  // Patterns that indicate unclear/garbled audio (check FIRST)
  unclearAudioPatterns: [
    /^(how|what|why|who|where|when)\s+(how|what|why|who|where|when)/i, // Repeated words
    /^[a-z]\s+[a-z](\s+[a-z])?$/i, // Just single letters
    /^\s*$/, // Empty or whitespace only
    /^[^a-z]*$/i, // No words/only special chars
  ],

  // Only after audio quality passes, check for voicemail phrases
  voicemailPhrases: [
    "leave a message",
    "leave your message",
    "after the beep",
    "after the tone",
    "not available",
    "cannot take your call",
    "please leave",
    "record your message",
    "voicemail",
    "answering machine",
  ],

  // Mailbox full signals
  mailboxFullPhrases: ["mailbox is full", "cannot accept messages"],

  // Decision tree
  decisionTree: {
    step1: "CHECK_AUDIO_QUALITY",
    ifUnclear: "REQUEST_CLARIFICATION",
    ifClear: "CHECK_VOICEMAIL_PHRASES",
    ifVoicemailPersonal: "ENTER_VOICEMAIL_MODE",
    ifVoicemailGeneric: "HANDLE_GENERIC_VOICEMAIL",
    ifMailboxFull: "MARK_MAILBOX_FULL_END_CALL",
  },
};

// ============================================================================
// COMPRESSION STRATEGIES (for time-constrained prospects)
// ============================================================================
export const COMPRESSION_STRATEGIES = {
  explicitTimeConstrain: "I only have {{N}} seconds", // regex pattern
  action: "COMPRESS_FLOW_ONE_QUESTION",
  shouldSkip: ["permission_request", "extended_context"],
  shouldAccelerate: ["discovery_question", "listening"],
};

// ============================================================================
// OBJECTION HANDLING PATTERNS
// ============================================================================
export const OBJECTION_PATTERNS = {
  CLARITY_OBJECTION: "Who is this? / What is this about?",
  DEFLECTION: "Send an email / Call back later",
  TIME_PRESSURE: "I only have 30 seconds",
};

// ============================================================================
// TRAINING RULE TEXT (for system prompt injection)
// ============================================================================
export const TRAINING_RULES_FOR_PROMPT = `
## Canonical Voice Agent Training Rules

### Hard Constraints (MUST OBEY)
1. **Never call without required variables**: contact.full_name, contact.first_name, contact.job_title, account.name, system.caller_id, system.called_number, system.time_utc
   - If email follow-up is enabled: also require contact.email
   - If any missing: block call and request via form

2. **Gatekeeper-first opening**: "May I speak with {{contact_full_name}}, the {{contact_job_title}} at {{account.name}}?"
   - Do not explain purpose until identity confirmed
   - Max 2 polite attempts; do not pitch or over-explain

3. **Identity confirmation**:
   - If short affirmative after asking ("yes", "speaking", "that's me"): treat as RIGHT_PARTY confirmed
   - Do not deadlock on short answers
   - If unclear, ask exactly once: "Am I speaking with {{contact_full_name}}?"

4. **Audio quality BEFORE disposition**:
   - If unclear/garbled (repeated words, stuttering, incomprehensible): ask "Sorry, I didn't catch that—could you say it again?"
   - Max 2 unclear attempts; then exit: "Sorry, I think I may have reached the wrong extension..."
   - Only after audio quality check, check for voicemail phrases

5. **Voicemail handling**:
   - If voicemail detected (after audio quality check): follow global policy (drop or no drop)
   - Keep voicemail message ≤18 seconds
   - If mailbox full: mark contact, end call

6. **IVR navigation** (use send_dtmf function):
   - Only press keys when EXPLICITLY prompted by the IVR system
   - Listen carefully to menu options before pressing any keys
   - Prefer directory (dial-by-name) or operator paths:
     - For dial-by-name: spell contact's last name using keypad letters
     - For operator: press 0 or say "operator"
   - Do NOT spam key presses or guess extension numbers
   - Wait for IVR to finish speaking before pressing next digit
   - Common IVR patterns:
     - "Press 1 for..." → send_dtmf("1", "Selecting option 1")
     - "Dial the extension" → send_dtmf("1234", "Dialing extension 1234")
     - "Press 0 for operator" → send_dtmf("0", "Requesting operator")
     - "Press # to confirm" → send_dtmf("#", "Confirming selection")
   - If IVR asks for name/extension you don't know, press 0 for operator

7. **Time pressure acknowledgment**:
   - If prospect says "I only have X seconds": acknowledge immediately
   - Compress to 1 reflective question
   - Skip permission request unless invited

### Learning-Based Adjustments (MUST APPLY)
1. **On Success**: Reinforce behaviors that led to success
   - Short intro, appropriate pacing, relevant question type, patient silence
   - Store: engagement level, time pressure, sentiment, consent

2. **On Failure**: Adjust by shortening, delaying asks, exiting earlier
   - NEVER by increasing pressure
   - Store: failure reason, gatekeeper type, objection, sentiment
   - Use signals to improve future calls with similar patterns

### Required Preflight Checks (MUST VALIDATE)
Before initiating ANY call, verify:
- ✓ agent.name (your name)
- ✓ org.name (your organization)
- ✓ contact.full_name (person being called)
- ✓ contact.first_name (for personalization)
- ✓ contact.job_title (for opener)
- ✓ account.name (company being called)
- ✓ system.caller_id (your phone number)
- ✓ system.called_number (their phone number)
- ✓ system.time_utc (call timestamp)
- ✓ contact.email (if follow-up enabled)

If any missing: return error with ASK_FOR_MISSING_VARIABLES_FORM action
`;

// ============================================================================
// TYPE DEFINITIONS FOR CLASSIFICATION
// ============================================================================
export interface TrainingLabel {
  entry?: CallEntryLabel;
  identity?: RightPartyConfirmationLabel;
  gatekeeper_outcome?: GatekeeperOutcomeLabel;
  voicemail_outcome?: VoicemailOutcomeLabel;
  time_pressure?: string; // "explicit" | "none"
  objection?: string; // Pattern name
}

export interface TrainingAction {
  type: SystemAction;
  next?: string;
  dtmf?: string;
  value?: string;
  policy?: string;
  missing?: string[];
  requires?: string[];
  note?: string;
}

export interface TrainingExample {
  id: string;
  text: string;
  labels: TrainingLabel;
  action: TrainingAction;
}

export interface LearningRecord {
  id: string;
  outcome: string;
  signals: Record<string, string | number | boolean>;
  reinforce?: string[];
  adjust_next_time?: string[];
  suppression?: {
    enabled: boolean;
    cooldown_days: number;
  };
}
