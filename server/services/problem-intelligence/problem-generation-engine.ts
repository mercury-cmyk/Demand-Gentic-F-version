/**
 * Problem Generation Engine
 *
 * AI-powered engine that synthesizes account signals, detected problems,
 * and service catalog into actionable campaign intelligence.
 * Handles both batch generation and per-call refresh.
 */

import { createHash } from "crypto";
import { db } from "../../db";
import {
  campaignAccountProblems,
  accounts,
  campaigns,
  type CampaignAccountProblem,
  type InsertCampaignAccountProblem,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type {
  CampaignAccountProblemIntelligence,
  AccountSignals,
  DetectedProblem,
  GapAnalysis,
  MessagingPackage,
  OutreachStrategy,
  ServiceDefinition,
  ObjectionPrep,
  BatchGenerateResult,
} from "@shared/types/problem-intelligence";
import {
  detectAccountSignals,
  matchProblemsToAccount,
  analyzeCapabilityGaps,
  loadProblemDefinitions,
} from "./problem-detection-service";
import { getEffectiveServiceCatalog } from "./service-catalog-service";

const PROBLEM_INTELLIGENCE_TTL_DAYS = 14;
const SYNTHESIS_MODEL = process.env.PROBLEM_INTELLIGENCE_MODEL || "gpt-4o";

// ==================== MAIN GENERATION FUNCTION ====================

/**
 * Generate problem intelligence for an account in a campaign
 * Uses cached version if available and not expired
 */
export async function generateAccountProblemIntelligence(params: {
  campaignId: string;
  accountId: string;
  forceRefresh?: boolean;
}): Promise<CampaignAccountProblemIntelligence | null> {
  const { campaignId, accountId, forceRefresh = false } = params;

  // Check for existing intelligence
  const [existing] = await db
    .select()
    .from(campaignAccountProblems)
    .where(
      and(
        eq(campaignAccountProblems.campaignId, campaignId),
        eq(campaignAccountProblems.accountId, accountId)
      )
    )
    .limit(1);

  // Detect signals and build fingerprint
  const signals = await detectAccountSignals(accountId);
  if (!signals) {
    console.warn(`[ProblemGenEngine] No signals for account ${accountId}`);
    return null;
  }

  const sourceFingerprint = buildSourceFingerprint(signals, campaignId);

  // Check if we need to regenerate
  const shouldRegenerate =
    forceRefresh ||
    !existing ||
    isTtlExpired(existing.generatedAt, PROBLEM_INTELLIGENCE_TTL_DAYS) ||
    existing.sourceFingerprint !== sourceFingerprint;

  if (!shouldRegenerate && existing) {
    return parseStoredIntelligence(existing);
  }

  // Load necessary data
  const [serviceCatalog, problemDefs, campaign] = await Promise.all([
    getEffectiveServiceCatalog(campaignId),
    loadProblemDefinitions(),
    loadCampaignContext(campaignId),
  ]);

  // Detect problems
  const detectedProblems = await matchProblemsToAccount(accountId, signals, problemDefs);

  // Analyze gaps
  const gapAnalysis = await analyzeCapabilityGaps(accountId, signals, serviceCatalog);

  // Synthesize messaging and strategy using AI
  const synthesis = await synthesizeProblemIntelligence({
    accountSignals: signals,
    detectedProblems,
    gapAnalysis,
    serviceCatalog,
    campaignContext: campaign,
  });

  // Prepare the intelligence record
  const intelligence: CampaignAccountProblemIntelligence = {
    campaignId,
    accountId,
    detectedProblems,
    gapAnalysis,
    messagingPackage: synthesis.messagingPackage,
    outreachStrategy: synthesis.outreachStrategy,
    generatedAt: new Date(),
    generationModel: SYNTHESIS_MODEL,
    sourceFingerprint,
    confidence: synthesis.confidence,
  };

  // Store/update in database
  if (existing) {
    await db
      .update(campaignAccountProblems)
      .set({
        detectedProblems: intelligence.detectedProblems,
        gapAnalysis: intelligence.gapAnalysis,
        messagingPackage: intelligence.messagingPackage,
        outreachStrategy: intelligence.outreachStrategy,
        generatedAt: intelligence.generatedAt,
        generationModel: intelligence.generationModel,
        sourceFingerprint: intelligence.sourceFingerprint,
        confidence: intelligence.confidence,
        lastRefreshedAt: new Date(),
        refreshCount: (existing.refreshCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(campaignAccountProblems.id, existing.id));
  } else {
    await db.insert(campaignAccountProblems).values({
      campaignId,
      accountId,
      detectedProblems: intelligence.detectedProblems,
      gapAnalysis: intelligence.gapAnalysis,
      messagingPackage: intelligence.messagingPackage,
      outreachStrategy: intelligence.outreachStrategy,
      generatedAt: intelligence.generatedAt,
      generationModel: intelligence.generationModel,
      sourceFingerprint: intelligence.sourceFingerprint,
      confidence: intelligence.confidence,
    });
  }

  return intelligence;
}

// ==================== BATCH GENERATION ====================

/**
 * Batch generate problem intelligence for all accounts in a campaign
 */
export async function batchGenerateCampaignProblems(params: {
  campaignId: string;
  accountIds: string[];
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}): Promise<BatchGenerateResult> {
  const { campaignId, accountIds, concurrency = 5, onProgress } = params;

  let successCount = 0;
  let failedCount = 0;
  const errors: Array<{ accountId: string; error: string }> = [];

  // Process in batches to control concurrency
  for (let i = 0; i < accountIds.length; i += concurrency) {
    const batch = accountIds.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map((accountId) =>
        generateAccountProblemIntelligence({ campaignId, accountId })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const accountId = batch[j];

      if (result.status === "fulfilled" && result.value) {
        successCount++;
      } else {
        failedCount++;
        const errorMessage =
          result.status === "rejected"
            ? String(result.reason)
            : "Generation returned null";
        errors.push({ accountId, error: errorMessage });
      }
    }

    onProgress?.(i + batch.length, accountIds.length);
  }

  return {
    success: successCount,
    failed: failedCount,
    errors,
  };
}

/**
 * Refresh intelligence for a specific account (for per-call refresh)
 */
export async function refreshAccountProblemIntelligence(
  campaignId: string,
  accountId: string
): Promise<CampaignAccountProblemIntelligence | null> {
  return generateAccountProblemIntelligence({
    campaignId,
    accountId,
    forceRefresh: true,
  });
}

// ==================== AI SYNTHESIS ====================

/**
 * Use AI to synthesize messaging package and outreach strategy
 */
async function synthesizeProblemIntelligence(params: {
  accountSignals: AccountSignals;
  detectedProblems: DetectedProblem[];
  gapAnalysis: GapAnalysis;
  serviceCatalog: ServiceDefinition[];
  campaignContext: CampaignContext | null;
}): Promise<{
  messagingPackage: MessagingPackage;
  outreachStrategy: OutreachStrategy;
  confidence: number;
}> {
  const { accountSignals, detectedProblems, gapAnalysis, serviceCatalog, campaignContext } =
    params;

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  // Fallback if no API key
  if (!openaiKey) {
    return buildFallbackSynthesis(detectedProblems, gapAnalysis, serviceCatalog);
  }

  const systemPrompt = buildSynthesisSystemPrompt();
  const userPrompt = buildSynthesisUserPrompt(
    accountSignals,
    detectedProblems,
    gapAnalysis,
    serviceCatalog,
    campaignContext
  );

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: SYNTHESIS_MODEL,
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    const parsed = JSON.parse(content);
    return {
      messagingPackage: {
        primaryAngle: parsed.primaryAngle || "Exploratory conversation about business challenges",
        secondaryAngles: parsed.secondaryAngles || [],
        openingLines: parsed.openingLines || [],
        objectionPrep: (parsed.objectionPrep || []).map((o: any) => ({
          objection: o.objection || "",
          response: o.response || "",
          proofPoint: o.proofPoint,
        })),
        proofPoints: parsed.proofPoints || [],
      },
      outreachStrategy: {
        recommendedApproach: validateApproach(parsed.recommendedApproach),
        talkingPoints: parsed.talkingPoints || [],
        questionsToAsk: parsed.questionsToAsk || [],
        doNotMention: parsed.doNotMention || [],
      },
      confidence: parsed.confidence || calculateConfidence(detectedProblems, gapAnalysis),
    };
  } catch (error) {
    console.error("[ProblemGenEngine] AI synthesis failed:", error);
    return buildFallbackSynthesis(detectedProblems, gapAnalysis, serviceCatalog);
  }
}

// ==================== PROMPTS ====================

function buildSynthesisSystemPrompt(): string {
  return `You are an expert B2B campaign strategist. Your task is to synthesize account intelligence into actionable messaging and outreach strategies.

Given:
- Account signals (firmographic, tech stack, intent, behavioral data)
- Detected problems (with confidence scores)
- Capability gap analysis
- Service catalog

Generate a JSON response with:
{
  "primaryAngle": "The main messaging angle to lead with",
  "secondaryAngles": ["Alternative angles if primary doesn't resonate"],
  "openingLines": ["2-3 opening lines for calls or emails"],
  "objectionPrep": [
    {"objection": "Common objection", "response": "How to address it", "proofPoint": "Evidence to cite"}
  ],
  "proofPoints": ["Relevant proof points or case study references"],
  "recommendedApproach": "exploratory|consultative|direct|educational",
  "talkingPoints": ["Key points to cover in conversation"],
  "questionsToAsk": ["Discovery questions to understand their situation"],
  "doNotMention": ["Topics or competitors to avoid mentioning"],
  "confidence": 0.0-1.0
}

Rules:
1. Be specific to the account's context, not generic
2. Frame everything from the organization's perspective (problems we solve)
3. Avoid assumptive language - use exploratory positioning
4. Match approach intensity to confidence level (low confidence = more exploratory)
5. Include competitor gaps only if clearly identified
6. Keep opening lines conversational, not sales-y`;
}

function buildSynthesisUserPrompt(
  signals: AccountSignals,
  problems: DetectedProblem[],
  gaps: GapAnalysis,
  services: ServiceDefinition[],
  campaign: CampaignContext | null
): string {
  const sections: string[] = [];

  // Account context
  sections.push(`## Account Context
Industry: ${signals.firmographic.industry || "Unknown"}
Company Size: ${signals.firmographic.employees ? `~${signals.firmographic.employees} employees` : "Unknown"}
Region: ${signals.firmographic.region || "Unknown"}
Tech Stack: ${signals.techStack.technologies.slice(0, 10).join(", ") || "Unknown"}
Intent Signals: ${signals.intentSignals.slice(0, 5).join(", ") || "None detected"}
Engagement Level: ${signals.behavioralSignals.engagementLevel}`);

  // Detected problems
  if (problems.length > 0) {
    sections.push(`## Detected Problems (Ranked by Confidence)`);
    for (const problem of problems.slice(0, 3)) {
      sections.push(
        `- ${problem.problemStatement} (${Math.round(problem.confidence * 100)}% confidence)
  Signals: ${problem.detectionSignals.map((s) => s.signalValue).join(", ")}`
      );
    }
  } else {
    sections.push("## Detected Problems\nNo specific problems detected - use exploratory approach");
  }

  // Gap analysis
  if (gaps.capabilities.length > 0) {
    sections.push(`## Capability Gaps Identified`);
    for (const gap of gaps.capabilities.slice(0, 3)) {
      sections.push(
        `- Gap: ${gap.accountGap}
  Our Solution: ${gap.ourSolution}
  Confidence: ${Math.round(gap.confidence * 100)}%`
      );
    }
  }

  // Service context
  if (services.length > 0) {
    sections.push(`## Our Services (for reference)`);
    for (const service of services.slice(0, 3)) {
      sections.push(
        `- ${service.serviceName}: ${service.serviceDescription || "N/A"}
  Problems solved: ${service.problemsSolved.map((p) => p.problemStatement).slice(0, 2).join("; ")}`
      );
    }
  }

  // Campaign context
  if (campaign) {
    sections.push(`## Campaign Context
Objective: ${campaign.objective || "General outreach"}
Target Audience: ${campaign.targetAudience || "Not specified"}
Talking Points: ${campaign.talkingPoints?.join("; ") || "Not specified"}`);
  }

  return sections.join("\n\n");
}

// ==================== HELPERS ====================

interface CampaignContext {
  objective: string | null;
  targetAudience: string | null;
  talkingPoints: string[] | null;
}

async function loadCampaignContext(campaignId: string): Promise<CampaignContext | null> {
  const [campaign] = await db
    .select({
      objective: campaigns.campaignObjective,
      targetAudience: campaigns.targetAudienceDescription,
      talkingPoints: campaigns.talkingPoints,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return null;

  return {
    objective: campaign.objective,
    targetAudience: campaign.targetAudience,
    talkingPoints: campaign.talkingPoints as string[] | null,
  };
}

function buildSourceFingerprint(signals: AccountSignals, campaignId: string): string {
  const payload = {
    campaignId,
    industry: signals.firmographic.industry,
    employees: signals.firmographic.employees,
    revenue: signals.firmographic.revenue,
    techStack: signals.techStack.technologies.sort(),
    intentSignals: signals.intentSignals.sort(),
    engagementLevel: signals.behavioralSignals.engagementLevel,
  };

  const hash = createHash("md5");
  hash.update(JSON.stringify(payload));
  return hash.digest("hex").slice(0, 16);
}

function isTtlExpired(generatedAt: Date, ttlDays: number): boolean {
  const expirationTime = new Date(generatedAt).getTime() + ttlDays * 24 * 60 * 60 * 1000;
  return Date.now() > expirationTime;
}

function parseStoredIntelligence(
  record: CampaignAccountProblem
): CampaignAccountProblemIntelligence {
  return {
    campaignId: record.campaignId,
    accountId: record.accountId,
    detectedProblems: (record.detectedProblems as DetectedProblem[]) || [],
    gapAnalysis: (record.gapAnalysis as GapAnalysis) || { capabilities: [], prioritizedGaps: [] },
    messagingPackage: (record.messagingPackage as MessagingPackage) || {
      primaryAngle: "",
      secondaryAngles: [],
      openingLines: [],
      objectionPrep: [],
      proofPoints: [],
    },
    outreachStrategy: (record.outreachStrategy as OutreachStrategy) || {
      recommendedApproach: "exploratory",
      talkingPoints: [],
      questionsToAsk: [],
      doNotMention: [],
    },
    generatedAt: record.generatedAt,
    generationModel: record.generationModel || undefined,
    sourceFingerprint: record.sourceFingerprint || undefined,
    confidence: record.confidence || 0.5,
  };
}

function validateApproach(
  approach: string | undefined
): "exploratory" | "consultative" | "direct" | "educational" {
  const valid = ["exploratory", "consultative", "direct", "educational"];
  if (approach && valid.includes(approach)) {
    return approach as "exploratory" | "consultative" | "direct" | "educational";
  }
  return "exploratory"; // Default to safest approach
}

function calculateConfidence(problems: DetectedProblem[], gaps: GapAnalysis): number {
  if (problems.length === 0) return 0.3;

  const avgProblemConfidence =
    problems.reduce((sum, p) => sum + p.confidence, 0) / problems.length;
  const avgGapConfidence =
    gaps.capabilities.length > 0
      ? gaps.capabilities.reduce((sum, g) => sum + g.confidence, 0) / gaps.capabilities.length
      : 0.5;

  return (avgProblemConfidence * 0.6 + avgGapConfidence * 0.4);
}

function buildFallbackSynthesis(
  problems: DetectedProblem[],
  gaps: GapAnalysis,
  services: ServiceDefinition[]
): {
  messagingPackage: MessagingPackage;
  outreachStrategy: OutreachStrategy;
  confidence: number;
} {
  // Build basic messaging from detected problems
  const primaryProblem = problems[0];
  const primaryAngle = primaryProblem
    ? `Explore ${primaryProblem.problemStatement.toLowerCase()}`
    : "Understand your current business challenges";

  const openingLines = problems.slice(0, 2).map(
    (p) => `I noticed that companies in your space often face ${p.problemStatement.toLowerCase()}. Is that something you're dealing with?`
  );

  if (openingLines.length === 0) {
    openingLines.push(
      "I'm reaching out to learn more about how you're currently handling [relevant area]. Do you have a few minutes to chat?"
    );
  }

  // Build objection prep from problem messaging angles
  const objectionPrep: ObjectionPrep[] = problems.slice(0, 2).flatMap((p) =>
    p.messagingAngles.slice(0, 1).map((ma) => ({
      objection: "We're already handling this internally",
      response: ma.followUp || "I understand. Many teams start that way. What I'm curious about is...",
      proofPoint: undefined,
    }))
  );

  // Build talking points from gaps
  const talkingPoints = gaps.capabilities.slice(0, 3).map(
    (g) => `${g.capability}: ${g.ourSolution}`
  );

  return {
    messagingPackage: {
      primaryAngle,
      secondaryAngles: problems.slice(1, 3).map((p) => p.problemStatement),
      openingLines,
      objectionPrep,
      proofPoints: services.slice(0, 2).flatMap((s) =>
        s.differentiators.slice(0, 1).map((d) => d.proof)
      ),
    },
    outreachStrategy: {
      recommendedApproach: problems.length > 0 && problems[0].confidence > 0.7
        ? "consultative"
        : "exploratory",
      talkingPoints,
      questionsToAsk: [
        "What's your current approach to [problem area]?",
        "What would success look like for you in this area?",
        "What's been the biggest challenge you've faced?",
      ],
      doNotMention: [],
    },
    confidence: calculateConfidence(problems, gaps),
  };
}
