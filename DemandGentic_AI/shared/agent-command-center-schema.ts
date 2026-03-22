import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./schema";

export const agentCommandRuns = pgTable("agent_command_runs", {
  id: text("id").primaryKey(),
  orgId: integer("org_id"),
  userId: text("user_id").references(() => users.id).notNull(),
  requestText: text("request_text").notNull(),
  requestContext: jsonb("request_context"),
  status: text("status").notNull().default("queued"),
  phase: text("phase").notNull().default("understand"),
  model: text("model"),
  dryRun: boolean("dry_run").default(false),
  safeMode: boolean("safe_mode").default(true),
  currentStepIdx: integer("current_step_idx").default(0),
  totalSteps: integer("total_steps").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  summaryMd: text("summary_md"),
  outputsJson: jsonb("outputs_json"),
  lastInterruptId: text("last_interrupt_id"),
  resumeCount: integer("resume_count").default(0),
});

export const agentCommandSteps = pgTable("agent_command_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  idx: integer("idx").notNull(),
  title: text("title").notNull(),
  why: text("why"),
  status: text("status").notNull().default("queued"),
  toolName: text("tool_name"),
  toolArgsRedacted: jsonb("tool_args_redacted"),
  resultSummary: text("result_summary"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentCommandArtifacts = pgTable("agent_command_artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id").references(() => agentCommandSteps.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  refId: text("ref_id"),
  contentJson: jsonb("content_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentCommandInterrupts = pgTable("agent_command_interrupts", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id").references(() => agentCommandSteps.id),
  interruptType: text("interrupt_type").notNull(),
  state: text("state").notNull().default("pending"),
  title: text("title").notNull(),
  whyNeeded: text("why_needed").notNull(),
  resumeHint: text("resume_hint"),
  schemaVersion: integer("schema_version").default(1),
  questions: jsonb("questions").notNull(),
  defaults: jsonb("defaults"),
  blocking: boolean("blocking").default(true),
  timeoutSeconds: integer("timeout_seconds"),
  response: jsonb("response"),
  respondedAt: timestamp("responded_at"),
  respondedByUserId: text("responded_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

export const agentCommandEvents = pgTable("agent_command_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  phase: text("phase"),
  stepId: text("step_id"),
  payload: jsonb("payload").notNull(),
  ts: timestamp("ts").defaultNow().notNull(),
});

export const agentCommandSources = pgTable("agent_command_sources", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id"),
  sourceType: text("source_type").notNull(),
  label: text("label").notNull(),
  detailsJson: jsonb("details_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentCommandApprovals = pgTable("agent_command_approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id").references(() => agentCommandSteps.id),
  state: text("state").notNull().default("requested"),
  policy: text("policy").notNull(),
  actionDescription: text("action_description").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id").references(() => users.id),
  note: text("note"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
});

export const createAgentRunSchema = z.object({
  requestText: z.string().optional(),
  request: z.string().optional(),
  command: z.string().optional(),
  requestContext: z.record(z.any()).optional(),
  context: z.record(z.any()).optional(),
  dryRun: z.boolean().optional(),
  safeMode: z.boolean().optional(),
  mode: z.string().optional(),
}).refine((data) => !!(data.requestText || data.request || data.command), {
  message: "Request text is required",
  path: ["requestText"],
});

export type AgentCommandRun = typeof agentCommandRuns.$inferSelect;
export type AgentCommandStep = typeof agentCommandSteps.$inferSelect;
export type AgentCommandArtifact = typeof agentCommandArtifacts.$inferSelect;
export type AgentCommandInterrupt = typeof agentCommandInterrupts.$inferSelect;
export type AgentCommandEvent = typeof agentCommandEvents.$inferSelect;

export type AgentEventType =
  | "run.created"
  | "run.started"
  | "run.phase.changed"
  | "run.progress"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "run.heartbeat"
  | "plan.created"
  | "step.created"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "tool.called"
  | "tool.result"
  | "output.upserted"
  | "source.attached"
  | "approval.requested"
  | "approval.resolved"
  | "interrupt.raised"
  | "interrupt.submitted"
  | "interrupt.expired";

export interface AgentEventEnvelope {
  id?: string;
  seq: number;
  type: AgentEventType;
  runId: string;
  phase?: string | null;
  stepId?: string | null;
  ts?: string | Date;
  timestamp?: string | Date;
  data?: T;
  payload?: T;
}

export interface InterruptOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface InterruptQuestion {
  id: string;
  fieldType:
    | "single_select"
    | "multi_select"
    | "text_short"
    | "text_long"
    | "number"
    | "date"
    | "datetime"
    | "confirm"
    | "entity_picker"
    | "constraints";
  label: string;
  description?: string;
  required?: boolean;
  options?: InterruptOption[];
  placeholder?: string;
  maxLength?: number;
  validationRegex?: string;
  validationMessage?: string;
  entityType?: string;
}

export type InterruptResponse = Record;

export type CreateAgentRunRequest = z.infer;

export const defaultInterruptTriggerConfig = {
  missingFieldsCheck: {
    enabled: true,
  },
  conflictDetection: {
    enabled: true,
  },
  riskyActionConfirm: {
    enabled: true,
    actions: [
      { action: "delete", severity: "high", requiresExplicitConfirm: true },
      { action: "launch", severity: "high", requiresExplicitConfirm: true },
      { action: "update_bulk", severity: "medium", requiresExplicitConfirm: true },
    ],
  },
  confidenceThreshold: {
    enabled: true,
    minConfidence: 0.65,
  },
};