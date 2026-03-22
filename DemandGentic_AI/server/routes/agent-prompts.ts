/**
 * Agent Prompts Management API Routes
 *
 * CRUD operations for managing role-based agent prompts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, and, desc, isNull, or } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, requireRole } from '../auth';
import {
  agentPrompts,
  agentPromptHistory,
  insertAgentPromptSchema,
  type AgentPrompt,
  type InsertAgentPrompt
} from '@shared/schema';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ==================== Validation Schemas ====================

const createPromptSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  userRole: z.enum(['admin', 'agent', 'quality_analyst', 'content_creator', 'campaign_manager', 'data_ops']).optional().nullable(),
  iamRoleId: z.string().uuid().optional().nullable(),
  isClientPortal: z.boolean().optional().default(false),
  promptType: z.enum(['system', 'capability', 'restriction', 'persona', 'context']).optional().default('system'),
  promptContent: z.string().min(1),
  capabilities: z.array(z.string()).optional().nullable(),
  restrictions: z.array(z.string()).optional().nullable(),
  contextRules: z.record(z.any()).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(0),
});

const updatePromptSchema = createPromptSchema.partial().extend({
  changeReason: z.string().optional(),
});

// ==================== List All Prompts ====================

router.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { role, type, active, isClientPortal } = req.query;

    let query = db.select().from(agentPrompts);

    // Build conditions array
    const conditions: any[] = [];

    if (role && role !== 'all') {
      conditions.push(eq(agentPrompts.userRole, role as any));
    }

    if (type && type !== 'all') {
      conditions.push(eq(agentPrompts.promptType, type as any));
    }

    if (active !== undefined) {
      conditions.push(eq(agentPrompts.isActive, active === 'true'));
    }

    if (isClientPortal !== undefined) {
      conditions.push(eq(agentPrompts.isClientPortal, isClientPortal === 'true'));
    }

    const results = await db
      .select()
      .from(agentPrompts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentPrompts.priority), desc(agentPrompts.createdAt));

    res.json(results);
  } catch (error) {
    console.error('[Agent Prompts] Error listing prompts:', error);
    res.status(500).json({ error: 'Failed to list agent prompts' });
  }
});

// ==================== Get Prompts for Role ====================

router.get('/role/:role', async (req: Request, res: Response) => {
  try {
    const { role } = req.params;
    const isClient = role === 'client';

    // Get prompts for the specified role (active only)
    const results = await db
      .select()
      .from(agentPrompts)
      .where(
        and(
          eq(agentPrompts.isActive, true),
          isClient
            ? eq(agentPrompts.isClientPortal, true)
            : or(
                eq(agentPrompts.userRole, role as any),
                isNull(agentPrompts.userRole) // Universal prompts
              )
        )
      )
      .orderBy(desc(agentPrompts.priority));

    res.json(results);
  } catch (error) {
    console.error('[Agent Prompts] Error getting role prompts:', error);
    res.status(500).json({ error: 'Failed to get role prompts' });
  }
});

// ==================== Get Single Prompt ====================

router.get('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [prompt] = await db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.id, id))
      .limit(1);

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(prompt);
  } catch (error) {
    console.error('[Agent Prompts] Error getting prompt:', error);
    res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// ==================== Create Prompt ====================

router.post('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const data = createPromptSchema.parse(req.body);
    const userId = (req as any).userId;

    const [prompt] = await db
      .insert(agentPrompts)
      .values({
        ...data,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    res.status(201).json(prompt);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Agent Prompts] Error creating prompt:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// ==================== Update Prompt ====================

router.put('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updatePromptSchema.parse(req.body);
    const userId = (req as any).userId;
    const { changeReason, ...updateData } = data;

    // Get current prompt for history
    const [currentPrompt] = await db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.id, id))
      .limit(1);

    if (!currentPrompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Save to history if content changed
    if (updateData.promptContent && updateData.promptContent !== currentPrompt.promptContent) {
      await db.insert(agentPromptHistory).values({
        agentPromptId: id,
        previousContent: currentPrompt.promptContent,
        previousCapabilities: currentPrompt.capabilities,
        previousRestrictions: currentPrompt.restrictions,
        changeReason: changeReason || 'Manual update',
        version: currentPrompt.version,
        changedBy: userId,
      });
    }

    // Update the prompt
    const [updated] = await db
      .update(agentPrompts)
      .set({
        ...updateData,
        version: currentPrompt.version + 1,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(agentPrompts.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[Agent Prompts] Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// ==================== Delete Prompt (Soft Delete) ====================

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;

    const [prompt] = await db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.id, id))
      .limit(1);

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Soft delete by setting isActive to false
    await db
      .update(agentPrompts)
      .set({
        isActive: false,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(agentPrompts.id, id));

    res.json({ success: true, message: 'Prompt deactivated' });
  } catch (error) {
    console.error('[Agent Prompts] Error deleting prompt:', error);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

// ==================== Get Prompt History ====================

router.get('/:id/history', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const history = await db
      .select()
      .from(agentPromptHistory)
      .where(eq(agentPromptHistory.agentPromptId, id))
      .orderBy(desc(agentPromptHistory.version));

    res.json(history);
  } catch (error) {
    console.error('[Agent Prompts] Error getting prompt history:', error);
    res.status(500).json({ error: 'Failed to get prompt history' });
  }
});

// ==================== Restore Prompt Version ====================

router.post('/:id/restore/:version', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, version } = req.params;
    const userId = (req as any).userId;

    // Get the history entry
    const [historyEntry] = await db
      .select()
      .from(agentPromptHistory)
      .where(
        and(
          eq(agentPromptHistory.agentPromptId, id),
          eq(agentPromptHistory.version, parseInt(version))
        )
      )
      .limit(1);

    if (!historyEntry) {
      return res.status(404).json({ error: 'History version not found' });
    }

    // Get current prompt
    const [currentPrompt] = await db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.id, id))
      .limit(1);

    if (!currentPrompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Save current state to history before restore
    await db.insert(agentPromptHistory).values({
      agentPromptId: id,
      previousContent: currentPrompt.promptContent,
      previousCapabilities: currentPrompt.capabilities,
      previousRestrictions: currentPrompt.restrictions,
      changeReason: `Restored from version ${version}`,
      version: currentPrompt.version,
      changedBy: userId,
    });

    // Restore the old version
    const [restored] = await db
      .update(agentPrompts)
      .set({
        promptContent: historyEntry.previousContent,
        capabilities: historyEntry.previousCapabilities,
        restrictions: historyEntry.previousRestrictions,
        version: currentPrompt.version + 1,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(agentPrompts.id, id))
      .returning();

    res.json(restored);
  } catch (error) {
    console.error('[Agent Prompts] Error restoring prompt:', error);
    res.status(500).json({ error: 'Failed to restore prompt' });
  }
});

// ==================== Get Available Tools ====================

router.get('/tools/available', async (req: Request, res: Response) => {
  try {
    // List of all available tools that can be assigned to prompts
    const tools = [
      // CRM Tools
      { id: 'count_records', name: 'Count Records', category: 'CRM', description: 'Count entities in CRM' },
      { id: 'search_records', name: 'Search Records', category: 'CRM', description: 'Search with filters and pagination' },
      { id: 'get_record_by_id', name: 'Get Record', category: 'CRM', description: 'Fetch single record details' },
      { id: 'list_recent_activity', name: 'List Activity', category: 'CRM', description: 'Recent CRM events' },

      // Campaign Tools
      { id: 'get_campaign_analytics', name: 'Campaign Analytics', category: 'Campaigns', description: 'Campaign performance metrics' },
      { id: 'create_campaign', name: 'Create Campaign', category: 'Campaigns', description: 'Create draft campaigns' },
      { id: 'create_segment', name: 'Create Segment', category: 'Campaigns', description: 'Create contact segments' },

      // Analytics Tools
      { id: 'get_pipeline_summary', name: 'Pipeline Summary', category: 'Analytics', description: 'Sales pipeline overview' },
      { id: 'analyze_data', name: 'Analyze Data', category: 'Analytics', description: 'Custom data analysis' },

      // Client Portal Tools
      { id: 'list_campaigns', name: 'List Campaigns', category: 'Client Portal', description: 'View client campaigns' },
      { id: 'get_campaign_details', name: 'Campaign Details', category: 'Client Portal', description: 'Get campaign details' },
      { id: 'list_orders', name: 'List Orders', category: 'Client Portal', description: 'View client orders' },
      { id: 'get_order_status', name: 'Order Status', category: 'Client Portal', description: 'Check order status' },
      { id: 'get_billing_summary', name: 'Billing Summary', category: 'Client Portal', description: 'View billing information' },
      { id: 'list_invoices', name: 'List Invoices', category: 'Client Portal', description: 'View invoices' },
      { id: 'get_analytics_summary', name: 'Analytics Summary', category: 'Client Portal', description: 'View analytics' },
      { id: 'create_order', name: 'Create Order', category: 'Client Portal', description: 'Submit new orders' },
      { id: 'request_new_campaign', name: 'Request Campaign', category: 'Client Portal', description: 'Request new campaign' },

      // System Tools
      { id: 'task_complete', name: 'Task Complete', category: 'System', description: 'Signal task completion' },
      { id: 'navigate', name: 'Navigate', category: 'System', description: 'Navigate to pages' },
    ];

    res.json(tools);
  } catch (error) {
    console.error('[Agent Prompts] Error getting tools:', error);
    res.status(500).json({ error: 'Failed to get tools' });
  }
});

// ==================== Seed Default Prompts ====================

router.post('/seed-defaults', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    // Check if defaults already exist
    const existing = await db
      .select()
      .from(agentPrompts)
      .where(eq(agentPrompts.name, 'Admin System Prompt'))
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Default prompts already exist' });
    }

    // Seed default prompts for each role
    const defaultPrompts: InsertAgentPrompt[] = [
      {
        name: 'Admin System Prompt',
        description: 'Full access system prompt for administrators',
        userRole: 'admin',
        promptType: 'system',
        promptContent: `You are an AI assistant for the DemandGentic platform with full administrative access. You can help with:
- Managing campaigns (create, update, analyze)
- Viewing and managing contacts and accounts
- Analyzing sales pipeline and performance
- Creating segments and lists
- System configuration and settings

Always be helpful, accurate, and transparent about what actions you are taking.`,
        capabilities: ['count_records', 'search_records', 'get_record_by_id', 'get_campaign_analytics', 'get_pipeline_summary', 'list_recent_activity', 'create_segment', 'analyze_data', 'create_campaign', 'task_complete'],
        restrictions: [],
        priority: 100,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      {
        name: 'Campaign Manager Prompt',
        description: 'Campaign-focused prompt for campaign managers',
        userRole: 'campaign_manager',
        promptType: 'system',
        promptContent: `You are an AI assistant helping campaign managers with the DemandGentic platform. You can help with:
- Creating and managing campaigns
- Analyzing campaign performance
- Creating audience segments
- Viewing leads and contacts

You cannot modify system settings or manage users.`,
        capabilities: ['count_records', 'search_records', 'get_record_by_id', 'get_campaign_analytics', 'list_recent_activity', 'create_segment', 'analyze_data', 'create_campaign', 'task_complete'],
        restrictions: [],
        priority: 80,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      {
        name: 'Client Portal Prompt',
        description: 'Restricted prompt for client portal users',
        userRole: null,
        isClientPortal: true,
        promptType: 'system',
        promptContent: `You are an AI assistant for DemandGentic client portal. You help clients with:
- Viewing their campaigns and performance
- Checking order status
- Viewing billing and invoices
- Understanding analytics

You can only access data that belongs to the client. Be helpful and professional.`,
        capabilities: ['list_campaigns', 'get_campaign_details', 'list_orders', 'get_order_status', 'get_billing_summary', 'list_invoices', 'get_analytics_summary', 'navigate', 'task_complete'],
        restrictions: ['create_campaign', 'search_records', 'analyze_data'],
        priority: 50,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      {
        name: 'Quality Analyst Prompt',
        description: 'QA-focused prompt for quality analysts',
        userRole: 'quality_analyst',
        promptType: 'system',
        promptContent: `You are an AI assistant helping quality analysts with the DemandGentic platform. You can help with:
- Reviewing leads and their quality
- Analyzing call recordings and transcripts
- Viewing campaign performance metrics
- Searching contacts and accounts

You cannot create or modify campaigns.`,
        capabilities: ['count_records', 'search_records', 'get_record_by_id', 'get_campaign_analytics', 'list_recent_activity', 'analyze_data', 'task_complete'],
        restrictions: ['create_campaign', 'create_segment'],
        priority: 70,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    ];

    const results = await db.insert(agentPrompts).values(defaultPrompts).returning();

    res.status(201).json({
      success: true,
      message: `Created ${results.length} default prompts`,
      prompts: results
    });
  } catch (error) {
    console.error('[Agent Prompts] Error seeding defaults:', error);
    res.status(500).json({ error: 'Failed to seed default prompts' });
  }
});

export default router;