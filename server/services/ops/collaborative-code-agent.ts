import type {
  AgentOptimizationProfile,
  AgentResponse,
  AgentTask,
  CodingWorkflowRole,
  LLMProvider,
} from "../multi-provider-agent";
import { getOrchestrator } from "../multi-provider-agent";
import { formatOpsAgentErrorMessage } from "./format-agent-error";

export type CollaborativeCodeAgentMode =
  | "simple-edit"
  | "multi-edit"
  | "debug"
  | "deploy"
  | "general"
  | "plan";

export interface CollaborativeCodeAgentRequest {
  prompt: string;
  mode?: CollaborativeCodeAgentMode;
  selectedFilePath?: string | null;
  selectedFileContent?: string | null;
  optimizationProfile?: AgentOptimizationProfile;
}

export interface CollaborativeCodeAgentFile {
  path: string;
  content: string;
}

export interface CollaborativeStageResult {
  role: CodingWorkflowRole;
  roleLabel: string;
  purpose: string;
  requestedProvider: string;
  actualProvider?: string;
  model?: string;
  transport?: string;
  status: "completed" | "failed" | "skipped";
  summary?: string;
  error?: string;
}

export interface CollaborativeOrchestration {
  mode: "ensemble";
  summary: string;
  completedProviders: string[];
  stages: CollaborativeStageResult[];
}

export interface CollaborativeSingleFileEditResult {
  summary: string;
  updatedContent: string;
  model?: string;
  transport?: string;
  orchestration: CollaborativeOrchestration;
}

export interface CollaborativeMultiFileEditResult {
  summary: string;
  fileEdits: Array<{ path: string; content: string; isNew?: boolean }>;
  model?: string;
  transport?: string;
  orchestration: CollaborativeOrchestration;
}

export interface CollaborativeTextResult {
  summary: string;
  model?: string;
  transport?: string;
  orchestration: CollaborativeOrchestration;
}

type ArchitectureBrief = {
  summary?: string;
  implementationPlan?: string[];
  scalability?: string[];
  apiRouting?: string[];
  risks?: string[];
};

type ReasoningReview = {
  summary?: string;
  mustAddress?: string[];
  edgeCases?: string[];
  consistencyChecks?: string[];
};

type SecurityReview = {
  summary?: string;
  security?: string[];
  costEfficiency?: string[];
  operationalRisks?: string[];
};

type UxReview = {
  summary?: string;
  userExperience?: string[];
  performance?: string[];
  observability?: string[];
};

type SingleFileEditPayload = {
  summary?: unknown;
  updatedContent?: unknown;
};

type MultiFileEditPayload = {
  summary?: unknown;
  files?: unknown;
};

const COLLABORATIVE_BASE_PROMPT = [
  "You are part of AgentC collaborative coding orchestration.",
  "Work from the provided repository context only.",
  "Do not invent files, APIs, validation, runtime behavior, or test results.",
  "Prefer the smallest safe solution that fully satisfies the request.",
  "Preserve unrelated code, naming, formatting, and comments unless a change is required.",
  "Surface real risks, security gaps, performance concerns, and architectural tradeoffs only when they materially matter.",
  "Be concise, technical, and operational.",
].join("\n");

function resolveMode(
  mode?: CollaborativeCodeAgentRequest["mode"],
): CollaborativeCodeAgentMode {
  return mode ?? "general";
}

function getTaskForMode(
  mode?: CollaborativeCodeAgentRequest["mode"],
): AgentTask {
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

function cleanJsonText(content: string): string {
  return content
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function parseJsonPayload<T>(content: string): T | null {
  try {
    return JSON.parse(cleanJsonText(content)) as T;
  } catch {
    return null;
  }
}

function clampList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 5);
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

function buildWorkspaceContext(
  files: CollaborativeCodeAgentFile[],
): string {
  if (files.length === 0) {
    return "No workspace files were provided.";
  }

  return files
    .map((file) => `--- File: ${file.path} ---\n${file.content}\n--- End File ---`)
    .join("\n\n");
}

function buildModeContext(mode?: CollaborativeCodeAgentRequest["mode"]): string {
  const resolvedMode = resolveMode(mode);

  switch (resolvedMode) {
    case "simple-edit":
      return "Task mode: single-file code edit.";
    case "multi-edit":
      return "Task mode: multi-file code edit.";
    case "debug":
      return "Task mode: debugging and root-cause analysis.";
    case "deploy":
      return "Task mode: deployment or rollout planning.";
    case "plan":
      return "Task mode: planning only. No file edits.";
    default:
      return "Task mode: general engineering assistance.";
  }
}

function summarizeCompletedStages(stages: CollaborativeStageResult[]): string {
  const completed = stages.filter((stage) => stage.status === "completed");
  if (completed.length === 0) {
    return "Collaborative orchestration did not complete any provider stages.";
  }

  return `Collaborative review: ${completed
    .map((stage) => `${stage.actualProvider || stage.requestedProvider} ${stage.roleLabel.toLowerCase()}`)
    .join(", ")}.`;
}

function buildArchitecturePrompt(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: Architecture lead.",
    "Focus on scalable implementation direction, context understanding, API routing choices, and scope control.",
    "Return valid JSON only with exactly these keys:",
    '{"summary":"string","implementationPlan":["string"],"scalability":["string"],"apiRouting":["string"],"risks":["string"]}',
    "Keep each list to at most 4 items and omit fluff.",
    "",
    buildModeContext(request.mode),
    "",
    "Selected context:",
    buildSelectedFileContext(
      request.selectedFilePath,
      request.selectedFileContent,
    ),
    "",
    "Workspace context:",
    buildWorkspaceContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildReasoningPrompt(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
  architecture: ArchitectureBrief | null,
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: Reasoning and correctness reviewer.",
    "Focus on logic, edge cases, nullability, type safety, behavior regressions, and architectural coherence.",
    "Return valid JSON only with exactly these keys:",
    '{"summary":"string","mustAddress":["string"],"edgeCases":["string"],"consistencyChecks":["string"]}',
    "",
    architecture
      ? `Architecture brief:\n${JSON.stringify(architecture, null, 2)}`
      : "Architecture brief: unavailable",
    "",
    buildModeContext(request.mode),
    "",
    "Workspace context:",
    buildWorkspaceContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildSecurityPrompt(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
  architecture: ArchitectureBrief | null,
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: Security and cost reviewer.",
    "Focus on validation, auth boundaries, secrets exposure, unsafe writes, abuse paths, query/IO cost, and operational scalability.",
    "Return valid JSON only with exactly these keys:",
    '{"summary":"string","security":["string"],"costEfficiency":["string"],"operationalRisks":["string"]}',
    "",
    architecture
      ? `Architecture brief:\n${JSON.stringify(architecture, null, 2)}`
      : "Architecture brief: unavailable",
    "",
    buildModeContext(request.mode),
    "",
    "Workspace context:",
    buildWorkspaceContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildUxPrompt(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
  architecture: ArchitectureBrief | null,
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: UX, performance, and API-routing reviewer.",
    "Focus on operator experience, responsiveness, latency-sensitive routing, observability, and maintainable control surfaces.",
    "Return valid JSON only with exactly these keys:",
    '{"summary":"string","userExperience":["string"],"performance":["string"],"observability":["string"]}',
    "",
    architecture
      ? `Architecture brief:\n${JSON.stringify(architecture, null, 2)}`
      : "Architecture brief: unavailable",
    "",
    buildModeContext(request.mode),
    "",
    "Workspace context:",
    buildWorkspaceContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildSingleFileSynthesisPrompt(
  request: CollaborativeCodeAgentRequest,
  file: CollaborativeCodeAgentFile,
  architecture: ArchitectureBrief | null,
  reasoning: ReasoningReview | null,
  security: SecurityReview | null,
  ux: UxReview | null,
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: Final implementation synthesizer.",
    "Use the collaborative guidance below to produce the smallest safe final edit.",
    "If reviewer guidance conflicts, prefer correctness, safety, and minimal scope.",
    "",
    "Response contract:",
    '- return valid JSON only',
    '- use exactly these keys: "summary" and "updatedContent"',
    '- "summary" must briefly state what changed',
    '- "updatedContent" must contain the complete final contents of the selected file',
    '- if blocked or unsafe, return the original content unchanged in "updatedContent"',
    "",
    architecture
      ? `Architecture brief:\n${JSON.stringify(architecture, null, 2)}`
      : "Architecture brief: unavailable",
    "",
    reasoning
      ? `Reasoning review:\n${JSON.stringify(reasoning, null, 2)}`
      : "Reasoning review: unavailable",
    "",
    security
      ? `Security review:\n${JSON.stringify(security, null, 2)}`
      : "Security review: unavailable",
    "",
    ux
      ? `UX and performance review:\n${JSON.stringify(ux, null, 2)}`
      : "UX and performance review: unavailable",
    "",
    "Selected file:",
    `Path: ${file.path}`,
    file.content,
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildMultiFileSynthesisPrompt(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
  architecture: ArchitectureBrief | null,
  reasoning: ReasoningReview | null,
  security: SecurityReview | null,
  ux: UxReview | null,
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: Final implementation synthesizer for multi-file changes.",
    "Use the collaborative guidance below to produce the smallest safe final edit set.",
    "",
    "Response contract:",
    '- return valid JSON only',
    '- use exactly these keys: "summary" and "files"',
    '- "summary" must briefly state what changed across all files',
    '- "files" must be an array of objects with "path", "content", and "isNew"',
    '- include only files that actually changed or were created',
    '- for existing files, "content" must be the complete final file contents',
    "",
    architecture
      ? `Architecture brief:\n${JSON.stringify(architecture, null, 2)}`
      : "Architecture brief: unavailable",
    "",
    reasoning
      ? `Reasoning review:\n${JSON.stringify(reasoning, null, 2)}`
      : "Reasoning review: unavailable",
    "",
    security
      ? `Security review:\n${JSON.stringify(security, null, 2)}`
      : "Security review: unavailable",
    "",
    ux
      ? `UX and performance review:\n${JSON.stringify(ux, null, 2)}`
      : "UX and performance review: unavailable",
    "",
    "Workspace files:",
    buildWorkspaceContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

function buildPlanSynthesisPrompt(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
  architecture: ArchitectureBrief | null,
  reasoning: ReasoningReview | null,
  security: SecurityReview | null,
  ux: UxReview | null,
): string {
  return [
    COLLABORATIVE_BASE_PROMPT,
    "",
    "Role: Final planning synthesizer.",
    "Return a concise implementation plan with these sections:",
    "1. Goal",
    "2. Known Context",
    "3. Assumptions",
    "4. Proposed Changes",
    "5. Execution Steps",
    "6. Risks",
    "7. Verification",
    "",
    architecture
      ? `Architecture brief:\n${JSON.stringify(architecture, null, 2)}`
      : "Architecture brief: unavailable",
    "",
    reasoning
      ? `Reasoning review:\n${JSON.stringify(reasoning, null, 2)}`
      : "Reasoning review: unavailable",
    "",
    security
      ? `Security review:\n${JSON.stringify(security, null, 2)}`
      : "Security review: unavailable",
    "",
    ux
      ? `UX and performance review:\n${JSON.stringify(ux, null, 2)}`
      : "UX and performance review: unavailable",
    "",
    "Workspace context:",
    buildWorkspaceContext(files),
    "",
    `User request:\n${request.prompt}`,
  ].join("\n");
}

async function runStage<T>(
  request: CollaborativeCodeAgentRequest,
  role: CodingWorkflowRole,
  prompt: string,
  options: {
    task: AgentTask;
    responseFormat: "json" | "text";
    maxTokens: number;
    temperature: number;
  },
): Promise<{ stage: CollaborativeStageResult; payload: T | null; response: AgentResponse | null }> {
  const orchestrator = getOrchestrator();
  const workflowStep = orchestrator.getCodingWorkflow().find((step) => step.role === role);

  if (!workflowStep || !workflowStep.available) {
    return {
      stage: {
        role,
        roleLabel: workflowStep?.roleLabel || role,
        purpose: workflowStep?.purpose || "",
        requestedProvider: workflowStep?.provider || "unassigned",
        status: "skipped",
        summary: "Provider unavailable for this stage.",
      },
      payload: null,
      response: null,
    };
  }

  try {
    const response = await orchestrator.execute({
      prompt,
      task: options.task,
      providerMode: "manual",
      preferredProvider: workflowStep.provider as LLMProvider,
      optimizationProfile:
        role === "implementation"
          ? request.optimizationProfile || "quality"
          : role === "security" || role === "ux"
            ? "cost"
            : "quality",
      responseFormat: options.responseFormat,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      systemPrompt: COLLABORATIVE_BASE_PROMPT,
    });

    const payload =
      options.responseFormat === "json"
        ? parseJsonPayload<T>(response.content)
        : (response.content as T);

    if (options.responseFormat === "json" && !payload) {
      throw new Error(`${response.provider} returned invalid JSON for the ${role} stage.`);
    }

    return {
      stage: {
        role,
        roleLabel: workflowStep.roleLabel,
        purpose: workflowStep.purpose,
        requestedProvider: workflowStep.provider,
        actualProvider: response.provider,
        model: response.model,
        transport: response.transport,
        status: "completed",
        summary:
          typeof response.content === "string"
            ? response.content.trim().slice(0, 240)
            : undefined,
      },
      payload: payload ?? null,
      response,
    };
  } catch (error) {
    return {
      stage: {
        role,
        roleLabel: workflowStep.roleLabel,
        purpose: workflowStep.purpose,
        requestedProvider: workflowStep.provider,
        status: "failed",
        error: formatOpsAgentErrorMessage(error, `The ${role} stage failed.`),
      },
      payload: null,
      response: null,
    };
  }
}

function buildOrchestration(
  stages: CollaborativeStageResult[],
): CollaborativeOrchestration {
  const completedProviders = Array.from(
    new Set(
      stages
        .filter((stage) => stage.status === "completed")
        .map((stage) => stage.actualProvider || stage.requestedProvider),
    ),
  );

  return {
    mode: "ensemble",
    summary: summarizeCompletedStages(stages),
    completedProviders,
    stages,
  };
}

async function runSharedCollaborativeStages(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
): Promise<{
  architecture: ArchitectureBrief | null;
  reasoning: ReasoningReview | null;
  security: SecurityReview | null;
  ux: UxReview | null;
  stages: CollaborativeStageResult[];
}> {
  const stages: CollaborativeStageResult[] = [];

  const architectureStage = await runStage<ArchitectureBrief>(
    request,
    "architecture",
    buildArchitecturePrompt(request, files),
    {
      task: "reasoning",
      responseFormat: "json",
      maxTokens: 1600,
      temperature: 0.2,
    },
  );
  stages.push(architectureStage.stage);

  const architecture = architectureStage.payload;

  const [reasoningStage, securityStage, uxStage] = await Promise.all([
    runStage<ReasoningReview>(
      request,
      "reasoning",
      buildReasoningPrompt(request, files, architecture),
      {
        task: "reasoning",
        responseFormat: "json",
        maxTokens: 1400,
        temperature: 0.15,
      },
    ),
    runStage<SecurityReview>(
      request,
      "security",
      buildSecurityPrompt(request, files, architecture),
      {
        task: "analysis",
        responseFormat: "json",
        maxTokens: 1200,
        temperature: 0.1,
      },
    ),
    runStage<UxReview>(
      request,
      "ux",
      buildUxPrompt(request, files, architecture),
      {
        task: "analysis",
        responseFormat: "json",
        maxTokens: 1200,
        temperature: 0.15,
      },
    ),
  ]);

  stages.push(reasoningStage.stage, securityStage.stage, uxStage.stage);

  return {
    architecture,
    reasoning: reasoningStage.payload,
    security: securityStage.payload,
    ux: uxStage.payload,
    stages,
  };
}

export async function runCollaborativeSingleFileEdit(
  request: CollaborativeCodeAgentRequest,
  file: CollaborativeCodeAgentFile,
): Promise<CollaborativeSingleFileEditResult | null> {
  const shared = await runSharedCollaborativeStages(request, [file]);
  const implementationStage = await runStage<SingleFileEditPayload>(
    request,
    "implementation",
    buildSingleFileSynthesisPrompt(
      request,
      file,
      shared.architecture,
      shared.reasoning,
      shared.security,
      shared.ux,
    ),
    {
      task: "code",
      responseFormat: "json",
      maxTokens: 8192,
      temperature: 0.1,
    },
  );
  shared.stages.push(implementationStage.stage);

  const payload = implementationStage.payload;
  if (!payload || typeof payload.updatedContent !== "string") {
    return null;
  }

  const orchestration = buildOrchestration(shared.stages);
  const summary =
    typeof payload.summary === "string" && payload.summary.trim()
      ? `${payload.summary.trim()}\n\n${orchestration.summary}`
      : orchestration.summary;

  return {
    summary,
    updatedContent: payload.updatedContent,
    model: implementationStage.response?.model,
    transport: implementationStage.response?.transport,
    orchestration,
  };
}

export async function runCollaborativeMultiFileEdit(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
): Promise<CollaborativeMultiFileEditResult | null> {
  const shared = await runSharedCollaborativeStages(request, files);
  const implementationStage = await runStage<MultiFileEditPayload>(
    request,
    "implementation",
    buildMultiFileSynthesisPrompt(
      request,
      files,
      shared.architecture,
      shared.reasoning,
      shared.security,
      shared.ux,
    ),
    {
      task: "code",
      responseFormat: "json",
      maxTokens: 16384,
      temperature: 0.1,
    },
  );
  shared.stages.push(implementationStage.stage);

  const payload = implementationStage.payload;
  const rawFiles = Array.isArray(payload?.files) ? payload.files : [];
  const fileEdits = rawFiles
    .filter(
      (item): item is { path: string; content: string; isNew?: boolean } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { path?: unknown }).path === "string" &&
        typeof (item as { content?: unknown }).content === "string",
    )
    .map((item) => ({
      path: item.path,
      content: item.content,
      isNew: Boolean(item.isNew),
    }));

  if (fileEdits.length === 0) {
    return null;
  }

  const orchestration = buildOrchestration(shared.stages);
  const summary =
    typeof payload?.summary === "string" && payload.summary.trim()
      ? `${payload.summary.trim()}\n\n${orchestration.summary}`
      : orchestration.summary;

  return {
    summary,
    fileEdits,
    model: implementationStage.response?.model,
    transport: implementationStage.response?.transport,
    orchestration,
  };
}

export async function runCollaborativePlan(
  request: CollaborativeCodeAgentRequest,
  files: CollaborativeCodeAgentFile[],
): Promise<CollaborativeTextResult | null> {
  const shared = await runSharedCollaborativeStages(request, files);
  const implementationStage = await runStage<string>(
    request,
    "implementation",
    buildPlanSynthesisPrompt(
      request,
      files,
      shared.architecture,
      shared.reasoning,
      shared.security,
      shared.ux,
    ),
    {
      task: getTaskForMode(request.mode),
      responseFormat: "text",
      maxTokens: 4096,
      temperature: 0.2,
    },
  );
  shared.stages.push(implementationStage.stage);

  if (!implementationStage.response?.content?.trim()) {
    return null;
  }

  const orchestration = buildOrchestration(shared.stages);
  return {
    summary: `${implementationStage.response.content.trim()}\n\n${orchestration.summary}`,
    model: implementationStage.response.model,
    transport: implementationStage.response.transport,
    orchestration,
  };
}

