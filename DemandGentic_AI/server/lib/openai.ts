import OpenAI from "openai";

// Shared AI client — Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
// DeepSeek and Kimi handle most of the AI load; OpenAI is kept as emergency fallback only.
let _instance: OpenAI | null = null;

/** Which model to use with the resolved client */
export let resolvedModel: string = "deepseek-chat";

function getClient(): OpenAI {
  if (!_instance) {
    // DeepSeek primary — cost-effective, high quality, handles most load
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      _instance = new OpenAI({
        apiKey: deepseekKey,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        timeout: 120_000,
        maxRetries: 2,
      });
      resolvedModel = "deepseek-chat";
      return _instance;
    }

    // Kimi fallback — strong for research and analysis
    const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (kimiKey) {
      _instance = new OpenAI({
        apiKey: kimiKey,
        baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1",
        timeout: 180_000,
        maxRetries: 2,
      });
      resolvedModel = process.env.KIMI_STANDARD_MODEL || "moonshot-v1-32k";
      return _instance;
    }

    // OpenAI last resort
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("No AI API key configured. Set DEEPSEEK_API_KEY, KIMI_API_KEY, or OPENAI_API_KEY.");
    }
    _instance = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey,
      timeout: 120_000,
      maxRetries: 2,
    });
    resolvedModel = "gpt-4o-mini";
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