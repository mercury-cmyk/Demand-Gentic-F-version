import type {
  AgentRequest,
  AgentOptimizationProfile,
  LLMProvider,
  ProviderMode,
} from "../multi-provider-agent";
import { formatOpsAgentErrorMessage } from "./format-agent-error";
import { readWorkspaceFile, writeWorkspaceFile } from "./runtime";

export interface OpsCodeAgentRequest {
  prompt: string;
  mode?: "simple-edit" | "debug" | "deploy" | "general";
  selectedFilePath?: string | null;
  selectedFileContent?: string | null;
  applyChanges?: boolean;
  providerMode?: ProviderMode;
  preferredProvider?: LLMProvider | null;
  optimizationProfile?: AgentOptimizationProfile;
}

export interface OpsCodeAgentResponse {
  provider: string;
  model?: string;
  transport?: string;
  summary: string;
  path: string | null;
  applied: boolean;
  changed: boolean;
  updatedContent?: string;
  modifiedAt?: string;
}

type SingleFileEditPayload = {
  summary?: unknown;
  updatedContent?: unknown;
};

type AgentRuntimeResponse = {
  provider: string;
  model?: string;
  transport?: string;
  content: string;
};

async function requestAgentResponse(
  agentOptions: Pick<
    AgentRequest,
    "maxTokens" | "temperature" | "responseFormat" | "systemPrompt"
  >,
  prompt: string,
  mode: OpsCodeAgentRequest["mode"],
  selection: Pick<
    OpsCodeAgentRequest,
    "providerMode" | "preferredProvider" | "optimizationProfile"
  >,
  context?: Record<string, unknown>,
) {
  const { getOrchestrator } = await import("../multi-provider-agent.js");

  return getOrchestrator().execute({
    prompt,
    task:
      mode === "simple-edit"
        ? "code"
        : mode === "debug"
          ? "analysis"
          : mode === "deploy"
            ? "reasoning"
            : "general",
    context,
    providerMode: selection.providerMode,
    preferredProvider: selection.preferredProvider ?? undefined,
    optimizationProfile: selection.optimizationProfile,
    ...agentOptions,
  });
}

function formatAgentXErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();

  if (!message) {
    return fallbackMessage;
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("could not load the default credentials") ||
    normalized.includes("google_application_credentials") ||
    normalized.includes("failed to retrieve access token") ||
    normalized.includes("failed to refresh access token") ||
    (normalized.includes("permission denied") &&
      (normalized.includes("aiplatform") ||
        normalized.includes("vertex ai") ||
        normalized.includes("vertexai")))
  ) {
    return "AgentX could not authenticate with Vertex AI. Check GOOGLE_APPLICATION_CREDENTIALS or the runtime service account permissions.";
  }

  return formatOpsAgentErrorMessage(error, fallbackMessage);
}

function buildCombinedFailureMessage(
  primaryFailure: string | null,
  fallbackFailure: string,
): string {
  if (!primaryFailure) {
    return fallbackFailure;
  }

  return [
    primaryFailure,
    "Fallback providers also failed:",
    fallbackFailure,
  ].join("\n\n");
}

async function requestAgentXFileEdit(
  request: OpsCodeAgentRequest,
  file: { path: string; content: string },
): Promise<{
  response: AgentRuntimeResponse;
  payload: SingleFileEditPayload;
}> {
  const { generateJSON, getVertexConfig } = await import("../vertex-ai/index.js");

  const payload = await generateJSON<SingleFileEditPayload>(
    [
      "You are AgentX, the coding operator inside Ops Hub.",
      "Edit exactly one file using only the provided file content.",
      "Return valid JSON with keys: summary and updatedContent.",
      "updatedContent must contain the full file contents after the edit.",
      "Preserve imports, formatting style, and unrelated code.",
      "If the request cannot be completed safely within this file, leave the content unchanged and explain why in summary.",
      "",
      "Edit request payload:",
      JSON.stringify(
        {
          instruction: request.prompt,
          path: file.path,
          content: file.content,
        },
        null,
        2,
      ),
    ].join("\n"),
    {
      maxTokens: 8192,
      temperature: 0.1,
    },
  );

  return {
    response: {
      provider: "agentx",
      model: getVertexConfig().models.chat,
      transport: "vertex-ai",
      content:
        typeof payload.summary === "string" && payload.summary.trim()
          ? payload.summary.trim()
          : "Updated the selected file.",
    },
    payload,
  };
}

async function requestAgentXResponse(
  request: OpsCodeAgentRequest,
): Promise<AgentRuntimeResponse> {
  const { generateText, getVertexConfig } = await import("../vertex-ai/index.js");
  const mode = request.mode || "general";
  const objective =
    mode === "debug"
      ? "Diagnose the issue, identify the root cause, and propose the narrowest safe fix."
      : mode === "deploy"
        ? "Focus on deployment steps, verification, and rollback risk."
        : "Provide concise, implementation-focused coding guidance.";

  const content = await generateText(
    [
      "You are AgentX, the coding operator inside Ops Hub.",
      objective,
      "Be concise, concrete, and action-oriented.",
      request.selectedFilePath
        ? `Selected file: ${request.selectedFilePath}`
        : "No file is currently selected.",
      request.selectedFileContent
        ? `Selected file content:\n${request.selectedFileContent}`
        : "",
      "",
      `User request:\n${request.prompt}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      maxTokens: 4096,
      temperature: 0.2,
    },
  );

  return {
    provider: "agentx",
    model: getVertexConfig().models.chat,
    transport: "vertex-ai",
    content,
  };
}

async function runSingleFileEdit(
  request: OpsCodeAgentRequest,
): Promise<OpsCodeAgentResponse> {
  if (!request.selectedFilePath) {
    return {
      provider: "system",
      summary: "Open a workspace file to enable direct edits, or switch to Plan for guidance.",
      path: null,
      applied: false,
      changed: false,
    };
  }

  const file =
    request.selectedFileContent != null
      ? {
          path: request.selectedFilePath,
          content: request.selectedFileContent,
        }
      : await readWorkspaceFile(request.selectedFilePath);

  let response: AgentRuntimeResponse;
  let payload: SingleFileEditPayload;
  let agentXFailure: string | null = null;

  try {
    const agentXResult = await requestAgentXFileEdit(request, file);
    response = agentXResult.response;
    payload = agentXResult.payload;
  } catch (agentXError) {
    agentXFailure = formatAgentXErrorMessage(
      agentXError,
      "AgentX failed to generate an edit.",
    );

    let providerResponse;
    try {
      providerResponse = await requestAgentResponse(
        {
          maxTokens: 4096,
          temperature: 0.2,
          responseFormat: "json",
          systemPrompt: [
            "You are a precise code editor working on a single file.",
            "Apply the user's request only to the provided file content.",
            "Return valid JSON with keys: summary and updatedContent.",
            "updatedContent must contain the complete file contents after the edit.",
            "Do not wrap the file or JSON in markdown fences.",
            "Preserve imports, formatting style, and unrelated code.",
          ].join(" "),
        },
        JSON.stringify({
          instruction: request.prompt,
          path: request.selectedFilePath,
          content: file.content,
        }),
        request.mode,
        request,
        {
          selectedFilePath: request.selectedFilePath,
        },
      );
    } catch (providerError) {
      return {
        provider: "system",
        summary: buildCombinedFailureMessage(
          agentXFailure,
          formatOpsAgentErrorMessage(
            providerError,
            "The coding agent failed to generate an edit.",
          ),
        ),
        path: request.selectedFilePath,
        applied: false,
        changed: false,
      };
    }

    response = providerResponse;
    try {
      payload = JSON.parse(providerResponse.content) as SingleFileEditPayload;
    } catch {
      return {
        provider: "system",
        summary: `The ${providerResponse.provider} response could not be parsed as a file edit.`,
        path: request.selectedFilePath,
        applied: false,
        changed: false,
      };
    }
  }

  const updatedContent =
    typeof payload.updatedContent === "string"
      ? payload.updatedContent
      : file.content;
  const summary =
    typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : "Updated the selected file.";
  const changed = updatedContent !== file.content;

  if (!request.applyChanges || !changed) {
    return {
      provider: response.provider,
      model: response.model,
      transport: response.transport,
      summary,
      path: request.selectedFilePath,
      applied: false,
      changed,
      updatedContent,
    };
  }

  const savedFile = await writeWorkspaceFile(request.selectedFilePath, updatedContent);
  return {
    provider: response.provider,
    model: response.model,
    transport: response.transport,
    summary,
    path: request.selectedFilePath,
    applied: true,
    changed,
    updatedContent: savedFile.content,
    modifiedAt: savedFile.modifiedAt,
  };
}

export async function runOpsCodeAgent(
  request: OpsCodeAgentRequest,
): Promise<OpsCodeAgentResponse> {
  if ((request.mode || "general") === "simple-edit") {
    return runSingleFileEdit(request);
  }

  let agentXFailure: string | null = null;
  try {
    const response = await requestAgentXResponse(request);

    return {
      provider: response.provider,
      model: response.model,
      transport: response.transport,
      summary: response.content,
      path: request.selectedFilePath || null,
      applied: false,
      changed: false,
    };
  } catch (error) {
    agentXFailure = formatAgentXErrorMessage(
      error,
      "AgentX failed to generate a response.",
    );
  }

  try {
    const response = await requestAgentResponse(
      {},
      request.prompt,
      request.mode,
      request,
      request.selectedFilePath
        ? {
            selectedFilePath: request.selectedFilePath,
            selectedFileContent: request.selectedFileContent,
          }
        : undefined,
    );

    return {
      provider: response.provider,
      model: response.model,
      transport: response.transport,
      summary: response.content,
      path: request.selectedFilePath || null,
      applied: false,
      changed: false,
    };
  } catch (error) {
    return {
      provider: "system",
      summary: buildCombinedFailureMessage(
        agentXFailure,
        formatOpsAgentErrorMessage(
          error,
          "The coding agent failed to generate a response.",
        ),
      ),
      path: request.selectedFilePath || null,
      applied: false,
      changed: false,
    };
  }
}
