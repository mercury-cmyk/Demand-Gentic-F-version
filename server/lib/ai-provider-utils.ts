export function resolveGeminiBaseUrl(): string | undefined {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!baseUrl) return undefined;

  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("localhost") || normalized.includes("127.0.0.1")) {
    return undefined;
  }

  return baseUrl;
}
