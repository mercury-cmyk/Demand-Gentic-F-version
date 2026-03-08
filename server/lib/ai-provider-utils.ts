export function resolveGeminiBaseUrl(): string | undefined {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL?.trim();
  if (!baseUrl) return undefined;

  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.toLowerCase();

    // Local proxies are only valid when explicitly fronting Gemini; the SDK
    // should use its built-in endpoint for direct Google API access.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return undefined;
    }

    // Older env values used the raw Google host here. The GoogleGenAI SDK already
    // knows that endpoint and will build the correct request paths itself; forcing
    // the host causes duplicated/invalid paths and 404 responses.
    if (hostname === "generativelanguage.googleapis.com") {
      return undefined;
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
