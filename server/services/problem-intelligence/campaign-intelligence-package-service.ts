/**
 * Campaign Intelligence Package Service
 *
 * Assembles the complete intelligence package for agent runtime,
 * combining account info, problem intelligence, and service context.
 * Provides the prompt section builder for agent injection.
 */

import { db } from "../../db";
import { accounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import type {
  CampaignIntelligencePackage,
  CampaignAccountProblemIntelligence,
  ObjectionPrep,
} from "@shared/types/problem-intelligence";
import { generateAccountProblemIntelligence } from "./problem-generation-engine";
import { getEffectiveServiceCatalog } from "./service-catalog-service";

// ==================== INTELLIGENCE PACKAGE ====================

/**
 * Get the full intelligence package for an account in a campaign
 * Used at agent runtime to inject problem intelligence into prompts
 */
export async function getCampaignIntelligencePackage(
  campaignId: string,
  accountId: string
): Promise<CampaignIntelligencePackage | null> {
  // Get account info
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      industry: accounts.industryStandardized,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    console.warn(`[IntelligencePackage] Account not found: ${accountId}`);
    return null;
  }

  // Get or generate problem intelligence
  const problemIntelligence = await generateAccountProblemIntelligence({
    campaignId,
    accountId,
    forceRefresh: false,
  });

  if (!problemIntelligence) {
    console.warn(`[IntelligencePackage] Failed to generate intelligence for ${accountId}`);
    return null;
  }

  // Get effective service catalog for this campaign
  const serviceCatalog = await getEffectiveServiceCatalog(campaignId);

  // Build call brief from top detected problems
  const callBrief = buildCallBrief(problemIntelligence);

  return {
    account: {
      id: account.id,
      name: account.name,
      domain: account.domain,
      industry: account.industry,
    },
    problemIntelligence,
    serviceCatalog,
    callBrief,
  };
}

// ==================== PROMPT SECTION BUILDER ====================

/**
 * Build the prompt section for agent injection
 * This is the formatted text that gets added to the agent's system prompt
 */
export function buildProblemIntelligencePromptSection(
  intelligence: CampaignIntelligencePackage
): string {
  const sections: string[] = [];

  // Account context header
  sections.push(`## Account Problem Context
Account: ${intelligence.account.name}
Industry: ${intelligence.account.industry || "Unknown"}
Domain: ${intelligence.account.domain || "Unknown"}`);

  // Detected problems (top 3)
  const { problemIntelligence } = intelligence;
  if (problemIntelligence.detectedProblems.length > 0) {
    sections.push(`## Detected Problems (Ranked by Confidence)`);
    for (const problem of problemIntelligence.detectedProblems.slice(0, 3)) {
      const confidencePercent = Math.round(problem.confidence * 100);
      const signals = problem.detectionSignals.map((s) => s.signalValue).join(", ");
      sections.push(`- ${problem.problemStatement} (${confidencePercent}% confidence)
  Signals: ${signals || "General industry pattern"}`);
    }
  } else {
    sections.push(`## Detected Problems
No specific problems detected. Use exploratory approach to understand their situation.`);
  }

  // Gap analysis (prioritized)
  if (problemIntelligence.gapAnalysis.prioritizedGaps.length > 0) {
    sections.push(`## Capability Gaps (Prioritized)
${problemIntelligence.gapAnalysis.prioritizedGaps.map((g) => `- ${g}`).join("\n")}`);
  }

  // Messaging guidance
  const mp = problemIntelligence.messagingPackage;
  sections.push(`## Messaging Guidance
Primary Angle: ${mp.primaryAngle}

Opening Lines:
${mp.openingLines.map((l) => `- "${l}"`).join("\n")}

Secondary Angles (if needed):
${mp.secondaryAngles.map((a) => `- ${a}`).join("\n") || "- None specified"}`);

  // Outreach strategy
  const os = problemIntelligence.outreachStrategy;
  sections.push(`## Outreach Strategy
Recommended Approach: ${formatApproach(os.recommendedApproach)}

Key Talking Points:
${os.talkingPoints.map((t) => `- ${t}`).join("\n") || "- Follow messaging guidance above"}

Questions to Ask:
${os.questionsToAsk.map((q) => `- ${q}`).join("\n") || "- Standard discovery questions"}

Do NOT Mention:
${os.doNotMention.length > 0 ? os.doNotMention.map((d) => `- ${d}`).join("\n") : "- No specific restrictions"}`);

  // Objection handling
  if (mp.objectionPrep.length > 0) {
    sections.push(`## Objection Handling`);
    for (const obj of mp.objectionPrep.slice(0, 3)) {
      sections.push(`If they say: "${obj.objection}"
Response: ${obj.response}${obj.proofPoint ? `\nProof point: ${obj.proofPoint}` : ""}`);
    }
  }

  // Confidence indicator
  sections.push(`## Intelligence Confidence
Overall: ${Math.round(problemIntelligence.confidence * 100)}%
${problemIntelligence.confidence < 0.5 ? "⚠️ Low confidence - prioritize discovery over pitch" : problemIntelligence.confidence < 0.7 ? "ℹ️ Moderate confidence - balance discovery with targeted questions" : "✓ High confidence - can be more direct with problem-specific discussion"}`);

  return sections.join("\n\n");
}

/**
 * Build a condensed prompt section for situations where context space is limited
 */
export function buildCondensedProblemIntelligenceSection(
  intelligence: CampaignIntelligencePackage
): string {
  const { problemIntelligence, account } = intelligence;
  const mp = problemIntelligence.messagingPackage;
  const os = problemIntelligence.outreachStrategy;

  const topProblem = problemIntelligence.detectedProblems[0];
  const problemSummary = topProblem
    ? `${topProblem.problemStatement} (${Math.round(topProblem.confidence * 100)}%)`
    : "No specific problem detected";

  return `## Problem Intelligence [${account.name}]
Industry: ${account.industry || "Unknown"} | Confidence: ${Math.round(problemIntelligence.confidence * 100)}%
Primary Problem: ${problemSummary}
Approach: ${formatApproach(os.recommendedApproach)}
Lead with: ${mp.primaryAngle}
First question: ${os.questionsToAsk[0] || "What's your current approach to [problem area]?"}
Avoid: ${os.doNotMention.join(", ") || "None specified"}`;
}

// ==================== HELPERS ====================

/**
 * Build call brief from problem intelligence
 */
function buildCallBrief(intelligence: CampaignAccountProblemIntelligence): {
  openingApproach: string;
  keyPoints: string[];
  objectionHandlers: ObjectionPrep[];
} {
  const { messagingPackage, outreachStrategy, detectedProblems } = intelligence;

  // Determine opening approach based on confidence
  let openingApproach: string;
  if (intelligence.confidence >= 0.7 && detectedProblems.length > 0) {
    openingApproach = `Lead with specific problem: "${detectedProblems[0].problemStatement}"`;
  } else if (intelligence.confidence >= 0.5) {
    openingApproach = `Exploratory but targeted: Use opening line and pivot to discovery`;
  } else {
    openingApproach = `Pure discovery: Focus on understanding their situation before any positioning`;
  }

  // Key points combine talking points and top problem contexts
  const keyPoints = [
    ...outreachStrategy.talkingPoints.slice(0, 3),
    ...(messagingPackage.secondaryAngles.length > 0
      ? [`Alternative angle: ${messagingPackage.secondaryAngles[0]}`]
      : []),
  ].slice(0, 4);

  return {
    openingApproach,
    keyPoints,
    objectionHandlers: messagingPackage.objectionPrep.slice(0, 3),
  };
}

/**
 * Format approach for display
 */
function formatApproach(approach: string): string {
  const descriptions: Record<string, string> = {
    exploratory: "Exploratory - Focus on discovery, avoid positioning",
    consultative: "Consultative - Balance discovery with expertise sharing",
    direct: "Direct - Can be more assertive about identified problems",
    educational: "Educational - Lead with industry insights and trends",
  };
  return descriptions[approach] || approach;
}

// ==================== EXPORTS ====================

export { generateAccountProblemIntelligence } from "./problem-generation-engine";
export { getServiceCatalog, getEffectiveServiceCatalog } from "./service-catalog-service";
export { detectAccountSignals, matchProblemsToAccount } from "./problem-detection-service";
