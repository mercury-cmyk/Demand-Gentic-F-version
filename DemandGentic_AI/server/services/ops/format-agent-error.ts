function extractJsonCandidate(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart === -1) {
    return null;
  }

  return trimmed.slice(jsonStart);
}

function parseErrorPayload(message: string): {
  status?: number;
  code?: number | string;
  providerMessage?: string;
} | null {
  const candidate = extractJsonCandidate(message);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as {
      error?: {
        message?: unknown;
        code?: unknown;
        status?: unknown;
      };
      message?: unknown;
      code?: unknown;
      status?: unknown;
    };

    const details = parsed.error && typeof parsed.error === "object"
      ? parsed.error
      : parsed;
    const statusValue = details.status ?? parsed.status;
    const codeValue = details.code ?? parsed.code;
    const providerMessageValue = details.message ?? parsed.message;

    return {
      status:
        typeof statusValue === "number"
          ? statusValue
          : typeof codeValue === "number"
            ? codeValue
            : undefined,
      code:
        typeof codeValue === "number" || typeof codeValue === "string"
          ? codeValue
          : undefined,
      providerMessage:
        typeof providerMessageValue === "string"
          ? providerMessageValue.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

function formatAggregatedProviderFailureMessage(message: string): string {
  if (!message.includes("All configured coding agent providers failed.")) {
    return message;
  }

  const summary = message.replace(
    "All configured coding agent providers failed.",
    "",
  ).trim();

  if (!summary) {
    return "AgentX could not reach any configured coding provider. Check Codex, Claude, Gemini, Kimi, and DeepSeek runtime settings.";
  }

  const providerLines = summary
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const normalized = segment.toLowerCase();

      if (normalized.startsWith("codex: authentication failed")) {
        return "Codex authentication failed. Check AI_INTEGRATIONS_OPENAI_API_KEY / OPENAI_API_KEY, or switch OPS_HUB_CODEX_TRANSPORT to github_models and set GITHUB_MODELS_TOKEN.";
      }

      if (normalized.startsWith("claude: authentication failed")) {
        return "Claude authentication failed. Check AI_INTEGRATIONS_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY.";
      }

      if (normalized.startsWith("kimi: authentication failed")) {
        return "Kimi authentication failed. Check KIMI_API_KEY / MOONSHOT_API_KEY.";
      }

      if (normalized.startsWith("deepseek: authentication failed")) {
        return "DeepSeek authentication failed. Check DEEPSEEK_API_KEY.";
      }

      if (
        normalized.startsWith("gemini: endpoint or model configuration returned 404")
      ) {
        return "Gemini returned 404. Check AI_INTEGRATIONS_GEMINI_BASE_URL and OPS_HUB_GEMINI_MODEL. If you did not override them, verify the Gemini API key and project access.";
      }

      if (normalized.startsWith("codex: not configured")) {
        return "Codex is not configured. Add an OpenAI API key or GitHub Models token for Ops Hub.";
      }

      if (normalized.startsWith("claude: not configured")) {
        return "Claude is not configured. Add AI_INTEGRATIONS_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.";
      }

      if (normalized.startsWith("gemini: not configured")) {
        return "Gemini is not configured. Add AI_INTEGRATIONS_GEMINI_API_KEY, GOOGLE_AI_API_KEY, or GEMINI_API_KEY.";
      }

      if (normalized.startsWith("kimi: not configured")) {
        return "Kimi is not configured. Add KIMI_API_KEY or MOONSHOT_API_KEY.";
      }

      if (normalized.startsWith("deepseek: not configured")) {
        return "DeepSeek is not configured. Add DEEPSEEK_API_KEY.";
      }

      return segment;
    });

  return [
    "AgentX could not reach any configured coding provider.",
    ...providerLines.map((line) => `- ${line}`),
  ].join("\n");
}

export function formatOpsAgentErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();

  if (!message) {
    return fallbackMessage;
  }

  if (message.includes("All configured coding agent providers failed.")) {
    return formatAggregatedProviderFailureMessage(message);
  }

  const normalized = message.toLowerCase();
  const parsed = parseErrorPayload(message);
  const status =
    typeof (error as { status?: unknown } | null)?.status === "number"
      ? ((error as { status: number }).status)
      : parsed?.status;
  const code = parsed?.code;
  const providerMessage = parsed?.providerMessage?.toLowerCase();

  if (
    normalized.includes("could not load the default credentials") ||
    normalized.includes("google_application_credentials") ||
    normalized.includes("failed to retrieve access token") ||
    normalized.includes("failed to refresh access token")
  ) {
    return "AgentX could not authenticate with Vertex AI. Check GOOGLE_APPLICATION_CREDENTIALS or the runtime service account permissions.";
  }

  if (
    status === 401 ||
    status === 403 ||
    normalized.includes("incorrect api key") ||
    normalized.includes("invalid x-api-key") ||
    normalized.includes("authentication") ||
    providerMessage?.includes("authentication")
  ) {
    return "AI provider authentication failed. Check Codex, Claude, Gemini, Kimi, and DeepSeek credentials.";
  }

  if (
    status === 404 ||
    code === 404 ||
    normalized.includes('"status":"not found"') ||
    providerMessage === "not found"
  ) {
    return "AI provider endpoint or model configuration returned 404. Check Gemini endpoint and model settings.";
  }

  return message;
}