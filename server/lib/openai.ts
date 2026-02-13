import OpenAI from "openai";

// Lazy OpenAI client – delays initialization until first usage to avoid crashing
// when AI_INTEGRATIONS_OPENAI_API_KEY/OPENAI_API_KEY is not set.
let _instance: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_instance) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.");
    }
    _instance = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey,
      timeout: 120_000, // 2 minute timeout (down from 10 minute default)
      maxRetries: 2,    // SDK-level retries for transient errors
    });
  }
  return _instance;
}

export default new Proxy({} as OpenAI, {
  get(_target, prop: string) {
    const client = getClient();
    // @ts-expect-error proxy forwarding
    return client[prop];
  },
});
