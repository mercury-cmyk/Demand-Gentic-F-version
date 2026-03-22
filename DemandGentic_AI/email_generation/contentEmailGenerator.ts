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

  const confidenceLow = angle.confidence 
    line.replace(/&/g, "&amp;").replace(//g, "&gt;")
  );
  return `${escaped.join("")}`;
}