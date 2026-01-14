import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { PromptVariant, Provider, ConversationTurn } from "./types";

// Lazy initialization helpers
let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) {
       console.warn("OPENAI_API_KEY not found in env, AgentRunner might fail if OpenAI is used.");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

let _geminiClient: GoogleGenAI | null = null;
function getGemini() {
    if (!_geminiClient) {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY; // Added fallback
        if (apiKey) {
            _geminiClient = new GoogleGenAI({ apiKey });
        }
    }
    return _geminiClient;
}

export class AgentRunner {
  private prompt: PromptVariant;
  private provider: Provider;

  constructor(prompt: PromptVariant, provider: Provider) {
    this.prompt = prompt;
    this.provider = provider;
  }

  async generateResponse(history: ConversationTurn[]): Promise<string> {
    if (this.provider === "openai") {
      return this.runOpenAI(history);
    } else {
      return this.runGemini(history);
    }
  }

  private async runOpenAI(history: ConversationTurn[]): Promise<string> {
    const openai = getOpenAI();
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: this.prompt.systemPrompt },
      ...history.map((turn) => ({
        role: turn.role === "agent" ? "assistant" : "user",
        content: turn.content,
      } as const)),
    ];

    const response = await openai.chat.completions.create({
        model: "gpt-4o", // Or allow configuring the model
        messages,
        temperature: 0.6,
    });

    return response.choices[0]?.message?.content || "";
  }

  private async runGemini(history: ConversationTurn[]): Promise<string> {
    const geminiClient = getGemini();
    if (!geminiClient) {
        throw new Error("Gemini client not initialized (missing API key?)");
    }
    
    // Using @google/genai SDK pattern
    try {
        const model = "gemini-1.5-flash";
        
        // Construct the full prompt from history for a stateless call 
        // OR map to the SDK's expected content format.
        // The @google/genai SDK 'contents' usually expects an array of Content objects.
        // Content object: { role: string, parts: Part[] }
        
        const contents = [
             // System prompt is often passed as 'system_instruction' config or just prepended.
             // @google/genai might support 'config.systemInstruction'.
             // Let's try to map the history.
             ...history.map(turn => ({
                 role: turn.role === "agent" ? "model" : "user",
                 parts: [{ text: turn.content }]
             }))
        ];

        // The input for the next turn is implied to be generating the 'model' response
        // based on the conversation so far.
        // However, 'generateContent' generates a response.
        
        const response = await geminiClient.models.generateContent({
            model: model,
            contents: contents, // Pass the conversation history
            config: {
                systemInstruction: {
                    parts: [ { text: this.prompt.systemPrompt } ]
                }
            }
        });

        // The response structure for @google/genai might differ slightly
        // Usually response.text is a getter or string
        if (response.text) {
             return response.text;
        } else {
             // Fallback inspecting structure
             return JSON.stringify(response);
        }

    } catch (e) {
        console.error("Gemini Error:", e);
        return "Error calling Gemini";
    }
  }
}
