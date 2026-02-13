import { generateJSON } from "./vertex-ai/vertex-client";
import { db } from "../db";
import { campaigns } from "@shared/schema";
import { eq } from "drizzle-orm";

export type ConversationInteractionType = "live_call" | "test_call" | "simulation";
export type ConversationQualityStatus = "ok" | "missing_transcript" | "analysis_failed";
export type ConversationIssueSeverity = "low" | "medium" | "high";
export type ConversationRecommendationCategory =
  | "script"
  | "flow"
  | "qualification"
  | "tone"
  | "timing"
  | "compliance"
  | "data"
  | "other";

export interface ConversationQualityIssue {
  type: string;
  severity: ConversationIssueSeverity;
  description: string;
  evidence?: string;
  recommendation?: string;
}

export interface ConversationQualityBreakdown {
  type: string;
  description: string;
  moment?: string;
  recommendation?: string;
}

export interface ConversationQualityPromptUpdate {
  category: "opening" | "flow" | "objection_handling" | "qualification" | "closing" | "tone" | "compliance" | "other";
  change: string;
  rationale: string;
  priority: "low" | "medium" | "high";
}

export interface ConversationQualityRecommendation {
  category: ConversationRecommendationCategory;
  currentBehavior?: string;
  suggestedChange: string;
  expectedImpact: string;
}

export interface ConversationQualityAnalysis {
  status: ConversationQualityStatus;
  overallScore: number;
  summary: string;
  qualityDimensions: {
    engagement: number;
    clarity: number;
    empathy: number;
    objectionHandling: number;
    qualification: number;
    closing: number;
  };
  campaignAlignment: {
    objectiveAdherence: number;
    contextUsage: number;
    talkingPointsCoverage: number;
    missedTalkingPoints: string[];
    notes: string[];
  };
  flowCompliance: {
    score: number;
    missedSteps: string[];
    deviations: string[];
  };
  dispositionReview: {
    assignedDisposition?: string;
    expectedDisposition?: string;
    isAccurate: boolean;
    notes: string[];
  };
  qualificationAssessment: {
    metCriteria: boolean;
    successIndicators: string[];
    missingIndicators: string[];
    deviations: string[];
  };
  breakdowns: ConversationQualityBreakdown[];
  issues: ConversationQualityIssue[];
  performanceGaps: string[];
  recommendations: ConversationQualityRecommendation[];
  promptUpdates: ConversationQualityPromptUpdate[];
  nextBestActions: string[];
  learningSignals: {
    sentiment?: "positive" | "neutral" | "negative";
    engagementLevel?: "high" | "medium" | "low";
    timePressure?: boolean;
    outcome?: string;
  };
  metadata: {
    model: string;
    analyzedAt: string;
    interactionType: ConversationInteractionType;
    analysisStage: "realtime" | "post_call";
    transcriptLength: number;
    truncated: boolean;
  };
}

export interface ConversationQualityInput {
  transcript: string;
  interactionType: ConversationInteractionType;
  analysisStage?: "realtime" | "post_call";
  callDurationSeconds?: number;
  disposition?: string;
  campaignId?: string;
  campaignName?: string;
  campaignObjective?: string;
  agentName?: string;
  contactName?: string;
  accountName?: string;
}

const DEFAULT_DIMENSIONS = {
  engagement: 50,
  clarity: 50,
  empathy: 50,
  objectionHandling: 50,
  qualification: 50,
  closing: 50,
};

const MAX_TRANSCRIPT_CHARS = 12000;

async function resolveCampaignContext(campaignId?: string): Promise<{
  name?: string;
  objective?: string;
  contextBrief?: string;
  talkingPoints?: string[];
  successCriteria?: string;
  qaParameters?: Record<string, unknown>;
  aiAgentSettings?: Record<string, unknown>;
}> {
  if (!campaignId) return {};
  const [campaign] = await db
    .select({
      name: campaigns.name,
      objective: campaigns.campaignObjective,
      contextBrief: campaigns.campaignContextBrief,
      talkingPoints: campaigns.talkingPoints,
      successCriteria: campaigns.successCriteria,
      qaParameters: campaigns.qaParameters,
      aiAgentSettings: campaigns.aiAgentSettings,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  return {
    name: campaign?.name || undefined,
    objective: campaign?.objective || undefined,
    contextBrief: campaign?.contextBrief || undefined,
    talkingPoints: (campaign?.talkingPoints as string[] | null) || undefined,
    successCriteria: campaign?.successCriteria || undefined,
    qaParameters: (campaign?.qaParameters as Record<string, unknown> | null) || undefined,
    aiAgentSettings: (campaign?.aiAgentSettings as Record<string, unknown> | null) || undefined,
  };
}

function clampScore(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function ensureIssues(value: unknown): ConversationQualityIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((issue) => {
      const raw = issue as Partial<ConversationQualityIssue> | null;
      if (!raw || !raw.type || !raw.description) return null;
      const severity = (raw.severity || "medium") as ConversationIssueSeverity;
      return {
        type: String(raw.type),
        severity,
        description: String(raw.description),
        evidence: raw.evidence ? String(raw.evidence) : undefined,
        recommendation: raw.recommendation ? String(raw.recommendation) : undefined,
      };
    })
    .filter(Boolean) as ConversationQualityIssue[];
}

function ensureRecommendations(value: unknown): ConversationQualityRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((rec) => {
      const raw = rec as Partial<ConversationQualityRecommendation> | null;
      if (!raw || !raw.suggestedChange || !raw.expectedImpact) return null;
      const category = (raw.category || "other") as ConversationRecommendationCategory;
      return {
        category,
        currentBehavior: raw.currentBehavior ? String(raw.currentBehavior) : undefined,
        suggestedChange: String(raw.suggestedChange),
        expectedImpact: String(raw.expectedImpact),
      };
    })
    .filter(Boolean) as ConversationQualityRecommendation[];
}

function ensureBreakdowns(value: unknown): ConversationQualityBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<ConversationQualityBreakdown> | null;
      if (!raw || !raw.type || !raw.description) return null;
      return {
        type: String(raw.type),
        description: String(raw.description),
        moment: raw.moment ? String(raw.moment) : undefined,
        recommendation: raw.recommendation ? String(raw.recommendation) : undefined,
      };
    })
    .filter(Boolean) as ConversationQualityBreakdown[];
}

function ensurePromptUpdates(value: unknown): ConversationQualityPromptUpdate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<ConversationQualityPromptUpdate> | null;
      if (!raw || !raw.change || !raw.rationale) return null;
      return {
        category: (raw.category || "other") as ConversationQualityPromptUpdate["category"],
        change: String(raw.change),
        rationale: String(raw.rationale),
        priority: (raw.priority || "medium") as ConversationQualityPromptUpdate["priority"],
      };
    })
    .filter(Boolean) as ConversationQualityPromptUpdate[];
}

type ParsedTranscript = {
  agentLines: string[];
  contactLines: string[];
  allLines: string[];
  hasRoleLabels: boolean;
};

function parseTranscriptRoles(transcript: string): ParsedTranscript {
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const agentLines: string[] = [];
  const contactLines: string[] = [];
  let hasRoleLabels = false;

  for (const line of lines) {
    const agentMatch = line.match(/^(agent|assistant|ai|bot)\s*:\s*(.*)$/i);
    if (agentMatch) {
      agentLines.push(agentMatch[2].trim());
      hasRoleLabels = true;
      continue;
    }
    const contactMatch = line.match(/^(contact|prospect|user|caller|lead)\s*:\s*(.*)$/i);
    if (contactMatch) {
      contactLines.push(contactMatch[2].trim());
      hasRoleLabels = true;
      continue;
    }
  }

  return { agentLines, contactLines, allLines: lines, hasRoleLabels };
}

function normalizeLine(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function containsAny(haystack: string, phrases: string[]): boolean {
  return phrases.some((phrase) => haystack.includes(phrase));
}

function detectRepeatedAgentPhrase(agentLines: string[], transcriptLower: string): string | null {
  const repeatedLiteral = transcriptLower.match(/let me check that/gi);
  if (repeatedLiteral && repeatedLiteral.length >= 2) {
    return "let me check that";
  }

  const seen = new Set<string>();
  for (const line of agentLines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    const wordCount = normalized.split(" ").filter(Boolean).length;
    if (wordCount < 3) continue;
    if (seen.has(normalized)) {
      return line.trim();
    }
    seen.add(normalized);
  }
  return null;
}

function detectTopChallengeIssues(
  input: ConversationQualityInput,
  transcript: string
): ConversationQualityIssue[] {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const transcriptLower = trimmed.toLowerCase();
  const parsed = parseTranscriptRoles(trimmed);
  const agentText = parsed.agentLines.join(" ").toLowerCase();
  const contactText = parsed.contactLines.join(" ").toLowerCase();

  const agentSpoke = parsed.agentLines.length > 0 || transcriptLower.includes("agent:");
  const contactSpoke = parsed.contactLines.length > 0 || transcriptLower.includes("contact:") || transcriptLower.includes("user:");

  const wordCount = countWords(trimmed);
  const duration = input.callDurationSeconds;

  const hasVoicemailIndicators = containsAny(transcriptLower, [
    "voicemail",
    "leave a message",
    "leave your message",
    "after the beep",
    "after the tone",
    "mailbox is full",
    "not available",
    "record your message",
  ]);

  const hasIdentityQuestion = containsAny(transcriptLower, [
    "am i speaking with",
    "may i speak with",
    "is this",
    "speaking with",
  ]);

  const hasIntro = containsAny(transcriptLower, [
    "calling on behalf of",
    "my name is",
    "this is",
    "i'm calling from",
    "i am calling from",
  ]);

  const hasPurpose = containsAny(transcriptLower, [
    "calling to",
    "calling about",
    "reason for the call",
    "i'm calling to",
    "i am calling to",
    "to offer",
    "to share",
    "white paper",
    "free white paper",
    "can i send",
    "send it to your email",
  ]);

  const hasOffer = containsAny(transcriptLower, [
    "white paper",
    "free white paper",
    "offer",
    "send it",
    "send this",
  ]);

  const hasAudioComplaint = containsAny(transcriptLower, [
    "can't hear",
    "cannot hear",
    "bad line",
    "terrible line",
    "breaking up",
    "cutting out",
    "static",
    "crackly",
    "distorted",
    "poor connection",
    "audio is bad",
  ]);

  const bookingObjective = (input.campaignObjective || "").toLowerCase();
  const requiresBooking = /working session|book|schedule|appointment|meeting|demo/.test(bookingObjective);
  const hasBookingLanguage = containsAny(transcriptLower, [
    "schedule",
    "calendar",
    "meeting",
    "book",
    "time works",
    "availability",
    "send a calendar",
    "send an invite",
  ]);

  const issues: ConversationQualityIssue[] = [];
  const issueMap = new Map<string, ConversationQualityIssue>();

  const pushIssue = (issue: ConversationQualityIssue) => {
    const existing = issueMap.get(issue.type);
    if (!existing) {
      issueMap.set(issue.type, issue);
      return;
    }
    const severityRank = { low: 1, medium: 2, high: 3 } as const;
    const chosenSeverity =
      severityRank[issue.severity] > severityRank[existing.severity] ? issue.severity : existing.severity;
    issueMap.set(issue.type, {
      ...existing,
      ...issue,
      severity: chosenSeverity,
      description: existing.description || issue.description,
      recommendation: existing.recommendation || issue.recommendation,
    });
  };

  if (contactSpoke && !agentSpoke && (duration === undefined || duration >= 5)) {
    pushIssue({
      type: "agent_non_response",
      severity: "high",
      description:
        "The agent failed to deliver any speech, leaving the contact hanging. This is a critical failure that prevents any campaign objective from being pursued.",
      recommendation:
        "Review system logs for this call to diagnose root cause (STT failure, audio channel issue, agent crash). Implement a fail-safe greeting that plays if the primary agent response times out. Immediate technical review of the agent deployment, voice settings, and call initiation process.",
    });
  }

  const shortCall = duration !== undefined && duration < 20;
  const minimalConversation = wordCount < 40 || parsed.agentLines.length + parsed.contactLines.length < 2;

  if (!hasVoicemailIndicators && shortCall && minimalConversation && !issueMap.has("agent_non_response")) {
    pushIssue({
      type: "premature_termination",
      severity: "high",
      description:
        "The call ended before any meaningful conversation could occur, preventing campaign execution.",
      recommendation:
        "Review call connection quality and initial audio. Ensure the agent's opening is clear and complete before the contact responds. Review call timing strategies and dialing patterns to improve contact rates. Consider time-of-day optimization for target personas.",
    });
  }

  if (agentSpoke && hasIntro && !hasPurpose && (duration === undefined || duration < 30)) {
    pushIssue({
      type: "flow_execution",
      severity: "high",
      description:
        "The agent's opening was incomplete and ineffective. After the incorrect name confirmation, the agent began the company introduction but was cut off before stating the purpose.",
      recommendation:
        "The agent must complete the full introductory sequence crisply. After identity confirmation (correct or corrected), immediately state the purpose to capture attention: \"This is Laomedeia calling on behalf of UK Export Finance. I'm calling to offer our free 'Leading with Finance' white paper...\" Ensure the agent's opening script executes reliably. The first critical step is a clear, grammatically correct request to speak with the contact (e.g., \"May I speak with [Contact Name]?\"). If an audio issue is detected, use a standard recovery phrase before attempting to restart the opening.",
    });
  }

  if (agentSpoke && hasIdentityQuestion && !hasPurpose && (duration === undefined || duration < 25)) {
    pushIssue({
      type: "failed_engagement",
      severity: "high",
      description:
        "Agent failed to establish a reason for the call or create engagement before the contact ended the interaction.",
      recommendation:
        "Train the agent to pivot more quickly to the core value statement immediately after confirming identity. The gap between \"Hello, is that [Contact]?\" and delivering the purpose was too long, allowing disengagement. Consider list quality or contact pre-qualification.",
    });
  }

  const repeatedPhrase = detectRepeatedAgentPhrase(parsed.agentLines, transcriptLower);
  if (repeatedPhrase && normalizeLine(repeatedPhrase) === "let me check that") {
    pushIssue({
      type: "flow_disruption",
      severity: "high",
      description:
        "Agent repeated \"Let me check that\" twice, creating an unnatural conversational pattern that may have contributed to the contact's AI detection.",
      recommendation:
        "Review system logic to prevent repetitive phrases during verification pauses. Ensure the agent persists through initial objections to deliver at least the core value proposition, even when not speaking to the primary contact.",
    });
  }

  if (hasAudioComplaint) {
    pushIssue({
      type: "technical_quality",
      severity: "high",
      description:
        "Audio transmission quality was insufficient for conversation, causing immediate call failure.",
      recommendation:
        "Review STT/audio pipeline quality and implement quality monitoring to prevent wasted calls. Improve audio latency handling and implement better interruption detection.",
    });
  }

  if (hasVoicemailIndicators && (hasOffer || agentSpoke)) {
    pushIssue({
      type: "flow_deviation",
      severity: "high",
      description:
        "Agent delivered the full opening pitch to an automated voicemail message, wasting time and creating a nonsensical recording.",
      recommendation:
        "Enhance the system's real-time audio analysis to detect voicemail cues within the first 2-3 seconds of a response and abort the conversational script immediately.",
    });
  }

  if (duration !== undefined && duration < 10 && minimalConversation && !hasVoicemailIndicators && !agentSpoke && !contactSpoke) {
    pushIssue({
      type: "technical_failure",
      severity: "high",
      description:
        "Call terminated prematurely due to technical issues, preventing any campaign objectives from being addressed.",
      recommendation:
        "Investigate root cause of technical failure (STT, TTS, or connectivity) and implement preventive measures. Review audio connection protocols and implement faster detection of one-way audio situations.",
    });
  }

  if (requiresBooking && agentSpoke && !hasBookingLanguage) {
    pushIssue({
      type: "campaign_objective_failure",
      severity: "high",
      description:
        "Zero progress was made toward the campaign objective of booking a working session.",
      recommendation:
        "Ensure agent is correctly triggered to begin its script upon call connection. Add a pre-call audio check. Monitor for early disconnects and flag calls that end before the 30-second mark without a clear reason (e.g., gatekeeper refusal).",
    });
  }

  issues.push(...issueMap.values());
  return issues;
}

function mergeIssues(
  primary: ConversationQualityIssue[],
  secondary: ConversationQualityIssue[]
): ConversationQualityIssue[] {
  const severityRank: Record<ConversationIssueSeverity, number> = { low: 1, medium: 2, high: 3 };
  const merged = new Map<string, ConversationQualityIssue>();

  for (const issue of primary) {
    merged.set(issue.type, issue);
  }

  for (const issue of secondary) {
    const existing = merged.get(issue.type);
    if (!existing) {
      merged.set(issue.type, issue);
      continue;
    }
    const severity =
      severityRank[issue.severity] > severityRank[existing.severity] ? issue.severity : existing.severity;
    merged.set(issue.type, {
      ...existing,
      ...issue,
      severity,
      description: existing.description || issue.description,
      recommendation: existing.recommendation || issue.recommendation,
    });
  }

  return Array.from(merged.values());
}

function truncateTranscript(transcript: string): { text: string; truncated: boolean } {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
    return { text: transcript, truncated: false };
  }
  return { text: transcript.slice(0, MAX_TRANSCRIPT_CHARS), truncated: true };
}

export function buildFallbackAnalysis(
  input: ConversationQualityInput,
  status: ConversationQualityStatus,
  reason: string
): ConversationQualityAnalysis {
  const issues: ConversationQualityIssue[] = [
    {
      type: status === "missing_transcript" ? "missing_transcript" : "analysis_failed",
      severity: "high",
      description: reason,
      recommendation: "Ensure transcripts are captured and retry analysis.",
    },
  ];

  return {
    status,
    overallScore: 0,
    summary: "Conversation quality analysis unavailable.",
    qualityDimensions: { ...DEFAULT_DIMENSIONS },
    campaignAlignment: {
      objectiveAdherence: 0,
      contextUsage: 0,
      talkingPointsCoverage: 0,
      missedTalkingPoints: [],
      notes: [],
    },
    flowCompliance: {
      score: 0,
      missedSteps: [],
      deviations: [],
    },
    dispositionReview: {
      assignedDisposition: input.disposition,
      expectedDisposition: undefined,
      isAccurate: false,
      notes: [],
    },
    qualificationAssessment: {
      metCriteria: false,
      successIndicators: [],
      missingIndicators: [],
      deviations: [],
    },
    breakdowns: [],
    issues,
    performanceGaps: ["Transcript unavailable or analysis failed."],
    recommendations: [
      {
        category: "data",
        suggestedChange: "Verify transcription pipeline and retry analysis automatically.",
        expectedImpact: "Restored conversation quality coverage for all interactions.",
      },
    ],
    promptUpdates: [],
    nextBestActions: ["Reprocess transcript when available."],
    learningSignals: {
      outcome: input.disposition,
    },
    metadata: {
      model: FALLBACK_MODEL,
      analyzedAt: new Date().toISOString(),
      interactionType: input.interactionType,
      analysisStage: input.analysisStage || "post_call",
      transcriptLength: input.transcript.length,
      truncated: false,
    },
  };
}

export async function analyzeConversationQuality(
  input: ConversationQualityInput
): Promise<ConversationQualityAnalysis> {
  const trimmed = input.transcript.trim();
  if (!trimmed) {
    return buildFallbackAnalysis(input, "missing_transcript", "Transcript is empty.");
  }

  const { text: transcriptText, truncated } = truncateTranscript(trimmed);
  const campaignContext = await resolveCampaignContext(input.campaignId);

  const contextLines = [
    `Interaction type: ${input.interactionType}`,
    `Analysis stage: ${input.analysisStage || "post_call"}`,
    input.callDurationSeconds !== undefined ? `Call duration: ${input.callDurationSeconds}s` : null,
    input.disposition ? `Disposition: ${input.disposition}` : null,
    (input.campaignName || campaignContext.name)
      ? `Campaign: ${input.campaignName || campaignContext.name}`
      : null,
    (input.campaignObjective || campaignContext.objective)
      ? `Campaign objective: ${input.campaignObjective || campaignContext.objective}`
      : null,
    campaignContext.contextBrief ? `Campaign context: ${campaignContext.contextBrief}` : null,
    campaignContext.successCriteria ? `Success criteria: ${campaignContext.successCriteria}` : null,
    campaignContext.talkingPoints?.length
      ? `Approved talking points: ${campaignContext.talkingPoints.join(" | ")}`
      : null,
    input.agentName ? `Agent: ${input.agentName}` : null,
    input.contactName ? `Contact: ${input.contactName}` : null,
    input.accountName ? `Account: ${input.accountName}` : null,
    truncated ? "Transcript was truncated for analysis." : null,
    campaignContext.qaParameters ? `Qualification criteria: ${JSON.stringify(campaignContext.qaParameters)}` : null,
    campaignContext.aiAgentSettings ? `Call flow scripts: ${JSON.stringify(campaignContext.aiAgentSettings)}` : null,
  ].filter(Boolean);

  const prompt = `You are the Vertex AI real-time conversation quality monitor for B2B campaigns.
You must continuously evaluate adherence to campaign objectives, flow compliance, disposition accuracy, qualification alignment, and breakdowns.

CRITICAL RULES FOR ANALYSIS — DO NOT VIOLATE:
1. NEVER suggest improvements to pronunciation, enunciation, or speech clarity. The agent is an AI voice agent — any perceived pronunciation issues are speech-to-text (STT) transcription errors, NOT actual agent mistakes. Do not penalize or recommend changes for these.
2. NEVER suggest leaving voicemails. This system does NOT leave voicemails. If a call reached voicemail, the agent correctly hung up. Do not recommend "leave a voicemail message" or similar.
3. NEVER flag STT artifacts (misspellings, garbled words, incomplete sentences in the transcript) as agent performance issues. These are transcription artifacts, not things the agent actually said.
4. Focus recommendations ONLY on: conversation strategy, objection handling, qualification flow, pitch effectiveness, closing technique, and campaign alignment.
5. NEVER suggest "bundled openings" or combining the greeting and introduction into one sentence. The agent's opening flow is intentionally two-step by design: (1) first confirm identity by asking for the contact by name, (2) THEN introduce the purpose after confirmation. This is the correct sales methodology — do NOT recommend changing it.
6. The agent says "calling on behalf of [Organization]" — this is intentional. NEVER suggest changing to "calling from [Organization]". The agent represents the organization, it is not an employee of the organization.

Context:
${contextLines.join("\n")}

Transcript:
${transcriptText}

Return JSON with this exact shape and no extra keys:
{
  "overallScore": 0-100,
  "summary": "2-4 sentence summary focused on performance",
  "qualityDimensions": {
    "engagement": 0-100,
    "clarity": 0-100,
    "empathy": 0-100,
    "objectionHandling": 0-100,
    "qualification": 0-100,
    "closing": 0-100
  },
  "campaignAlignment": {
    "objectiveAdherence": 0-100,
    "contextUsage": 0-100,
    "talkingPointsCoverage": 0-100,
    "missedTalkingPoints": ["string"],
    "notes": ["string"]
  },
  "flowCompliance": {
    "score": 0-100,
    "missedSteps": ["string"],
    "deviations": ["string"]
  },
  "dispositionReview": {
    "assignedDisposition": "string",
    "expectedDisposition": "string",
    "isAccurate": true | false,
    "notes": ["string"]
  },
  "qualificationAssessment": {
    "metCriteria": true | false,
    "successIndicators": ["string"],
    "missingIndicators": ["string"],
    "deviations": ["string"]
  },
  "breakdowns": [
    {
      "type": "string",
      "description": "string",
      "moment": "string (optional)",
      "recommendation": "string (optional)"
    }
  ],
  "issues": [
    {
      "type": "string",
      "severity": "low" | "medium" | "high",
      "description": "string",
      "evidence": "string (optional)",
      "recommendation": "string (optional)"
    }
  ],
  "performanceGaps": ["string"],
  "recommendations": [
    {
      "category": "script" | "flow" | "qualification" | "tone" | "timing" | "compliance" | "data" | "other",
      "currentBehavior": "string (optional)",
      "suggestedChange": "string",
      "expectedImpact": "string"
    }
  ],
  "promptUpdates": [
    {
      "category": "opening" | "flow" | "objection_handling" | "qualification" | "closing" | "tone" | "compliance" | "other",
      "change": "string",
      "rationale": "string",
      "priority": "low" | "medium" | "high"
    }
  ],
  "nextBestActions": ["string"],
  "learningSignals": {
    "sentiment": "positive" | "neutral" | "negative",
    "engagementLevel": "high" | "medium" | "low",
    "timePressure": true | false,
    "outcome": "string"
  }
}`;

  try {
    const actualModel = "vertex-ai-gemini";

    // Use Vertex AI Gemini (Google-native) for quality analysis
    let raw: any;
    try {
      raw = await generateJSON(prompt, { temperature: 0.3, maxTokens: 8192 });
    } catch (vertexError: any) {
      console.warn(`[ConversationQuality] Vertex AI analysis failed: ${vertexError.message}`);
      return buildFallbackAnalysis(input, "analysis_failed", `Vertex AI failed: ${vertexError.message}`);
    }
    const qualityDimensions = raw.qualityDimensions || {};
    const campaignAlignment = raw.campaignAlignment || {};
    const flowCompliance = raw.flowCompliance || {};
    const dispositionReview = raw.dispositionReview || {};
    const qualificationAssessment = raw.qualificationAssessment || {};

    const modelIssues = ensureIssues(raw.issues);
    const ruleIssues = input.analysisStage === "realtime" ? [] : detectTopChallengeIssues(input, transcriptText);
    const mergedIssues = mergeIssues(modelIssues, ruleIssues);

    return {
      status: "ok",
      overallScore: clampScore(raw.overallScore, 0),
      summary: typeof raw.summary === "string" ? raw.summary : "Summary unavailable.",
      qualityDimensions: {
        engagement: clampScore(qualityDimensions.engagement, DEFAULT_DIMENSIONS.engagement),
        clarity: clampScore(qualityDimensions.clarity, DEFAULT_DIMENSIONS.clarity),
        empathy: clampScore(qualityDimensions.empathy, DEFAULT_DIMENSIONS.empathy),
        objectionHandling: clampScore(qualityDimensions.objectionHandling, DEFAULT_DIMENSIONS.objectionHandling),
        qualification: clampScore(qualityDimensions.qualification, DEFAULT_DIMENSIONS.qualification),
        closing: clampScore(qualityDimensions.closing, DEFAULT_DIMENSIONS.closing),
      },
      campaignAlignment: {
        objectiveAdherence: clampScore(campaignAlignment.objectiveAdherence, 0),
        contextUsage: clampScore(campaignAlignment.contextUsage, 0),
        talkingPointsCoverage: clampScore(campaignAlignment.talkingPointsCoverage, 0),
        missedTalkingPoints: ensureStringArray(campaignAlignment.missedTalkingPoints),
        notes: ensureStringArray(campaignAlignment.notes),
      },
      flowCompliance: {
        score: clampScore(flowCompliance.score, 0),
        missedSteps: ensureStringArray(flowCompliance.missedSteps),
        deviations: ensureStringArray(flowCompliance.deviations),
      },
      dispositionReview: {
        assignedDisposition: dispositionReview.assignedDisposition || input.disposition,
        expectedDisposition: dispositionReview.expectedDisposition,
        isAccurate: Boolean(dispositionReview.isAccurate),
        notes: ensureStringArray(dispositionReview.notes),
      },
      qualificationAssessment: {
        metCriteria: Boolean(qualificationAssessment.metCriteria),
        successIndicators: ensureStringArray(qualificationAssessment.successIndicators),
        missingIndicators: ensureStringArray(qualificationAssessment.missingIndicators),
        deviations: ensureStringArray(qualificationAssessment.deviations),
      },
      breakdowns: ensureBreakdowns(raw.breakdowns),
      issues: mergedIssues,
      performanceGaps: ensureStringArray(raw.performanceGaps),
      recommendations: ensureRecommendations(raw.recommendations),
      promptUpdates: ensurePromptUpdates(raw.promptUpdates),
      nextBestActions: ensureStringArray(raw.nextBestActions),
      learningSignals: {
        sentiment: raw.learningSignals?.sentiment,
        engagementLevel: raw.learningSignals?.engagementLevel,
        timePressure: Boolean(raw.learningSignals?.timePressure),
        outcome: raw.learningSignals?.outcome || input.disposition,
      },
      metadata: {
        model: actualModel,
        analyzedAt: new Date().toISOString(),
        interactionType: input.interactionType,
        analysisStage: input.analysisStage || "post_call",
        transcriptLength: trimmed.length,
        truncated,
      },
    };
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    return buildFallbackAnalysis(input, "analysis_failed", message);
  }
}
