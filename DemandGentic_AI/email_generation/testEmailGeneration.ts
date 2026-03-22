// Example/test cases for DemandGentic.ai By Pivotal B2B Email Generation flows
import { ContentContext } from "./contentContext";
import { accountAssetFitReasoner, AccountAssetFitInput } from "./accountAssetFitReasoner";
import { contentEmailGenerator, ContentEmailGeneratorInput } from "./contentEmailGenerator";
import { enforceGuardrails } from "./guardrails";

// Example Content Contexts
const webinarContext: ContentContext = {
  asset_type: "webinar",
  asset_title: "From Lead Capture to DemandGentic.ai By Pivotal B2B",
  asset_format: "live webinar",
  primary_theme: "earning engagement before pipeline",
  who_it_is_for: "B2B demand and revenue teams",
  what_problem_it_helps_explore: "why intent signals fail to convert into conversations",
  what_it_does_not_claim: [
    "guaranteed pipeline",
    "best practices",
    "proprietary methods",
  ],
};

const accountMessagingBrief = {
  problem: "Some teams capture demand signals but still reset context before pipeline.",
  insight: "Momentum improves when the engagement thread compounds rather than resets at handoff.",
  posture: "explore",
  outcome: "conversation",
  confidence: 0.76,
};

const participantContext = {
  name: "Jordan",
  company: "Acme",
  role: "VP Demand Generation",
  tone: "practical",
  depth: "medium",
  emphasis: "continuity",
  relationship_state: "cold",
  prior_touches: ["email_sent_no_reply"],
};

const assetMetadata = {
  title: "From Lead Capture to DemandGentic.ai By Pivotal B2B",
  format: "live webinar",
  cta_url: "https://example.com/webinar",
};

// Step 1: Account-Asset Fit Reasoner
const fitInput: AccountAssetFitInput = {
  account_messaging_brief: accountMessagingBrief,
  content_context: webinarContext,
};
const fitResult = accountAssetFitReasoner(fitInput);

// Step 2: Content Email Generator
const emailInput: ContentEmailGeneratorInput = {
  account_messaging_brief: accountMessagingBrief,
  participant_context: participantContext,
  content_account_angle: fitResult,
  asset_metadata: assetMetadata,
};
const emailOutput = contentEmailGenerator(emailInput);

// Step 3: Guardrails
const passesGuardrails = enforceGuardrails(emailInput, emailOutput);

console.log("Fit Result:", fitResult);
console.log("Email Output:", emailOutput);
console.log("Passes Guardrails:", passesGuardrails);