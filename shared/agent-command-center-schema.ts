import { pgTable, text, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

export const agentCommandRuns = pgTable("agent_command_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  orgId: integer("org_id"),
  command: text("command").notNull(),
  context: jsonb("context"),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, waiting_for_input, cancelled
  phase: text("phase"),
  dryRun: boolean("dry_run").default(false),
  safeMode: boolean("safe_mode").default(true),
  summary: text("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
});

export const agentCommandSteps = pgTable("agent_command_steps", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  phase: text("phase").notNull(), // understand, plan, execute, verify, summarize
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  description: text("description"),
  toolCalls: jsonb("tool_calls"),
  toolResults: jsonb("tool_results"),
  reasoning: text("reasoning"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const agentCommandArtifacts = pgTable("agent_command_artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id").references(() => agentCommandSteps.id),
  type: text("type").notNull(), // file, image, data, message
  name: text("name").notNull(),
  content: text("content"), // or url
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentCommandInterrupts = pgTable("agent_command_interrupts", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id").references(() => agentCommandSteps.id),
  type: text("type").notNull(), // confirmation, input, selection
  message: text("message").notNull(),
  options: jsonb("options"),
  response: jsonb("response"),
  status: text("status").notNull().default("pending"), // pending, resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const agentCommandEvents = pgTable("agent_command_events", {
  id: serial("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  seq: integer("seq").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentCommandSources = pgTable("agent_command_sources", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  type: text("type").notNull(),
  uri: text("uri").notNull(),
  content: text("content"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentCommandApprovals = pgTable("agent_command_approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => agentCommandRuns.id).notNull(),
  stepId: text("step_id").references(() => agentCommandSteps.id),
  status: text("status").notNull(), // pending, approved, rejected
  approvedBy: text("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const createAgentRunSchema = z.object({
  command: z.string(),
  context: z.record(z.any()).optional(),
  dryRun: z.boolean().optional(),
  safeMode: z.boolean().optional(),
});

export type AgentCommandRun = typeof agentCommandRuns.$inferSelect;
export type AgentCommandStep = typeof agentCommandSteps.$inferSelect;
export type AgentCommandArtifact = typeof agentCommandArtifacts.$inferSelect;
export type AgentCommandInterrupt = typeof agentCommandInterrupts.$inferSelect;
export type AgentCommandEvent = typeof agentCommandEvents.$inferSelect;

export type AgentEventType = 
  | "run.start"
  | "run.complete"
  | "run.failed"
  | "run.cancelled"
  | "phase.start"
  | "phase.complete"
  | "step.start"
  | "step.complete"
  | "step.failed"
  | "tool.call"
  | "tool.result"
  | "interrupt.request"
  | "interrupt.resolved"
  | "artifact.created"
  | "log";

export interface AgentEventEnvelope {
  type: AgentEventType;
  payload: any;
  timestamp: string;
  seq: number;
}

export interface InterruptQuestion {
  type: "confirmation" | "input" | "selection";
  message: string;
  options?: string[];
}

export interface InterruptResponse {
  response: any;
}

export type CreateAgentRunRequest = z.infer<typeof createAgentRunSchema>;

export const defaultInterruptTriggerConfig = {
  requireApprovalFor: ["delete", "update_bulk"],
  autoApproveSafeOps: true,
  maxStepsBeforeInterrupt: 10,
};

