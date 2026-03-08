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

async function runSingleFileEdit(
  request: OpsCodeAgentRequest,
): Promise<OpsCodeAgentResponse> {
  if (!request.selectedFilePath) {
    return {
      provider: "system",
      summary: "Select a workspace file before asking for an edit.",
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

  let response;
  try {
    response = await requestAgentResponse(
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
  } catch (error) {
    return {
      provider: "system",
      summary: formatOpsAgentErrorMessage(
        error,
        "The coding agent failed to generate an edit.",
      ),
      path: request.selectedFilePath,
      applied: false,
      changed: false,
    };
  }

  let payload: SingleFileEditPayload;
  try {
    payload = JSON.parse(response.content) as SingleFileEditPayload;
  } catch {
    return {
      provider: "system",
      summary: `The ${response.provider} response could not be parsed as a file edit.`,
      path: request.selectedFilePath,
      applied: false,
      changed: false,
    };
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
      summary: formatOpsAgentErrorMessage(
        error,
        "The coding agent failed to generate a response.",
      ),
      path: request.selectedFilePath || null,
      applied: false,
      changed: false,
    };
  }
}
