import OpenAI from "openai";
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
const FALLBACK_MODEL = "deepseek-chat";

let deepseekClient: OpenAI | null = null;

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not configured.");
    }
    deepseekClient = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
  }
  return deepseekClient;
}

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
  const model = process.env.CONVERSATION_QUALITY_MODEL || "deepseek-chat";
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

  const prompt = `You are the DeepSeek real-time conversation quality monitor for B2B campaigns.
You must continuously evaluate adherence to campaign objectives, flow compliance, disposition accuracy, qualification alignment, and breakdowns.

CRITICAL RULES FOR ANALYSIS — DO NOT VIOLATE:
1. NEVER suggest improvements to pronunciation, enunciation, or speech clarity. The agent is an AI voice agent — any perceived pronunciation issues are speech-to-text (STT) transcription errors, NOT actual agent mistakes. Do not penalize or recommend changes for these.
2. NEVER suggest leaving voicemails. This system does NOT leave voicemails. If a call reached voicemail, the agent correctly hung up. Do not recommend "leave a voicemail message" or similar.
3. NEVER flag STT artifacts (misspellings, garbled words, incomplete sentences in the transcript) as agent performance issues. These are transcription artifacts, not things the agent actually said.
4. Focus recommendations ONLY on: conversation strategy, objection handling, qualification flow, pitch effectiveness, closing technique, and campaign alignment.

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
    let response;
    let actualModel = model;

    // Try DeepSeek first, fall back to Gemini if DeepSeek is not configured
    const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
    const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);

    if (hasDeepSeek) {
      response = await getDeepSeekClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: "Return only valid JSON. No markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      });
    } else if (hasGemini) {
      // Fallback: Use Gemini via Google AI SDK
      console.log("[ConversationQuality] DeepSeek not configured, falling back to Gemini");
      const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genai = new GoogleGenerativeAI(geminiKey!);
      const geminiModel = genai.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      });
      const geminiResult = await geminiModel.generateContent(prompt);
      const geminiContent = geminiResult.response?.text() || null;
      if (!geminiContent) {
        return buildFallbackAnalysis(input, "analysis_failed", "Gemini returned empty content.");
      }
      actualModel = "gemini-2.0-flash";
      // Wrap in OpenAI-compatible format for uniform handling below
      response = {
        choices: [{ message: { content: geminiContent } }],
      } as any;
    } else {
      console.warn("[ConversationQuality] No AI provider configured (DEEPSEEK_API_KEY or GEMINI_API_KEY required)");
      return buildFallbackAnalysis(input, "analysis_failed", "No AI provider configured for quality analysis.");
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return buildFallbackAnalysis(input, "analysis_failed", `${actualModel} returned empty content.`);
    }

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const raw = JSON.parse(jsonStr.trim());
    const qualityDimensions = raw.qualityDimensions || {};
    const campaignAlignment = raw.campaignAlignment || {};
    const flowCompliance = raw.flowCompliance || {};
    const dispositionReview = raw.dispositionReview || {};
    const qualificationAssessment = raw.qualificationAssessment || {};

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
      issues: ensureIssues(raw.issues),
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
