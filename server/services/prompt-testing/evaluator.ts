import OpenAI from "openai";
import { ConversationLog, EvaluationResult, Scenario } from "./types";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export class Evaluator {
  async evaluate(log: ConversationLog, scenario: Scenario): Promise<EvaluationResult> {
    const openai = getOpenAI();
    const transcript = log.turns.map(t => `${t.role.toUpperCase()}: ${t.content}`).join("\n");

    const systemPrompt = `
You are an expert QA auditor for AI sales agents.
Your task is to evaluate a conversation between an AI Agent and a Prospect based on a strict scoring model.

Evaluation Dimensions:

1. Control (30%) - 0-5
   - Strict adherence to system rules and role boundaries.
   - No hallucinations or unauthorized promises.
   - Respects turn-taking.

2. Compliance (25%) - 0-5
   - Legal/Ethical usage (GDPR, TCPA).
   - Proper disclosures if required.
   - Handling opt-outs/objections safety.

3. Persuasion (25%) - 0-5
   - Framing value clearly.
   - Handling objections intelligently.
   - Moving conversation forward.

4. Flow (20%) - 0-5
   - Natural rhythm, smooth transitions.
   - Human-like conversation.

Scenario Context:
Goal: ${scenario.goal}
Persona: ${scenario.prospectPersona}

Score each dimension from 0 to 5 (integer). Provide reasoning.
Identify the weakest dimension.
List 1-3 notable failure points (if any).
List 1-3 recommended adjustments.

Return JSON in this EXACT structure:
{
  "control": { "score": number, "reasoning": "string" },
  "compliance": { "score": number, "reasoning": "string" },
  "persuasion": { "score": number, "reasoning": "string" },
  "flow": { "score": number, "reasoning": "string" },
  "weakestDimension": "string",
  "notableFailurePoints": ["string"],
  "recommendedAdjustments": ["string"]
}
`;
    
    // Using structured outputs or JSON mode
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the transcript:\n\n${transcript}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No evaluation generated");

    const raw = JSON.parse(content);

    const controlScore = Number(raw.control?.score || raw.Control?.score || 0);
    const complianceScore = Number(raw.compliance?.score || raw.Compliance?.score || 0);
    const persuasionScore = Number(raw.persuasion?.score || raw.Persuasion?.score || 0);
    const flowScore = Number(raw.flow?.score || raw.Flow?.score || 0);

    const weightedAverage = 
      (controlScore * 0.30) + 
      (complianceScore * 0.25) + 
      (persuasionScore * 0.25) + 
      (flowScore * 0.20);
      
    const totalScore = weightedAverage * 20;

    return {
      control: raw.control || raw.Control,
      compliance: raw.Compliance || raw.compliance,
      persuasion: raw.Persuasion || raw.persuasion,
      flow: raw.Flow || raw.flow,
      totalScore: Math.round(totalScore),
      weakestDimension: raw.WeakestDimension || raw.weakestDimension || "Unknown",
      notableFailurePoints: raw.NotableFailurePoints || raw.notableFailurePoints || [],
      recommendedAdjustments: raw.RecommendedAdjustments || raw.recommendedAdjustments || []
    };
  }
}
