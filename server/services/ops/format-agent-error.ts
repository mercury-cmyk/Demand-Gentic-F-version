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
    return message;
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
    status === 401 ||
    status === 403 ||
    normalized.includes("incorrect api key") ||
    normalized.includes("invalid x-api-key") ||
    normalized.includes("authentication") ||
    providerMessage?.includes("authentication")
  ) {
    return "AI provider authentication failed. Check Codex, Claude, and Gemini credentials.";
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
