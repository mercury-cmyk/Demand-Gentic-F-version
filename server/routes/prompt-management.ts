/**
 * Prompt Management API Routes
 *
 * Centralized management for ALL prompts across the system.
 *
 * Endpoints:
 * - GET /api/prompts - List all prompts with filtering
 * - GET /api/prompts/stats - Get prompt statistics
 * - GET /api/prompts/:id - Get single prompt with full details
 * - PUT /api/prompts/:id - Update prompt (creates version automatically)
 * - GET /api/prompts/:id/versions - Get version history
 * - GET /api/prompts/:id/versions/:version - Get specific version
 * - POST /api/prompts/:id/revert/:version - Revert to specific version
 * - POST /api/prompts/:id/reset - Reset to default content
 * - POST /api/prompts/sync - Sync prompts from codebase
 * - GET /api/prompts/preview/:id - Preview compiled prompt
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import { z } from 'zod';
import {
  getPrompts,
  getPromptById,
  updatePrompt,
  getPromptVersionHistory,
  getPromptVersion,
  revertPromptToVersion,
  resetPromptToDefault,
  syncPromptDefinitions,
  getPromptStats,
} from '../services/prompt-management-service';
import { ALL_PROMPT_DEFINITIONS, buildAgentPrompt } from '../services/prompt-loader';

const router = Router();
const LOG_PREFIX = '[PromptManagementAPI]';

// ==================== VALIDATION SCHEMAS ====================

const updatePromptSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  changeDescription: z.string().min(1, 'Change description is required'),
  name: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

const previewPromptSchema = z.object({
  agentType: z.enum(['voice', 'email', 'intelligence', 'compliance', 'data_management']),
  organizationContext: z.object({
    orgName: z.string().optional(),
    orgIntelligence: z.string().optional(),
  }).optional(),
  campaignContext: z.object({
    campaignName: z.string().optional(),
    objective: z.string().optional(),
    targetAudience: z.string().optional(),
    talkingPoints: z.array(z.string()).optional(),
  }).optional(),
  contactContext: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    jobTitle: z.string().optional(),
    company: z.string().optional(),
  }).optional(),
  provider: z.enum(['openai', 'google', 'anthropic']).optional(),
});

// ==================== ROUTES ====================

/**
 * GET /api/prompts
 * List all prompts with optional filtering
 *
 * Query params:
 * - category: Filter by category (voice, email, intelligence, compliance, system)
 * - type: Filter by prompt type (foundational, knowledge, specialized, compliance, system)
 * - scope: Filter by scope (global, agent_type, campaign, organization)
 * - agentType: Filter by agent type (voice, email, intelligence, compliance, data_management)
 * - search: Search in name, key, and description
 * - activeOnly: Only return active prompts (default: true)
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      category,
      type,
      scope,
      agentType,
      search,
      activeOnly,
    } = req.query;

    const prompts = await getPrompts({
      category: category as string | undefined,
      type: type as string | undefined,
      scope: scope as string | undefined,
      agentType: agentType as string | undefined,
      search: search as string | undefined,
      activeOnly: activeOnly !== 'false',
    });

    res.json(prompts);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error listing prompts:`, error);
    res.status(500).json({
      error: 'Failed to list prompts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/prompts/stats
 * Get prompt statistics by category and type
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = await getPromptStats();
    res.json(stats);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting prompt stats:`, error);
    res.status(500).json({
      error: 'Failed to get prompt statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/prompts/categories
 * Get available prompt categories with metadata
 */
router.get('/categories', requireAuth, async (req: Request, res: Response) => {
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
      description: 'Prompts for email generation and analysis',
      icon: 'Mail',
      color: 'purple',
    },
    {
      id: 'intelligence',
      name: 'Intelligence',
      description: 'Prompts for account research and lead qualification',
      icon: 'Brain',
      color: 'emerald',
    },
    {
      id: 'compliance',
      name: 'Compliance',
      description: 'Prompts for compliance validation and data management',
      icon: 'Shield',
      color: 'red',
    },
    {
      id: 'system',
      name: 'System',
      description: 'System-level prompts and configurations',
      icon: 'Settings',
      color: 'gray',
    },
  ];

  res.json(categories);
});

/**
 * GET /api/prompts/:id
 * Get a single prompt with full details
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const prompt = await getPromptById(id);

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(prompt);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting prompt ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to get prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/prompts/:id
 * Update a prompt (creates a new version automatically)
 * Admin only
 */
router.put('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || null;

    // Validate request body
    const validation = updatePromptSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { content, changeDescription, ...options } = validation.data;

    const updatedPrompt = await updatePrompt(
      id,
      content,
      changeDescription,
      userId,
      options
    );

    console.log(`${LOG_PREFIX} Prompt ${id} updated by user ${userId}`);
    res.json(updatedPrompt);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating prompt ${req.params.id}:`, error);

    if (error instanceof Error && error.message.includes('locked')) {
      return res.status(403).json({
        error: 'Prompt is locked',
        message: error.message,
      });
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Prompt not found',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to update prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/prompts/:id/versions
 * Get version history for a prompt
 */
router.get('/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const versions = await getPromptVersionHistory(id, limit);
    res.json(versions);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting version history for ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to get version history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/prompts/:id/versions/:version
 * Get a specific version of a prompt
 */
router.get('/:id/versions/:version', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, version } = req.params;
    const versionNumber = parseInt(version);

    if (isNaN(versionNumber)) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    const versionDetail = await getPromptVersion(id, versionNumber);

    if (!versionDetail) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(versionDetail);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting version ${req.params.version} for ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to get version',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prompts/:id/revert/:version
 * Revert a prompt to a specific version
 * Admin only
 */
router.post('/:id/revert/:version', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, version } = req.params;
    const userId = (req as any).user?.userId || null;
    const versionNumber = parseInt(version);

    if (isNaN(versionNumber)) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    const revertedPrompt = await revertPromptToVersion(id, versionNumber, userId);

    console.log(`${LOG_PREFIX} Prompt ${id} reverted to version ${versionNumber} by user ${userId}`);
    res.json(revertedPrompt);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error reverting prompt ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to revert prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prompts/:id/reset
 * Reset a prompt to its default content
 * Admin only
 */
router.post('/:id/reset', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || null;

    const resetPrompt = await resetPromptToDefault(id, userId);

    console.log(`${LOG_PREFIX} Prompt ${id} reset to default by user ${userId}`);
    res.json(resetPrompt);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error resetting prompt ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to reset prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prompts/sync
 * Sync prompts from codebase to database
 * Admin only
 *
 * This imports all hardcoded prompts into the database.
 * - New prompts are created
 * - Existing prompts have their defaultContent updated (preserves custom content)
 */
router.post('/sync', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || null;

    console.log(`${LOG_PREFIX} Starting prompt sync from codebase...`);
    const results = await syncPromptDefinitions(ALL_PROMPT_DEFINITIONS, userId);

    console.log(`${LOG_PREFIX} Sync complete:`, results);
    res.json({
      message: 'Prompt sync completed',
      ...results,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error syncing prompts:`, error);
    res.status(500).json({
      error: 'Failed to sync prompts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prompts/preview/:id
 * Preview a compiled prompt with context
 *
 * This shows what the prompt would look like at runtime with
 * organization, campaign, and contact context applied.
 */
router.post('/preview/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the prompt to determine agent type
    const prompt = await getPromptById(id);
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Validate request body
    const validation = previewPromptSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { agentType, organizationContext, campaignContext, contactContext, provider } = validation.data;

    // Build the preview prompt
    const previewContent = await buildAgentPrompt({
      agentType,
      basePromptKey: prompt.promptKey,
      organizationContext,
      campaignContext,
      contactContext,
      provider,
    });

    res.json({
      promptKey: prompt.promptKey,
      previewContent,
      tokenEstimate: Math.ceil(previewContent.length / 4), // Rough token estimate
      characterCount: previewContent.length,
      lineCount: previewContent.split('\n').length,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error previewing prompt ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to preview prompt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/prompts/compare/:id
 * Compare two versions of a prompt
 */
router.get('/compare/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fromVersion, toVersion } = req.query;

    if (!fromVersion || !toVersion) {
      return res.status(400).json({
        error: 'Both fromVersion and toVersion query parameters are required',
      });
    }

    const fromV = parseInt(fromVersion as string);
    const toV = parseInt(toVersion as string);

    if (isNaN(fromV) || isNaN(toV)) {
      return res.status(400).json({ error: 'Invalid version numbers' });
    }

    const [fromVersionData, toVersionData] = await Promise.all([
      getPromptVersion(id, fromV),
      getPromptVersion(id, toV),
    ]);

    if (!fromVersionData || !toVersionData) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }

    res.json({
      fromVersion: fromVersionData,
      toVersion: toVersionData,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error comparing versions for ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to compare versions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
