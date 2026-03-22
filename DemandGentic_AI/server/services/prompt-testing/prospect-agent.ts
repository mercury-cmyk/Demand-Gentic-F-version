import OpenAI from "openai";
import { Scenario, ConversationTurn } from "./types";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export class ProspectAgent {
  private scenario: Scenario;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
  }

  async generateResponse(history: ConversationTurn[]): Promise {
    const openai = getOpenAI();
    const systemPrompt = `
You are a roleplay actor playing the part of a prospect in a sales call.
Your Persona: ${this.scenario.prospectPersona}
Your Goal: ${this.scenario.goal}

Objection Sequence (bring these up naturally if the conversation flows that way, or if the agent pushes):
${this.scenario.objectionSequence.join("\n")}

Instructions:
- Respond naturally as this character.
- Do not announce you are an AI or an actor.
- Keep responses relatively short (spoken conversation length).
- React to what the agent says.
- If the agent answers your objection well, move to the next one or show interest.
- If the agent is pushy or weird, hang up or get annoyed.
    `;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((turn) => ({
        role: turn.role === "agent" ? "user" : "assistant",
        content: turn.content,
      } as const)),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use a high quality model for the simulator
      messages,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "...";
  }
}