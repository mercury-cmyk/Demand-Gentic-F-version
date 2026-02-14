/**
 * UNLICENSED DEPARTMENT: Lead Quality & Outcome Analysis Department
 *
 * Evaluates the RESULT of the conversation — campaign & qualification integrity.
 * This department measures campaign alignment, qualification accuracy,
 * interest identification, and outcome categorization.
 *
 * It does NOT evaluate tone, communication naturalness, technical errors,
 * or agent professionalism. Scoring logic is completely independent from
 * the Conversation Quality Department.
 */

import { deepAnalyzeJSON } from "./vertex-ai/vertex-client";
import { db } from "../db";
import { campaigns, leadQualityAssessments, contacts, accounts } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================
// TYPES — Lead Quality Department
// ============================================

export interface LeadQualityDepartmentInput {
  transcript: string;
  callSessionId: string;
  campaignId?: string;
  contactId?: string;
  dialerCallAttemptId?: string;
  leadId?: string;
  disposition?: string;
  callDurationSec?: number;
  tenantId?: string;
}

export interface InterestEvidence {
  signal: string;
  type: "explicit" | "implicit";
  quote: string;
}

export interface QualificationCriterion {
  criterion: string;
  met: boolean;
  evidence: string;
  score: number;
}

export interface CampaignAlignmentNote {
  aspect: string;
  score: number;
  evidence: string;
}

export type OutcomeCategory =
  | "qualified_lead"
  | "mql"
  | "sql"
  | "follow_up"
  | "not_interested"
  | "not_a_fit"
  | "dnc"
  | "callback"
  | "voicemail"
  | "invalid";

export type IntentStrength = "strong" | "moderate" | "weak" | "none" | "ambiguous";

export type CrmAction =
  | "create_lead"
  | "send_to_review"
  | "push_to_crm"
  | "suppress"
  | "mark_dnc"
  | "schedule_callback"
  | "no_action";

export interface LeadQualityDepartmentResult {
  success: boolean;
  assessmentId?: string;

  // Composite Scores
  leadQualificationScore: number;   // 0-100
  campaignFitScore: number;         // 0-100
  intentStrength: IntentStrength;

  // Section A: Interest Identification
  interestIdentification: {
    prospectInterested: boolean;
    explicitBuyingIntent: boolean;
    implicitBuyingIntent: boolean;
    interestMisinterpreted: boolean;
    interestEvidence: InterestEvidence[];
  };

  // Section B: Qualification Analysis
  qualificationAnalysis: {
    jobTitleAlignment: number;
    industryAlignment: number;
    companySizeFit: number;
    budgetIndicators: number;
    authorityLevel: number;
    timelineSignals: number;
    painPointAlignment: number;
    qualificationCriteria: QualificationCriterion[];
  };

  // Section C: Outcome Categorization
  outcomeCategorization: {
    outcomeCategory: OutcomeCategory;
    dispositionAccurate: boolean;
    suggestedDisposition: string;
    dispositionConfidence: number;
  };

  // Section D: Lead Routing
  leadRouting: {
    recommendedCrmAction: CrmAction;
    shouldCreateLead: boolean;
    shouldSendToReview: boolean;
    shouldPushToCrm: boolean;
    shouldSuppress: boolean;
    shouldMarkDnc: boolean;
  };

  // Detailed Outputs
  qualificationReport: Record<string, unknown>;
  campaignAlignmentNotes: CampaignAlignmentNote[];
  routingRationale: string;
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

function clampFloat(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function ensureBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function ensureArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function ensureString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function truncateTranscript(transcript: string): { text: string; truncated: boolean } {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
    return { text: transcript, truncated: false };
  }
  return { text: transcript.slice(0, MAX_TRANSCRIPT_CHARS), truncated: true };
}

async function resolveCampaignContext(campaignId?: string): Promise<{
  name?: string;
  objective?: string;
  contextBrief?: string;
  talkingPoints?: string[];
  successCriteria?: string;
  qaParameters?: Record<string, unknown>;
  targetJobTitles?: string[];
  targetIndustries?: string[];
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
        qaParameters: campaigns.qaParameters,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    const qaParams = (campaign?.qaParameters as Record<string, unknown>) || {};
    const clientCriteria = (qaParams.client_criteria as Record<string, unknown>) || {};

    return {
      name: campaign?.name || undefined,
      objective: campaign?.objective || undefined,
      contextBrief: campaign?.contextBrief || undefined,
      talkingPoints: (campaign?.talkingPoints as string[] | null) || undefined,
      successCriteria: campaign?.successCriteria || undefined,
      qaParameters: qaParams,
      targetJobTitles: (clientCriteria.job_titles as string[]) || undefined,
      targetIndustries: (clientCriteria.industries as string[]) || undefined,
    };
  } catch {
    return {};
  }
}

async function resolveContactContext(contactId?: string): Promise<{
  jobTitle?: string;
  company?: string;
  industry?: string;
}> {
  if (!contactId) return {};
  try {
    const [contact] = await db
      .select({
        jobTitle: contacts.jobTitle,
        company: contacts.company,
        accountId: contacts.accountId,
      })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);

    let industry: string | undefined;
    if (contact?.accountId) {
      const [account] = await db
        .select({ industry: accounts.industry })
        .from(accounts)
        .where(eq(accounts.id, contact.accountId))
        .limit(1);
      industry = account?.industry || undefined;
    }

    return {
      jobTitle: contact?.jobTitle || undefined,
      company: contact?.company || undefined,
      industry,
    };
  } catch {
    return {};
  }
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export async function analyzeLeadQualityDepartment(
  input: LeadQualityDepartmentInput
): Promise<LeadQualityDepartmentResult> {
  const trimmed = input.transcript.trim();
  if (!trimmed) {
    return buildFallbackResult("Transcript is empty — cannot analyze lead quality.");
  }

  const { text: transcriptText, truncated } = truncateTranscript(trimmed);
  const campaignContext = await resolveCampaignContext(input.campaignId);
  const contactContext = await resolveContactContext(input.contactId);

  const contextLines = [
    input.callDurationSec !== undefined ? `Call duration: ${input.callDurationSec}s` : null,
    input.disposition ? `Assigned disposition: ${input.disposition}` : null,
    campaignContext.name ? `Campaign: ${campaignContext.name}` : null,
    campaignContext.objective ? `Campaign objective: ${campaignContext.objective}` : null,
    campaignContext.contextBrief ? `Campaign context: ${campaignContext.contextBrief}` : null,
    campaignContext.successCriteria ? `Success criteria: ${campaignContext.successCriteria}` : null,
    campaignContext.talkingPoints?.length
      ? `Campaign talking points: ${campaignContext.talkingPoints.join(" | ")}`
      : null,
    campaignContext.qaParameters ? `QA parameters / qualification criteria: ${JSON.stringify(campaignContext.qaParameters)}` : null,
    campaignContext.targetJobTitles?.length
      ? `Target job titles: ${campaignContext.targetJobTitles.join(", ")}`
      : null,
    campaignContext.targetIndustries?.length
      ? `Target industries: ${campaignContext.targetIndustries.join(", ")}`
      : null,
    contactContext.jobTitle ? `Contact job title: ${contactContext.jobTitle}` : null,
    contactContext.company ? `Contact company: ${contactContext.company}` : null,
    contactContext.industry ? `Contact industry: ${contactContext.industry}` : null,
    truncated ? "Transcript was truncated for analysis." : null,
  ].filter(Boolean);

  const prompt = buildLeadQualityPrompt(transcriptText, contextLines);

  try {
    const raw: any = await deepAnalyzeJSON(prompt, { temperature: 0.2, maxTokens: 8192 });

    const interest = raw.interestIdentification || {};
    const qualification = raw.qualificationAnalysis || {};
    const outcome = raw.outcomeCategorization || {};
    const routing = raw.leadRouting || {};

    const validOutcomes: OutcomeCategory[] = [
      "qualified_lead", "mql", "sql", "follow_up", "not_interested",
      "not_a_fit", "dnc", "callback", "voicemail", "invalid",
    ];
    const validIntents: IntentStrength[] = ["strong", "moderate", "weak", "none", "ambiguous"];
    const validActions: CrmAction[] = [
      "create_lead", "send_to_review", "push_to_crm", "suppress",
      "mark_dnc", "schedule_callback", "no_action",
    ];

    const result: LeadQualityDepartmentResult = {
      success: true,
      leadQualificationScore: clampScore(raw.leadQualificationScore, 0),
      campaignFitScore: clampScore(raw.campaignFitScore, 0),
      intentStrength: validIntents.includes(raw.intentStrength) ? raw.intentStrength : "ambiguous",
      interestIdentification: {
        prospectInterested: ensureBoolean(interest.prospectInterested, false),
        explicitBuyingIntent: ensureBoolean(interest.explicitBuyingIntent, false),
        implicitBuyingIntent: ensureBoolean(interest.implicitBuyingIntent, false),
        interestMisinterpreted: ensureBoolean(interest.interestMisinterpreted, false),
        interestEvidence: ensureArray<InterestEvidence>(interest.interestEvidence),
      },
      qualificationAnalysis: {
        jobTitleAlignment: clampScore(qualification.jobTitleAlignment, 0),
        industryAlignment: clampScore(qualification.industryAlignment, 0),
        companySizeFit: clampScore(qualification.companySizeFit, 0),
        budgetIndicators: clampScore(qualification.budgetIndicators, 0),
        authorityLevel: clampScore(qualification.authorityLevel, 0),
        timelineSignals: clampScore(qualification.timelineSignals, 0),
        painPointAlignment: clampScore(qualification.painPointAlignment, 0),
        qualificationCriteria: ensureArray<QualificationCriterion>(qualification.qualificationCriteria),
      },
      outcomeCategorization: {
        outcomeCategory: validOutcomes.includes(outcome.outcomeCategory) ? outcome.outcomeCategory : "not_interested",
        dispositionAccurate: ensureBoolean(outcome.dispositionAccurate, false),
        suggestedDisposition: ensureString(outcome.suggestedDisposition, "needs_review"),
        dispositionConfidence: clampFloat(outcome.dispositionConfidence, 0),
      },
      leadRouting: {
        recommendedCrmAction: validActions.includes(routing.recommendedCrmAction) ? routing.recommendedCrmAction : "no_action",
        shouldCreateLead: ensureBoolean(routing.shouldCreateLead, false),
        shouldSendToReview: ensureBoolean(routing.shouldSendToReview, false),
        shouldPushToCrm: ensureBoolean(routing.shouldPushToCrm, false),
        shouldSuppress: ensureBoolean(routing.shouldSuppress, false),
        shouldMarkDnc: ensureBoolean(routing.shouldMarkDnc, false),
      },
      qualificationReport: typeof raw.qualificationReport === "object" ? raw.qualificationReport : {},
      campaignAlignmentNotes: ensureArray<CampaignAlignmentNote>(raw.campaignAlignmentNotes),
      routingRationale: ensureString(raw.routingRationale, ""),
      summary: ensureString(raw.summary, "Analysis complete."),
      analysisModel: ANALYSIS_MODEL,
    };

    // Persist to database
    try {
      const [inserted] = await db
        .insert(leadQualityAssessments)
        .values({
          callSessionId: input.callSessionId,
          dialerCallAttemptId: input.dialerCallAttemptId || null,
          campaignId: input.campaignId || null,
          contactId: input.contactId || null,
          leadId: input.leadId || null,
          tenantId: input.tenantId || null,
          status: "analyzed",
          leadQualificationScore: result.leadQualificationScore,
          campaignFitScore: result.campaignFitScore,
          intentStrength: result.intentStrength,
          prospectInterested: result.interestIdentification.prospectInterested,
          explicitBuyingIntent: result.interestIdentification.explicitBuyingIntent,
          implicitBuyingIntent: result.interestIdentification.implicitBuyingIntent,
          interestMisinterpreted: result.interestIdentification.interestMisinterpreted,
          interestEvidence: result.interestIdentification.interestEvidence,
          jobTitleAlignment: result.qualificationAnalysis.jobTitleAlignment,
          industryAlignment: result.qualificationAnalysis.industryAlignment,
          companySizeFit: result.qualificationAnalysis.companySizeFit,
          budgetIndicators: result.qualificationAnalysis.budgetIndicators,
          authorityLevel: result.qualificationAnalysis.authorityLevel,
          timelineSignals: result.qualificationAnalysis.timelineSignals,
          painPointAlignment: result.qualificationAnalysis.painPointAlignment,
          qualificationCriteria: result.qualificationAnalysis.qualificationCriteria,
          outcomeCategory: result.outcomeCategorization.outcomeCategory,
          dispositionAccurate: result.outcomeCategorization.dispositionAccurate,
          suggestedDisposition: result.outcomeCategorization.suggestedDisposition,
          dispositionConfidence: String(result.outcomeCategorization.dispositionConfidence),
          recommendedCrmAction: result.leadRouting.recommendedCrmAction,
          shouldCreateLead: result.leadRouting.shouldCreateLead,
          shouldSendToReview: result.leadRouting.shouldSendToReview,
          shouldPushToCrm: result.leadRouting.shouldPushToCrm,
          shouldSuppress: result.leadRouting.shouldSuppress,
          shouldMarkDnc: result.leadRouting.shouldMarkDnc,
          qualificationReport: result.qualificationReport,
          campaignAlignmentNotes: result.campaignAlignmentNotes,
          routingRationale: result.routingRationale,
          summary: result.summary,
          analysisModel: ANALYSIS_MODEL,
          analyzedAt: new Date(),
        })
        .returning({ id: leadQualityAssessments.id });

      result.assessmentId = inserted?.id;
    } catch (dbError: any) {
      console.error(`[LeadQualityDept] Failed to persist assessment: ${dbError.message}`);
    }

    return result;
  } catch (error: any) {
    console.error(`[LeadQualityDept] Analysis failed: ${error.message}`);
    return buildFallbackResult(`Analysis failed: ${error.message}`);
  }
}

// ============================================
// PROMPT BUILDER — LEAD QUALITY ONLY
// ============================================

function buildLeadQualityPrompt(transcript: string, contextLines: string[]): string {
  return `You are the Lead Quality & Outcome Analysis Department analyzer for an AI-powered B2B telemarketing platform.

YOUR SOLE PURPOSE: Evaluate the RESULT of the conversation — campaign alignment, qualification accuracy, interest identification, and outcome categorization.

CRITICAL BOUNDARIES — STRICTLY ENFORCED:
- You MUST NOT evaluate tone, communication naturalness, agent professionalism, or technical execution.
- You MUST NOT assess how the call was delivered — only what it achieved.
- You MUST NOT factor agent behavior, script compliance, or communication style into ANY of your scores.
- A poorly executed call that generates genuine interest should score HIGH in your assessment.
- A perfectly executed call that yields no interest should score LOW in your assessment.
- Your scores reflect OUTCOME QUALITY ONLY.

CRITICAL RULES:
1. Base ALL assessments on actual transcript content and evidence — never assume or infer beyond what was said.
2. Use campaign-defined criteria (QA parameters, success criteria, ICP) as the reference for qualification.
3. Interest must be evidenced by specific quotes from the transcript.
4. Disposition accuracy must be compared against what actually happened in the conversation.
5. If a voicemail or IVR was reached (no human conversation), the lead is NOT qualified regardless.
6. Call screening (Google Voice, screening services) without human connection = no qualification possible.

EVALUATION DIMENSIONS:

A. INTEREST IDENTIFICATION
- Was the prospect interested?
- Was there explicit or implicit buying intent?
- Was the interest misinterpreted?
- Provide specific evidence (quotes) for all interest signals.

B. QUALIFICATION ANALYSIS (score each 0-100)
- Job title alignment with campaign ICP
- Industry alignment with target industries
- Company size fit
- Budget indicators detected
- Authority level (decision-maker vs. gatekeeper vs. influencer)
- Timeline signals (urgency, planned initiatives)
- Pain point alignment with campaign offering

C. OUTCOME CATEGORIZATION
Classify into exactly ONE category:
- qualified_lead: Contact expressed genuine interest AND met qualification criteria
- mql: Marketing Qualified Lead — shows interest but hasn't been sales-validated
- sql: Sales Qualified Lead — meets all criteria for direct sales engagement
- follow_up: Interested but needs additional touchpoint
- not_interested: Clear declination after engagement
- not_a_fit: Engaged but doesn't match ICP criteria
- dnc: Do Not Call requested
- callback: Callback specifically requested at a time
- voicemail: Reached voicemail, no human engagement
- invalid: Wrong number, disconnected, fax, etc.

D. LEAD CREATION & ROUTING LOGIC
- Should a lead be created?
- Should it go to review?
- Should it go directly to CRM?
- Should it be suppressed?
- Should the account be marked DNC?

Context:
${contextLines.join("\n")}

Transcript:
${transcript}

Return JSON with this exact shape:
{
  "leadQualificationScore": 0-100,
  "campaignFitScore": 0-100,
  "intentStrength": "strong|moderate|weak|none|ambiguous",
  "interestIdentification": {
    "prospectInterested": true|false,
    "explicitBuyingIntent": true|false,
    "implicitBuyingIntent": true|false,
    "interestMisinterpreted": true|false,
    "interestEvidence": [{"signal": "description", "type": "explicit|implicit", "quote": "exact transcript quote"}]
  },
  "qualificationAnalysis": {
    "jobTitleAlignment": 0-100,
    "industryAlignment": 0-100,
    "companySizeFit": 0-100,
    "budgetIndicators": 0-100,
    "authorityLevel": 0-100,
    "timelineSignals": 0-100,
    "painPointAlignment": 0-100,
    "qualificationCriteria": [{"criterion": "what was checked", "met": true|false, "evidence": "transcript evidence", "score": 0-100}]
  },
  "outcomeCategorization": {
    "outcomeCategory": "qualified_lead|mql|sql|follow_up|not_interested|not_a_fit|dnc|callback|voicemail|invalid",
    "dispositionAccurate": true|false,
    "suggestedDisposition": "recommended disposition code",
    "dispositionConfidence": 0.0-1.0
  },
  "leadRouting": {
    "recommendedCrmAction": "create_lead|send_to_review|push_to_crm|suppress|mark_dnc|schedule_callback|no_action",
    "shouldCreateLead": true|false,
    "shouldSendToReview": true|false,
    "shouldPushToCrm": true|false,
    "shouldSuppress": true|false,
    "shouldMarkDnc": true|false
  },
  "qualificationReport": {
    "overallAssessment": "summary of qualification outcome",
    "keyFindings": ["specific findings"],
    "gaps": ["what was missing"]
  },
  "campaignAlignmentNotes": [{"aspect": "what aspect", "score": 0-100, "evidence": "supporting evidence"}],
  "routingRationale": "explanation of why this routing decision was made",
  "summary": "2-4 sentence summary focused on lead quality and outcome ONLY, not communication quality"
}`;
}

// ============================================
// FALLBACK
// ============================================

function buildFallbackResult(reason: string): LeadQualityDepartmentResult {
  return {
    success: false,
    leadQualificationScore: 0,
    campaignFitScore: 0,
    intentStrength: "none",
    interestIdentification: {
      prospectInterested: false,
      explicitBuyingIntent: false,
      implicitBuyingIntent: false,
      interestMisinterpreted: false,
      interestEvidence: [],
    },
    qualificationAnalysis: {
      jobTitleAlignment: 0,
      industryAlignment: 0,
      companySizeFit: 0,
      budgetIndicators: 0,
      authorityLevel: 0,
      timelineSignals: 0,
      painPointAlignment: 0,
      qualificationCriteria: [],
    },
    outcomeCategorization: {
      outcomeCategory: "invalid",
      dispositionAccurate: false,
      suggestedDisposition: "needs_review",
      dispositionConfidence: 0,
    },
    leadRouting: {
      recommendedCrmAction: "no_action",
      shouldCreateLead: false,
      shouldSendToReview: false,
      shouldPushToCrm: false,
      shouldSuppress: false,
      shouldMarkDnc: false,
    },
    qualificationReport: { error: reason },
    campaignAlignmentNotes: [],
    routingRationale: reason,
    summary: reason,
    analysisModel: ANALYSIS_MODEL,
  };
}
