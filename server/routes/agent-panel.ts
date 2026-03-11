/**
 * Agent Panel API Routes
 *
 * Unified agent chat with plan-before-execute functionality
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, verifyToken } from '../auth';
import {
  agentPrompts,
  agentConversations,
  agentExecutionPlans,
  insertAgentConversationSchema,
  insertAgentExecutionPlanSchema,
  type AgentPrompt,
  type AgentConversation,
  type AgentExecutionPlan
} from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import {
  executeResearch,
  executeCodeAssist,
  researchConversation,
  isDeepResearchAvailable,
  type ResearchDomain,
} from '../services/ai-deep-research';
import { kimiChat, isKimiConfigured, type KimiMessage } from '../services/kimi-client';
import { buildAgentXInstructionPrompt } from '../lib/agentx-instructions';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key-change-in-production";

/**
 * Dual auth middleware - accepts both main app tokens and client portal tokens.
 * Sets req.user for main app users, or synthesizes a compatible req.user for client portal users.
 */
function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ message: "Invalid token" });
  }

  // Try main app auth first
  const mainPayload = verifyToken(token);
  if (mainPayload) {
    req.user = mainPayload;
    return next();
  }

  // Try client portal auth
  try {
    const clientPayload = jwt.verify(token, JWT_SECRET) as any;
    if (clientPayload.isClient) {
      // Synthesize a compatible req.user for agent panel endpoints
      req.user = {
        userId: clientPayload.clientUserId,
        role: 'client',
        email: clientPayload.email,
        tenantId: clientPayload.clientAccountId,
      } as any;
      // Also set clientUser for boundary checks
      (req as any).clientUser = clientPayload;
      return next();
    }
  } catch {
    // Token didn't verify as client token either
  }

  return res.status(401).json({ message: "Invalid or expired token" });
}

// All routes require authentication (dual: main app OR client portal)
router.use(requireDualAuth);

// ==================== Types ====================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thoughtProcess?: string[];
  toolsExecuted?: Array<{ tool: string; args: any; result: any }>;
  planId?: string;
}

interface PlannedStep {
  id: string;
  stepNumber: number;
  tool: string;
  description: string;
  args: Record<string, any>;
  isDestructive: boolean;
  estimatedImpact?: string;
}

// ==================== Validation Schemas ====================

const chatRequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  context: z.record(z.any()).optional(),
  planMode: z.boolean().optional().default(true), // Enable plan-before-execute by default
});

const executePlanSchema = z.object({
  modifications: z.object({
    modifiedSteps: z.array(z.object({
      stepId: z.string(),
      originalArgs: z.any(),
      newArgs: z.any(),
    })).optional(),
    removedSteps: z.array(z.string()).optional(),
    addedSteps: z.array(z.object({
      tool: z.string(),
      args: z.any(),
      insertAfter: z.string().optional(),
    })).optional(),
  }).optional(),
});

// ==================== Helper Functions ====================

/**
 * Get active prompts for the user's role
 */
async function getPromptsForUser(userId: string, userRole: string, isClientPortal: boolean = false): Promise<AgentPrompt[]> {
  const conditions = [
    eq(agentPrompts.isActive, true),
    isClientPortal
      ? eq(agentPrompts.isClientPortal, true)
      : or(
          eq(agentPrompts.userRole, userRole as any),
          isNull(agentPrompts.userRole)
        )
  ];

  return db
    .select()
    .from(agentPrompts)
    .where(and(...conditions))
    .orderBy(desc(agentPrompts.priority));
}

/**
 * Build system prompt from multiple prompt entries
 */
function buildSystemPrompt(prompts: AgentPrompt[]): string {
  const systemPrompts = prompts.filter(p => p.promptType === 'system');
  const capabilityPrompts = prompts.filter(p => p.promptType === 'capability');
  const restrictionPrompts = prompts.filter(p => p.promptType === 'restriction');
  const personaPrompts = prompts.filter(p => p.promptType === 'persona');

  let fullPrompt = '';

  // Add persona first
  if (personaPrompts.length > 0) {
    fullPrompt += personaPrompts.map(p => p.promptContent).join('\n\n') + '\n\n';
  }

  // Add system prompts
  if (systemPrompts.length > 0) {
    fullPrompt += systemPrompts.map(p => p.promptContent).join('\n\n') + '\n\n';
  }

  // Add capabilities section
  if (capabilityPrompts.length > 0) {
    fullPrompt += '## Your Capabilities\n';
    fullPrompt += capabilityPrompts.map(p => p.promptContent).join('\n') + '\n\n';
  }

  // Add restrictions section
  if (restrictionPrompts.length > 0) {
    fullPrompt += '## Restrictions\n';
    fullPrompt += restrictionPrompts.map(p => p.promptContent).join('\n') + '\n\n';
  }

  return fullPrompt || 'You are a helpful AI assistant.';
}

/**
 * Build system prompt with AgentX operating instructions injected.
 * Combines: role-based DB prompts + context-aware operating instructions.
 */
function buildSystemPromptWithInstructions(prompts: AgentPrompt[], userMessage: string): string {
  const basePrompt = buildSystemPrompt(prompts);
  const instructions = buildAgentXInstructionPrompt(userMessage);
  return basePrompt + '\n' + instructions;
}

/**
 * Get allowed tools from prompts
 */
function getAllowedTools(prompts: AgentPrompt[]): string[] {
  const allowed = new Set<string>();
  const restricted = new Set<string>();

  for (const prompt of prompts) {
    if (prompt.capabilities) {
      prompt.capabilities.forEach(t => allowed.add(t));
    }
    if (prompt.restrictions) {
      prompt.restrictions.forEach(t => restricted.add(t));
    }
  }

  // Remove restricted tools from allowed
  restricted.forEach(t => allowed.delete(t));

  return Array.from(allowed);
}

/**
 * Determine risk level of execution plan
 */
function determineRiskLevel(steps: PlannedStep[]): 'low' | 'medium' | 'high' {
  const destructiveCount = steps.filter(s => s.isDestructive).length;
  const totalSteps = steps.length;

  if (destructiveCount > 2 || (destructiveCount > 0 && destructiveCount / totalSteps > 0.5)) {
    return 'high';
  }
  if (destructiveCount > 0 || totalSteps > 5) {
    return 'medium';
  }
  return 'low';
}

// ==================== Get Capabilities ====================

router.get('/capabilities', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role || 'agent';
    const isClientPortal = req.query.clientPortal === 'true';

    const prompts = await getPromptsForUser(userId, userRole, isClientPortal);
    const allowedTools = getAllowedTools(prompts);

    res.json({
      role: userRole,
      isClientPortal,
      allowedTools,
      promptCount: prompts.length,
    });
  } catch (error) {
    console.error('[Agent Panel] Error getting capabilities:', error);
    res.status(500).json({ error: 'Failed to get capabilities' });
  }
});

// ==================== Chat Endpoint ====================

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const data = chatRequestSchema.parse(req.body);
    const userId = req.user!.userId;
    const userRole = req.user!.role || 'agent';
    const isClientPortal = req.query.clientPortal === 'true';

    // Get prompts and build system prompt with context-aware instructions
    const prompts = await getPromptsForUser(userId, userRole, isClientPortal);
    const systemPrompt = buildSystemPromptWithInstructions(prompts, data.message);
    const allowedTools = getAllowedTools(prompts);

    // Get or create conversation
    let conversation: AgentConversation | null = null;
    const sessionId = data.sessionId || uuidv4();

    if (data.conversationId) {
      const [existing] = await db
        .select()
        .from(agentConversations)
        .where(
          and(
            eq(agentConversations.id, data.conversationId),
            eq(agentConversations.userId, userId)
          )
        )
        .limit(1);
      conversation = existing;
    }

    if (!conversation) {
      const [newConversation] = await db
        .insert(agentConversations)
        .values({
          userId,
          sessionId,
          messages: [],
          context: data.context || {},
          isActive: true,
        })
        .returning();
      conversation = newConversation;
    }

    // Add user message to conversation
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: data.message,
      timestamp: new Date().toISOString(),
    };

    const currentMessages = (conversation.messages as ChatMessage[]) || [];
    const updatedMessages = [...currentMessages, userMessage];

    // ─── Generate AI response via Kimi or fallback ───
    let aiContent = '';
    let thoughtProcess: string[] = [];

    if (isKimiConfigured()) {
      try {
        // Detect research intent and code intent
        const msgLower = data.message.toLowerCase();
        const isResearchQuery = /\b(research|analyze|analysis|investigate|deep dive|market|competitive|industry|trends|account research)\b/.test(msgLower);
        const isCodeQuery = /\b(code|debug|refactor|implement|function|class|component|api|endpoint|fix bug|write a)\b/.test(msgLower);

        if (isResearchQuery && isDeepResearchAvailable()) {
          // Route to deep research
          const domain = detectResearchDomain(data.message);
          const depth = msgLower.includes('deep') || msgLower.includes('comprehensive') ? 'deep' as const : 'standard' as const;

          thoughtProcess = [
            `Detected research query (domain: ${domain}, depth: ${depth})`,
            'Routing to Kimi deep research engine (128k context)...',
            'Analyzing with cross-validation...',
          ];

          const result = await executeResearch({
            query: data.message,
            depth,
            domain,
            additionalContext: data.context?.additionalContext,
            organizationId: data.context?.organizationId,
          });

          aiContent = result.answer;
          if (result.thinking) {
            thoughtProcess.push('Deep reasoning completed');
          }
          if (result.provider === 'hybrid') {
            thoughtProcess.push('Cross-validated with Vertex AI reasoning');
          }
          thoughtProcess.push(`Confidence: ${result.confidence}%`);

        } else if (isCodeQuery && isDeepResearchAvailable()) {
          // Route to code assist
          thoughtProcess = [
            'Detected code assistance request',
            'Routing to Kimi code engine...',
          ];

          const result = await executeCodeAssist({
            task: data.message,
            codeContext: data.context?.codeContext,
            language: data.context?.language,
            framework: data.context?.framework,
          });

          aiContent = `**Code Solution:**\n\`\`\`\n${result.code}\n\`\`\`\n\n**Explanation:** ${result.explanation}`;
          if (result.suggestions.length > 0) {
            aiContent += `\n\n**Suggestions:**\n${result.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
          }
          thoughtProcess.push('Code generation complete');

        } else {
          // General chat via Kimi
          thoughtProcess = [
            'Processing with Kimi AI...',
            'Building context from conversation history...',
          ];

          const kimiMessages: KimiMessage[] = currentMessages
            .slice(-10)
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
          kimiMessages.push({ role: 'user', content: data.message });

          aiContent = await kimiChat(
            systemPrompt,
            kimiMessages,
            { model: 'standard', temperature: 0.7 }
          );
          thoughtProcess.push('Response generated');
        }
      } catch (kimiError: any) {
        console.warn('[Agent Panel] Kimi AI error, using fallback:', kimiError.message);
        aiContent = `I understand your request: "${data.message}". I'm analyzing what needs to be done.`;
        thoughtProcess = ['AI provider temporarily unavailable', 'Using structured plan mode...'];
      }
    } else {
      // Kimi not configured — use informative fallback
      aiContent = `I understand your request: "${data.message}". I'm analyzing what needs to be done.`;
      thoughtProcess = ['Analyzing user request...', 'Identifying required tools...', 'Preparing execution plan...'];
    }

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: aiContent,
      timestamp: new Date().toISOString(),
      thoughtProcess,
    };

    // If plan mode is enabled, create an execution plan
    let plan: AgentExecutionPlan | null = null;
    if (data.planMode) {
      // Generate a mock plan based on the message
      const plannedSteps: PlannedStep[] = [];

      // Simple keyword-based plan generation (replace with AI in production)
      if (data.message.toLowerCase().includes('campaign')) {
        plannedSteps.push({
          id: uuidv4(),
          stepNumber: 1,
          tool: 'search_records',
          description: 'Search for campaigns matching criteria',
          args: { entity: 'campaign', limit: 10 },
          isDestructive: false,
        });
      }

      if (data.message.toLowerCase().includes('create')) {
        plannedSteps.push({
          id: uuidv4(),
          stepNumber: plannedSteps.length + 1,
          tool: 'create_campaign',
          description: 'Create new campaign based on specifications',
          args: { type: 'email', status: 'draft' },
          isDestructive: false,
          estimatedImpact: 'Creates a new draft campaign',
        });
      }

      if (plannedSteps.length === 0) {
        plannedSteps.push({
          id: uuidv4(),
          stepNumber: 1,
          tool: 'search_records',
          description: 'Search for relevant data',
          args: { limit: 10 },
          isDestructive: false,
        });
      }

      // Add task_complete step
      plannedSteps.push({
        id: uuidv4(),
        stepNumber: plannedSteps.length + 1,
        tool: 'task_complete',
        description: 'Mark task as complete and summarize results',
        args: {},
        isDestructive: false,
      });

      // Create the plan in database
      const [newPlan] = await db
        .insert(agentExecutionPlans)
        .values({
          conversationId: conversation.id,
          userId,
          requestMessage: data.message,
          plannedSteps,
          riskLevel: determineRiskLevel(plannedSteps),
          affectedEntities: [],
          status: 'pending',
        })
        .returning();

      plan = newPlan;
      assistantMessage.planId = plan.id;
      assistantMessage.content = `I've created an execution plan for your request. Please review the ${plannedSteps.length} steps below and approve when ready.`;
    }

    // Update conversation with new messages
    const finalMessages = [...updatedMessages, assistantMessage];
    await db
      .update(agentConversations)
      .set({
        messages: finalMessages,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentConversations.id, conversation.id));

    res.json({
      conversationId: conversation.id,
      sessionId,
      message: assistantMessage,
      plan: plan ? {
        id: plan.id,
        steps: plan.plannedSteps,
        riskLevel: plan.riskLevel,
        status: plan.status,
      } : null,
      capabilities: allowedTools,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Agent Panel] Error in chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// ==================== Generate Plan (without executing) ====================

router.post('/plan', async (req: Request, res: Response) => {
  try {
    const data = chatRequestSchema.parse(req.body);
    const userId = req.user!.userId;
    const userRole = req.user!.role || 'agent';

    // Generate plan without executing
    const prompts = await getPromptsForUser(userId, userRole, false);
    const allowedTools = getAllowedTools(prompts);

    // Mock plan generation (replace with AI in production)
    const plannedSteps: PlannedStep[] = [
      {
        id: uuidv4(),
        stepNumber: 1,
        tool: 'search_records',
        description: 'Analyze request and gather relevant data',
        args: { entity: 'auto', query: data.message },
        isDestructive: false,
      },
      {
        id: uuidv4(),
        stepNumber: 2,
        tool: 'task_complete',
        description: 'Summarize findings',
        args: {},
        isDestructive: false,
      }
    ];

    const [plan] = await db
      .insert(agentExecutionPlans)
      .values({
        userId,
        requestMessage: data.message,
        plannedSteps,
        riskLevel: determineRiskLevel(plannedSteps),
        affectedEntities: [],
        status: 'pending',
      })
      .returning();

    res.json({
      planId: plan.id,
      steps: plannedSteps,
      riskLevel: plan.riskLevel,
      status: 'pending',
      allowedTools,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Agent Panel] Error generating plan:', error);
    res.status(500).json({ error: 'Failed to generate plan' });
  }
});

// ==================== Execute Approved Plan ====================

router.post('/execute/:planId', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const data = executePlanSchema.parse(req.body);
    const userId = req.user!.userId;

    // Get the plan
    const [plan] = await db
      .select()
      .from(agentExecutionPlans)
      .where(
        and(
          eq(agentExecutionPlans.id, planId),
          eq(agentExecutionPlans.userId, userId)
        )
      )
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.status !== 'pending') {
      return res.status(400).json({ error: `Plan is already ${plan.status}` });
    }

    // Update plan status to approved/executing
    await db
      .update(agentExecutionPlans)
      .set({
        status: 'executing',
        approvedBy: userId,
        approvedAt: new Date(),
        userModifications: (data.modifications as any) || null,
        executionStartedAt: new Date(),
      })
      .where(
        and(
          eq(agentExecutionPlans.id, planId),
          eq(agentExecutionPlans.userId, userId)
        )
      );

    // Execute steps (mock execution for now)
    const executedSteps: Array<{
      stepId: string;
      executedAt: string;
      result: any;
      success: boolean;
      error?: string;
    }> = [];

    const steps = plan.plannedSteps as PlannedStep[];
    for (const step of steps) {
      // Check if step was removed
      if (data.modifications?.removedSteps?.includes(step.id)) {
        continue;
      }

      // Mock execution result
      executedSteps.push({
        stepId: step.id,
        executedAt: new Date().toISOString(),
        result: { success: true, message: `Executed ${step.tool}` },
        success: true,
      });
    }

    // Update plan with results
    await db
      .update(agentExecutionPlans)
      .set({
        status: 'completed',
        executedSteps,
        executionCompletedAt: new Date(),
      })
      .where(
        and(
          eq(agentExecutionPlans.id, planId),
          eq(agentExecutionPlans.userId, userId)
        )
      );

    res.json({
      planId,
      status: 'completed',
      executedSteps,
      message: 'Plan executed successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Agent Panel] Error executing plan:', error);
    res.status(500).json({ error: 'Failed to execute plan' });
  }
});

// ==================== Reject Plan ====================

router.post('/reject/:planId', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const { reason } = req.body;
    const userId = req.user!.userId;

    const [plan] = await db
      .select()
      .from(agentExecutionPlans)
      .where(
        and(
          eq(agentExecutionPlans.id, planId),
          eq(agentExecutionPlans.userId, userId)
        )
      )
      .limit(1);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    await db
      .update(agentExecutionPlans)
      .set({
        status: 'rejected',
        rejectionReason: reason || 'User rejected the plan',
      })
      .where(
        and(
          eq(agentExecutionPlans.id, planId),
          eq(agentExecutionPlans.userId, userId)
        )
      );

    res.json({
      planId,
      status: 'rejected',
      message: 'Plan rejected',
    });
  } catch (error) {
    console.error('[Agent Panel] Error rejecting plan:', error);
    res.status(500).json({ error: 'Failed to reject plan' });
  }
});

// ==================== Get Conversation ====================

router.get('/conversation/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const [conversation] = await db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.userId, userId)
        )
      )
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('[Agent Panel] Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// ==================== List Conversations ====================

router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    const conversations = await db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.userId, userId),
          eq(agentConversations.isActive, true)
        )
      )
      .orderBy(desc(agentConversations.lastMessageAt))
      .limit(limit);

    res.json(conversations);
  } catch (error) {
    console.error('[Agent Panel] Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// ==================== Delete Conversation ====================

router.delete('/conversation/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    await db
      .update(agentConversations)
      .set({ isActive: false })
      .where(
        and(
          eq(agentConversations.id, id),
          eq(agentConversations.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('[Agent Panel] Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ==================== Helper: detect research domain from message ====================

function detectResearchDomain(message: string): ResearchDomain {
  const msg = message.toLowerCase();

  if (/\b(market|market size|tam|sam|som|market trend|market analysis)\b/.test(msg)) return 'market_analysis';
  if (/\b(compet|rival|battlecard|swot|positioning|differentiator)\b/.test(msg)) return 'competitive_intelligence';
  if (/\b(account|company research|buying signal|stakeholder|org chart)\b/.test(msg)) return 'account_research';
  if (/\b(campaign|strategy|channel|messaging|funnel|conversion)\b/.test(msg)) return 'campaign_strategy';
  if (/\b(lead|qualification|scoring|intent|engagement pattern)\b/.test(msg)) return 'lead_analysis';
  if (/\b(industry|trend|regulation|emerging|forecast)\b/.test(msg)) return 'industry_trends';
  if (/\b(code|debug|refactor|implement|typescript|react|api|bug)\b/.test(msg)) return 'code_review';

  return 'general';
}

// ==================== AgentX Instructions & Model Catalog ====================

router.get('/instructions', requireDualAuth, async (_req: Request, res: Response) => {
  try {
    const { getModelCatalog, getAgentXInstructions, MODEL_SELECTION_STRATEGY } = await import('../lib/agentx-instructions');
    res.json({
      modelCatalog: getModelCatalog(),
      modelStrategy: MODEL_SELECTION_STRATEGY,
      instructions: {
        coding: getAgentXInstructions('coding'),
        security: getAgentXInstructions('security'),
        ui: getAgentXInstructions('ui'),
      },
    });
  } catch (error) {
    console.error('[Agent Panel] Error getting instructions:', error);
    res.status(500).json({ error: 'Failed to get instructions' });
  }
});

export default router;
