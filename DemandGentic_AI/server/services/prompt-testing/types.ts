export type Provider = "openai" | "gemini";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  prospectPersona: string;
  objectionSequence: string[];
  goal: string;
}

export interface PromptVariant {
  id: string;
  name: string;
  systemPrompt: string;
  type: "baseline" | "optimized" | "experimental";
}

export interface TestUnit {
  id: string;
  scenarioId: string;
  promptVariantId: string;
  provider: Provider;
  voiceId: string; // "alloy", "echo", etc. or a Gemini voice
}

export interface ConversationTurn {
  role: "agent" | "prospect";
  content: string;
  timestamp: number;
}

export interface ConversationLog {
  testUnitId: string;
  turns: ConversationTurn[];
  durationMs: number;
}

export interface ScoreDimension {
  score: number; // 0-5
  reasoning: string;
}

export interface EvaluationResult {
  control: ScoreDimension;
  compliance: ScoreDimension;
  persuasion: ScoreDimension;
  flow: ScoreDimension;
  totalScore: number;
  weakestDimension: string;
  notableFailurePoints: string[];
  recommendedAdjustments: string[];
}

export interface SimulationResult {
  testUnit: TestUnit;
  log: ConversationLog;
  evaluation: EvaluationResult;
}