import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import openai, { resolvedModel } from "../lib/openai";
import { resolveGeminiBaseUrl } from "../lib/ai-provider-utils";
import { getOrganizationPromptSettings } from "../lib/org-intelligence-helper";

export type PromptAgentType = "voice" | "text" | "research" | "qa";
export type PromptOptimizationProvider = "auto" | "openai" | "gemini";

export type PromptOptimizationInput = {
  systemPrompt: string;
  firstMessage?: string | null;
  instructions?: string | null;
  toolsAllowed?: string[] | null;
  toolPolicy?: Record | null;
  audienceContext?: string | null;
  agentType?: PromptAgentType | null;
  provider?: PromptOptimizationProvider | null;
};

export type LintFinding = {
  severity: "error" | "warning";
  code: string;
  message: string;
  evidence?: string | null;
};

type PolicyAlignment = {
  status: "pass" | "warn" | "fail";
  issues: string[];
};

type RiskAssessment = {
  level: "low" | "medium" | "high";
  reasons: string[];
};

type PromptContract = {
  immutable_context: {
    organization: string[];
    compliance: string[];
    platform_policies: string[];
    agent_type_defaults: string[];
  };
  user_intent: {
    system_prompt: string;
    first_message: string | null;
    instructions: string | null;
    audience_context: string | null;
  };
  constraints: string[];
  tool_policy: Record | string[] | null;
  final_system_prompt: string;
  final_first_message: string | null;
  version: string;
  approved_by: string | null;
  audit_log: Array;
};

export type PromptOptimizationResult = {
  optimizedSystemPrompt: string;
  optimizedFirstMessage: string | null;
  changeSummary: string[];
  policyAlignment: PolicyAlignment;
  lintFindings: LintFinding[];
  diff: {
    systemPrompt: string;
    firstMessage?: string;
  };
  riskAssessment: RiskAssessment;
  autoApplyAllowed: boolean;
  promptContract: PromptContract;
  providerUsed: string;
  modelUsed: string;
  warnings: string[];
  scores: {
    clarity: number;
    risk: number;
  };
  redactionSummary: string[];
};

const DEFAULT_ORG_INTELLIGENCE = [
  "Organization intelligence is not configured.",
  "Define brand name, positioning, offerings, ICP, personas, approved claims, and tone.",
];

const DEFAULT_COMPLIANCE_POLICY = [
  "Respect business hours in the prospect's local timezone.",
  "Immediately honor opt-out and do-not-call requests.",
  "Do not harass, pressure, or repeatedly call uninterested prospects.",
  "Be polite, professional, and calm at all times.",
  "No deceptive behavior or misrepresentation.",
  "Do not misuse personal data.",
  "Escalate to a human when uncertain.",
];

const DEFAULT_PLATFORM_POLICIES = [
  "Operate only within allowed tool permissions.",
  "Do not expand tool permissions implicitly.",
  "Use escalation rules when risk is detected.",
];

const DEFAULT_AGENT_TYPE_DEFAULTS: Record = {
  voice: [
    "Use conversational turn-taking: listen before responding.",
    "Navigate IVR quickly and politely.",
    "Handle gatekeepers with concise, respectful requests.",
    "Ask for transfers using role-based language.",
    "Decide when to leave voicemail versus retry.",
    "Escalate to a human when needed.",
  ],
  text: [
    "Use professional email etiquette.",
    "Keep subject lines clear and relevant.",
    "Respect unsubscribe signals immediately.",
    "Follow up with appropriate timing and cadence.",
  ],
  research: [
    "Prioritize authoritative sources.",
    "Do not hallucinate company data.",
    "Flag low-confidence findings for review.",
  ],
  qa: [
    "Score compliance against policy rules.",
    "Assess tone and risk.",
    "Detect policy violations for human review.",
  ],
};

const REDACTION_PATTERNS: Array = [
  { label: "openai_key", regex: /sk-[A-Za-z0-9]{20,}/g },
  { label: "google_key", regex: /AIza[0-9A-Za-z_-]{10,}/g },
  { label: "api_key", regex: /\b(api_key|apikey|token|secret)\b\s*[:=]\s*[A-Za-z0-9_-]{8,}/gi },
  { label: "bearer_token", regex: /Bearer\s+[A-Za-z0-9._-]{10,}/gi },
  { label: "email", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { label: "phone", regex: /\+?\d[\d\s().-]{7,}\d/g },
];

const REDACTION_LINE_PREFIX = /^\s*(internal|private|confidential)\b/i;

const REVIEW_OUTPUT_SCHEMA = z.object({
  optimized_user_prompt: z.string().min(1),
  optimized_first_message: z.string().optional().nullable(),
  change_summary: z.array(z.string()).optional(),
  policy_alignment: z
    .object({
      status: z.enum(["pass", "warn", "fail"]).optional(),
      issues: z.array(z.string()).optional(),
    })
    .optional(),
  risk_assessment: z
    .object({
      level: z.enum(["low", "medium", "high"]).optional(),
      reasons: z.array(z.string()).optional(),
    })
    .optional(),
});

async function resolveImmutableContext(agentType: PromptAgentType) {
  // Get settings from database
  const dbSettings = await getOrganizationPromptSettings();
  
  // Parse database settings into arrays, fallback to defaults if empty
  const parseToArray = (text: string | null, fallback: string[]) => {
    if (!text || !text.trim()) return fallback;
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  };
  
  return {
    organization: parseToArray(dbSettings.orgIntelligence, DEFAULT_ORG_INTELLIGENCE),
    compliance: parseToArray(dbSettings.compliancePolicy, DEFAULT_COMPLIANCE_POLICY),
    platform_policies: parseToArray(dbSettings.platformPolicies, DEFAULT_PLATFORM_POLICIES),
    agent_type_defaults: parseToArray(
      dbSettings.agentVoiceDefaults,
      DEFAULT_AGENT_TYPE_DEFAULTS[agentType]
    ),
  };
}

function redactSensitive(text: string): { redacted: string; summary: string[] } {
  if (!text) return { redacted: "", summary: [] };
  const summary = new Set();
  const filteredLines = text
    .split(/\r?\n/)
    .filter((line) => !REDACTION_LINE_PREFIX.test(line));
  let redacted = filteredLines.join("\n");
  for (const pattern of REDACTION_PATTERNS) {
    const next = redacted.replace(pattern.regex, "[REDACTED]");
    if (next !== redacted) {
      summary.add(pattern.label);
      redacted = next;
    }
  }
  return { redacted, summary: Array.from(summary) };
}

function runPromptLinter(input: {
  systemPrompt: string;
  firstMessage?: string | null;
  instructions?: string | null;
}): LintFinding[] {
  const combined = [
    input.systemPrompt,
    input.firstMessage ?? "",
    input.instructions ?? "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  const lower = combined.toLowerCase();
  const findings: LintFinding[] = [];

  if (!combined) {
    findings.push({
      severity: "error",
      code: "empty_prompt",
      message: "Prompt content is empty.",
    });
    return findings;
  }

  const requiresIdentity = /you are|you represent|on behalf of|representing|company/i;
  if (!requiresIdentity.test(combined)) {
    findings.push({
      severity: "warning",
      code: "missing_identity",
      message: "Missing clear agent identity or representation statement.",
    });
  }

  const objectivePattern = /(goal|objective|purpose|book|schedule|qualify|meeting|demo|introduce)/i;
  if (!objectivePattern.test(combined)) {
    findings.push({
      severity: "warning",
      code: "missing_objective",
      message: "Missing explicit objective or success outcome.",
    });
  }

  const successPattern = /(success|qualif|book|schedule|meeting|demo|transfer)/i;
  if (!successPattern.test(combined)) {
    findings.push({
      severity: "warning",
      code: "missing_success_criteria",
      message: "Missing success criteria or completion conditions.",
    });
  }

  const escalationPattern = /(escalat|transfer|handoff|hand off|human)/i;
  if (!escalationPattern.test(combined)) {
    findings.push({
      severity: "warning",
      code: "missing_escalation",
      message: "Missing escalation or human handoff guidance.",
    });
  }

  const optOutPattern = /(do not call|opt[- ]?out|unsubscribe|not interested|remove me)/i;
  if (!optOutPattern.test(combined)) {
    findings.push({
      severity: "warning",
      code: "missing_opt_out",
      message: "Missing opt-out or do-not-call handling.",
    });
  }

  const businessHoursPattern = /(business hours|local time|timezone|time zone|8am|9am|6pm)/i;
  if (!businessHoursPattern.test(combined)) {
    findings.push({
      severity: "warning",
      code: "missing_business_hours",
      message: "Missing business-hours guidance.",
    });
  }

  const forbiddenPattern = /(pretend to be human|impersonate|mislead|deceptive|bypass gatekeeper|pressure|threaten|call until|keep calling|harass)/i;
  if (forbiddenPattern.test(combined)) {
    findings.push({
      severity: "error",
      code: "forbidden_actions",
      message: "Prompt includes forbidden or high-risk instructions.",
      evidence: combined.match(forbiddenPattern)?.[0] ?? null,
    });
  }

  const sensitiveDataPattern = /(ssn|social security|credit card|bank account|passport|driver's license|dob|date of birth)/i;
  if (sensitiveDataPattern.test(lower)) {
    findings.push({
      severity: "error",
      code: "sensitive_data_request",
      message: "Prompt requests sensitive personal data.",
      evidence: combined.match(sensitiveDataPattern)?.[0] ?? null,
    });
  }

  return findings;
}

function computeScores(findings: LintFinding[], risk: RiskAssessment): { clarity: number; risk: number } {
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const clarity = Math.max(0, 100 - warningCount * 10 - errorCount * 25);
  const riskScore = risk.level === "low" ? 20 : risk.level === "medium" ? 50 : 85;
  return { clarity, risk: riskScore };
}

function resolveProvider(requested: PromptOptimizationProvider | null | undefined) {
  const hasGemini = Boolean(process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
  const hasOpenAI = Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  );
  const warnings: string[] = [];

  if (requested === "gemini") {
    if (!hasGemini) {
      warnings.push("Gemini provider not configured.");
      return { provider: "disabled", warnings };
    }
    return { provider: "gemini", warnings };
  }

  if (requested === "openai") {
    if (!hasOpenAI) {
      warnings.push("OpenAI provider not configured.");
      return { provider: "disabled", warnings };
    }
    return { provider: "openai", warnings };
  }

  if (hasGemini) return { provider: "gemini", warnings };
  if (hasOpenAI) return { provider: "openai", warnings };

  warnings.push("No prompt optimization provider configured.");
  return { provider: "disabled", warnings };
}

function extractUserIntent(systemPrompt: string): { userPrompt: string; hasSections: boolean } {
  const lines = systemPrompt.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith("user intent")
  );
  if (markerIndex === -1) {
    return { userPrompt: systemPrompt.trim(), hasSections: false };
  }
  const remaining = lines.slice(markerIndex + 1).join("\n").trim();
  return { userPrompt: remaining || systemPrompt.trim(), hasSections: true };
}

function formatSection(title: string, lines: string[]): string {
  const safeLines = lines.filter(Boolean);
  return [title, ...safeLines.map((line) => `- ${line}`)].join("\n");
}

function formatToolPolicy(toolPolicy: Record | string[] | null): string[] {
  if (!toolPolicy) return [];
  if (Array.isArray(toolPolicy)) {
    return toolPolicy.map((tool) => `Allowed tool: ${tool}`);
  }
  return Object.entries(toolPolicy).map(
    ([tool, allowed]) => `${tool}: ${allowed ? "allowed" : "blocked"}`
  );
}

function composeFinalSystemPrompt(input: {
  immutableContext: Awaited>;
  userPrompt: string;
  agentType: PromptAgentType;
  toolPolicy: Record | string[] | null;
}): string {
  const toolLines = formatToolPolicy(input.toolPolicy);
  const sections = [
    formatSection("ORGANIZATION INTELLIGENCE", input.immutableContext.organization),
    "",
    formatSection("GLOBAL COMPLIANCE AND ETHICS", input.immutableContext.compliance),
    "",
    formatSection("PLATFORM POLICIES", input.immutableContext.platform_policies),
    "",
    formatSection(
      `AGENT TYPE DEFAULTS (${input.agentType.toUpperCase()})`,
      input.immutableContext.agent_type_defaults
    ),
  ];

  if (toolLines.length) {
    sections.push("", formatSection("TOOL POLICY", toolLines));
  }

  sections.push("", "USER INTENT", input.userPrompt.trim());
  return sections.join("\n").trim();
}

function buildReviewPrompt(input: {
  immutableContext: Awaited>;
  userIntent: {
    systemPrompt: string;
    firstMessage: string | null;
    instructions: string | null;
    audienceContext: string | null;
  };
  lintFindings: LintFinding[];
  toolPolicy: Record | string[] | null;
  agentType: PromptAgentType;
}) {
  const toolLines = formatToolPolicy(input.toolPolicy);
  const lintLines = input.lintFindings.map(
    (finding) => `[${finding.severity}] ${finding.code}: ${finding.message}`
  );

  const systemPrompt = [
    "You are the Prompt Optimization Pipeline for enterprise agents.",
    "Improve clarity and compliance while preserving intent.",
    "Do not add new capabilities, claims, or tool permissions.",
    "Do not soften opt-out handling or escalation rules.",
    "Keep tone aligned with the immutable context.",
    "Return JSON only.",
    "Required JSON keys: optimized_user_prompt, optimized_first_message, change_summary, policy_alignment, risk_assessment.",
    "policy_alignment.status must be one of: pass, warn, fail.",
    "risk_assessment.level must be one of: low, medium, high.",
  ].join("\n");

  const userPrompt = [
    formatSection("IMMUTABLE CONTEXT - ORGANIZATION", input.immutableContext.organization),
    "",
    formatSection("IMMUTABLE CONTEXT - COMPLIANCE", input.immutableContext.compliance),
    "",
    formatSection("IMMUTABLE CONTEXT - PLATFORM POLICIES", input.immutableContext.platform_policies),
    "",
    formatSection(
      `IMMUTABLE CONTEXT - AGENT TYPE DEFAULTS (${input.agentType.toUpperCase()})`,
      input.immutableContext.agent_type_defaults
    ),
  ];

  if (toolLines.length) {
    userPrompt.push("", formatSection("TOOL POLICY", toolLines));
  }

  userPrompt.push(
    "",
    "USER INTENT",
    `System prompt:\n${input.userIntent.systemPrompt}`,
    `First message:\n${input.userIntent.firstMessage ?? ""}`,
    `Additional instructions:\n${input.userIntent.instructions ?? ""}`,
    `Audience context:\n${input.userIntent.audienceContext ?? ""}`
  );

  if (lintLines.length) {
    userPrompt.push("", "LINTER FINDINGS", ...lintLines.map((line) => `- ${line}`));
  }

  userPrompt.push(
    "",
    "OUTPUT RULES",
    "- Keep optimized_user_prompt concise and actionable.",
    "- Keep optimized_first_message brief and compliant.",
    "- change_summary should list the changes made and why.",
    "- policy_alignment should reflect remaining risks or missing items."
  );

  return { systemPrompt, userPrompt: userPrompt.join("\n") };
}

async function reviewWithOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise {
  const model = process.env.PROMPT_OPTIMIZATION_OPENAI_MODEL
    || process.env.OPENAI_VIRTUAL_AGENT_REFINER_MODEL
    || resolvedModel;

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices?.[0]?.message?.content?.trim() || "";
  return { raw, model };
}

async function reviewWithGemini(prompt: string): Promise {
  const model = process.env.PROMPT_OPTIMIZATION_GEMINI_MODEL || "gemini-2.5-flash";
  const geminiBaseUrl = resolveGeminiBaseUrl();
  const genai = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "",
    httpOptions: {
      apiVersion: "",
      ...(geminiBaseUrl ? { baseUrl: geminiBaseUrl } : {}),
    },
  });

  const result = await genai.models.generateContent({
    model,
    contents: prompt,
  });

  const raw = result.text?.trim() || "";
  return { raw, model };
}

function parseReviewOutput(raw: string): z.infer | null {
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const normalized = {
      optimized_user_prompt:
        parsed.optimized_user_prompt || parsed.optimized_system_prompt || "",
      optimized_first_message: parsed.optimized_first_message ?? null,
      change_summary: parsed.change_summary,
      policy_alignment: parsed.policy_alignment,
      risk_assessment: parsed.risk_assessment,
    };
    const result = REVIEW_OUTPUT_SCHEMA.safeParse(normalized);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

function buildDiff(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const dp: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    Array(afterLines.length + 1).fill(0)
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      if (beforeLines[i] === afterLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diffLines: string[] = [];
  let i = 0;
  let j = 0;
  while (i = dp[i][j + 1]) {
      diffLines.push(`- ${beforeLines[i]}`);
      i += 1;
    } else {
      diffLines.push(`+ ${afterLines[j]}`);
      j += 1;
    }
  }
  while (i  finding.severity === "error");
  if (lintErrors.length) {
    level = "high";
    reasons.push("Lint errors detected.");
  }

  const lintWarnings = lintFindings.filter((finding) => finding.severity === "warning");
  if (lintWarnings.length) {
    reasons.push("Lint warnings detected.");
  }

  if (llmRisk?.level) {
    const rank = { low: 0, medium: 1, high: 2 };
    if (rank[llmRisk.level] > rank[level]) {
      level = llmRisk.level;
      reasons.push(...(llmRisk.reasons ?? []));
    }
  }

  const riskyPatterns = [
    { level: "high" as const, reason: "Pressure or harassment language detected.", regex: /(pressure|hard sell|last chance|must act|urgent)/i },
    { level: "high" as const, reason: "Repeated calling behavior detected.", regex: /(call until|keep calling|repeat call|call repeatedly|never stop)/i },
    { level: "high" as const, reason: "Misrepresentation language detected.", regex: /(pretend|impersonate|mislead|deceptive)/i },
    { level: "medium" as const, reason: "Potential claims language detected.", regex: /(guarantee|100%|promise)/i },
  ];

  for (const pattern of riskyPatterns) {
    if (pattern.regex.test(optimizedUserPrompt)) {
      const rank = { low: 0, medium: 1, high: 2 };
      if (rank[pattern.level] > rank[level]) {
        level = pattern.level;
      }
      reasons.push(pattern.reason);
    }
  }

  const optOutPattern = /(opt[- ]?out|do not call|unsubscribe)/i;
  const optOutChanged = optOutPattern.test(originalLower) !== optOutPattern.test(optimizedLower);
  if (optOutChanged) {
    const rank = { low: 0, medium: 1, high: 2 };
    if (rank.medium > rank[level]) {
      level = "medium";
    }
    reasons.push("Opt-out handling changed.");
  }

  return {
    level,
    reasons: reasons.length ? Array.from(new Set(reasons)) : ["No elevated risks detected."],
  };
}

export async function optimizePromptPackage(
  input: PromptOptimizationInput
): Promise {
  const agentType: PromptAgentType = input.agentType ?? "voice";
  const immutableContext = await resolveImmutableContext(agentType);
  const { userPrompt: extractedUserPrompt } = extractUserIntent(input.systemPrompt);
  const lintFindings = runPromptLinter({
    systemPrompt: extractedUserPrompt,
    firstMessage: input.firstMessage ?? null,
    instructions: input.instructions ?? null,
  });

  const toolPolicy =
    input.toolsAllowed !== undefined && input.toolsAllowed !== null
      ? input.toolsAllowed
      : input.toolPolicy ?? null;

  const { redacted: redactedUserPrompt, summary: redactionSummary } = redactSensitive(
    extractedUserPrompt
  );
  const { redacted: redactedFirstMessage } = redactSensitive(input.firstMessage ?? "");
  const { redacted: redactedInstructions } = redactSensitive(input.instructions ?? "");
  const { redacted: redactedAudience } = redactSensitive(input.audienceContext ?? "");

  const reviewPrompt = buildReviewPrompt({
    immutableContext,
    userIntent: {
      systemPrompt: redactedUserPrompt,
      firstMessage: redactedFirstMessage || null,
      instructions: redactedInstructions || null,
      audienceContext: redactedAudience || null,
    },
    lintFindings,
    toolPolicy,
    agentType,
  });

  const providerResolution = resolveProvider(input.provider);
  const warnings = [...providerResolution.warnings];
  let reviewOutput: z.infer | null = null;
  let providerUsed = providerResolution.provider;
  let modelUsed = "disabled";

  if (providerResolution.provider === "openai") {
    try {
      const response = await reviewWithOpenAI(reviewPrompt.systemPrompt, reviewPrompt.userPrompt);
      modelUsed = response.model;
      reviewOutput = parseReviewOutput(response.raw);
      if (!reviewOutput) warnings.push("OpenAI review output could not be parsed.");
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "OpenAI review failed."
      );
    }
  } else if (providerResolution.provider === "gemini") {
    try {
      const response = await reviewWithGemini(
        `${reviewPrompt.systemPrompt}\n\n${reviewPrompt.userPrompt}`
      );
      modelUsed = response.model;
      reviewOutput = parseReviewOutput(response.raw);
      if (!reviewOutput) warnings.push("Gemini review output could not be parsed.");
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "Gemini review failed."
      );
    }
  }

  if (providerResolution.provider === "disabled") {
    providerUsed = "disabled";
  }

  const optimizedUserPrompt = reviewOutput?.optimized_user_prompt?.trim()
    || extractedUserPrompt.trim()
    || DEFAULT_COMPLIANCE_POLICY.join(" ");
  const optimizedFirstMessage = reviewOutput?.optimized_first_message?.trim()
    || input.firstMessage?.trim()
    || null;

  const finalSystemPrompt = composeFinalSystemPrompt({
    immutableContext,
    userPrompt: optimizedUserPrompt,
    agentType,
    toolPolicy,
  });

  const lintIssues = lintFindings.map((finding) => finding.message);
  const policyAlignment: PolicyAlignment = reviewOutput?.policy_alignment?.status
    ? {
        status: reviewOutput.policy_alignment.status,
        issues: reviewOutput.policy_alignment.issues ?? lintIssues,
      }
    : lintFindings.some((finding) => finding.severity === "error")
    ? { status: "fail", issues: lintIssues }
    : lintFindings.length
    ? { status: "warn", issues: lintIssues }
    : { status: "pass", issues: [] };

  const riskAssessment = mergeRiskAssessments(
    lintFindings,
    reviewOutput?.risk_assessment
      ? {
          level: reviewOutput.risk_assessment.level ?? "medium",
          reasons: reviewOutput.risk_assessment.reasons ?? [],
        }
      : null,
    optimizedUserPrompt,
    extractedUserPrompt
  );

  const scores = computeScores(lintFindings, riskAssessment);
  const diff = {
    systemPrompt: buildDiff(input.systemPrompt, finalSystemPrompt),
    firstMessage: buildDiff(input.firstMessage ?? "", optimizedFirstMessage ?? ""),
  };

  const changeSummary =
    reviewOutput?.change_summary && reviewOutput.change_summary.length
      ? reviewOutput.change_summary
      : lintFindings.map((finding) => finding.message);

  const promptContract: PromptContract = {
    immutable_context: immutableContext,
    user_intent: {
      system_prompt: extractedUserPrompt,
      first_message: input.firstMessage ?? null,
      instructions: input.instructions ?? null,
      audience_context: input.audienceContext ?? null,
    },
    constraints: immutableContext.compliance,
    tool_policy: toolPolicy,
    final_system_prompt: finalSystemPrompt,
    final_first_message: optimizedFirstMessage,
    version: new Date().toISOString(),
    approved_by: null,
    audit_log: [
      {
        timestamp: new Date().toISOString(),
        action: "optimize_prompt",
        details: `provider=${providerUsed};model=${modelUsed}`,
      },
    ],
  };

  return {
    optimizedSystemPrompt: finalSystemPrompt,
    optimizedFirstMessage,
    changeSummary,
    policyAlignment,
    lintFindings,
    diff,
    riskAssessment,
    autoApplyAllowed: riskAssessment.level === "low",
    promptContract,
    providerUsed,
    modelUsed,
    warnings,
    scores,
    redactionSummary,
  };
}