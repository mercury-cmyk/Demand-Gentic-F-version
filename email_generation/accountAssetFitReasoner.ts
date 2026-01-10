// Account-Asset Fit Reasoner contract for DemanGent Email Generation
// Input: account_messaging_brief, content_context
// Output: { approved_angle, supporting_insight, what_to_deemphasize, confidence }

import { ContentContext } from "./contentContext";

export interface AccountMessagingBrief {
  problem: string;
  insight: string;
  posture: string;
  outcome: string;
  confidence: number;
}

export interface AccountAssetFitInput {
  account_messaging_brief: AccountMessagingBrief;
  content_context: ContentContext;
}

export interface AccountAssetFitOutput {
  approved_angle: string;
  supporting_insight: string;
  what_to_deemphasize: string[];
  confidence: number;
}

export function accountAssetFitReasoner(
  input: AccountAssetFitInput
): AccountAssetFitOutput {
  const { account_messaging_brief: brief, content_context: context } = input;
  const approvedAngle = buildApprovedAngle(brief, context);
  const supportingInsight = buildSupportingInsight(brief, context);
  const whatToDeemphasize = [
    ...context.what_it_does_not_claim,
    "hype",
    "asset-first framing",
    "benefits lists",
  ];

  const confidence = calculateConfidence(brief, context);

  return {
    approved_angle: approvedAngle,
    supporting_insight: supportingInsight,
    what_to_deemphasize: whatToDeemphasize,
    confidence,
  };
}

function buildApprovedAngle(brief: AccountMessagingBrief, context: ContentContext): string {
  if (brief.problem && context.primary_theme) {
    return `${brief.problem} The asset is only relevant as a continuation of the ${context.primary_theme} thread.`;
  }
  if (brief.problem) {
    return `${brief.problem} The asset is only useful if it helps explore that question further.`;
  }
  return "Use the asset only as a continuation of the account's existing question, not as a standalone pitch.";
}

function buildSupportingInsight(brief: AccountMessagingBrief, context: ContentContext): string {
  if (brief.insight) {
    return brief.insight;
  }
  if (context.what_problem_it_helps_explore) {
    return `This content explores ${context.what_problem_it_helps_explore}.`;
  }
  return "The asset is useful only if it clarifies the account's current engagement question.";
}

function calculateConfidence(brief: AccountMessagingBrief, context: ContentContext): number {
  let score = 0.2;

  if (brief.problem) score += 0.25;
  if (brief.insight) score += 0.2;
  if (brief.confidence) score += Math.min(0.2, brief.confidence * 0.2);
  if (context.primary_theme) score += 0.15;
  if (context.what_problem_it_helps_explore) score += 0.1;
  if (context.what_it_does_not_claim?.length) score += 0.1;

  return Math.min(0.95, Number(score.toFixed(2)));
}
