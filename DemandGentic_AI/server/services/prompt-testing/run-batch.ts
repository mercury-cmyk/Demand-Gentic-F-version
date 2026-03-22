import { Simulator } from "./simulator";
import { Evaluator } from "./evaluator";
import { SCENARIOS } from "./scenarios";
import { PROMPTS } from "./prompts";
import { TestUnit, SimulationResult, EvaluationResult } from "./types";
import dotenv from "dotenv";

dotenv.config();

type BatchResult = {
  scenarioName: string;
  promptName: string;
  totalScore: number;
  controlScore: number;
  complianceScore: number;
  persuasionScore: number;
  flowScore: number;
  duration: number;
  weakestDimension: string;
};

async function runBatch() {
  const provider = process.argv.includes("--gemini") ? "gemini" : "openai";
  const results: BatchResult[] = [];

  console.log(`Starting Batch Test Execution`);
  console.log(`Provider: ${provider}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Prompts: ${PROMPTS.length}`);
  console.log(`Total Runs: ${SCENARIOS.length * PROMPTS.length}`);
  console.log("--------------------------------------------------\n");

  for (const scenario of SCENARIOS) {
    for (const prompt of PROMPTS) {
      const testUnitId = `${scenario.id}::${prompt.id}`;
      // Construct Test Unit
      const testUnit: TestUnit = {
        id: testUnitId,
        scenarioId: scenario.id,
        promptVariantId: prompt.id,
        provider: provider,
        voiceId: "alloy" // Default
      };

      console.log(`[Running] ${scenario.name} | ${prompt.name}`);
      
      try {
        const simulator = new Simulator(testUnit, scenario, prompt);
        const log = await simulator.run(15); // 15 turns max

        // Evaluation
        const evaluator = new Evaluator();
        const evaluation = await evaluator.evaluate(log, scenario);

        const result: BatchResult = {
          scenarioName: scenario.name,
          promptName: prompt.name,
          totalScore: evaluation.totalScore,
          controlScore: evaluation.control.score,
          complianceScore: evaluation.compliance.score,
          persuasionScore: evaluation.persuasion.score,
          flowScore: evaluation.flow.score,
          duration: log.durationMs,
          weakestDimension: evaluation.weakestDimension
        };

        results.push(result);
        console.log(`[Result] Score: ${result.totalScore} | Weakest: ${result.weakestDimension}\n`);
      } catch (err) {
        console.error(`[Error] Failed to run ${testUnitId}:`, err);
      }
    }
  }

  // Final Report
  console.log("\n==================================================");
  console.log("BATCH TEST COMPLETE - SUMMARY REPORT");
  console.log("==================================================");
  console.table(results.map(r => ({
      Scenario: r.scenarioName.substring(0, 20) + "...",
      Prompt: r.promptName,
      Score: r.totalScore,
      Ctrl: r.controlScore,
      Comp: r.complianceScore,
      Pers: r.persuasionScore,
      Flow: r.flowScore,
      Weakest: r.weakestDimension
  })));
  
  // Calculate best prompt across all scenarios
  const promptScores: Record = {};
  PROMPTS.forEach(p => promptScores[p.name] = []);
  
  results.forEach(r => {
      promptScores[r.promptName].push(r.totalScore);
  });

  console.log("\nAVERAGE SCORE PER PROMPT:");
  Object.entries(promptScores).forEach(([name, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`${name.padEnd(25)}: ${avg.toFixed(1)}`);
  });
}

if (import.meta.url.startsWith("file:")) {
    runBatch().catch(console.error);
}