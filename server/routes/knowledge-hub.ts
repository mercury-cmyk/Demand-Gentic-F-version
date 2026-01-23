/**
 * Unified Knowledge Hub API Routes
 * 
 * SINGLE SOURCE OF TRUTH for all AI agent knowledge.
 * 
 * This API provides:
 * - GET /api/knowledge-hub - Get current unified knowledge
 * - PUT /api/knowledge-hub - Update unified knowledge (creates new version)
 * - GET /api/knowledge-hub/versions - Get version history
 * - GET /api/knowledge-hub/versions/:version - Get specific version
 * - POST /api/knowledge-hub/compare - Compare two versions (diff)
 * - POST /api/knowledge-hub/reset - Reset to system defaults
 * - POST /api/knowledge-hub/simulate - Run simulation/preview
 * - GET /api/knowledge-hub/prompt-preview - Preview compiled prompt
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../auth';
import {
  getUnifiedKnowledge,
  updateUnifiedKnowledge,
  getKnowledgeVersionHistory,
  getKnowledgeVersion,
  compareKnowledgeVersions,
  resetToDefaultKnowledge,
  buildUnifiedKnowledgePrompt,
  buildAgentSystemPromptFromHub,
  KnowledgeSection,
  KnowledgeCategory,
  DEFAULT_UNIFIED_KNOWLEDGE
} from '../services/unified-knowledge-hub';
import { db } from '../db';
import { agentSimulations, campaigns, accounts, contacts, virtualAgents } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
const LOG_PREFIX = '[UnifiedKnowledgeHub]';

// ==================== VALIDATION SCHEMAS ====================

const knowledgeSectionSchema = z.object({
  id: z.string(),
  category: z.enum([
    'compliance',
    'gatekeeper_handling',
    'voicemail_detection',
    'call_dispositioning',
    'call_quality',
    'conversation_flow',
    'dos_and_donts',
    'objection_handling',
    'tone_and_pacing',
    'identity_verification',
    'call_control',
    'learning_rules'
  ]),
  title: z.string(),
  content: z.string(),
  priority: z.number().min(0).max(100),
  isActive: z.boolean(),
  tags: z.array(z.string())
});

const updateKnowledgeSchema = z.object({
  sections: z.array(knowledgeSectionSchema),
  changeDescription: z.string().min(1, 'Change description is required')
});

const simulationSchema = z.object({
  campaignId: z.string().optional(),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  virtualAgentId: z.string().optional(),
  simulationType: z.enum(['voice', 'email', 'text']),
  simulationMode: z.enum(['preview', 'test_call', 'dry_run']),
  inputScenario: z.object({
    scenario: z.string().optional(),
    expectedOutcome: z.string().optional(),
    testPrompt: z.string().optional()
  }).optional()
});

// ==================== ROUTES ====================

/**
 * GET /api/knowledge-hub
 * Get the current unified knowledge with all sections
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log(`${LOG_PREFIX} Fetching unified knowledge`);
    const knowledge = await getUnifiedKnowledge();
    
    // Group sections by category for easier UI rendering
    const sectionsByCategory = knowledge.sections.reduce((acc, section) => {
      if (!acc[section.category]) {
        acc[section.category] = [];
      }
      acc[section.category].push(section);
      return acc;
    }, {} as Record<string, KnowledgeSection[]>);

    res.json({
      ...knowledge,
      sectionsByCategory,
      categoryOrder: [
        'compliance',
        'identity_verification',
        'gatekeeper_handling',
        'voicemail_detection',
        'call_dispositioning',
        'call_quality',
        'conversation_flow',
        'tone_and_pacing',
        'dos_and_donts',
        'objection_handling',
        'call_control',
        'learning_rules'
      ]
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching knowledge:`, error);
    res.status(500).json({
      error: 'Failed to fetch unified knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/knowledge-hub
 * Update the unified knowledge (creates a new version)
 */
router.put('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const parsed = updateKnowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.errors
      });
    }

    const { sections, changeDescription } = parsed.data;
    const userId = (req as any).user?.id || null;

    console.log(`${LOG_PREFIX} Updating unified knowledge with ${sections.length} sections`);

    const updated = await updateUnifiedKnowledge(
      sections as KnowledgeSection[],
      userId,
      changeDescription
    );

    res.json({
      success: true,
      message: `Knowledge updated to version ${updated.version}`,
      knowledge: updated
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating knowledge:`, error);
    res.status(500).json({
      error: 'Failed to update unified knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-hub/versions
 * Get version history for change tracking
 */
router.get('/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    console.log(`${LOG_PREFIX} Fetching version history (limit: ${limit})`);
    
    const history = await getKnowledgeVersionHistory(limit);
    res.json({ versions: history });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching version history:`, error);
    res.status(500).json({
      error: 'Failed to fetch version history',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-hub/versions/:version
 * Get a specific version for comparison
 */
router.get('/versions/:version', requireAuth, async (req: Request, res: Response) => {
  try {
    const version = parseInt(req.params.version);
    if (isNaN(version)) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    console.log(`${LOG_PREFIX} Fetching version ${version}`);
    const knowledge = await getKnowledgeVersion(version);

    if (!knowledge) {
      return res.status(404).json({ error: `Version ${version} not found` });
    }

    res.json(knowledge);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching version:`, error);
    res.status(500).json({
      error: 'Failed to fetch version',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/knowledge-hub/compare
 * Compare two versions and generate diff
 */
router.post('/compare', requireAuth, async (req: Request, res: Response) => {
  try {
    const { versionA, versionB } = req.body;

    if (typeof versionA !== 'number' || typeof versionB !== 'number') {
      return res.status(400).json({ error: 'versionA and versionB must be numbers' });
    }

    console.log(`${LOG_PREFIX} Comparing versions ${versionA} and ${versionB}`);
    const diff = await compareKnowledgeVersions(versionA, versionB);

    res.json({
      versionA,
      versionB,
      diff,
      summary: {
        additionsCount: diff.additions.length,
        removalsCount: diff.removals.length,
        modificationsCount: diff.modifications.length
      }
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error comparing versions:`, error);
    res.status(500).json({
      error: 'Failed to compare versions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/knowledge-hub/reset
 * Reset to system defaults
 */
router.post('/reset', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || null;
    console.log(`${LOG_PREFIX} Resetting to system defaults`);

    const reset = await resetToDefaultKnowledge(userId);

    res.json({
      success: true,
      message: 'Knowledge reset to system defaults',
      knowledge: reset
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error resetting knowledge:`, error);
    res.status(500).json({
      error: 'Failed to reset knowledge',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-hub/prompt-preview
 * Preview the compiled prompt that agents will receive
 */
router.get('/prompt-preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const categories = (req.query.categories as string)?.split(',').filter(Boolean) as KnowledgeCategory[] | undefined;
    const excludeCategories = (req.query.exclude as string)?.split(',').filter(Boolean) as KnowledgeCategory[] | undefined;
    const basePrompt = (req.query.basePrompt as string) || '# Agent System Prompt\n\nYou are a professional AI agent.';

    console.log(`${LOG_PREFIX} Generating prompt preview`);

    const compiledPrompt = await buildAgentSystemPromptFromHub(basePrompt, {
      includeCategories: categories,
      excludeCategories
    });

    const knowledge = await getUnifiedKnowledge();

    res.json({
      basePrompt,
      knowledgeVersion: knowledge.version,
      compiledPrompt,
      promptLength: compiledPrompt.length,
      estimatedTokens: Math.ceil(compiledPrompt.length / 4), // Rough estimate
      sectionsIncluded: knowledge.sections.filter(s => s.isActive).length
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error generating prompt preview:`, error);
    res.status(500).json({
      error: 'Failed to generate prompt preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/knowledge-hub/simulate
 * Run a simulation/preview with selected context
 */
router.post('/simulate', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = simulationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid simulation request',
        details: parsed.error.errors
      });
    }

    const { campaignId, accountId, contactId, virtualAgentId, simulationType, simulationMode, inputScenario } = parsed.data;
    const userId = (req as any).user?.id || null;

    console.log(`${LOG_PREFIX} Running ${simulationType} simulation (mode: ${simulationMode})`);

    // Fetch context data
    let campaign = null;
    let account = null;
    let contact = null;
    let agent = null;

    if (campaignId) {
      [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    }
    if (accountId) {
      [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    }
    if (contactId) {
      [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    }
    if (virtualAgentId) {
      [agent] = await db.select().from(virtualAgents).where(eq(virtualAgents.id, virtualAgentId)).limit(1);
    }

    // Build the runtime prompt
    const basePrompt = agent?.systemPrompt || '# AI Agent\n\nYou are a professional AI agent.';
    const knowledge = await getUnifiedKnowledge();
    const compiledPrompt = await buildAgentSystemPromptFromHub(basePrompt);

    // Interpolate variables
    let runtimePrompt = compiledPrompt;
    if (contact) {
      runtimePrompt = runtimePrompt
        .replace(/\{\{contact\.full_name\}\}/g, `${contact.firstName || ''} ${contact.lastName || ''}`.trim())
        .replace(/\{\{contact\.job_title\}\}/g, contact.jobTitle || '')
        .replace(/\{\{contact\.email\}\}/g, contact.email || '');
    }
    if (account) {
      runtimePrompt = runtimePrompt.replace(/\{\{account\.name\}\}/g, account.name || '');
    }
    if (campaign) {
      runtimePrompt = runtimePrompt.replace(/\{\{campaign\.name\}\}/g, campaign.name || '');
    }

    // Create simulation record
    const [simulation] = await db
      .insert(agentSimulations)
      .values({
        campaignId,
        accountId,
        contactId,
        virtualAgentId,
        simulationType,
        simulationMode,
        inputScenario: inputScenario || null,
        generatedPrompt: runtimePrompt,
        knowledgeVersion: knowledge.version,
        runBy: userId,
        status: 'completed',
        runAt: new Date()
      })
      .returning();

    res.json({
      success: true,
      simulation: {
        id: simulation.id,
        simulationType,
        simulationMode,
        status: 'completed'
      },
      context: {
        campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
        account: account ? { id: account.id, name: account.name } : null,
        contact: contact ? { id: contact.id, name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() } : null,
        agent: agent ? { id: agent.id, name: agent.name } : null
      },
      prompt: {
        basePrompt: basePrompt.substring(0, 500) + (basePrompt.length > 500 ? '...' : ''),
        runtimePrompt,
        knowledgeVersion: knowledge.version,
        promptLength: runtimePrompt.length,
        estimatedTokens: Math.ceil(runtimePrompt.length / 4)
      }
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error running simulation:`, error);
    res.status(500).json({
      error: 'Failed to run simulation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-hub/simulations
 * Get simulation history
 */
router.get('/simulations', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    
    const simulations = await db
      .select({
        id: agentSimulations.id,
        simulationType: agentSimulations.simulationType,
        simulationMode: agentSimulations.simulationMode,
        status: agentSimulations.status,
        evaluationScore: agentSimulations.evaluationScore,
        runAt: agentSimulations.runAt,
        knowledgeVersion: agentSimulations.knowledgeVersion
      })
      .from(agentSimulations)
      .orderBy(agentSimulations.runAt)
      .limit(limit);

    res.json({ simulations });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching simulations:`, error);
    res.status(500).json({
      error: 'Failed to fetch simulations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-hub/simulations/:id
 * Get detailed simulation result
 */
router.get('/simulations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const [simulation] = await db
      .select()
      .from(agentSimulations)
      .where(eq(agentSimulations.id, req.params.id))
      .limit(1);

    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    res.json(simulation);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching simulation:`, error);
    res.status(500).json({
      error: 'Failed to fetch simulation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/knowledge-hub/simulations/:id/evaluate
 * Add evaluation to a simulation
 */
router.put('/simulations/:id/evaluate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { score, notes } = req.body;

    if (typeof score !== 'number' || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Score must be a number between 0 and 100' });
    }

    const [updated] = await db
      .update(agentSimulations)
      .set({
        evaluationScore: score,
        evaluationNotes: notes || null
      })
      .where(eq(agentSimulations.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Simulation not found' });
    }

    res.json({
      success: true,
      message: 'Evaluation saved',
      simulation: updated
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error evaluating simulation:`, error);
    res.status(500).json({
      error: 'Failed to evaluate simulation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-hub/categories
 * Get list of all knowledge categories with descriptions
 */
router.get('/categories', requireAuth, async (_req: Request, res: Response) => {
  res.json({
    categories: [
      { id: 'compliance', name: 'Compliance', description: 'TCPA, GDPR, CCPA, DNC handling rules', priority: 100 },
      { id: 'identity_verification', name: 'Identity Verification', description: 'Right-party verification protocols', priority: 95 },
      { id: 'gatekeeper_handling', name: 'Gatekeeper Handling', description: 'Receptionist and transfer protocols', priority: 90 },
      { id: 'voicemail_detection', name: 'Voicemail Detection', description: 'Voicemail detection and behavior', priority: 85 },
      { id: 'call_dispositioning', name: 'Call Dispositioning', description: 'Call outcome classification rules', priority: 80 },
      { id: 'call_quality', name: 'Call Quality', description: 'Audio quality and speaking standards', priority: 75 },
      { id: 'conversation_flow', name: 'Conversation Flow', description: 'State machine and flow control', priority: 70 },
      { id: 'tone_and_pacing', name: 'Tone & Pacing', description: 'Voice tone, pacing, professionalism', priority: 65 },
      { id: 'dos_and_donts', name: 'Do\'s & Don\'ts', description: 'Critical behavioral rules', priority: 60 },
      { id: 'objection_handling', name: 'Objection Handling', description: 'Response framework for resistance', priority: 55 },
      { id: 'call_control', name: 'Call Control', description: 'Tools, DTMF, IVR navigation', priority: 50 },
      { id: 'learning_rules', name: 'Learning Rules', description: 'Adaptation and improvement rules', priority: 45 }
    ]
  });
});

/**
 * GET /api/knowledge-hub/defaults
 * Get the default knowledge sections (for reset preview)
 */
router.get('/defaults', requireAuth, async (_req: Request, res: Response) => {
  res.json({
    sections: DEFAULT_UNIFIED_KNOWLEDGE,
    sectionsCount: DEFAULT_UNIFIED_KNOWLEDGE.length
  });
});

export default router;
