import { readWorkspaceFile, writeWorkspaceFile } from "./runtime";

export interface OpsCodeAgentRequest {
  prompt: string;
  mode?: "simple-edit" | "debug" | "deploy" | "general";
  selectedFilePath?: string | null;
  selectedFileContent?: string | null;
  applyChanges?: boolean;
}

export interface OpsCodeAgentResponse {
  provider: string;
  summary: string;
  path: string | null;
  applied: boolean;
  changed: boolean;
  updatedContent?: string;
  modifiedAt?: string;
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

  const file = request.selectedFileContent != null
    ? {
        path: request.selectedFilePath,
        content: request.selectedFileContent,
      }
    : await readWorkspaceFile(request.selectedFilePath);

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      provider: "system",
      summary: "OpenAI API key is not configured, so Ops Hub cannot apply code edits.",
      path: request.selectedFilePath,
      applied: false,
      changed: false,
    };
  }

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const model =
    process.env.OPS_HUB_CODE_MODEL ||
    process.env.AI_OPERATOR_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  const systemPrompt = [
    "You are a precise code editor working on a single file.",
    "Apply the user's request only to the provided file content.",
    "Return valid JSON with keys: summary, updatedContent.",
    "updatedContent must contain the complete file contents after the edit.",
    "Do not wrap the file in markdown fences.",
    "Preserve existing imports, formatting style, and unrelated code.",
  ].join(" ");

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction: request.prompt,
          path: request.selectedFilePath,
          content: file.content,
        }),
      },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("The coding model returned an empty response");
  }

  const payload = JSON.parse(rawContent) as {
    summary?: unknown;
    updatedContent?: unknown;
  };

  const updatedContent =
    typeof payload.updatedContent === "string" ? payload.updatedContent : file.content;
  const summary =
    typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : "Updated the selected file.";
  const changed = updatedContent !== file.content;

  if (!request.applyChanges || !changed) {
    return {
      provider: "openai",
      summary,
      path: request.selectedFilePath,
      applied: false,
      changed,
      updatedContent,
    };
  }

  const savedFile = await writeWorkspaceFile(request.selectedFilePath, updatedContent);
  return {
    provider: "openai",
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

  const { getOrchestrator } = await import("../multi-provider-agent.js");
  const orchestrator = getOrchestrator();
  const response = await orchestrator.execute({
    prompt: request.prompt,
    task:
      request.mode === "debug"
        ? "analysis"
        : request.mode === "deploy"
          ? "reasoning"
          : "general",
    context: request.selectedFilePath
      ? {
          selectedFilePath: request.selectedFilePath,
        }
      : undefined,
  });

  return {
    provider: response.provider,
    summary: response.content,
    path: request.selectedFilePath || null,
    applied: false,
    changed: false,
  };
}
