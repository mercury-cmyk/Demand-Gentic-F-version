import { deepAnalyze } from "./ai-analysis-router";
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
const REALTIME_QUALITY_ANALYSIS_MODEL = "vertex-ai-gemini";
const POST_CALL_QUALITY_ANALYSIS_MODEL = process.env.DEEPSEEK_REASONING_MODEL || "deepseek-chat";

function getConversationQualityModelLabel(analysisStage?: "realtime" | "post_call"): string {
  return (analysisStage || "post_call") === "post_call"
    ? POST_CALL_QUALITY_ANALYSIS_MODEL
    : REALTIME_QUALITY_ANALYSIS_MODEL;
}

async function resolveCampaignContext(campaignId?: string): Promise;
  aiAgentSettings?: Record;
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
    qaParameters: (campaign?.qaParameters as Record | null) || undefined,
    aiAgentSettings: (campaign?.aiAgentSettings as Record | null) || undefined,
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
      const raw = issue as Partial | null;
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
      const raw = rec as Partial | null;
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
      const raw = item as Partial | null;
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
      const raw = item as Partial | null;
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

  const seen = new Set();
  for (const line of agentLines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    const wordCount = normalized.split(" ").filter(Boolean).length;
    if (wordCount 
    audioCheckPhrases.some((phrase) => line.toLowerCase().includes(phrase))
  );
}

function detectClosingLoop(agentLines: string[]): boolean {
  // Detect when closing phrases appear multiple times across all agent turns,
  // or when a single agent turn contains a closing phrase repeated more than once.
  const closingPhrases = [
    "have a great day",
    "have a great",
    "thank you so much for your time",
    "thanks so much for your time",
    "you'll receive that shortly",
    "you will receive that shortly",
  ];

  // Check within a single agent line for repeated closing phrases
  for (const line of agentLines) {
    const lower = line.toLowerCase();
    for (const phrase of closingPhrases) {
      const matches = lower.split(phrase).length - 1;
      if (matches >= 2) return true;
    }
  }

  // Check across all agent lines for closing phrase appearing 3+ times total
  const allAgentText = agentLines.join(" ").toLowerCase();
  for (const phrase of closingPhrases) {
    const matches = allAgentText.split(phrase).length - 1;
    if (matches >= 3) return true;
  }

  return false;
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
    "reception is",        // e.g. "reception is very bad"
    "signal is",           // e.g. "signal is poor"
    "poor signal",
    "bad signal",
    "no signal",
    "very bad signal",
    "patchy",
    "in and out",
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
  const issueMap = new Map();

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

  const shortCall = duration !== undefined && duration  = { low: 1, medium: 2, high: 3 };
  const merged = new Map();

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
  if (transcript.length  {
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

  const prompt = `You are the conversation quality monitor for B2B campaigns.
You must continuously evaluate adherence to campaign objectives, flow compliance, disposition accuracy, qualification alignment, and breakdowns.

CRITICAL RULES FOR ANALYSIS — DO NOT VIOLATE:
1. NEVER suggest improvements to pronunciation, enunciation, or speech clarity. The agent is an AI voice agent — any perceived pronunciation issues are speech-to-text (STT) transcription errors, NOT actual agent mistakes. Do not penalize or recommend changes for these.
2. NEVER suggest leaving voicemails. This system does NOT leave voicemails. If a call reached voicemail, the agent correctly hung up. Do not recommend "leave a voicemail message" or similar.
3. NEVER flag STT artifacts (misspellings, garbled words, incomplete sentences in the transcript) as agent performance issues. These are transcription artifacts, not things the agent actually said.
4. Focus recommendations ONLY on: conversation strategy, objection handling, qualification flow, pitch effectiveness, closing technique, and campaign alignment.
5. NEVER suggest "bundled openings" or combining the greeting and introduction into one sentence. The agent's opening flow is intentionally two-step by design: (1) first confirm identity by asking for the contact by name, (2) THEN introduce the purpose after confirmation. This is the correct sales methodology — do NOT recommend changing it.
6. The agent says "calling on behalf of [Organization]" — this is intentional. NEVER suggest changing to "calling from [Organization]". The agent represents the organization, it is not an employee of the organization.
7. ALWAYS score ALL 6 quality dimensions (engagement, clarity, empathy, objectionHandling, qualification, closing) for EVERY conversation. NEVER return 0 for any dimension. Even if the call was too short for qualification or closing to occur, evaluate based on what the agent attempted or how they handled the available opportunity. For qualification: score the agent's effort to gather qualifying information or set up qualification — minimum 20 if the call had any meaningful exchange. For closing: score the agent's attempt to advance the conversation toward a next step or conclusion — minimum 20 if the agent made any effort to direct the call. A score of 0 should ONLY be used if the agent actively failed or did the opposite of what was expected in that dimension.
8. CAMPAIGN-OBJECTIVE ALIGNMENT FOR ISSUES — THIS IS MANDATORY: Every issue you raise in the "issues" array MUST be directly tied to the campaign's stated objective and success criteria shown in the Context section above. Ask yourself: "Was achieving this thing explicitly required by this campaign's objective or success criteria?" If the answer is NO, do NOT raise it as an issue. For example: if the campaign objective is to offer a white paper and obtain email consent, do NOT raise "Missed Opportunity" for not booking a follow-up call unless a follow-up call was explicitly listed in the success criteria. Do NOT invent secondary objectives that are not stated.
9. WHAT COUNTS AS A VALID ISSUE: An issue is only valid if (a) it relates to something the campaign's success criteria or objective required, AND (b) the agent failed or partially failed to deliver it. If the agent successfully completed all stated success criteria, the issues array should be EMPTY or contain only HIGH-severity technical failures (audio, data capture errors). Do NOT fill the issues array with generic coaching points or "nice to have" improvements that have no bearing on whether this specific call succeeded according to the defined criteria.

Context:
${contextLines.join("\n")}

Transcript:
${transcriptText}

ISSUES CONSTRAINT (apply before generating the issues array): Only raise an issue if it is a direct, concrete failure against the campaign's stated objective or success criteria above. If the call successfully achieved all stated criteria, return "issues": []. Never raise issues for behaviours not required by the campaign.

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
    const actualModel = getConversationQualityModelLabel(input.analysisStage);
    const preferredProvider = input.analysisStage === "post_call" ? "deepseek" as const : undefined;
    const analysisLabel = input.analysisStage === "post_call" ? "conv-quality-post-call" : "conv-quality";

    // Prefer DeepSeek for post-call quality analysis while keeping the same router pattern.
    let raw: any;
    try {
      raw = await deepAnalyze(prompt, {
        temperature: 0.3,
        maxTokens: 8192,
        label: analysisLabel,
        preferredProvider,
      });
    } catch (routerError: any) {
      console.warn(`[ConversationQuality] AI analysis failed (all providers): ${routerError.message}`);
      // Fallback analysis will be returned
      return buildFallbackAnalysis(input, "analysis_failed", `AI analysis failed: ${routerError.message}`);
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