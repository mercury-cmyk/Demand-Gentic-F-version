import { Simulator } from "./simulator";
import { Evaluator } from "./evaluator";
import { Scenario, PromptVariant, TestUnit } from "./types";
import dotenv from "dotenv";

dotenv.config();

const SAMPLE_SCENARIO: Scenario = {
  id: "scenario-1",
  name: "Cold Call - Marketing Services",
  description: "Selling digital marketing services to a heavy equipment distributor.",
  prospectPersona: "John, a clearly busy Operations Manager at a heavy equipment distributor. He is skeptical of marketing, thinks word of mouth is enough, and hates cold calls.",
  objectionSequence: [
    "I'm busy right now, what is this about?",
    "We don't need marketing, we have enough work.",
    "Send me an email.",
    "How did you get my number?"
  ],
  goal: "Book a 15-minute discovery zoom call."
};

const BASELINE_PROMPT: PromptVariant = {
  id: "prompt-base",
  name: "Baseline",
  type: "baseline",
  systemPrompt: `
You are Alex, a sales development representative for DemandEarn AI.
Your goal is to book a meeting with the prospect to discuss how we can help them get more leads.
Be polite and professional.
Briefly explain that we help companies like theirs grow revenue.
If they are busy, ask for a better time.
If they object, try to overcome it.
Close with asking for a meeting.
  `
};

async function main() {
  const provider = process.argv.includes("--gemini") ? "gemini" : "openai";
  
  const testUnit: TestUnit = {
    id: "test-1",
    scenarioId: SAMPLE_SCENARIO.id,
    promptVariantId: BASELINE_PROMPT.id,
    provider: provider,
    voiceId: "alloy"
  };

  console.log("=== Agent Prompt-Testing Framework ===");
  console.log(`Running Test Unit: ${testUnit.id}`);
  console.log(`Provider: ${testUnit.provider}`);
  console.log(`Scenario: ${SAMPLE_SCENARIO.name}`);
  console.log("======================================\n");

  const simulator = new Simulator(testUnit, SAMPLE_SCENARIO, BASELINE_PROMPT);
  const log = await simulator.run(10); // 10 turns max for demo

  console.log("\n=== Simulation Complete ===");
  console.log(`Duration: ${log.durationMs}ms`);
  console.log(`Turns: ${log.turns.length}`);
  
  console.log("\n=== Evaluator Starting ===");
  const evaluator = new Evaluator();
  const evaluation = await evaluator.evaluate(log, SAMPLE_SCENARIO);

  console.log("\n=== Evaluation Report ===");
  console.log(`Total Score: ${evaluation.totalScore}/100`);
  console.log("--------------------------------------");
  console.log(`Control:     ${evaluation.control.score}/5 - ${evaluation.control.reasoning}`);
  console.log(`Compliance:  ${evaluation.compliance.score}/5 - ${evaluation.compliance.reasoning}`);
  console.log(`Persuasion:  ${evaluation.persuasion.score}/5 - ${evaluation.persuasion.reasoning}`);
  console.log(`Flow:        ${evaluation.flow.score}/5 - ${evaluation.flow.reasoning}`);
  console.log("--------------------------------------");
  console.log(`Weakest Dimension: ${evaluation.weakestDimension}`);
  console.log(`Notable Failures:`);
  evaluation.notableFailurePoints.forEach(p => console.log(`- ${p}`));
  console.log(`Recommended Adjustments:`);
  evaluation.recommendedAdjustments.forEach(p => console.log(`- ${p}`));
}

if (import.meta.url.startsWith("file:")) { // Simple ESM check to see if executed directly
    const modulePath = import.meta.url;
    // We can also just run main() directly if we know we are invoking this script.
    // For simplicity:
    main().catch(console.error);
}
