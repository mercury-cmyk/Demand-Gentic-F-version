type VoicemailClassification = "voicemail" | "likely_voicemail" | "not_voicemail";

type PhraseRule = {
  category: string;
  phrase: string;
  weight: number;
};

type RegexRule = {
  category: string;
  pattern: RegExp;
  weight: number;
  highPrecision?: boolean;
};

export interface VoicemailDetectionResult {
  normalizedTranscript: string;
  classification: VoicemailClassification;
  score: number;
  hasHighPrecisionMatch: boolean;
  matchedCategories: string[];
  matchedPhrases: string[];
  matchedPatterns: string[];
  categoryScores: Record;
}

export function normalizeVoicemailTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PHRASE_RULES: PhraseRule[] = [
  ...[
    "after the beep",
    "after the tone",
    "at the beep",
    "at the tone",
    "when you hear the beep",
    "when you hear the tone",
    "please leave a message after the beep",
    "please leave your message after the tone",
    "leave your message at the beep",
    "record your message after the beep",
    "record your message at the tone",
    "start speaking after the beep",
    "start speaking after the tone",
    "begin recording after the beep",
    "begin recording after the tone",
    "the beep will indicate",
    "the tone will indicate",
    "you may begin after the beep",
    "you may begin after the tone",
    "wait for the beep",
    "wait for the tone",
    "message can be left after the beep",
    "message can be left after the tone",
    "please speak after the beep",
    "please speak after the tone",
    "the beep lets you know",
    "the tone lets you know",
    "tone will sound",
    "please leave it after the beep",
    "speak after the beep",
    "после сигнала",
    "после гудка",
    "после звукового сигнала",
    "после тонального сигнала",
    "дождитесь сигнала",
    "оставьте сообщение после сигнала",
    "оставьте сообщение после гудка",
    "запишите сообщение после сигнала",
    "говорите после сигнала",
    "можете оставить сообщение после сигнала",
  ].map((phrase) => ({ category: "beep_instruction", phrase, weight: 3 })),
  ...[
    "you have reached",
    "you ve reached",
    "you have reached the voicemail",
    "you ve reached the voicemail",
    "you have reached the mailbox",
    "you ve reached the mailbox",
    "you have reached the office of",
    "you ve reached the office of",
    "you have reached the desk of",
    "you ve reached the desk of",
    "you have reached the phone of",
    "you ve reached the phone of",
    "reached the voicemail",
    "reached the mailbox",
    "вы позвонили",
    "вы дозвонились до",
    "вас приветствует автоответчик",
    "вас приветствует голосовая почта",
  ].map((phrase) => ({ category: "reached_pattern", phrase, weight: 3 })),
  ...[
    "voicemail",
    "voice mail",
    "mailbox",
    "mailbox is full",
    "voicemail box is full",
    "the mailbox is full",
    "the mailbox has not been set up",
    "mailbox not set up",
    "voicemail not set up",
    "cannot accept messages",
    "not accepting messages",
    "cannot receive messages",
    "not receiving messages",
    "automatic voice message system",
    "your call has been forwarded",
    "call has been forwarded",
    "forwarded to voicemail",
    "has been forwarded to an automatic voice message system",
    "to leave a message",
    "to replay this message",
    "to repeat this message",
    "to send a message",
    "your message will be recorded",
    "your message has been recorded",
    "please enter your password",
    "автоответчик",
    "голосовая почта",
    "ящик голосовой почты",
    "почтовый ящик",
    "ваш звонок переадресован",
    "ваш звонок переведен на автоответчик",
    "абонент временно недоступен",
    "не удалось принять ваш звонок",
  ].map((phrase) => ({ category: "system_message", phrase, weight: 3 })),
  ...[
    "i am not available",
    "i m not available",
    "i am unavailable",
    "i m unavailable",
    "can t take your call",
    "cannot take your call",
    "unable to take your call",
    "not able to answer",
    "not able to take your call",
    "away from the phone",
    "away from my phone",
    "stepped away",
    "stepped out",
    "currently away",
    "not here right now",
    "not in right now",
    "not at my desk",
    "not at the office",
    "out of the office",
    "i m busy right now",
    "i m on another call",
    "i m in a meeting",
    "i m driving right now",
    "i m sleeping",
    "i m traveling",
    "i m out right now",
    "i can t come to the phone",
    "i can t answer the phone",
    "i can t pick up",
    "please call back later",
    "is not available",
    "is unavailable",
    "is temporarily unavailable",
    "is currently unavailable",
    "not reachable at this time",
    "cannot be reached",
    "is not reachable",
    "не могу ответить",
    "не могу сейчас ответить",
    "не могу принять ваш звонок",
    "не могу подойти к телефону",
    "сейчас недоступен",
    "сейчас недоступна",
    "в данный момент недоступен",
    "в данный момент недоступна",
    "абонент недоступен",
  ].map((phrase) => ({ category: "unavailable", phrase, weight: 2 })),
  ...[
    "leave your name",
    "leave your number",
    "leave your phone number",
    "leave your contact information",
    "leave your callback number",
    "leave your best number",
    "leave a detailed message",
    "leave a brief message",
    "leave a short message",
    "leave a message and i ll call you back",
    "leave a message and i will call you back",
    "leave a message and we ll call you back",
    "leave a message and we will call you back",
    "leave a message and i will return your call",
    "leave a message and we will return your call",
    "include your name and number",
    "include your name and phone number",
    "include the reason for your call",
    "please state your name",
    "please state your number",
    "please spell your name",
    "please leave your email",
    "leave your company name",
    "leave your account number",
    "leave your extension",
    "tell me what this is about",
    "let me know what you need",
    "i ll get back to you",
    "we ll get back to you",
    "i will return your call soon",
    "you may leave a message",
    "you can leave a message",
    "please leave a message for",
    "leave a message for the office",
    "leave a message for our team",
    "leave a message for sales",
    "leave a message for support",
    "leave a message for billing",
    "leave a message for accounts",
    "leave a message for customer service",
    "leave me a message",
    "leave me your name",
    "leave me your number",
    "оставьте сообщение",
    "оставьте ваше сообщение",
    "оставьте свой номер",
    "оставьте номер телефона",
    "оставьте ваше имя",
    "оставьте имя и номер",
    "запишите сообщение",
    "сообщение после сигнала",
    "я вам перезвоню",
    "мы вам перезвоним",
    "я перезвоню вам",
    "перезвоню вам",
  ].map((phrase) => ({ category: "leave_info", phrase, weight: 2 })),
  ...[
    "press pound",
    "press the pound key",
    "press star",
    "press the star key",
    "for more options",
    "for additional options",
    "press 1",
    "press 2",
    "press 3",
  ].map((phrase) => ({
    category: phrase.startsWith("press 1") || phrase.startsWith("press 2") || phrase.startsWith("press 3")
      ? "generic_menu_option"
      : "voicemail_controls",
    phrase,
    weight: phrase.startsWith("press 1") || phrase.startsWith("press 2") || phrase.startsWith("press 3") ? 1 : 2,
  })),
  ...[
    "please hold while we transfer your call",
    "transferring to voicemail",
    "transfer to voicemail",
    "i m transferring you to voicemail",
    "connecting you to voicemail",
    "sending you to voicemail",
    "our office is closed",
    "we are closed",
    "outside normal business hours",
    "outside business hours",
    "our hours are",
    "business hours are",
    "open from",
    "closed on weekends",
    "closed for holidays",
    "currently closed",
    "please call during regular hours",
    "we will return your call next business day",
    "we ll return your call on the next business day",
    "thank you and goodbye",
  ].map((phrase) => ({ category: "business_handoff", phrase, weight: 1 })),
  ...[
    "hey it s",
    "hi it s",
    "this is",
    "you can t reach me right now",
    "i m not able to get to the phone",
    "i m not able to answer right now",
    "i m screening my calls",
    "sorry i can t answer",
    "sorry i missed you",
    "sorry i missed your call",
    "i ll call you back",
    "i ll return your call",
    "i ll get back to you soon",
    "i ll get back to you asap",
    "i ll respond when i can",
    "i ll respond as soon as possible",
    "i m away right now",
    "i m tied up right now",
  ].map((phrase) => ({ category: "personal_greeting", phrase, weight: 1 })),
  ...[
    "thanks for calling",
    "thank you for calling",
    "we re not available",
    "we are not available",
    "nobody is available",
    "no one is available",
    "nobody can take your call",
    "no one can take your call",
    "your call is important",
    "your call is very important",
    "we value your call",
    "we appreciate your call",
    "thanks for your call",
    "thank you for your call",
    "sorry we missed your call",
  ].map((phrase) => ({ category: "generic_greeting", phrase, weight: 1 })),
];

const REGEX_RULES: RegexRule[] = [
  {
    category: "beep_instruction",
    pattern: /\b(after|at)\s+the\s+(beep|tone)\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "beep_instruction",
    pattern: /(?:^|\s)после\s+(сигнала|гудка|тона)(?=\s|$|[.,!?])/ui,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "beep_instruction",
    pattern: /\bwhen\s+you\s+hear\s+the\s+(beep|tone)\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "reached_pattern",
    pattern: /\byou(\s+have|'ve)\s+reached\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "system_message",
    pattern: /\b(voice\s*mail|mailbox)\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "system_message",
    pattern: /(?:^|\s)(автоответчик|голосов(?:ая|ой)\s+почт(?:а|ы)|почтов(?:ый|ого)\s+ящик)(?=\s|$|[.,!?])/ui,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "system_message",
    pattern: /\b(call\s+has\s+been\s+forwarded|forwarded\s+to\s+voicemail|automatic\s+voice\s+message\s+system)\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "system_message",
    pattern: /(?:^|\s)(ваш\s+звонок\s+(?:переадресован|переведен)|абонент\s+(?:временно\s+)?недоступен)(?=\s|$|[.,!?])/ui,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "leave_info",
    pattern: /\b(leave|record)\s+(a\s+|your\s+)?message\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "leave_info",
    pattern: /(?:^|\s)(остав(?:ьте|ь)\s+(?:ваше\s+|свое\s+)?сообщение|запиш(?:ите|и)\s+сообщение)(?=\s|$|[.,!?])/ui,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "system_message",
    pattern: /\b(mailbox\s+is\s+full|mailbox\s+not\s+set\s+up|voicemail\s+not\s+set\s+up|cannot\s+accept\s+messages|not\s+accepting\s+messages)\b/i,
    weight: 3,
    highPrecision: true,
  },
  {
    category: "voicemail_controls",
    pattern: /\b(press\s+(pound|#|star|\*)|for\s+(more|additional)\s+options)\b/i,
    weight: 2,
  },
  {
    category: "unavailable",
    pattern: /\b(not\s+available|unavailable|cannot\s+take\s+your\s+call|can t\s+take\s+your\s+call|unable\s+to\s+take\s+your\s+call)\b/i,
    weight: 2,
  },
  {
    category: "unavailable",
    pattern: /(?:^|\s)(не\s+могу\s+(?:ответить|принять\s+ваш\s+звонок)|сейчас\s+недоступ(?:ен|на)|в\s+данный\s+момент\s+недоступ(?:ен|на))(?=\s|$|[.,!?])/ui,
    weight: 2,
  },
  {
    category: "leave_info",
    pattern: /\bleave\s+(your\s+)?(name|number|phone\s+number|contact\s+information|callback\s+number)\b/i,
    weight: 2,
  },
  {
    category: "leave_info",
    pattern: /(?:^|\s)(остав(?:ьте|ь)\s+(?:ваше\s+|свое\s+)?(?:имя|номер|номер\s+телефона)|я\s+вам\s+перезвоню|мы\s+вам\s+перезвоним)(?=\s|$|[.,!?])/ui,
    weight: 2,
  },
  {
    category: "business_handoff",
    pattern: /\b(transferring\s+to\s+voicemail|connecting\s+you\s+to\s+voicemail|sending\s+you\s+to\s+voicemail)\b/i,
    weight: 1,
  },
];

const PRECOMPUTED_PHRASE_RULES = PHRASE_RULES.map((rule) => ({
  ...rule,
  normalizedPhrase: normalizeVoicemailTranscript(rule.phrase),
}));

export function analyzeVoicemailTranscript(transcript: string): VoicemailDetectionResult {
  const normalizedTranscript = normalizeVoicemailTranscript(transcript);
  if (!normalizedTranscript) {
    return {
      normalizedTranscript,
      classification: "not_voicemail",
      score: 0,
      hasHighPrecisionMatch: false,
      matchedCategories: [],
      matchedPhrases: [],
      matchedPatterns: [],
      categoryScores: {},
    };
  }

  const matchedPhraseSet = new Set();
  const matchedPatternSet = new Set();
  const categoryScores = new Map();
  let hasHighPrecisionMatch = false;

  for (const rule of PRECOMPUTED_PHRASE_RULES) {
    if (!rule.normalizedPhrase) continue;
    if (!normalizedTranscript.includes(rule.normalizedPhrase)) continue;

    matchedPhraseSet.add(rule.phrase);
    categoryScores.set(rule.category, Math.max(categoryScores.get(rule.category) || 0, rule.weight));
  }

  for (const rule of REGEX_RULES) {
    if (!rule.pattern.test(transcript)) continue;

    matchedPatternSet.add(rule.pattern.source);
    categoryScores.set(rule.category, Math.max(categoryScores.get(rule.category) || 0, rule.weight));
    if (rule.highPrecision) hasHighPrecisionMatch = true;
  }

  const matchedCategories = Array.from(categoryScores.keys());

  let comboBonus = 0;
  const hasCategory = (category: string) => categoryScores.has(category);

  if (hasCategory("unavailable") && (hasCategory("leave_info") || hasCategory("beep_instruction"))) {
    comboBonus += 2;
  }

  if (hasCategory("reached_pattern") && (hasCategory("beep_instruction") || hasCategory("leave_info") || hasCategory("system_message"))) {
    comboBonus += 2;
  }

  if (hasCategory("personal_greeting") && (hasCategory("leave_info") || hasCategory("beep_instruction"))) {
    comboBonus += 2;
  }

  if (hasCategory("system_message") && hasCategory("voicemail_controls")) {
    comboBonus += 1;
  }

  const score =
    Array.from(categoryScores.values()).reduce((total, weight) => total + weight, 0) +
    comboBonus;
  const hasMediumOrStrongerSignal = Array.from(categoryScores.values()).some((weight) => weight >= 2);

  let classification: VoicemailClassification = "not_voicemail";
  if (hasHighPrecisionMatch || (score >= 4 && hasMediumOrStrongerSignal)) {
    classification = "voicemail";
  } else if (score >= 2 && hasMediumOrStrongerSignal) {
    classification = "likely_voicemail";
  }

  return {
    normalizedTranscript,
    classification,
    score,
    hasHighPrecisionMatch,
    matchedCategories,
    matchedPhrases: Array.from(matchedPhraseSet),
    matchedPatterns: Array.from(matchedPatternSet),
    categoryScores: Object.fromEntries(categoryScores.entries()),
  };
}

export function isVoicemailByTranscriptRules(transcript: string): boolean {
  return analyzeVoicemailTranscript(transcript).classification === "voicemail";
}

export function isLikelyVoicemailByTranscriptRules(transcript: string): boolean {
  const classification = analyzeVoicemailTranscript(transcript).classification;
  return classification === "voicemail" || classification === "likely_voicemail";
}