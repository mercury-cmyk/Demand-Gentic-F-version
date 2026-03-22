/**
 * Utterance Classifier Service
 * Real-time classification of prospect responses into training labels
 * Returns: label + recommended next action
 */

import {
  CallEntryLabel,
  RightPartyConfirmationLabel,
  GatekeeperOutcomeLabel,
  SystemAction,
  TrainingLabel,
  TrainingAction,
  VOICEMAIL_DETECTION_RULES,
  OBJECTION_PATTERNS,
} from "../training/taxonomy";

const LOG_PREFIX = "[UtteranceClassifier]";

export interface ClassificationResult {
  labels: TrainingLabel;
  action: TrainingAction;
  confidence: number;
  reasoning: string;
}

/**
 * Classify an utterance into training labels
 * Used to route agent behavior and track learning
 */
export async function classifyUtterance(
  transcript: string,
  context?: {
    previousAction?: SystemAction;
    gatekeeperAttempts?: number;
    unclearAttempts?: number;
    isFirstResponse?: boolean;
  }
): Promise {
  if (!transcript || !transcript.trim()) {
    return {
      labels: { entry: CallEntryLabel.UNKNOWN },
      action: { type: SystemAction.ASK_CLARIFY_IDENTITY },
      confidence: 0.5,
      reasoning: "Empty transcript",
    };
  }

  const lower = transcript.trim().toLowerCase();

  // ========================================================================
  // TIER 1: CHECK FOR UNCLEAR/GARBLED AUDIO FIRST
  // ========================================================================
  const unclearResult = checkForUnclearAudio(transcript);
  if (unclearResult) {
    return unclearResult;
  }

  // ========================================================================
  // TIER 2: IVR & VOICEMAIL DETECTION
  // ========================================================================

  // Check for voicemail
  const voicemailResult = checkForVoicemail(transcript);
  if (voicemailResult) {
    return voicemailResult;
  }

  // Check for IVR prompts
  const ivrResult = checkForIVR(transcript);
  if (ivrResult) {
    return ivrResult;
  }

  // ========================================================================
  // TIER 3: RIGHT-PARTY CONFIRMATION PATTERNS
  // ========================================================================

  // Short affirmatives = RIGHT_PARTY confirmed
  if (isShortAffirmative(lower)) {
    return {
      labels: {
        entry: CallEntryLabel.RIGHT_PARTY,
        identity: RightPartyConfirmationLabel.CONFIRMED_RIGHT_PARTY,
      },
      action: { type: SystemAction.STATE_ADVANCE_RIGHT_PARTY_INTRO },
      confidence: 0.95,
      reasoning: `Short affirmative detected: "${transcript}"`,
    };
  }

  // Wrong number
  if (isWrongNumber(lower)) {
    return {
      labels: { entry: CallEntryLabel.WRONG_NUMBER },
      action: { type: SystemAction.END_CALL_POLITE, next: "SUPPRESS_CONTACT" },
      confidence: 0.9,
      reasoning: "Wrong number statement detected",
    };
  }

  // ========================================================================
  // TIER 4: GATEKEEPER & RECEPTIONIST PATTERNS
  // ========================================================================

  // Receptionist/switchboard greeting
  if (isReceptionistGreeting(lower)) {
    return {
      labels: { entry: CallEntryLabel.RECEPTIONIST_SWITCHBOARD },
      action: { type: SystemAction.STATE_ENTER_GATEKEEPER_MODE, next: "REQUEST_TRANSFER_TO_CONTACT" },
      confidence: 0.9,
      reasoning: "Receptionist greeting detected",
    };
  }

  // Gatekeeper objections
  const gatekeeperResult = checkGatekeeperObjection(transcript, context?.gatekeeperAttempts);
  if (gatekeeperResult) {
    return gatekeeperResult;
  }

  // ========================================================================
  // TIER 5: AMBIGUOUS / UNKNOWN
  // ========================================================================
  return {
    labels: { entry: CallEntryLabel.UNKNOWN, identity: RightPartyConfirmationLabel.AMBIGUOUS_IDENTITY },
    action: { type: SystemAction.ASK_CLARIFY_IDENTITY },
    confidence: 0.5,
    reasoning: `Ambiguous response: "${transcript}"`,
  };
}

/**
 * Check for unclear/garbled audio patterns FIRST
 * These should not trigger voicemail or disposition logic
 */
function checkForUnclearAudio(transcript: string): ClassificationResult | null {
  const patterns = VOICEMAIL_DETECTION_RULES.unclearAudioPatterns;
  const lower = transcript.trim().toLowerCase();

  const isUnclear = patterns.some((pattern) => pattern.test(lower));

  if (isUnclear) {
    return {
      labels: {
        entry: CallEntryLabel.UNKNOWN,
        identity: RightPartyConfirmationLabel.AMBIGUOUS_IDENTITY,
      },
      action: { type: SystemAction.ASK_CLARIFY_IDENTITY },
      confidence: 0.95,
      reasoning: `Unclear/garbled audio detected: "${transcript}" (repeated words or incomprehensible)`,
    };
  }

  return null;
}

/**
 * Check for voicemail detection (ONLY after audio quality check passes)
 */
function checkForVoicemail(transcript: string): ClassificationResult | null {
  const lower = transcript.trim().toLowerCase();

  // Check for mailbox full
  const isMailboxFull = VOICEMAIL_DETECTION_RULES.mailboxFullPhrases.some((phrase) =>
    lower.includes(phrase)
  );
  if (isMailboxFull) {
    return {
      labels: { entry: CallEntryLabel.VOICEMAIL_GENERIC },
      action: {
        type: SystemAction.STATE_ENTER_VOICEMAIL_MODE,
        next: "END_CALL_POLITE",
        note: "mailbox_full",
      },
      confidence: 0.95,
      reasoning: "Mailbox full detected",
    };
  }

  // Check for AI call screening (Google Call Assist, etc.) - NOW ALLOWED
  // We want the Agent to actually RESPOND to the screener using the new prompt logic
  /*
  const isAiCallScreening = VOICEMAIL_DETECTION_RULES.aiCallScreeningPhrases?.some((phrase) =>
    lower.includes(phrase)
  );
  if (isAiCallScreening) {
    return {
      labels: { entry: CallEntryLabel.VOICEMAIL_GENERIC },
      action: {
        type: SystemAction.STATE_ENTER_VOICEMAIL_MODE,
        next: "END_CALL_POLITE",
        note: "ai_call_screening",
      },
      confidence: 0.95,
      reasoning: `AI call screening detected: "${transcript}"`,
    };
  }
  */

  // Check for personal voicemail greeting
  const isVoicemailPhrase = VOICEMAIL_DETECTION_RULES.voicemailPhrases.some((phrase) =>
    lower.includes(phrase)
  );
  if (isVoicemailPhrase) {
    return {
      labels: { entry: CallEntryLabel.VOICEMAIL_PERSONAL },
      action: { type: SystemAction.STATE_ENTER_VOICEMAIL_MODE },
      confidence: 0.9,
      reasoning: `Voicemail phrase detected: "${transcript}"`,
    };
  }

  return null;
}

/**
 * Check for IVR menu prompts
 */
function checkForIVR(transcript: string): ClassificationResult | null {
  const lower = transcript.trim().toLowerCase();

  const ivrKeywords = [
    "press",
    "dial",
    "directory",
    "extension",
    "listen carefully",
    "for sales",
    "for support",
    "for operator",
  ];

  const hasIVRKeyword = ivrKeywords.some((kw) => lower.includes(kw));

  if (hasIVRKeyword) {
    return {
      labels: { entry: CallEntryLabel.IVR_MENU },
      action: { type: SystemAction.STATE_ENTER_IVR_MODE },
      confidence: 0.85,
      reasoning: `IVR prompt detected: "${transcript}"`,
    };
  }

  return null;
}

/**
 * Check if response is a short affirmative
 * Patterns: "yes", "speaking", "that's me", "this is me", "yeah"
 */
function isShortAffirmative(lower: string): boolean {
  const affirmatives = [
    "yes",
    "yeah",
    "yep",
    "yup",
    "speaking",
    "that's me",
    "this is me",
    "that is me",
    "this is him",
    "this is her",
    "it's me",
    "uh-huh",
    "mmhmm",
    "absolutely",
    "correct",
    "right",
    "affirmative",
    "go ahead",
  ];

  // Exact match or as the only word (with possible punctuation)
  const trimmed = lower.replace(/[.,!?]+$/, "").trim();
  return affirmatives.includes(trimmed) || affirmatives.some((aff) => trimmed === aff);
}

/**
 * Check for wrong number indicators
 */
function isWrongNumber(lower: string): boolean {
  const wrongNumberPhrases = [
    "wrong number",
    "this is the wrong number",
    "you have the wrong number",
    "no one here by that name",
    "that person doesn't work here",
    "no such person",
    "no such extension",
  ];

  return wrongNumberPhrases.some((phrase) => lower.includes(phrase));
}

/**
 * Check if utterance is a receptionist/switchboard greeting
 */
function isReceptionistGreeting(lower: string): boolean {
  const greetingPatterns = [
    /good (morning|afternoon|evening)/,
    /this is.*how may i (help|direct)/,
    /how may i (help|direct|assist)/,
    /how can i (help|direct|assist)/,
    /thank you for calling/,
    /(hello|hi),.*corporation/,
    /reception/,
    /switchboard/,
  ];

  return greetingPatterns.some((pattern) => pattern.test(lower));
}

/**
 * Check for gatekeeper objections and hard/soft blocks
 */
function checkGatekeeperObjection(
  transcript: string,
  gatekeeperAttempts: number = 0
): ClassificationResult | null {
  const lower = transcript.trim().toLowerCase();

  // HARD BLOCK: "Remove us", "No sales calls", "Stop calling"
  const hardBlockPhrases = [
    "remove",
    "us from your",
    "don't call",
    "stop calling",
    "no sales",
    "we don't accept",
    "please stop",
    "cease",
    "take us off",
    "do not call",
  ];

  if (hardBlockPhrases.some((phrase) => lower.includes(phrase))) {
    return {
      labels: { entry: CallEntryLabel.GATEKEEPER_HUMAN, gatekeeper_outcome: GatekeeperOutcomeLabel.GATEKEEPER_BLOCKED_HARD },
      action: { type: SystemAction.GATEKEEPER_BLOCKED_HARD, next: "SUPPRESS_CONTACT" },
      confidence: 0.95,
      reasoning: "Hard refusal from gatekeeper",
    };
  }

  // SOFT BLOCK: "Not available", "In a meeting", "Call back", "Try later"
  const softBlockPhrases = [
    "not available",
    "in a meeting",
    "in meetings",
    "call back",
    "try back",
    "try later",
    "tomorrow",
    "next week",
    "next month",
    "busy",
    "on another call",
  ];

  if (softBlockPhrases.some((phrase) => lower.includes(phrase))) {
    return {
      labels: { entry: CallEntryLabel.GATEKEEPER_HUMAN, gatekeeper_outcome: GatekeeperOutcomeLabel.GATEKEEPER_BLOCKED_SOFT },
      action: { type: SystemAction.GATEKEEPER_BLOCKED_SOFT, next: "ASK_FOR_BEST_EXTENSION_OR_TIME" },
      confidence: 0.9,
      reasoning: "Soft block: person not available",
    };
  }

  // CLARITY OBJECTION: "Who is this?", "What's this about?"
  const clarityObjections = [
    "who is this",
    "who's calling",
    "what is this",
    "what's this about",
    "who are you",
    "may i ask",
    "and you are",
    "your name",
  ];

  if (clarityObjections.some((phrase) => lower.includes(phrase))) {
    return {
      labels: { entry: CallEntryLabel.GATEKEEPER_HUMAN, objection: "CLARITY_OBJECTION" },
      action: { type: SystemAction.MINIMAL_IDENTITY_ONLY, next: "REQUEST_TRANSFER_TO_CONTACT" },
      confidence: 0.85,
      reasoning: "Gatekeeper asking for clarification",
    };
  }

  return null;
}

/**
 * Assess if a response is ambiguous and might need follow-up
 */
export function isAmbiguousResponse(transcript: string): boolean {
  const ambiguousPatterns = [
    /^(yeah|yep|sure|okay|ok|alright|fine|fine with me)$/i,
    /^(perhaps|maybe|possibly|i guess)$/i,
    /^(why|how)$/i,
    /^[a-z]$/i, // Single letter
  ];

  const trimmed = transcript.trim();
  return ambiguousPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Check if response indicates time pressure
 */
export function checkForTimePressure(transcript: string): number | null {
  const timePressurePattern =
    /only have\s+(\d+)\s+(second|minute|sec|min)s?|(\d+)\s+(second|minute|sec|min)s?\s+only/i;
  const match = transcript.match(timePressurePattern);

  if (match) {
    const timeValue = match[1] || match[3];
    return parseInt(timeValue, 10);
  }

  return null;
}

/**
 * Detect if response is a deflection/objection
 */
export function checkForDeflection(transcript: string): string | null {
  const lower = transcript.toLowerCase();

  const deflectionPatterns: Record = {
    EMAIL: ["send an email", "email me", "email it", "send me an email"],
    CALL_BACK: ["call back", "call me back", "try back", "reach me at"],
    MAIL: ["send it by mail", "mail it", "postal"],
    MEETING: ["meet in person", "let's meet", "come by"],
  };

  for (const [type, patterns] of Object.entries(deflectionPatterns)) {
    if (patterns.some((p) => lower.includes(p))) {
      return type;
    }
  }

  return null;
}