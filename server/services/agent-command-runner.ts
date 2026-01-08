/**
 * Agent Command Center - Runner Service
 * 
 * Implements the core agent loop with:
 * - 5-phase execution (understand → plan → execute → verify → summarize)
 * - SSE event streaming
 * - Interrupt/clarification system with pause/resume
 * - Safe mode approvals
 * - Audit trail
 */

import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  agentCommandRuns,
  agentCommandSteps,
  agentCommandEvents,
  agentCommandInterrupts,
  agentCommandArtifacts,
  agentCommandSources,
  agentCommandApprovals,
  type AgentCommandRun,
  type AgentCommandStep,
  type AgentCommandEvent,
  type AgentCommandInterrupt,
  type AgentEventType,
  type AgentEventEnvelope,
  type InterruptQuestion,
  type InterruptResponse,
  type CreateAgentRunRequest,
  defaultInterruptTriggerConfig,
} from "@shared/agent-command-center-schema";
import { AVAILABLE_TOOLS, executeTool } from "./ai-tools";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

// ============================================================================
// ID GENERATION
// ============================================================================

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}${random}`;
}

// ============================================================================
// EVENT EMITTER
// ============================================================================

type EventCallback = (event: AgentEventEnvelope) => void;

class AgentEventEmitter {
  private subscribers = new Map<string, Set<EventCallback>>();
  
  subscribe(runId: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(runId)) {
      this.subscribers.set(runId, new Set());
    }
    this.subscribers.get(runId)!.add(callback);
    
    return () => {
      const subs = this.subscribers.get(runId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(runId);
        }
      }
    };
  }
  
  emit(event: AgentEventEnvelope): void {
    const subs = this.subscribers.get(event.runId);
    if (subs) {
      subs.forEach(callback => callback(event));
    }
  }
  
  getSubscriberCount(runId: string): number {
    return this.subscribers.get(runId)?.size ?? 0;
  }
}

export const agentEventEmitter = new AgentEventEmitter();

// ============================================================================
// SEQUENCE COUNTER (per-run monotonic)
// ============================================================================

const runSequences = new Map<string, number>();

function getNextSeq(runId: string): number {
  const current = runSequences.get(runId) ?? 0;
  const next = current + 1;
  runSequences.set(runId, next);
  return next;
}

function resetSeq(runId: string): void {
  runSequences.delete(runId);
}

// ============================================================================
// EVENT PERSISTENCE & EMISSION
// ============================================================================

async function emitEvent<T>(
  runId: string,
  type: AgentEventType,
  data: T,
  options?: {
    phase?: string;
    stepId?: string;
  }
): Promise<AgentEventEnvelope<T>> {
  const seq = getNextSeq(runId);
  const id = generateId('evt');
  const ts = new Date().toISOString();
  
  const event: AgentEventEnvelope<T> = {
    id,
    seq,
    ts,
    type,
    runId,
    phase: options?.phase,
    stepId: options?.stepId,
    data,
  };
  
  // Persist to audit log
  await db.insert(agentCommandEvents).values({
    id,
    runId,
    seq,
    type,
    phase: options?.phase as any,
    stepId: options?.stepId,
    payload: data as any,
    ts: new Date(),
  });
  
  // Emit to subscribers (SSE clients)
  agentEventEmitter.emit(event as AgentEventEnvelope);
  
  return event;
}

// ============================================================================
// INTERRUPT BUILDER
// ============================================================================

export interface InterruptOptions {
  type: 'missing_required_fields' | 'conflicting_instructions' | 'risky_action_confirm' | 'low_confidence_decision' | 'ambiguous_intent' | 'external_approval';
  title: string;
  whyNeeded: string;
  questions: InterruptQuestion[];
  defaults?: Record<string, unknown>;
  blocking?: boolean;
  resumeHint?: string;
  timeoutSeconds?: number;
}

export async function raiseInterrupt(
  runId: string,
  stepId: string | null,
  options: InterruptOptions
): Promise<AgentCommandInterrupt> {
  const id = generateId('int');
  
  // Create interrupt record
  const [interrupt] = await db.insert(agentCommandInterrupts).values({
    id,
    runId,
    stepId,
    interruptType: options.type,
    state: 'pending',
    title: options.title,
    whyNeeded: options.whyNeeded,
    questions: options.questions,
    defaults: options.defaults,
    blocking: options.blocking ?? true,
    resumeHint: options.resumeHint,
    timeoutSeconds: options.timeoutSeconds,
    expiresAt: options.timeoutSeconds 
      ? new Date(Date.now() + options.timeoutSeconds * 1000)
      : null,
  }).returning();
  
  // Update run status to paused
  await db.update(agentCommandRuns)
    .set({
      status: 'paused_needs_input',
      lastInterruptId: id,
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  // Emit interrupt event
  await emitEvent(runId, 'interrupt.raised', {
    interruptId: id,
    interruptType: options.type,
    title: options.title,
    whyNeeded: options.whyNeeded,
    questions: options.questions,
    defaults: options.defaults,
    blocking: options.blocking ?? true,
    resumeHint: options.resumeHint,
    questionCount: options.questions.length,
  }, { stepId: stepId ?? undefined });
  
  return interrupt;
}

// ============================================================================
// RESUME HANDLER
// ============================================================================

export async function submitInterruptResponse(
  runId: string,
  interruptId: string,
  response: InterruptResponse,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Get the interrupt
  const [interrupt] = await db.select()
    .from(agentCommandInterrupts)
    .where(and(
      eq(agentCommandInterrupts.id, interruptId),
      eq(agentCommandInterrupts.runId, runId),
    ));
  
  if (!interrupt) {
    return { success: false, error: 'Interrupt not found' };
  }
  
  if (interrupt.state !== 'pending') {
    return { success: false, error: `Interrupt already ${interrupt.state}` };
  }
  
  // Validate response against questions
  const questions = interrupt.questions as InterruptQuestion[];
  const validationErrors: string[] = [];
  
  for (const q of questions) {
    const value = response[q.id];
    
    if (q.required && (value === undefined || value === null || value === '')) {
      validationErrors.push(`${q.label} is required`);
      continue;
    }
    
    if (value !== undefined && q.validationRegex) {
      const regex = new RegExp(q.validationRegex);
      if (!regex.test(String(value))) {
        validationErrors.push(q.validationMessage || `${q.label} is invalid`);
      }
    }
  }
  
  if (validationErrors.length > 0) {
    return { success: false, error: validationErrors.join(', ') };
  }
  
  // Update interrupt with response
  await db.update(agentCommandInterrupts)
    .set({
      state: 'submitted',
      response,
      respondedAt: new Date(),
      respondedByUserId: userId,
    })
    .where(eq(agentCommandInterrupts.id, interruptId));
  
  // Get current run
  const [run] = await db.select()
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  
  // Update run status to resumed
  await db.update(agentCommandRuns)
    .set({
      status: 'resumed',
      resumeCount: (run.resumeCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  // Emit resume event
  await emitEvent(runId, 'interrupt.submitted', {
    interruptId,
    response,
    resumedAt: new Date().toISOString(),
  });
  
  // Continue the run (async)
  setImmediate(() => {
    continueRun(runId, response).catch(err => {
      console.error(`Error continuing run ${runId}:`, err);
    });
  });
  
  return { success: true };
}

// ============================================================================
// INTERRUPT TRIGGERS (Rule-based)
// ============================================================================

interface ParsedIntent {
  action: string;
  confidence: number;
  targetType?: string;
  targetId?: string;
  parameters: Record<string, unknown>;
  missingRequired: string[];
  conflicts: string[];
}

function checkMissingFields(
  intent: ParsedIntent,
  config = defaultInterruptTriggerConfig
): InterruptQuestion[] | null {
  if (!config.missingFieldsCheck.enabled) return null;
  
  const questions: InterruptQuestion[] = [];
  
  for (const field of intent.missingRequired) {
    switch (field) {
      case 'targetAudience':
        questions.push({
          id: 'targetAudience',
          fieldType: 'single_select',
          label: 'Audience source',
          description: 'Who should receive this campaign?',
          required: true,
          options: [
            { value: 'segment', label: 'Segment', description: 'Use an existing segment' },
            { value: 'list', label: 'List', description: 'Use a saved list' },
            { value: 'csv', label: 'Upload CSV', description: 'Import contacts from file' },
            { value: 'filter', label: 'Build new filter', description: 'Create a custom filter' },
          ],
        });
        break;
      
      case 'senderProfile':
        questions.push({
          id: 'senderProfile',
          fieldType: 'entity_picker',
          label: 'Sender profile',
          description: 'Which sender identity to use?',
          required: true,
          entityType: 'sender_profile',
        });
        break;
      
      case 'targetRegion':
        questions.push({
          id: 'targetRegion',
          fieldType: 'single_select',
          label: 'Target region',
          description: 'Which region to target?',
          required: true,
          options: [
            { value: 'north_america', label: 'North America' },
            { value: 'emea', label: 'EMEA' },
            { value: 'apac', label: 'APAC' },
            { value: 'global', label: 'Global', recommended: true },
          ],
        });
        break;
      
      case 'subject':
        questions.push({
          id: 'subject',
          fieldType: 'text_short',
          label: 'Email subject line',
          description: 'What subject line should we use?',
          required: true,
          placeholder: 'Enter subject line...',
          maxLength: 200,
        });
        break;
    }
  }
  
  return questions.length > 0 ? questions : null;
}

function checkConflicts(
  intent: ParsedIntent,
  config = defaultInterruptTriggerConfig
): InterruptQuestion[] | null {
  if (!config.conflictDetection.enabled || intent.conflicts.length === 0) return null;
  
  const questions: InterruptQuestion[] = [];
  
  for (const conflict of intent.conflicts) {
    questions.push({
      id: `resolve_${conflict}`,
      fieldType: 'single_select',
      label: `Resolve: ${conflict}`,
      description: 'How would you like to handle this conflict?',
      required: true,
      options: [
        { value: 'option_a', label: 'Use first instruction' },
        { value: 'option_b', label: 'Use second instruction' },
        { value: 'skip', label: 'Skip this step' },
      ],
    });
  }
  
  return questions;
}

function checkRiskyAction(
  intent: ParsedIntent,
  config = defaultInterruptTriggerConfig
): InterruptQuestion[] | null {
  if (!config.riskyActionConfirm.enabled) return null;
  
  const riskyAction = config.riskyActionConfirm.actions.find(
    a => intent.action.includes(a.action) && a.requiresExplicitConfirm
  );
  
  if (!riskyAction) return null;
  
  return [{
    id: 'confirmAction',
    fieldType: 'confirm',
    label: `Confirm ${intent.action}`,
    description: `This action (${riskyAction.severity} risk) requires your explicit confirmation.`,
    required: true,
  }];
}

function checkConfidence(
  intent: ParsedIntent,
  config = defaultInterruptTriggerConfig
): InterruptQuestion[] | null {
  if (!config.confidenceThreshold.enabled) return null;
  if (intent.confidence >= config.confidenceThreshold.minConfidence) return null;
  
  return [{
    id: 'clarifyIntent',
    fieldType: 'text_long',
    label: 'Please clarify your request',
    description: `I'm not fully confident I understood your request (${Math.round(intent.confidence * 100)}% confidence). Could you provide more details?`,
    required: true,
    placeholder: 'Add more context or rephrase your request...',
  }];
}

export async function evaluateInterruptTriggers(
  runId: string,
  stepId: string | null,
  intent: ParsedIntent
): Promise<boolean> {
  // Check all triggers
  const missingQuestions = checkMissingFields(intent);
  const conflictQuestions = checkConflicts(intent);
  const riskyQuestions = checkRiskyAction(intent);
  const confidenceQuestions = checkConfidence(intent);
  
  const allQuestions: InterruptQuestion[] = [];
  let interruptType: InterruptOptions['type'] = 'missing_required_fields';
  let title = '';
  let whyNeeded = '';
  
  if (missingQuestions) {
    allQuestions.push(...missingQuestions);
    interruptType = 'missing_required_fields';
    title = 'A few details needed';
    whyNeeded = 'To proceed safely, I need some additional information.';
  }
  
  if (conflictQuestions) {
    allQuestions.push(...conflictQuestions);
    interruptType = 'conflicting_instructions';
    title = 'Please resolve conflicting instructions';
    whyNeeded = 'Your request contains instructions that conflict with each other.';
  }
  
  if (riskyQuestions) {
    allQuestions.push(...riskyQuestions);
    interruptType = 'risky_action_confirm';
    title = 'Confirmation required';
    whyNeeded = 'This action has significant impact and requires your explicit approval.';
  }
  
  if (confidenceQuestions) {
    allQuestions.push(...confidenceQuestions);
    interruptType = 'low_confidence_decision';
    title = 'Could you clarify?';
    whyNeeded = "I want to make sure I understand your request correctly.";
  }
  
  if (allQuestions.length === 0) {
    return false; // No interrupt needed
  }
  
  // Raise the interrupt
  await raiseInterrupt(runId, stepId, {
    type: interruptType,
    title,
    whyNeeded,
    questions: allQuestions,
    blocking: true,
  });
  
  return true; // Interrupt was raised
}

// ============================================================================
// RUN LIFECYCLE
// ============================================================================

export async function createRun(
  request: CreateAgentRunRequest,
  userId: string,
  orgId?: number
): Promise<{ runId: string; sseUrl: string }> {
  const runId = generateId('run');
  const requestText = request.requestText || request.request || request.command;
  if (!requestText) {
    throw new Error("Request text is required");
  }
  const requestContext = request.requestContext || request.context;
  
  // Create run record
  await db.insert(agentCommandRuns).values({
    id: runId,
    orgId,
    userId,
    requestText,
    requestContext,
    status: 'queued',
    phase: 'understand',
    dryRun: request.dryRun,
    safeMode: request.safeMode,
  });
  
  // Emit created event
  await emitEvent(runId, 'run.created', {
    runId,
    requestText,
    requestContext,
    dryRun: request.dryRun,
    safeMode: request.safeMode,
  });
  
  // Start the run asynchronously
  setImmediate(() => {
    startRun(runId).catch(err => {
      console.error(`Error starting run ${runId}:`, err);
      failRun(runId, 'INTERNAL_ERROR', err.message);
    });
  });
  
  return {
    runId,
    sseUrl: `/api/agent/runs/${runId}/events`,
  };
}

async function startRun(runId: string): Promise<void> {
  // Update status to running
  await db.update(agentCommandRuns)
    .set({ 
      status: 'running', 
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  await emitEvent(runId, 'run.started', {
    startedAt: new Date().toISOString(),
  });
  
  // Get run details
  const [run] = await db.select()
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  
  try {
    // Phase 1: Understand
    await runPhase(runId, 'understand', async () => {
      return await executeUnderstandPhase(run);
    });
    
    // Check if paused after understand
    if (await isRunPaused(runId)) return;
    
    // Phase 2: Plan
    const plan = await runPhase(runId, 'plan', async () => {
      return await executePlanPhase(run);
    });
    
    if (await isRunPaused(runId)) return;
    
    // Phase 3: Execute
    await runPhase(runId, 'execute', async () => {
      return await executeExecutePhase(runId, plan);
    });
    
    if (await isRunPaused(runId)) return;
    
    // Phase 4: Verify
    await runPhase(runId, 'verify', async () => {
      return await executeVerifyPhase(runId);
    });
    
    if (await isRunPaused(runId)) return;
    
    // Phase 5: Summarize
    await runPhase(runId, 'summarize', async () => {
      return await executeSummarizePhase(runId);
    });
    
    // Complete the run
    await completeRun(runId);
    
  } catch (err: any) {
    await failRun(runId, 'EXECUTION_ERROR', err.message);
  }
}

async function continueRun(runId: string, interruptResponse: InterruptResponse): Promise<void> {
  // Get current run state
  const [run] = await db.select()
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  
  if (!run) {
    console.error(`Run ${runId} not found for continue`);
    return;
  }
  
  // Update status to running
  await db.update(agentCommandRuns)
    .set({ 
      status: 'running',
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  // Merge interrupt response into context
  const updatedContext = {
    ...(run.requestContext as Record<string, unknown> || {}),
    interruptResponses: {
      ...((run.requestContext as any)?.interruptResponses || {}),
      [run.lastInterruptId!]: interruptResponse,
    },
  };
  
  await db.update(agentCommandRuns)
    .set({ requestContext: updatedContext })
    .where(eq(agentCommandRuns.id, runId));
  
  // Resume from current phase
  try {
    const currentPhase = run.phase;
    
    if (currentPhase === 'understand' || currentPhase === 'plan') {
      // Re-run planning with new context
      const plan = await runPhase(runId, 'plan', async () => {
        return await executePlanPhase({ ...run, requestContext: updatedContext });
      });
      
      if (await isRunPaused(runId)) return;
      
      await runPhase(runId, 'execute', async () => {
        return await executeExecutePhase(runId, plan);
      });
    } else if (currentPhase === 'execute') {
      // Continue execution from current step
      const plan = await getRunPlan(runId);
      await executeExecutePhase(runId, plan, run.currentStepIdx ?? 0);
    }
    
    if (await isRunPaused(runId)) return;
    
    // Verify and summarize
    await runPhase(runId, 'verify', async () => {
      return await executeVerifyPhase(runId);
    });
    
    if (await isRunPaused(runId)) return;
    
    await runPhase(runId, 'summarize', async () => {
      return await executeSummarizePhase(runId);
    });
    
    await completeRun(runId);
    
  } catch (err: any) {
    await failRun(runId, 'RESUME_ERROR', err.message);
  }
}

async function isRunPaused(runId: string): Promise<boolean> {
  const [run] = await db.select({ status: agentCommandRuns.status })
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  return run?.status === 'paused_needs_input';
}

async function runPhase<T>(
  runId: string,
  phase: string,
  executor: () => Promise<T>
): Promise<T> {
  // Update phase
  await db.update(agentCommandRuns)
    .set({ 
      phase: phase as any,
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  // Get previous phase for event
  const [run] = await db.select({ phase: agentCommandRuns.phase })
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  
  await emitEvent(runId, 'run.phase.changed', {
    from: run?.phase,
    to: phase,
  }, { phase });
  
  // Execute the phase
  return await executor();
}

async function getRunPlan(runId: string): Promise<PlanStep[]> {
  const steps = await db.select()
    .from(agentCommandSteps)
    .where(eq(agentCommandSteps.runId, runId))
    .orderBy(agentCommandSteps.idx);
  
  return steps.map(s => ({
    title: s.title,
    why: s.why || '',
    toolHint: s.toolName || undefined,
  }));
}

async function completeRun(runId: string): Promise<void> {
  await db.update(agentCommandRuns)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  // Get final outputs
  const artifacts = await db.select()
    .from(agentCommandArtifacts)
    .where(eq(agentCommandArtifacts.runId, runId));
  
  const [run] = await db.select()
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  
  await emitEvent(runId, 'run.completed', {
    completedAt: new Date().toISOString(),
    summary: run.summaryMd,
    outputs: artifacts.map(a => ({
      kind: a.kind,
      title: a.title,
      url: a.url,
      refId: a.refId,
    })),
  });
  
  // Cleanup
  resetSeq(runId);
}

async function failRun(runId: string, errorCode: string, errorMessage: string): Promise<void> {
  await db.update(agentCommandRuns)
    .set({
      status: 'failed',
      errorCode,
      errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  await emitEvent(runId, 'run.failed', {
    errorCode,
    errorMessage,
  });
  
  resetSeq(runId);
}

export async function cancelRun(runId: string): Promise<void> {
  await db.update(agentCommandRuns)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentCommandRuns.id, runId));
  
  await emitEvent(runId, 'run.cancelled', {
    cancelledAt: new Date().toISOString(),
  });
  
  resetSeq(runId);
}

// ============================================================================
// PHASE IMPLEMENTATIONS
// ============================================================================

interface ParsedRequest {
  intent: ParsedIntent;
  normalized: string;
}

async function executeUnderstandPhase(run: AgentCommandRun): Promise<ParsedRequest> {
  const stepId = generateId('step');
  await db.insert(agentCommandSteps).values({
    id: stepId,
    runId: run.id,
    idx: 0,
    title: 'Understanding your request',
    why: 'Analyzing intent and extracting key parameters',
    status: 'running',
    startedAt: new Date(),
  });
  
  await emitEvent(run.id, 'step.started', {
    stepId,
    title: 'Understanding your request',
  }, { phase: 'understand', stepId });

  let parsed: ParsedRequest;

  try {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    const model = process.env.AI_OPERATOR_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const systemPrompt = await buildAgentSystemPrompt(`You are an AI agent understanding a user request for a CRM system. 
          Analyze the user's request and extract the intent.
          Return a JSON object with the following structure:
          {
            "intent": {
              "action": "string (e.g., campaign.create, data.analyze)",
              "confidence": number (0-1),
              "targetType": "string (optional)",
              "parameters": object (extracted parameters),
              "missingRequired": string[] (list of missing required fields),
              "conflicts": string[] (list of potential conflicts)
            },
            "normalized": "string (normalized request text)"
          }`);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: run.requestText }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No response from AI");
    
    parsed = JSON.parse(content) as ParsedRequest;

  } catch (error) {
    console.error("Error in understand phase:", error);
    // Fallback to mock if AI fails
    parsed = {
      intent: {
        action: 'unknown',
        confidence: 0.5,
        parameters: {},
        missingRequired: [],
        conflicts: [],
      },
      normalized: run.requestText,
    };
  }
  
  // Check if we need clarification
  const needsInterrupt = await evaluateInterruptTriggers(run.id, stepId, parsed.intent);
  
  if (!needsInterrupt) {
    await db.update(agentCommandSteps)
      .set({ 
        status: 'done',
        finishedAt: new Date(),
        resultSummary: 'Request understood successfully',
      })
      .where(eq(agentCommandSteps.id, stepId));
    
    await emitEvent(run.id, 'step.completed', {
      stepId,
      resultSummary: 'Request understood successfully',
    }, { phase: 'understand', stepId });
  }
  
  return parsed;
}

interface PlanStep {
  title: string;
  why: string;
  toolHint?: string;
}

async function executePlanPhase(run: AgentCommandRun): Promise<PlanStep[]> {
  let plan: PlanStep[] = [];

  try {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    const model = process.env.AI_OPERATOR_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const systemPrompt = await buildAgentSystemPrompt(`You are an AI agent planning a task for a CRM system.
          Based on the user's request, create a step-by-step execution plan.
          Available tools: ${AVAILABLE_TOOLS.map(t => t.function.name).join(', ')}.
          Return a JSON object with a "steps" array, where each step has:
          - title: string
          - why: string (reasoning)
          - toolHint: string (name of the tool to use, if any)
          `);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: run.requestText }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("No response from AI");
    
    const result = JSON.parse(content);
    plan = result.steps || [];

  } catch (error) {
    console.error("Error in plan phase:", error);
    // Fallback to mock plan
    plan = [
      { title: 'Analyze request', why: 'Fallback plan due to AI error', toolHint: 'analyze_data' }
    ];
  }
  
  // Create step records
  for (let i = 0; i < plan.length; i++) {
    const stepId = generateId('step');
    await db.insert(agentCommandSteps).values({
      id: stepId,
      runId: run.id,
      idx: i + 1, // Start after understand step
      title: plan[i].title,
      why: plan[i].why,
      toolName: plan[i].toolHint,
      status: 'queued',
    });
  }
  
  // Update total steps
  await db.update(agentCommandRuns)
    .set({ totalSteps: plan.length + 1 }) // +1 for understand step
    .where(eq(agentCommandRuns.id, run.id));
  
  // Emit plan created event
  await emitEvent(run.id, 'plan.created', {
    steps: plan.map((s, i) => ({
      idx: i + 1,
      title: s.title,
      why: s.why,
    })),
    totalSteps: plan.length,
  }, { phase: 'plan' });
  
  return plan;
}

async function executeExecutePhase(
  runId: string,
  plan: PlanStep[],
  startFromIdx = 0
): Promise<void> {
  // Get all steps for this run
  const steps = await db.select()
    .from(agentCommandSteps)
    .where(eq(agentCommandSteps.runId, runId))
    .orderBy(agentCommandSteps.idx);
  
  const executeSteps = steps.filter(s => s.idx > 0); // Skip understand step
  
  for (let i = startFromIdx; i < executeSteps.length; i++) {
    const step = executeSteps[i];
    
    // Check if run is still active
    if (await isRunPaused(runId)) {
      return;
    }
    
    // Update current step
    await db.update(agentCommandRuns)
      .set({ currentStepIdx: i })
      .where(eq(agentCommandRuns.id, runId));
    
    // Start step
    await db.update(agentCommandSteps)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(agentCommandSteps.id, step.id));
    
    await emitEvent(runId, 'step.started', {
      stepId: step.id,
      idx: step.idx,
      title: step.title,
      why: step.why,
    }, { phase: 'execute', stepId: step.id });
    
    await emitEvent(runId, 'run.progress', {
      currentStep: i + 1,
      totalSteps: executeSteps.length,
      stepTitle: step.title,
    }, { phase: 'execute' });
    
    try {
      // Execute the step (mock for now)
      await executeStep(runId, step);
      
      // Complete step
      await db.update(agentCommandSteps)
        .set({ 
          status: 'done',
          finishedAt: new Date(),
          resultSummary: `Completed: ${step.title}`,
        })
        .where(eq(agentCommandSteps.id, step.id));
      
      await emitEvent(runId, 'step.completed', {
        stepId: step.id,
        idx: step.idx,
        resultSummary: `Completed: ${step.title}`,
      }, { phase: 'execute', stepId: step.id });
      
    } catch (err: any) {
      await db.update(agentCommandSteps)
        .set({ 
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: err.message,
        })
        .where(eq(agentCommandSteps.id, step.id));
      
      await emitEvent(runId, 'step.failed', {
        stepId: step.id,
        idx: step.idx,
        errorMessage: err.message,
      }, { phase: 'execute', stepId: step.id });
      
      throw err;
    }
  }
}

async function executeStep(runId: string, step: AgentCommandStep): Promise<void> {
  // Emit tool called event
  await emitEvent(runId, 'tool.called', {
    tool: step.toolName || 'unknown',
    stepId: step.id,
    argsRedacted: step.toolArgsRedacted || {},
  }, { phase: 'execute', stepId: step.id });
  
  try {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    const model = process.env.AI_OPERATOR_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const systemPrompt = await buildAgentSystemPrompt(`You are an AI agent executing a step in a CRM task.
          The current step is: "${step.title}" - "${step.why}".
          The suggested tool is: "${step.toolName}".
          Available tools: ${JSON.stringify(AVAILABLE_TOOLS.map(t => ({ name: t.function.name, parameters: t.function.parameters })))}
          
          Call the appropriate tool to complete this step.
          `);

    // Ask AI to generate tool arguments based on the step description
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        }
      ],
      tools: AVAILABLE_TOOLS as any,
      tool_choice: "auto", 
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];
    
    if (toolCall) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      
      // Execute the tool
      const result = await executeTool(toolName, toolArgs);
      
      // Emit tool result
      await emitEvent(runId, 'tool.result', {
        tool: toolName,
        stepId: step.id,
        ok: !result.error,
        resultSummary: result.error ? `Error: ${result.error}` : `Successfully executed ${toolName}`,
        resultData: result
      }, { phase: 'execute', stepId: step.id });

      // Create artifact if applicable (simple heuristic for now)
      if (result.segmentId || result.campaignId || result.entity) {
         const artifactId = generateId('art');
         const kind = result.entity || 'resource';
         const title = `Result from ${toolName}`;
         
         await db.insert(agentCommandArtifacts).values({
            id: artifactId,
            runId,
            stepId: step.id,
            kind,
            title,
            url: '#', // Placeholder
            refId: result.segmentId || result.campaignId || null,
         });

         await emitEvent(runId, 'output.upserted', {
            artifactId,
            kind,
            title,
            url: '#',
         }, { phase: 'execute', stepId: step.id });
      }

    } else {
       // No tool call generated
       await emitEvent(runId, 'tool.result', {
        tool: step.toolName || 'unknown',
        stepId: step.id,
        ok: true,
        resultSummary: `AI decided no tool execution was needed for this step.`,
      }, { phase: 'execute', stepId: step.id });
    }

  } catch (error: any) {
    console.error("Error executing step:", error);
    throw error;
  }
}

async function executeVerifyPhase(runId: string): Promise<void> {
  // Update status
  await db.update(agentCommandRuns)
    .set({ status: 'verifying' })
    .where(eq(agentCommandRuns.id, runId));
  
  // TODO: Run validation checks
  await new Promise(resolve => setTimeout(resolve, 300));
}

async function executeSummarizePhase(runId: string): Promise<void> {
  // Get all artifacts
  const artifacts = await db.select()
    .from(agentCommandArtifacts)
    .where(eq(agentCommandArtifacts.runId, runId));
  
  // Generate summary
  const summary = `## Run Complete\n\nCreated ${artifacts.length} artifact(s):\n` +
    artifacts.map(a => `- **${a.title}** (${a.kind})`).join('\n');
  
  await db.update(agentCommandRuns)
    .set({
      summaryMd: summary,
      outputsJson: artifacts.map(a => ({
        kind: a.kind,
        title: a.title,
        url: a.url,
        refId: a.refId,
      })),
    })
    .where(eq(agentCommandRuns.id, runId));
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

export async function getRun(runId: string): Promise<AgentCommandRun | null> {
  const [run] = await db.select()
    .from(agentCommandRuns)
    .where(eq(agentCommandRuns.id, runId));
  return run || null;
}

export async function getRunSteps(runId: string): Promise<AgentCommandStep[]> {
  return db.select()
    .from(agentCommandSteps)
    .where(eq(agentCommandSteps.runId, runId))
    .orderBy(agentCommandSteps.idx);
}

export async function getRunEvents(
  runId: string,
  afterSeq?: number,
  limit = 100
): Promise<AgentCommandEvent[]> {
  const conditions = [eq(agentCommandEvents.runId, runId)];
  
  if (afterSeq !== undefined) {
    conditions.push(sql`${agentCommandEvents.seq} > ${afterSeq}`);
  }
  
  return db.select()
    .from(agentCommandEvents)
    .where(and(...conditions))
    .orderBy(agentCommandEvents.seq)
    .limit(limit);
}

export async function getRunInterrupts(runId: string): Promise<AgentCommandInterrupt[]> {
  return db.select()
    .from(agentCommandInterrupts)
    .where(eq(agentCommandInterrupts.runId, runId))
    .orderBy(desc(agentCommandInterrupts.createdAt));
}

export async function getPendingInterrupt(runId: string): Promise<AgentCommandInterrupt | null> {
  const [interrupt] = await db.select()
    .from(agentCommandInterrupts)
    .where(and(
      eq(agentCommandInterrupts.runId, runId),
      eq(agentCommandInterrupts.state, 'pending'),
    ))
    .orderBy(desc(agentCommandInterrupts.createdAt))
    .limit(1);
  
  return interrupt || null;
}

export async function listRuns(
  userId: string,
  options?: { limit?: number; status?: string }
): Promise<AgentCommandRun[]> {
  const conditions = [eq(agentCommandRuns.userId, userId)];
  
  if (options?.status) {
    conditions.push(eq(agentCommandRuns.status, options.status as any));
  }
  
  return db.select()
    .from(agentCommandRuns)
    .where(and(...conditions))
    .orderBy(desc(agentCommandRuns.createdAt))
    .limit(options?.limit ?? 20);
}

// Type export for events
export type { AgentCommandEvent } from "@shared/agent-command-center-schema";
