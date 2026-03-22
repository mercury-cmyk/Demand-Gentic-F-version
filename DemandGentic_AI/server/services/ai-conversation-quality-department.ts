/**
 * UNLICENSED DEPARTMENT: Conversation Quality Department
 *
 * Evaluates HOW the call was conducted — process & communication integrity.
 * This department measures communication execution quality, agent behavior,
 * technical integrity, and procedural compliance.
 *
 * It does NOT evaluate campaign success, lead quality, or qualification status.
 * Scoring logic is completely independent from the Lead Quality Department.
 */

import { deepAnalyze } from "./ai-analysis-router";
import { db } from "../db";
import { campaigns, conversationQualityAssessments, callSessions, dialerCallAttempts } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================
// TYPES — Conversation Quality Department
// ============================================

export interface ConversationQualityDepartmentInput {
  transcript: string;
  callSessionId: string;
  campaignId?: string;
  contactId?: string;
  dialerCallAttemptId?: string;
  disposition?: string;
  callDurationSec?: number;
  tenantId?: string;
}

export interface TechnicalIssue {
  type: string;
  description: string;
  severity: "low" | "medium" | "high";
  timestamp?: string;
}

export interface IssueFlag {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  evidence?: string;
  transcriptMoment?: string;
}

export interface TranscriptAnnotation {
  turnIndex: number;
  annotation: string;
  category: "communication" | "compliance" | "technical" | "handling";
}

export interface BehavioralAssessment {
  strengths: string[];
  weaknesses: string[];
  flags: string[];
}

export interface ConversationQualityDepartmentResult {
  success: boolean;
  assessmentId?: string;

  // Composite Scores
  conversationQualityScore: number;   // CQS 0-100
  technicalIntegrityScore: number;    // 0-100
  complianceScore: number;            // 0-100
  behavioralScore: number;            // 0-100

  // Section A: Communication Behavior
  communicationBehavior: {
    toneScore: number;
    naturalnessScore: number;
    confidenceScore: number;
    openingProtocolScore: number;
    roboticRepetitionFlag: boolean;
  };

  // Section B: Script & Instruction Compliance
  scriptCompliance: {
    scriptAdherenceScore: number;
    gatekeeperProtocolScore: number;
    objectionHandlingLogicScore: number;
    unauthorizedImprovisationFlag: boolean;
  };

  // Section C: Technical Execution
  technicalExecution: {
    voicemailDetectionAccurate: boolean;
    silenceDetectionAccurate: boolean;
    transferHandlingCorrect: boolean;
    directoryNavigationCorrect: boolean;
    interruptionHandlingCorrect: boolean;
    technicalIssues: TechnicalIssue[];
  };

  // Section D: Call Handling Logic
  callHandling: {
    dispositionCorrect: boolean;
    dncTriggeredCorrectly: boolean;
    callbackHandledCorrectly: boolean;
    stateLogicRespected: boolean;
  };

  // Detailed Outputs
  behavioralAssessment: BehavioralAssessment;
  issueFlags: IssueFlag[];
  transcriptAnnotations: TranscriptAnnotation[];
  summary: string;
  analysisModel: string;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_TRANSCRIPT_CHARS = 12000;
const ANALYSIS_MODEL = "vertex-ai-gemini";

// ============================================
// HELPERS
// ============================================

function clampScore(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ensureBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function ensureArray(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function truncateTranscript(transcript: string): { text: string; truncated: boolean } {
  if (transcript.length ;
}> {
  if (!campaignId) return {};
  try {
    const [campaign] = await db
      .select({
        name: campaigns.name,
        objective: campaigns.campaignObjective,
        contextBrief: campaigns.campaignContextBrief,
        talkingPoints: campaigns.talkingPoints,
        successCriteria: campaigns.successCriteria,
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
      aiAgentSettings: (campaign?.aiAgentSettings as Record | null) || undefined,
    };
  } catch {
    return {};
  }
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export async function analyzeConversationQualityDepartment(
  input: ConversationQualityDepartmentInput
): Promise {
  const trimmed = input.transcript.trim();
  if (!trimmed) {
    return buildFallbackResult("Transcript is empty — cannot analyze conversation quality.");
  }

  const { text: transcriptText, truncated } = truncateTranscript(trimmed);
  const campaignContext = await resolveCampaignContext(input.campaignId);

  const contextLines = [
    input.callDurationSec !== undefined ? `Call duration: ${input.callDurationSec}s` : null,
    input.disposition ? `Assigned disposition: ${input.disposition}` : null,
    campaignContext.name ? `Campaign: ${campaignContext.name}` : null,
    campaignContext.objective ? `Campaign objective: ${campaignContext.objective}` : null,
    campaignContext.contextBrief ? `Campaign context: ${campaignContext.contextBrief}` : null,
    campaignContext.talkingPoints?.length
      ? `Approved talking points: ${campaignContext.talkingPoints.join(" | ")}`
      : null,
    campaignContext.aiAgentSettings ? `Call flow scripts: ${JSON.stringify(campaignContext.aiAgentSettings)}` : null,
    truncated ? "Transcript was truncated for analysis." : null,
  ].filter(Boolean);

  const prompt = buildConversationQualityPrompt(transcriptText, contextLines);

  try {
    const raw: any = await deepAnalyze(prompt, { temperature: 0.2, maxTokens: 8192, label: "conv-quality-dept" });

    const communicationBehavior = raw.communicationBehavior || {};
    const scriptCompliance = raw.scriptCompliance || {};
    const technicalExecution = raw.technicalExecution || {};
    const callHandling = raw.callHandling || {};
    const behavioralAssessment = raw.behavioralAssessment || {};

    const result: ConversationQualityDepartmentResult = {
      success: true,
      conversationQualityScore: clampScore(raw.conversationQualityScore, 0),
      technicalIntegrityScore: clampScore(raw.technicalIntegrityScore, 0),
      complianceScore: clampScore(raw.complianceScore, 0),
      behavioralScore: clampScore(raw.behavioralScore, 0),
      communicationBehavior: {
        toneScore: clampScore(communicationBehavior.toneScore, 50),
        naturalnessScore: clampScore(communicationBehavior.naturalnessScore, 50),
        confidenceScore: clampScore(communicationBehavior.confidenceScore, 50),
        openingProtocolScore: clampScore(communicationBehavior.openingProtocolScore, 50),
        roboticRepetitionFlag: ensureBoolean(communicationBehavior.roboticRepetitionFlag, false),
      },
      scriptCompliance: {
        scriptAdherenceScore: clampScore(scriptCompliance.scriptAdherenceScore, 50),
        gatekeeperProtocolScore: clampScore(scriptCompliance.gatekeeperProtocolScore, 50),
        objectionHandlingLogicScore: clampScore(scriptCompliance.objectionHandlingLogicScore, 50),
        unauthorizedImprovisationFlag: ensureBoolean(scriptCompliance.unauthorizedImprovisationFlag, false),
      },
      technicalExecution: {
        voicemailDetectionAccurate: ensureBoolean(technicalExecution.voicemailDetectionAccurate, true),
        silenceDetectionAccurate: ensureBoolean(technicalExecution.silenceDetectionAccurate, true),
        transferHandlingCorrect: ensureBoolean(technicalExecution.transferHandlingCorrect, true),
        directoryNavigationCorrect: ensureBoolean(technicalExecution.directoryNavigationCorrect, true),
        interruptionHandlingCorrect: ensureBoolean(technicalExecution.interruptionHandlingCorrect, true),
        technicalIssues: ensureArray(technicalExecution.technicalIssues),
      },
      callHandling: {
        dispositionCorrect: ensureBoolean(callHandling.dispositionCorrect, true),
        dncTriggeredCorrectly: ensureBoolean(callHandling.dncTriggeredCorrectly, true),
        callbackHandledCorrectly: ensureBoolean(callHandling.callbackHandledCorrectly, true),
        stateLogicRespected: ensureBoolean(callHandling.stateLogicRespected, true),
      },
      behavioralAssessment: {
        strengths: ensureArray(behavioralAssessment.strengths),
        weaknesses: ensureArray(behavioralAssessment.weaknesses),
        flags: ensureArray(behavioralAssessment.flags),
      },
      issueFlags: ensureArray(raw.issueFlags),
      transcriptAnnotations: ensureArray(raw.transcriptAnnotations),
      summary: typeof raw.summary === "string" ? raw.summary : "Analysis complete.",
      analysisModel: ANALYSIS_MODEL,
    };

    // Persist to database
    try {
      const [inserted] = await db
        .insert(conversationQualityAssessments)
        .values({
          callSessionId: input.callSessionId,
          dialerCallAttemptId: input.dialerCallAttemptId || null,
          campaignId: input.campaignId || null,
          contactId: input.contactId || null,
          tenantId: input.tenantId || null,
          status: "analyzed",
          conversationQualityScore: result.conversationQualityScore,
          technicalIntegrityScore: result.technicalIntegrityScore,
          complianceScore: result.complianceScore,
          behavioralScore: result.behavioralScore,
          toneScore: result.communicationBehavior.toneScore,
          naturalnessScore: result.communicationBehavior.naturalnessScore,
          confidenceScore: result.communicationBehavior.confidenceScore,
          openingProtocolScore: result.communicationBehavior.openingProtocolScore,
          roboticRepetitionFlag: result.communicationBehavior.roboticRepetitionFlag,
          scriptAdherenceScore: result.scriptCompliance.scriptAdherenceScore,
          gatekeeperProtocolScore: result.scriptCompliance.gatekeeperProtocolScore,
          objectionHandlingLogicScore: result.scriptCompliance.objectionHandlingLogicScore,
          unauthorizedImprovisationFlag: result.scriptCompliance.unauthorizedImprovisationFlag,
          voicemailDetectionAccurate: result.technicalExecution.voicemailDetectionAccurate,
          silenceDetectionAccurate: result.technicalExecution.silenceDetectionAccurate,
          transferHandlingCorrect: result.technicalExecution.transferHandlingCorrect,
          directoryNavigationCorrect: result.technicalExecution.directoryNavigationCorrect,
          interruptionHandlingCorrect: result.technicalExecution.interruptionHandlingCorrect,
          technicalIssues: result.technicalExecution.technicalIssues,
          dispositionCorrect: result.callHandling.dispositionCorrect,
          dncTriggeredCorrectly: result.callHandling.dncTriggeredCorrectly,
          callbackHandledCorrectly: result.callHandling.callbackHandledCorrectly,
          stateLogicRespected: result.callHandling.stateLogicRespected,
          behavioralAssessment: result.behavioralAssessment,
          issueFlags: result.issueFlags,
          transcriptAnnotations: result.transcriptAnnotations,
          summary: result.summary,
          analysisModel: ANALYSIS_MODEL,
          analyzedAt: new Date(),
        })
        .returning({ id: conversationQualityAssessments.id });

      result.assessmentId = inserted?.id;
    } catch (dbError: any) {
      console.error(`[ConvQualityDept] Failed to persist assessment: ${dbError.message}`);
    }

    return result;
  } catch (error: any) {
    console.error(`[ConvQualityDept] Analysis failed: ${error.message}`);
    return buildFallbackResult(`Analysis failed: ${error.message}`);
  }
}

// ============================================
// PROMPT BUILDER — CONVERSATION QUALITY ONLY
// ============================================

function buildConversationQualityPrompt(transcript: string, contextLines: string[]): string {
  return `You are the Conversation Quality Department analyzer for an AI-powered B2B telemarketing platform.

YOUR SOLE PURPOSE: Evaluate HOW the call was conducted — the process, communication integrity, technical execution, and procedural compliance.

CRITICAL BOUNDARIES — STRICTLY ENFORCED:
- You MUST NOT evaluate lead quality, interest level, buying intent, or campaign outcome success.
- You MUST NOT assess whether the prospect was qualified or interested.
- You MUST NOT factor campaign success or failure into ANY of your scores.
- A perfectly executed call that yields no interest should score HIGH in your assessment.
- A poorly executed call that generates interest should score LOW in your assessment.
- Your scores reflect EXECUTION QUALITY ONLY.

CRITICAL RULES:
1. NEVER penalize pronunciation, enunciation, or speech clarity — these are STT transcription artifacts, NOT agent mistakes.
2. NEVER suggest leaving voicemails — this system does NOT leave voicemails. Correct behavior is to hang up on voicemail.
3. NEVER flag STT artifacts (misspellings, garbled words) as agent performance issues.
4. The agent's two-step opening (confirm identity THEN introduce purpose) is intentional. Do NOT flag this as an issue.
5. "Calling on behalf of [Organization]" is correct — NEVER suggest "calling from."

EVALUATION DIMENSIONS:

A. COMMUNICATION BEHAVIOR
- Was the tone professional?
- Was the interaction natural and human-like?
- Did the agent sound confident and structured?
- Did the agent follow the approved opening protocol?
- Was the conversation friendly but controlled?
- Did the agent avoid robotic repetition?

B. INSTRUCTION & SCRIPT COMPLIANCE
- Did the agent follow campaign instructions?
- Did it respect gatekeeper protocol?
- Did it follow objection-handling logic?
- Did it maintain forward-only conversation state?
- Did it avoid unauthorized improvisation?

C. TECHNICAL EXECUTION
- Was voicemail correctly detected?
- Was silence detection accurate?
- Were transfers handled properly?
- Were directories navigated correctly?
- Were interruptions handled correctly?
- Any latency, recognition, or audio failures?

D. CALL HANDLING LOGIC
- Was the call dispositioned correctly based on conversation?
- Was DNC properly triggered when requested?
- Was callback scheduling handled properly?
- Was state logic respected?

Context:
${contextLines.join("\n")}

Transcript:
${transcript}

Return JSON with this exact shape:
{
  "conversationQualityScore": 0-100,
  "technicalIntegrityScore": 0-100,
  "complianceScore": 0-100,
  "behavioralScore": 0-100,
  "communicationBehavior": {
    "toneScore": 0-100,
    "naturalnessScore": 0-100,
    "confidenceScore": 0-100,
    "openingProtocolScore": 0-100,
    "roboticRepetitionFlag": true|false
  },
  "scriptCompliance": {
    "scriptAdherenceScore": 0-100,
    "gatekeeperProtocolScore": 0-100,
    "objectionHandlingLogicScore": 0-100,
    "unauthorizedImprovisationFlag": true|false
  },
  "technicalExecution": {
    "voicemailDetectionAccurate": true|false,
    "silenceDetectionAccurate": true|false,
    "transferHandlingCorrect": true|false,
    "directoryNavigationCorrect": true|false,
    "interruptionHandlingCorrect": true|false,
    "technicalIssues": [{"type": "string", "description": "string", "severity": "low|medium|high", "timestamp": "optional string"}]
  },
  "callHandling": {
    "dispositionCorrect": true|false,
    "dncTriggeredCorrectly": true|false,
    "callbackHandledCorrectly": true|false,
    "stateLogicRespected": true|false
  },
  "behavioralAssessment": {
    "strengths": ["specific strength observed"],
    "weaknesses": ["specific weakness observed"],
    "flags": ["behavioral flag if any"]
  },
  "issueFlags": [
    {
      "type": "string",
      "severity": "low|medium|high",
      "description": "string",
      "evidence": "specific transcript quote",
      "transcriptMoment": "where in the conversation this occurred"
    }
  ],
  "transcriptAnnotations": [
    {
      "turnIndex": 0,
      "annotation": "what happened at this point",
      "category": "communication|compliance|technical|handling"
    }
  ],
  "summary": "2-4 sentence summary focused on execution quality ONLY, not outcome"
}`;
}

// ============================================
// FALLBACK
// ============================================

function buildFallbackResult(reason: string): ConversationQualityDepartmentResult {
  return {
    success: false,
    conversationQualityScore: 0,
    technicalIntegrityScore: 0,
    complianceScore: 0,
    behavioralScore: 0,
    communicationBehavior: {
      toneScore: 0,
      naturalnessScore: 0,
      confidenceScore: 0,
      openingProtocolScore: 0,
      roboticRepetitionFlag: false,
    },
    scriptCompliance: {
      scriptAdherenceScore: 0,
      gatekeeperProtocolScore: 0,
      objectionHandlingLogicScore: 0,
      unauthorizedImprovisationFlag: false,
    },
    technicalExecution: {
      voicemailDetectionAccurate: true,
      silenceDetectionAccurate: true,
      transferHandlingCorrect: true,
      directoryNavigationCorrect: true,
      interruptionHandlingCorrect: true,
      technicalIssues: [],
    },
    callHandling: {
      dispositionCorrect: false,
      dncTriggeredCorrectly: true,
      callbackHandledCorrectly: true,
      stateLogicRespected: true,
    },
    behavioralAssessment: {
      strengths: [],
      weaknesses: [],
      flags: [reason],
    },
    issueFlags: [{
      type: "analysis_failure",
      severity: "high",
      description: reason,
    }],
    transcriptAnnotations: [],
    summary: reason,
    analysisModel: ANALYSIS_MODEL,
  };
}