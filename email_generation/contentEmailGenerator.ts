// Content Email Generator contract for DemanGent Email Generation
// Input: account_messaging_brief, participant_context, content_account_angle, asset_metadata
// Output: { subject, preheader, text, html }

import { AccountMessagingBrief, AccountAssetFitOutput } from "./accountAssetFitReasoner";

export interface ParticipantContext {
  name?: string;
  company?: string;
  role?: string;
  tone?: string;
  depth?: "short" | "medium" | "deep";
  emphasis?: string;
  relationship_state?: string;
  prior_touches?: string[];
}

export interface ContentEmailGeneratorInput {
  account_messaging_brief: AccountMessagingBrief;
  participant_context: ParticipantContext;
  content_account_angle: AccountAssetFitOutput;
  asset_metadata: {
    title: string;
    format: string;
    cta_url: string;
  };
}

export interface ContentEmailGeneratorOutput {
  subject: string;
  preheader: string;
  text: string;
  html: string;
}

export function contentEmailGenerator(
  input: ContentEmailGeneratorInput
): ContentEmailGeneratorOutput {
  const { account_messaging_brief: brief, participant_context: participant, content_account_angle: angle, asset_metadata: asset } = input;

  const name = participant.name || "there";
  const company = participant.company || "your team";
  const tone = participant.tone || "thoughtful";
  const depth = participant.depth || "medium";
  const emphasis = participant.emphasis || "";

  const confidenceLow = angle.confidence < 0.7;
  const subject = buildSubject(brief, asset, confidenceLow);
  const preheader = buildPreheader(brief, asset, confidenceLow);

  const opening = `Hi ${name},`;
  const problemFrame = buildProblemFrame(brief, company, emphasis);
  const insight = buildInsightLine(angle.supporting_insight, depth);
  const relevance = buildRelevanceLine(angle.approved_angle);

  const assetLine = confidenceLow
    ? `Would it be useful if I sent a short ${asset.format} that explores this question?`
    : `We put together a short ${asset.format} that continues this thread: "${asset.title}".`;

  const ctaLine = confidenceLow
    ? `If so, it is here: ${asset.cta_url}`
    : `If it is useful, you can find it here: ${asset.cta_url}`;

  const closeLine = buildCloseLine(tone);

  const paragraphs = [
    opening,
    problemFrame,
    insight,
    relevance,
    assetLine,
    ctaLine,
    `Either way, happy to adjust based on how you're thinking about this at ${company}.`,
    closeLine,
  ];

  const text = paragraphs.join("\n\n");
  const html = buildHtml(paragraphs);

  return {
    subject,
    preheader,
    text,
    html,
  };
}

function buildSubject(
  brief: AccountMessagingBrief,
  asset: { title: string; format: string },
  lowConfidence: boolean
): string {
  if (lowConfidence) {
    return `quick question on ${brief.problem || "engagement"}`
      .toLowerCase();
  }

  if (asset.format.toLowerCase().includes("webinar")) {
    return "a question we are exploring live";
  }

  return "a short note on demand continuity";
}

function buildPreheader(
  brief: AccountMessagingBrief,
  asset: { title: string; format: string },
  lowConfidence: boolean
): string {
  if (lowConfidence) {
    return "Checking if this framing is relevant before sharing anything.";
  }
  if (brief.insight) {
    return brief.insight;
  }
  return `Sharing a short ${asset.format} that continues the conversation.`;
}

function buildProblemFrame(
  brief: AccountMessagingBrief,
  company: string,
  emphasis: string
): string {
  if (brief.problem) {
    return `${brief.problem} The pattern shows up in how engagement compounds before pipeline, not just after handoff.`;
  }

  const emphasisLine = emphasis ? `The thread we keep hearing is ${emphasis}.` : "";
  return `We have been comparing notes with teams at ${company} on how engagement is earned before pipeline. ${emphasisLine}`.trim();
}

function buildInsightLine(insight: string, depth: "short" | "medium" | "deep"): string {
  if (!insight) {
    return "The biggest shifts tend to come from continuity between touches, not volume.";
  }
  if (depth === "short") {
    return insight;
  }
  if (depth === "deep") {
    return `${insight} The teams that see traction tend to keep the thread intact from first interaction through the first sales touch.`;
  }
  return insight;
}

function buildRelevanceLine(approvedAngle: string): string {
  return approvedAngle || "The asset only matters if it helps explore the account's current question.";
}

function buildCloseLine(tone: string): string {
  if (tone === "direct") {
    return "Best,\n[Your Name]";
  }
  return "Best,\n[Your Name]";
}

function buildHtml(paragraphs: string[]): string {
  const escaped = paragraphs.map((line) =>
    line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );
  return `<p>${escaped.join("</p><p>")}</p>`;
}
