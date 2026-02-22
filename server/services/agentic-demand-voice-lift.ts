import { createHash } from "crypto";

export const AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME =
  "Agentic B2B Demand – Problem Intelligence & Solution Mapping (Voice)";

export type VoiceLiftVariant = "control" | "variant_b";

export interface VoiceLiftContext {
  campaignName?: string | null;
  campaignId?: string | null;
  contactId?: string | null;
  callAttemptId?: string | null;
}

export const AGENTIC_DEMAND_CONTROL_OPENING_TEMPLATE =
  "Hi {{contact.first_name}}, this is {{agent.name}} from {{org.name}}. We help B2B demand generation leaders replace spray-and-pray outreach with problem-first conversations using Problem Intelligence and Solution Mapping. Quick question: are your conversion rates where you want them to be, or is there a gap?";

export const AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE =
  "May I speak with {{contact.full_name}}?";

export const AGENTIC_DEMAND_VARIANT_B_PURPOSE_LINE =
  "This is {{agent.name}} from {{org.name}}. Quick reason for my call: we help B2B demand gen leaders replace spray-and-pray outreach using Problem Intelligence and Solution Mapping.";

export function isAgenticDemandVoiceLiftCampaign(campaignName?: string | null): boolean {
  if (!campaignName) return false;
  const normalized = campaignName.replace(/[–—]/g, "-").toLowerCase().trim();
  return normalized === AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME.replace(/[–—]/g, "-").toLowerCase().trim();
}

export function assignVoiceLiftVariant(
  context: VoiceLiftContext,
  splitVariantBPercent = 30
): VoiceLiftVariant {
  if (!isAgenticDemandVoiceLiftCampaign(context.campaignName)) {
    return "control";
  }

  const key = `${context.contactId || "unknown"}:${context.callAttemptId || "unknown"}:${context.campaignId || "unknown"}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % 100;
  return bucket < splitVariantBPercent ? "variant_b" : "control";
}

export function buildAgenticDemandOpeningContract(variant: VoiceLiftVariant): string {
  if (variant !== "variant_b") return "";

  return `
## CAMPAIGN-SPECIFIC OPENING CONTRACT (AGENTIC B2B DEMAND - VARIANT B)

This contract is mandatory for this call.

1) First spoken line after pickup MUST be identity-only:
   "May I speak with {{contact.full_name}}?"

2) After identity is confirmed or corrected, immediately pivot to purpose in the same turn:
   "${AGENTIC_DEMAND_VARIANT_B_PURPOSE_LINE}"

3) Timing and behavior requirements:
- Start purpose delivery within 700ms of identity confirmation.
- Do not insert filler before the purpose line.
- If asked "who is this", answer with name + company only, then resume flow.
- If asked "are you there", respond "Yes, I am here." immediately.
- Do not repeat the opening more than once.

4) Voicemail handling:
- If voicemail/automation cues appear, abort conversational script immediately.
- Do not deliver the full opening pitch to voicemail.
`.trim();
}

export function looksLikePurposeStatement(agentText: string): boolean {
  const text = agentText.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return false;

  const campaignSpecificSignal =
    text.includes("quick reason for my call") ||
    (text.includes("problem intelligence") && text.includes("solution mapping")) ||
    (text.includes("demand gen") && text.includes("spray-and-pray"));

  const introSignal = /\b(this is|my name is|calling on behalf of|i am|i'm)\b/.test(text);
  const purposeSignal =
    /\b(quick reason|reason i am calling|reason i'm calling|im calling|i am calling|calling to|reach(?:ing|ed) out|wanted to)\b/.test(text);
  const valueSignal =
    /\b(help|improve|reduce|increase|streamline|eliminate|solve|platform|service|cost|productivity|security|customer experience|book|schedule|meeting|discuss)\b/.test(text);

  return campaignSpecificSignal || ((introSignal || purposeSignal) && valueSignal);
}
