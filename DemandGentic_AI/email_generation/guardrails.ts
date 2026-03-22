// Guardrails and system law enforcement for DemanGent Email Generation
// Ensures content emails justify relevance to the account before referencing the asset.

import { ContentEmailGeneratorInput, ContentEmailGeneratorOutput } from "./contentEmailGenerator";

const FORBIDDEN_PHRASES = [
  "join us",
  "don't miss",
  "limited seats",
  "guaranteed",
  "best practices",
  "proprietary",
  "benefits",
  "exclusive",
  "offer",
  "register now",
  "sign up",
  "act now",
];

export function enforceGuardrails(
  input: ContentEmailGeneratorInput,
  output: ContentEmailGeneratorOutput
): boolean {
  const combined = `${output.subject}\n${output.preheader}\n${output.text}\n${output.html}`.toLowerCase();

  const containsForbidden = FORBIDDEN_PHRASES.some((phrase) => combined.includes(phrase));
  if (containsForbidden) return false;

  const relevanceIndex = findRelevanceIndex(output, input);
  const assetIndex = findAssetIndex(output, input);

  if (assetIndex !== -1 && relevanceIndex === -1) {
    return false;
  }

  if (assetIndex !== -1 && relevanceIndex !== -1 && relevanceIndex > assetIndex) {
    return false;
  }

  if (input.content_account_angle.confidence  assetIndex) {
      return false;
    }
  }

  return true;
}

function findRelevanceIndex(
  output: ContentEmailGeneratorOutput,
  input: ContentEmailGeneratorInput
): number {
  const combined = `${output.text}\n${output.html}`;
  const approvedAngle = input.content_account_angle.approved_angle;
  const supportingInsight = input.content_account_angle.supporting_insight;

  const index = indexOfFirst(combined, [approvedAngle, supportingInsight]);
  return index;
}

function findAssetIndex(
  output: ContentEmailGeneratorOutput,
  input: ContentEmailGeneratorInput
): number {
  const combined = `${output.text}\n${output.html}`;
  return indexOfFirst(combined, [input.asset_metadata.title, input.asset_metadata.cta_url]);
}

function indexOfFirst(text: string, needles: string[]): number {
  let earliest = -1;
  needles.forEach((needle) => {
    if (!needle) return;
    const idx = text.indexOf(needle);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  });
  return earliest;
}