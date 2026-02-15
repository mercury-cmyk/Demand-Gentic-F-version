/**
 * Unified Prompt Management API Routes
 * 
 * Single entry point for ALL prompt management operations:
 * - CRUD for prompts (registry, role-based, foundational)
 * - Version history and rollback
 * - A/B testing and variants
 * - Outcome tracking and analytics
 * - Learning and optimization
 * - Sync and discovery
 * 
 * Base path: /api/prompts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth';
import {
  unifiedPromptService,
  type PromptSource,
  type PromptCategory,
} from '../services/unified-prompt-service';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ==================== Validation Schemas ====================

const listPromptsSchema = z.object({
  source: z.enum(['registry', 'role_based', 'variant', 'foundational']).optional(),
  category: z.enum(['voice', 'email', 'intelligence', 'compliance', 'system']).optional(),
  agentType: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  search: z.string().optional(),
  tags: z.string().optional().transform(v => v?.split(',')),
  // Enhanced governance filters
  department: z.string().optional(),
  promptFunction: z.string().optional(),
  purpose: z.string().optional(),
  aiModel: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  entity: z.string().optional(),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 50),
  offset: z.string().optional().transform(v => v ? parseInt(v) : 0),
  orderBy: z.enum(['name', 'priority', 'updatedAt', 'version']).optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

const createPromptSchema = z.object({
  promptKey: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  promptType: z.enum(['foundational', 'system', 'specialized', 'template']).optional(),
  promptScope: z.enum(['global', 'organization', 'campaign', 'agent_type']).optional(),
  agentType: z.string().optional(),
  category: z.enum(['voice', 'email', 'intelligence', 'compliance', 'system']).optional(),
  content: z.string().min(1),
  defaultContent: z.string().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  sourceFile: z.string().optional(),
  sourceLine: z.number().optional(),
  sourceExport: z.string().optional(),
});

const updatePromptSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  content: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  changeDescription: z.string().optional(),
});

const createVariantSchema = z.object({
  accountId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  virtualAgentId: z.string().uuid().optional(),
  variantName: z.string().min(1).max(100),
  perspective: z.enum([
    'consultative', 'direct_value', 'pain_point', 'social_proof',
    'educational', 'urgent', 'relationship'
  ]),
  systemPrompt: z.string().min(1),
  firstMessage: z.string().optional(),
  context: z.record(z.any()).optional(),
  isDefault: z.boolean().optional(),
});

const recordTestSchema = z.object({
  variantId: z.string().uuid(),
  campaignId: z.string().uuid(),
  callAttemptId: z.string().uuid().optional(),
  disposition: z.string().optional(),
  duration: z.number().int().optional(),
  engagementScore: z.number().min(0).max(1).optional(),
  successful: z.boolean(),
  notes: z.string().optional(),
});

const analyticsQuerySchema = z.object({
  startDate: z.string().optional().transform(v => v ? new Date(v) : undefined),
  endDate: z.string().optional().transform(v => v ? new Date(v) : undefined),
  campaignId: z.string().uuid().optional(),
  category: z.enum(['voice', 'email', 'intelligence', 'compliance', 'system']).optional(),
  agentType: z.string().optional(),
});

// ==================== LIST & QUERY ====================

/**
 * GET /api/prompts
 * List all prompts with unified interface
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listPromptsSchema.parse(req.query);
    const result = await unifiedPromptService.listAll(query);

    res.json({
      success: true,
      ...result,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset! + result.prompts.length < result.total,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[UnifiedPrompts] GET / error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/categories
 * Get available prompt categories with metadata
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = [
      {
        id: 'voice',
        name: 'Voice Agents',
        description: 'Prompts for voice-based AI agents (phone calls)',
        icon: 'Phone',
        color: 'blue',
      },
      {
        id: 'email',
        name: 'Email Agents',
        description: 'Prompts for email-based AI agents',
        icon: 'Mail',
        color: 'purple',
      },
      {
        id: 'intelligence',
        name: 'Intelligence',
        description: 'Prompts for research and analysis agents',
        icon: 'Brain',
        color: 'yellow',
      },
      {
        id: 'compliance',
        name: 'Compliance',
        description: 'Prompts for regulatory and compliance checks',
        icon: 'Shield',
        color: 'red',
      },
      {
        id: 'system',
        name: 'System',
        description: 'Core system prompts and utilities',
        icon: 'Settings',
        color: 'gray',
      },
    ];
    res.json({ success: true, categories });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /categories error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/stats
 * Get prompt statistics by category and type
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const counts = await unifiedPromptService.getCategoryCounts();
    const { total } = await unifiedPromptService.listAll({ limit: 0 });

    const stats = {
      total,
      byCategory: counts,
      byType: {
        foundational: 0,
        system: 0,
        specialized: 0,
        template: 0,
      },
      recentlyUpdated: 0,
    };
    res.json(stats);
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/tags
 * Get all unique tags
 */
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const tags = await unifiedPromptService.getAllTags();
    res.json({ success: true, tags });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /tags error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/drifted
 * Get prompts that have drifted from their defaults
 */
router.get('/drifted', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const drifted = await unifiedPromptService.getDriftedPrompts();
    res.json({ success: true, prompts: drifted, count: drifted.length });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /drifted error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATIC ROUTES (MUST BE BEFORE /:id) ====================

/**
 * GET /api/prompts/summary
 * Get a summary of the entire prompt management system
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const [
      { prompts, total },
      categories,
      tags,
      drifted,
      analytics,
    ] = await Promise.all([
      unifiedPromptService.listAll({ limit: 0 }),
      unifiedPromptService.getCategoryCounts(),
      unifiedPromptService.getAllTags(),
      unifiedPromptService.getDriftedPrompts(),
      unifiedPromptService.getAggregateAnalytics(),
    ]);

    res.json({
      success: true,
      summary: {
        totalPrompts: total,
        byCategory: categories,
        totalTags: tags.length,
        driftedCount: drifted.length,
        analytics,
        sources: {
          registry: prompts.filter(p => p.source === 'registry').length,
          role_based: prompts.filter(p => p.source === 'role_based').length,
          foundational: prompts.filter(p => p.source === 'foundational').length,
        },
      },
    });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/analytics
 * Get aggregate analytics across all prompts
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    const analytics = await unifiedPromptService.getAggregateAnalytics(query);

    res.json({ success: true, analytics });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[UnifiedPrompts] GET /analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prompts/sync
 * Sync foundational prompts from code to database
 */
router.post('/sync', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await unifiedPromptService.syncFoundationalPrompts(userId);

    res.json({
      success: true,
      message: `Synced foundational prompts`,
      result,
    });
  } catch (error: any) {
    console.error('[UnifiedPrompts] POST /sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/variants
 * List all variants
 */
router.get('/variants', async (req: Request, res: Response) => {
  try {
    const { accountId, campaignId, virtualAgentId, isActive } = req.query;

    const variants = await unifiedPromptService.listVariants({
      accountId: accountId as string | undefined,
      campaignId: campaignId as string | undefined,
      virtualAgentId: virtualAgentId as string | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });

    res.json({ success: true, variants });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /variants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prompts/variants
 * Create a new variant for A/B testing
 */
router.post('/variants', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const data = createVariantSchema.parse(req.body);
    const userId = (req as any).userId;

    const variant = await unifiedPromptService.createVariant({
      ...data,
      userId,
    });

    res.status(201).json({ success: true, variant });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[UnifiedPrompts] POST /variants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/variants/:id/stats
 * Get statistics for a variant
 */
router.get('/variants/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stats = await unifiedPromptService.getVariantStats(id);

    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /variants/:id/stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prompts/variants/test
 * Record a variant test result
 */
router.post('/variants/test', async (req: Request, res: Response) => {
  try {
    const data = recordTestSchema.parse(req.body);
    await unifiedPromptService.recordVariantTest(data);

    res.json({ success: true, message: 'Test result recorded' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[UnifiedPrompts] POST /variants/test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/key/:key
 * Get a prompt by its key (e.g., 'email.generation', 'foundational.voice')
 */
router.get('/key/:key(*)', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const prompt = await unifiedPromptService.getByKey(key);

    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, prompt });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /key/:key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GOVERNANCE & AUDIT ENDPOINTS (must be before /:id) ====================

/**
 * GET /api/prompts/audit
 * Full system audit with dependency graph and statistics
 */
router.get('/audit', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const audit = await unifiedPromptService.getSystemAudit();
    res.json({ success: true, audit });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /audit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/departments
 * List prompts grouped by department with counts
 */
router.get('/departments', async (req: Request, res: Response) => {
  try {
    const departments = await unifiedPromptService.getDepartmentCounts();
    res.json({ success: true, departments });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /departments error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/functions
 * List prompts grouped by function with counts
 */
router.get('/functions', async (req: Request, res: Response) => {
  try {
    const functions = await unifiedPromptService.getFunctionCounts();
    res.json({ success: true, functions });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /functions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/models
 * List prompts grouped by AI model with counts
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    const models = await unifiedPromptService.getModelCounts();
    res.json({ success: true, models });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /models error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/governance
 * Governance dashboard data: drafts, recent changes, ownership gaps
 */
router.get('/governance', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const governance = await unifiedPromptService.getGovernanceData();
    res.json({ success: true, ...governance });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /governance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/flow-map
 * Intelligence flow visualization data showing prompt connections
 */
router.get('/flow-map', async (req: Request, res: Response) => {
  try {
    const flowMap = await unifiedPromptService.getFlowMap();
    res.json({ success: true, ...flowMap });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /flow-map error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/dependencies/:id
 * Get dependency graph for a specific prompt
 */
router.get('/dependencies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dependencies = await unifiedPromptService.getDependencies(id);
    res.json({ success: true, dependencies });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /dependencies/:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PARAMETERIZED ROUTES (/:id must be LAST) ====================

/**
 * GET /api/prompts/:id
 * Get a single prompt by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const prompt = await unifiedPromptService.getById(id);

    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, prompt });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CREATE & UPDATE ====================

/**
 * POST /api/prompts
 * Create a new prompt
 */
router.post('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const data = createPromptSchema.parse(req.body);
    const userId = (req as any).userId;

    const prompt = await unifiedPromptService.create({
      ...data,
      userId,
    });

    res.status(201).json({ success: true, prompt });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[UnifiedPrompts] POST / error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/prompts/:id
 * Update a prompt
 */
router.put('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updatePromptSchema.parse(req.body);
    const userId = (req as any).userId;

    const prompt = await unifiedPromptService.update(id, {
      ...data,
      userId,
    });

    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, prompt });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    if (error.message?.includes('locked')) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('[UnifiedPrompts] PUT /:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/prompts/:id/lock
 * Lock a prompt to prevent editing
 */
router.patch('/:id/lock', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;

    const success = await unifiedPromptService.setLocked(id, true, userId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Prompt not found or cannot be locked' });
    }

    res.json({ success: true, message: 'Prompt locked' });
  } catch (error: any) {
    console.error('[UnifiedPrompts] PATCH /:id/lock error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/prompts/:id/unlock
 * Unlock a prompt
 */
router.patch('/:id/unlock', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;

    const success = await unifiedPromptService.setLocked(id, false, userId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, message: 'Prompt unlocked' });
  } catch (error: any) {
    console.error('[UnifiedPrompts] PATCH /:id/unlock error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/prompts/:id
 * Soft delete (deactivate) a prompt
 */
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;

    const success = await unifiedPromptService.deactivate(id, userId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, message: 'Prompt deactivated' });
  } catch (error: any) {
    console.error('[UnifiedPrompts] DELETE /:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VERSION HISTORY ====================

/**
 * GET /api/prompts/:id/versions
 * Get version history for a prompt
 */
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const versions = await unifiedPromptService.getVersionHistory(id);

    res.json({ success: true, versions });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /:id/versions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prompts/:id/restore/:version
 * Restore a prompt to a previous version
 */
router.post('/:id/restore/:version', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, version } = req.params;
    const userId = (req as any).userId;

    const prompt = await unifiedPromptService.restoreVersion(id, parseInt(version), userId);
    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt or version not found' });
    }

    res.json({ success: true, prompt, message: `Restored to version ${version}` });
  } catch (error: any) {
    console.error('[UnifiedPrompts] POST /:id/restore/:version error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/:id/compare
 * Compare two versions of a prompt
 */
router.get('/:id/compare', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { v1, v2 } = req.query;

    if (!v1 || !v2) {
      return res.status(400).json({ success: false, error: 'v1 and v2 query params required' });
    }

    const comparison = await unifiedPromptService.compareVersions(id, parseInt(v1 as string), parseInt(v2 as string));
    if (!comparison) {
      return res.status(404).json({ success: false, error: 'Versions not found' });
    }

    res.json({ success: true, comparison });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /:id/compare error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prompts/:id/revert
 * Revert a prompt to its default content (from code)
 */
router.post('/:id/revert', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;

    const prompt = await unifiedPromptService.revertToDefault(id, userId);
    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found or has no default' });
    }

    res.json({ success: true, prompt, message: 'Reverted to default content' });
  } catch (error: any) {
    console.error('[UnifiedPrompts] POST /:id/revert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PER-PROMPT ANALYTICS & LEARNING ====================

/**
 * GET /api/prompts/:id/analytics
 * Get analytics for a specific prompt
 */
router.get('/:id/analytics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = analyticsQuerySchema.parse(req.query);

    const analytics = await unifiedPromptService.getPromptAnalytics(id, query);
    if (!analytics) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, analytics });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('[UnifiedPrompts] GET /:id/analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prompts/:id/learn
 * Generate learning insights from outcomes
 */
router.get('/:id/learn', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const learnings = await unifiedPromptService.generateLearnings(id);

    if (!learnings) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }

    res.json({ success: true, learnings });
  } catch (error: any) {
    console.error('[UnifiedPrompts] GET /:id/learn error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/prompts/:id/ownership
 * Assign ownership of a prompt
 */
router.put('/:id/ownership', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ownerId, ownerDepartment } = req.body;
    await unifiedPromptService.setOwnership(id, ownerId, ownerDepartment);
    res.json({ success: true, message: 'Ownership updated' });
  } catch (error: any) {
    console.error('[UnifiedPrompts] PUT /:id/ownership error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/prompts/:id/status
 * Change prompt status (draft/live/archived/deprecated)
 */
router.put('/:id/status', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['draft', 'live', 'archived', 'deprecated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    await unifiedPromptService.setStatus(id, status, (req as any).userId);
    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error: any) {
    console.error('[UnifiedPrompts] PUT /:id/status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
