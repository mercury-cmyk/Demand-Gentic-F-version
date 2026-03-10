import type {
  AgentRequest,
  AgentOptimizationProfile,
  LLMProvider,
  ProviderMode,
} from "../multi-provider-agent";
import type { CollaborativeOrchestration } from "./collaborative-code-agent";
import {
  runCollaborativeMultiFileEdit,
  runCollaborativePlan,
  runCollaborativeSingleFileEdit,
} from "./collaborative-code-agent";
import { formatOpsAgentErrorMessage } from "./format-agent-error";
import { readWorkspaceFile, writeWorkspaceFile, writeMultipleWorkspaceFiles } from "./runtime";

export interface OpsCodeAgentRequest {
  prompt: string;
  mode?: "simple-edit" | "multi-edit" | "debug" | "deploy" | "general" | "plan";
  selectedFilePath?: string | null;
  selectedFileContent?: string | null;
  /** Additional workspace file paths to include as context */
  contextFilePaths?: string[];
  applyChanges?: boolean;
  providerMode?: ProviderMode;
  preferredProvider?: LLMProvider | null;
  optimizationProfile?: AgentOptimizationProfile;
}

export interface OpsCodeAgentFileEdit {
  path: string;
  content: string;
  isNew?: boolean;
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
  /** Multi-file edits when in multi-edit mode */
  fileEdits?: OpsCodeAgentFileEdit[];
  orchestrationMode?: "ensemble" | "single";
  orchestration?: CollaborativeOrchestration;
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

type OpsCodeAgentMode = NonNullable<OpsCodeAgentRequest["mode"]>;
type AgentTask = "code" | "analysis" | "reasoning" | "general";

const AGENTX_SHARED_BASE_PROMPT = [
  "You are AgentX - The Architect, the primary coding and planning agent inside Ops Hub.",
  "",
  "Mission:",
  "- deliver correct, minimal, defensible engineering outcomes",
  "- use provided context carefully and never invent missing repository state",
  "- prioritize safe progress over broad speculation",
  "",
  "Working principles:",
  "- understand the request before acting",
  "- distinguish facts, reasonable inferences, and unknowns",
  "- make low-risk assumptions only when they do not change behavior materially",
  "- surface high-risk ambiguity instead of guessing",
  "- prefer the narrowest complete solution",
  "- follow existing patterns visible in the provided file and context",
  "- preserve unrelated behavior, interfaces, formatting style, comments, and naming unless a change is required",
  "",
  "Quality bar:",
  "- correctness before cleverness",
  "- clarity before compression",
  "- maintainability before novelty",
  "- reversibility for risky changes",
  "- note material trade-offs, edge cases, and missing validation only when they affect the outcome",
  "",
  "Safety rules:",
  "- do not invent files, APIs, commands, logs, tests, or deployments",
  "- do not claim code was run, verified, or shipped unless that result is explicitly available",
  "- do not imply multi-file completion from single-file context",
  "- do not silently broaden scope",
  "- if blocked, explain the exact blocker and the next best action",
  "- avoid reproducing sensitive secrets or credentials",
  "",
  "Reasoning discipline:",
  "- reason carefully and step by step internally",
  "- provide conclusions, decisions, and concrete actions",
  "- do not expose hidden chain-of-thought",
  "- before finalizing, check for obvious syntax, naming, import, type, nullability, async, and logic issues within the visible context",
  "",
  "Communication style:",
  "- concise",
  "- direct",
  "- factual",
  "- implementation-focused",
  "- no filler, no marketing language",
].join("\n");

const AGENTX_AGENT_MODE_PROMPT = [
  "Mode: Agent",
  "",
  "Use this mode when the user wants a direct code change and a workspace file is selected.",
  "",
  "Execution rules:",
  "- treat the selected file path and selected file content as the source of truth",
  "- edit only the selected file",
  "- make the smallest safe change that fully satisfies the request",
  "- preserve unrelated code and local conventions",
  "- do not perform opportunistic cleanup or large rewrites unless required for correctness",
  "- if the correct solution depends on other files, unseen types, external runtime behavior, or repository-wide changes, do not fake completion",
  "- if no safe single-file edit is possible, leave the file unchanged and explain why briefly",
  "- if no file is selected and editing is required, instruct the user to open a workspace file or switch to Plan mode",
  "",
  "Response contract:",
  '- return valid JSON only',
  '- use exactly these keys: "summary" and "updatedContent"',
  '- "summary" must briefly state what changed, or why no safe change was made',
  '- "updatedContent" must contain the complete final contents of the selected file',
  '- if blocked or unsafe, return the original content unchanged in "updatedContent"',
].join("\n");

const AGENTX_MULTI_EDIT_MODE_PROMPT = [
  "Mode: Multi-File Edit",
  "",
  "Use this mode when the user wants changes across multiple files, or wants to create new files.",
  "",
  "Execution rules:",
  "- you may edit multiple existing files and create new files",
  "- treat the provided file contents as the source of truth",
  "- make the smallest safe changes that fully satisfy the request",
  "- preserve unrelated code and local conventions",
  "- for new files, provide the complete file content",
  "- for existing files, provide the complete updated file content",
  "- do not invent files or APIs that are not in the provided context",
  "",
  "Response contract:",
  '- return valid JSON only',
  '- use exactly these keys: "summary" and "files"',
  '- "summary" must briefly state what changed across all files',
  '- "files" must be an array of objects, each with "path" (string), "content" (string), and "isNew" (boolean)',
  '- "path" must be a relative workspace path (e.g. "src/utils/helpers.ts")',
  '- "content" must contain the complete final contents of the file',
  '- "isNew" is true only for files being created, false for edits to existing files',
  '- only include files that were actually changed or created',
].join("\n");

const AGENTX_PLAN_MODE_PROMPT = [
  "Mode: Plan",
  "",
  "Use this mode when no file is selected, when the task likely spans multiple files, or when the user wants guidance before edits.",
  "",
  "Planning rules:",
  "- do not edit files",
  "- use the selected file only as context if one is provided",
  "- produce a concrete implementation plan, not a generic explanation",
  "- favor the safest path with the fewest moving parts",
  "- identify likely files, dependencies, risks, and verification steps",
  "- make assumptions explicit when needed",
  "- if critical information is missing, state the blocker plainly and give the next best path forward",
  "",
  "Response format:",
  "Return a concise plan with these sections:",
  "1. Goal",
  "2. Known Context",
  "3. Assumptions",
  "4. Proposed Changes",
  "5. Execution Steps",
  "6. Risks",
  "7. Verification",
  "",
  "Style:",
  "- keep it short",
  "- prefer specific steps over theory",
  "- be operational and decision-oriented",
].join("\n");

function resolveMode(mode?: OpsCodeAgentRequest["mode"]): OpsCodeAgentMode {
  return mode ?? "general";
}

function getAgentTask(mode?: OpsCodeAgentRequest["mode"]): AgentTask {
  const resolvedMode = resolveMode(mode);

  if (resolvedMode === "simple-edit" || resolvedMode === "multi-edit") {
    return "code";
  }

  if (resolvedMode === "debug") {
    return "analysis";
  }

  if (resolvedMode === "deploy" || resolvedMode === "plan") {
    return "reasoning";
  }

  return "general";
}

function buildSelectedFileContext(
  selectedFilePath?: string | null,
  selectedFileContent?: string | null,
): string {
  return [
    selectedFilePath
      ? `Selected file path: ${selectedFilePath}`
      : "Selected file path: none",
    typeof selectedFileContent === "string"
      ? `Selected file content:\n${selectedFileContent}`
      : "Selected file content: unavailable",
  ].join("\n\n");
}

function buildPlanFocus(mode?: OpsCodeAgentRequest["mode"]): string {
  const resolvedMode = resolveMode(mode);

  if (resolvedMode === "debug") {
    return [
      "Plan emphasis:",
      "- diagnose the most likely root cause",
      "- identify the narrowest safe fix",
      "- call out observability gaps and regression checks",
    ].join("\n");
  }

  if (resolvedMode === "deploy") {
    return [
      "Plan emphasis:",
      "- focus on deployment steps, dependencies, and rollout order",
      "- include verification and rollback considerations",
      "- note environment or credential prerequisites",
    ].join("\n");
  }

  return [
    "Plan emphasis:",
    "- produce an implementation-ready engineering plan",
    "- favor the smallest safe solution",
    "- call out likely files, dependencies, and validation steps",
  ].join("\n");
}

function buildAgentFileEditPrompt(
  request: OpsCodeAgentRequest,
  file: { path: string; content: string },
): string {
  return [
    AGENTX_SHARED_BASE_PROMPT,
    "",
    AGENTX_AGENT_MODE_PROMPT,
    "",
    "Context:",
    buildSelectedFileContext(file.path, file.content),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildMultiFileContext(
  files: Array<{ path: string; content: string }>,
): string {
  if (files.length === 0) return "No workspace files provided.";
  return files
    .map((f) => `--- File: ${f.path} ---\n${f.content}\n--- End: ${f.path} ---`)
    .join("\n\n");
}

function buildMultiEditPrompt(
  request: OpsCodeAgentRequest,
  files: Array<{ path: string; content: string }>,
): string {
  return [
    AGENTX_SHARED_BASE_PROMPT,
    "",
    AGENTX_MULTI_EDIT_MODE_PROMPT,
    "",
    "Workspace files:",
    buildMultiFileContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildPlanResponsePrompt(request: OpsCodeAgentRequest): string {
  return [
    AGENTX_SHARED_BASE_PROMPT,
    "",
    AGENTX_PLAN_MODE_PROMPT,
    "",
    buildPlanFocus(request.mode),
    "",
    "Context:",
    buildSelectedFileContext(
      request.selectedFilePath,
      request.selectedFileContent,
    ),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

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
    task: getAgentTask(mode),
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

async function collectContextFiles(
  request: Pick<
    OpsCodeAgentRequest,
    "selectedFilePath" | "selectedFileContent" | "contextFilePaths"
  >,
): Promise<Array<{ path: string; content: string }>> {
  const contextFiles: Array<{ path: string; content: string }> = [];

  if (request.selectedFilePath) {
    const fileContent =
      request.selectedFileContent ??
      (await readWorkspaceFile(request.selectedFilePath)
        .then((file) => file.content)
        .catch(() => null));
    if (fileContent !== null) {
      contextFiles.push({
        path: request.selectedFilePath,
        content: fileContent,
      });
    }
  }

  if (request.contextFilePaths?.length) {
    for (const filePath of request.contextFilePaths) {
      if (contextFiles.some((file) => file.path === filePath)) {
        continue;
      }

      try {
        const file = await readWorkspaceFile(filePath);
        contextFiles.push({ path: filePath, content: file.content });
      } catch {
        // Skip unreadable files and keep the collaborative run scoped to valid context.
      }
    }
  }

  return contextFiles;
}

async function requestAgentXFileEdit(
  request: OpsCodeAgentRequest,
  file: { path: string; content: string },
): Promise<{
  response: AgentRuntimeResponse;
  payload: SingleFileEditPayload;
}> {
  // Try Kimi first, fall back to Vertex AI
  const { isKimiConfigured, kimiGenerateJSON } = await import("../kimi-client.js");

  if (isKimiConfigured()) {
    try {
      const payload = await kimiGenerateJSON<SingleFileEditPayload>(
        buildAgentFileEditPrompt(request, file),
        { maxTokens: 8192, temperature: 0.1, model: "standard" },
      );

      return {
        response: {
          provider: "agentx",
          model: "moonshot-v1-32k",
          transport: "kimi",
          content:
            typeof payload.summary === "string" && payload.summary.trim()
              ? payload.summary.trim()
              : "Updated the selected file.",
        },
        payload,
      };
    } catch (kimiErr) {
      console.warn("[CodeAgent] Kimi file-edit failed, falling back to Vertex AI:", (kimiErr as Error).message);
    }
  }

  const { generateJSON, getVertexConfig } = await import("../vertex-ai/index.js");

  const payload = await generateJSON<SingleFileEditPayload>(
    buildAgentFileEditPrompt(request, file),
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
  // Try Kimi first, fall back to Vertex AI
  const { isKimiConfigured, kimiChat } = await import("../kimi-client.js");

  if (isKimiConfigured()) {
    try {
      const content = await kimiChat(
        buildPlanResponsePrompt(request),
        [],
        { maxTokens: 4096, temperature: 0.2, model: "standard" },
      );

      return {
        provider: "agentx",
        model: "moonshot-v1-32k",
        transport: "kimi",
        content,
      };
    } catch (kimiErr) {
      console.warn("[CodeAgent] Kimi response failed, falling back to Vertex AI:", (kimiErr as Error).message);
    }
  }

  const { generateText, getVertexConfig } = await import("../vertex-ai/index.js");
  const content = await generateText(buildPlanResponsePrompt(request), {
    maxTokens: 4096,
    temperature: 0.2,
  });

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
      summary:
        "Open a workspace file to enable Agent mode edits, or switch to Plan mode for guidance.",
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

  let collaborativeFailure: string | null = null;
  try {
    const collaborative = await runCollaborativeSingleFileEdit(request, file);
    if (collaborative) {
      const changed = collaborative.updatedContent !== file.content;

      if (!request.applyChanges || !changed) {
        return {
          provider: "ensemble",
          model: collaborative.model,
          transport: collaborative.transport
            ? `multi-agent/${collaborative.transport}`
            : "multi-agent",
          summary: collaborative.summary,
          path: request.selectedFilePath,
          applied: false,
          changed,
          updatedContent: collaborative.updatedContent,
          orchestrationMode: "ensemble",
          orchestration: collaborative.orchestration,
        };
      }

      const savedFile = await writeWorkspaceFile(
        request.selectedFilePath,
        collaborative.updatedContent,
      );
      return {
        provider: "ensemble",
        model: collaborative.model,
        transport: collaborative.transport
          ? `multi-agent/${collaborative.transport}`
          : "multi-agent",
        summary: collaborative.summary,
        path: request.selectedFilePath,
        applied: true,
        changed,
        updatedContent: savedFile.content,
        modifiedAt: savedFile.modifiedAt,
        orchestrationMode: "ensemble",
        orchestration: collaborative.orchestration,
      };
    }
  } catch (error) {
    collaborativeFailure = formatOpsAgentErrorMessage(
      error,
      "Collaborative orchestration failed to generate an edit.",
    );
    console.warn("[CodeAgent] Collaborative single-file edit failed:", collaborativeFailure);
  }

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
            AGENTX_SHARED_BASE_PROMPT,
            "",
            AGENTX_AGENT_MODE_PROMPT,
          ].join("\n"),
        },
        JSON.stringify({
          selectedFilePath: request.selectedFilePath,
          selectedFileContent: file.content,
          userRequest: request.prompt,
        }, null, 2),
        request.mode,
        request,
        {
          selectedFilePath: request.selectedFilePath,
          selectedFileContent: file.content,
        },
      );
    } catch (providerError) {
      const singleProviderFailure = buildCombinedFailureMessage(
        agentXFailure,
        formatOpsAgentErrorMessage(
          providerError,
          "The coding agent failed to generate an edit.",
        ),
      );
      return {
        provider: "system",
        summary: buildCombinedFailureMessage(
          collaborativeFailure,
          singleProviderFailure,
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
      orchestrationMode: "single",
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
    orchestrationMode: "single",
  };
}

type MultiFileEditPayload = {
  summary?: unknown;
  files?: unknown;
};

async function runMultiFileEdit(
  request: OpsCodeAgentRequest,
): Promise<OpsCodeAgentResponse> {
  const contextFiles = await collectContextFiles(request);

  if (contextFiles.length === 0) {
    return {
      provider: "system",
      summary: "Open one or more workspace files to enable multi-file editing.",
      path: null,
      applied: false,
      changed: false,
    };
  }

  try {
    const collaborative = await runCollaborativeMultiFileEdit(
      request,
      contextFiles,
    );
    if (collaborative) {
      if (!request.applyChanges || collaborative.fileEdits.length === 0) {
        return {
          provider: "ensemble",
          model: collaborative.model,
          transport: collaborative.transport
            ? `multi-agent/${collaborative.transport}`
            : "multi-agent",
          summary: collaborative.summary,
          path: request.selectedFilePath || null,
          applied: false,
          changed: collaborative.fileEdits.length > 0,
          fileEdits: collaborative.fileEdits,
          orchestrationMode: "ensemble",
          orchestration: collaborative.orchestration,
        };
      }

      await writeMultipleWorkspaceFiles(
        collaborative.fileEdits.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      );

      return {
        provider: "ensemble",
        model: collaborative.model,
        transport: collaborative.transport
          ? `multi-agent/${collaborative.transport}`
          : "multi-agent",
        summary: collaborative.summary,
        path: request.selectedFilePath || null,
        applied: true,
        changed: true,
        fileEdits: collaborative.fileEdits,
        orchestrationMode: "ensemble",
        orchestration: collaborative.orchestration,
      };
    }
  } catch (error) {
    console.warn(
      "[CodeAgent] Collaborative multi-file edit failed:",
      formatOpsAgentErrorMessage(
        error,
        "Collaborative orchestration failed to generate multi-file edits.",
      ),
    );
  }

  const prompt = buildMultiEditPrompt(request, contextFiles);

  // Try Kimi first, fall back to Vertex AI
  let payload: MultiFileEditPayload;
  let provider = "agentx";
  let model: string | undefined;
  let transport: string | undefined;

  const { isKimiConfigured, kimiGenerateJSON } = await import("../kimi-client.js");

  if (isKimiConfigured()) {
    try {
      payload = await kimiGenerateJSON<MultiFileEditPayload>(prompt, {
        maxTokens: 16384,
        temperature: 0.1,
        model: "standard",
      });
      model = "moonshot-v1-32k";
      transport = "kimi";
    } catch (kimiErr) {
      console.warn("[CodeAgent] Kimi multi-edit failed, falling back:", (kimiErr as Error).message);
      const { generateJSON, getVertexConfig } = await import("../vertex-ai/index.js");
      payload = await generateJSON<MultiFileEditPayload>(prompt, {
        maxTokens: 16384,
        temperature: 0.1,
      });
      model = getVertexConfig().models.chat;
      transport = "vertex-ai";
    }
  } else {
    const { generateJSON, getVertexConfig } = await import("../vertex-ai/index.js");
    payload = await generateJSON<MultiFileEditPayload>(prompt, {
      maxTokens: 16384,
      temperature: 0.1,
    });
    model = getVertexConfig().models.chat;
    transport = "vertex-ai";
  }

  const summary =
    typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : "Applied multi-file changes.";

  const rawFiles = Array.isArray(payload.files) ? payload.files : [];
  const fileEdits: OpsCodeAgentFileEdit[] = rawFiles
    .filter(
      (f: any): f is { path: string; content: string; isNew?: boolean } =>
        typeof f?.path === "string" && typeof f?.content === "string",
    )
    .map((f) => ({
      path: f.path,
      content: f.content,
      isNew: Boolean(f.isNew),
    }));

  if (!request.applyChanges || fileEdits.length === 0) {
    return {
      provider,
      model,
      transport,
      summary,
      path: request.selectedFilePath || null,
      applied: false,
      changed: fileEdits.length > 0,
      fileEdits,
      orchestrationMode: "single",
    };
  }

  // Apply all file edits
  await writeMultipleWorkspaceFiles(
    fileEdits.map((f) => ({ path: f.path, content: f.content })),
  );

  return {
    provider,
    model,
    transport,
    summary,
    path: request.selectedFilePath || null,
    applied: true,
    changed: true,
    fileEdits,
    orchestrationMode: "single",
  };
}

export async function runOpsCodeAgent(
  request: OpsCodeAgentRequest,
): Promise<OpsCodeAgentResponse> {
  const resolvedMode = request.mode || "general";

  if (resolvedMode === "simple-edit") {
    return runSingleFileEdit(request);
  }

  if (resolvedMode === "multi-edit") {
    return runMultiFileEdit(request);
  }

  try {
    const collaborative = await runCollaborativePlan(
      request,
      await collectContextFiles(request),
    );
    if (collaborative) {
      return {
        provider: "ensemble",
        model: collaborative.model,
        transport: collaborative.transport
          ? `multi-agent/${collaborative.transport}`
          : "multi-agent",
        summary: collaborative.summary,
        path: request.selectedFilePath || null,
        applied: false,
        changed: false,
        orchestrationMode: "ensemble",
        orchestration: collaborative.orchestration,
      };
    }
  } catch (error) {
    console.warn(
      "[CodeAgent] Collaborative planning failed:",
      formatOpsAgentErrorMessage(
        error,
        "Collaborative orchestration failed to generate a plan.",
      ),
    );
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
      orchestrationMode: "single",
    };
  } catch (error) {
    agentXFailure = formatAgentXErrorMessage(
      error,
      "AgentX failed to generate a response.",
    );
  }

  try {
    const response = await requestAgentResponse(
      {
        systemPrompt: [
          AGENTX_SHARED_BASE_PROMPT,
          "",
          AGENTX_PLAN_MODE_PROMPT,
          "",
          buildPlanFocus(request.mode),
        ].join("\n"),
      },
      [
        "Context:",
        buildSelectedFileContext(
          request.selectedFilePath,
          request.selectedFileContent,
        ),
        "",
        `User request:\n${request.prompt}`,
      ].join("\n"),
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
      orchestrationMode: "single",
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
