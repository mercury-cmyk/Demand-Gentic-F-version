/**
 * Unified Agent Architecture — API Routes
 * 
 * REST API for the consolidated AI Agent intelligence framework.
 * All agent management, prompt editing, capability mapping, learning pipeline,
 * and recommendation workflows are served through these endpoints.
 * 
 * Routes:
 * GET  /api/unified-agents                         — System summary
 * GET  /api/unified-agents/types                    — List all agent types
 * GET  /api/unified-agents/:agentType               — Agent detail view
 * GET  /api/unified-agents/:agentType/prompt-sections           — All prompt sections
 * GET  /api/unified-agents/:agentType/prompt-sections/:sectionId — Specific section
 * PUT  /api/unified-agents/:agentType/prompt-sections/:sectionId — Update section
 * GET  /api/unified-agents/:agentType/capabilities              — All capabilities
 * GET  /api/unified-agents/:agentType/capability-map            — Capability-to-prompt mapping
 * GET  /api/unified-agents/:agentType/configuration             — Agent configuration
 * PATCH /api/unified-agents/:agentType/configuration            — Update configuration
 * GET  /api/unified-agents/:agentType/recommendations           — Recommendations list
 * POST /api/unified-agents/:agentType/recommendations/:id/apply — Apply recommendation
 * POST /api/unified-agents/:agentType/recommendations/:id/reject — Reject recommendation
 * GET  /api/unified-agents/:agentType/version-history           — Version history
 * POST /api/unified-agents/:agentType/rollback/:version         — Rollback to version
 * GET  /api/unified-agents/:agentType/learning-pipeline         — Pipeline state
 * POST /api/unified-agents/:agentType/learning-pipeline/ingest  — Ingest performance data
 * POST /api/unified-agents/:agentType/learning-pipeline/analyze — Run analysis
 * GET  /api/unified-agents/pipeline-summary                     — All pipelines summary
 * GET  /api/unified-agents/:agentType/assembled-prompt          — Get assembled prompt
 * GET  /api/unified-agents/:agentType/assembled-prompt-with-oi  — Get prompt + Org Intelligence
 *
 * Agent Prompts (role-based prompt management):
 * GET  /api/unified-agents/agent-prompts                        — List all role-based prompts
 * GET  /api/unified-agents/agent-prompts/role/:role             — Get prompts for a role
 * GET  /api/unified-agents/agent-prompts/tools/available        — List available tools
 * GET  /api/unified-agents/agent-prompts/:id                    — Get single prompt
 * POST /api/unified-agents/agent-prompts                        — Create prompt
 * PUT  /api/unified-agents/agent-prompts/:id                    — Update prompt
 * DELETE /api/unified-agents/agent-prompts/:id                  — Soft-delete prompt
 * GET  /api/unified-agents/agent-prompts/:id/history            — Prompt version history
 * POST /api/unified-agents/agent-prompts/:id/restore/:version   — Restore prompt version
 * POST /api/unified-agents/agent-prompts/seed-defaults          — Seed default prompts
 *
 * Organization Intelligence Injection (snapshots, campaign binding, prompt assembly):
 * GET  /api/unified-agents/org-intelligence/snapshots            — List reusable OI snapshots
 * POST /api/unified-agents/org-intelligence/research             — Run fresh org research
 * POST /api/unified-agents/org-intelligence/assemble-prompt      — Assemble agent prompt with OI
 * POST /api/unified-agents/org-intelligence/campaigns/:id/bind   — Bind OI to campaign
 * GET  /api/unified-agents/org-intelligence/available-sources    — List available OI sources
 * GET  /api/unified-agents/org-intelligence/master               — Get master org intelligence
 */

import { Router, Request, Response } from 'express';
import {
  unifiedAgentRegistry,
  learningPipeline,
  type UnifiedAgentType,
} from './index';
import {
  UnifiedAgentTypeSchema,
  PromptSectionUpdateSchema,
  RecommendationActionSchema,
  AgentConfigurationUpdateSchema,
} from './types';
import {
  getVoiceArchitectureMode,
  setVoiceArchitectureMode,
  type VoiceArchitectureMode,
} from './architecture-mode';
import agentPromptsRouter from '../../../routes/agent-prompts';
import orgIntelligenceInjectionRouter from '../../../routes/org-intelligence-injection-routes';

const router = Router();

// Mount agent prompts (role-based prompt management) under unified agents
router.use('/agent-prompts', agentPromptsRouter);

// Mount org intelligence injection (snapshots, campaign binding, prompt assembly) under unified agents
router.use('/org-intelligence', orgIntelligenceInjectionRouter);

// ==================== HELPER ====================

function validateAgentType(req: Request, res: Response): UnifiedAgentType | null {
  const result = UnifiedAgentTypeSchema.safeParse(req.params.agentType);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid agent type', validTypes: UnifiedAgentTypeSchema.options });
    return null;
  }
  return result.data;
}

function getUserId(req: Request): string {
  return (req as any).user?.id || (req as any).userId || 'system';
}

function canManageArchitectureMode(req: Request): boolean {
  const user = (req as any).user || {};
  const roleCandidates = [
    ...(Array.isArray(user.roles) ? user.roles : []),
    user.role,
  ]
    .filter(Boolean)
    .map((r: unknown) => String(r).toLowerCase());

  return roleCandidates.includes('admin') || roleCandidates.includes('campaign_manager');
}

// ==================== SYSTEM ENDPOINTS ====================

/** GET /api/unified-agents — System summary */
router.get('/', (_req: Request, res: Response) => {
  try {
    const summary = unifiedAgentRegistry.getSystemSummary();
    
    // Log the summary for debugging
    if (summary.totalAgents === 0) {
      const allAgents = unifiedAgentRegistry.getAllAgents();
      console.warn('[UnifiedAgents] WARNING: System summary returned 0 agents');
      console.warn('[UnifiedAgents] Initialized flag:', summary.initialized);
      console.warn('[UnifiedAgents] getAllAgents() returned:', allAgents.length, 'agents');
      console.warn('[UnifiedAgents] Registered types:', unifiedAgentRegistry.getRegisteredTypes());
    }
    
    res.json(summary);
  } catch (error: any) {
    console.error('[UnifiedAgents] Error in system summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/unified-agents/types — List all registered agent types */
router.get('/types', (_req: Request, res: Response) => {
  try {
    const types = unifiedAgentRegistry.getRegisteredTypes();
    const agents = unifiedAgentRegistry.getAllAgents().map(a => ({
      agentType: a.agentType,
      id: a.id,
      name: a.name,
      description: a.description,
      channel: a.channel,
      status: a.status,
      version: a.versionControl.currentVersion,
    }));
    res.json({ types, agents });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/unified-agents/pipeline-summary — All learning pipelines summary */
router.get('/pipeline-summary', (_req: Request, res: Response) => {
  try {
    const summary = learningPipeline.getAllPipelineSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/unified-agents/voice/architecture-mode — Active voice runtime architecture mode */
router.get('/voice/architecture-mode', (req: Request, res: Response) => {
  try {
    const modeState = getVoiceArchitectureMode();
    res.json({
      architectureMode: modeState.mode,
      source: modeState.source,
      envDefaultMode: modeState.envDefaultMode,
      canManage: canManageArchitectureMode(req),
      note: 'UI override is runtime-only and applies immediately to new calls in this process.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** PUT /api/unified-agents/voice/architecture-mode — Set voice runtime architecture mode */
router.put('/voice/architecture-mode', (req: Request, res: Response) => {
  try {
    if (!canManageArchitectureMode(req)) {
      return res.status(403).json({ error: 'Forbidden: admin or campaign_manager role required' });
    }

    const mode = String(req.body?.architectureMode || '').toLowerCase();
    if (mode !== 'legacy' && mode !== 'unified') {
      return res.status(400).json({ error: 'Invalid architectureMode. Use legacy or unified.' });
    }

    const updated = setVoiceArchitectureMode(mode as VoiceArchitectureMode, getUserId(req));
    const state = getVoiceArchitectureMode();

    return res.json({
      success: true,
      architectureMode: state.mode,
      source: state.source,
      envDefaultMode: state.envDefaultMode,
      updatedBy: updated.updatedBy,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AGENT DETAIL ====================

/** GET /api/unified-agents/:agentType — Full agent detail view */
router.get('/:agentType', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const detail = unifiedAgentRegistry.getAgentDetail(agentType);
    if (!detail) {
      return res.status(404).json({ error: `Agent type '${agentType}' not registered` });
    }
    res.json(detail);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PROMPT SECTIONS ====================

/** GET /api/unified-agents/:agentType/prompt-sections — All prompt sections */
router.get('/:agentType/prompt-sections', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    res.json({
      agentType,
      totalSections: agent.promptSections.length,
      sections: agent.promptSections.map(s => ({
        id: s.id,
        name: s.name,
        sectionNumber: s.sectionNumber,
        category: s.category,
        isRequired: s.isRequired,
        isActive: s.isActive,
        versionHash: s.versionHash,
        lastUpdated: s.lastUpdated,
        lastUpdatedBy: s.lastUpdatedBy,
        contentLength: s.content.length,
        changeCount: s.changeHistory.length,
        content: s.content,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/unified-agents/:agentType/prompt-sections/:sectionId — Single section detail */
router.get('/:agentType/prompt-sections/:sectionId', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    const section = agent.getPromptSection(req.params.sectionId);
    if (!section) return res.status(404).json({ error: `Section not found: ${req.params.sectionId}` });

    // Include capabilities that map to this section
    const relatedCapabilities = agent.getCapabilitiesForSection(section.id);

    res.json({
      section,
      relatedCapabilities: relatedCapabilities.map(c => ({
        id: c.id,
        name: c.name,
        performanceScore: c.performanceScore,
        trend: c.trend,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** PUT /api/unified-agents/:agentType/prompt-sections/:sectionId — Update section content */
router.put('/:agentType/prompt-sections/:sectionId', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const validation = PromptSectionUpdateSchema.safeParse({
      sectionId: req.params.sectionId,
      ...req.body,
    });
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.format() });
    }

    const { newContent, reason } = validation.data;
    const updatedBy = getUserId(req);

    unifiedAgentRegistry.updateAgentPromptSection(agentType, req.params.sectionId, newContent, updatedBy, reason);

    const agent = unifiedAgentRegistry.getAgent(agentType);
    const section = agent?.getPromptSection(req.params.sectionId);

    res.json({
      success: true,
      message: `Section '${req.params.sectionId}' updated successfully`,
      section,
      newVersion: agent?.versionControl.currentVersion,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CAPABILITIES ====================

/** GET /api/unified-agents/:agentType/capabilities — All capabilities */
router.get('/:agentType/capabilities', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    res.json({
      agentType,
      capabilities: agent.capabilities.map(c => ({
        ...c,
        mappedSections: agent.getSectionsForCapability(c.id).map(s => ({
          id: s.id,
          name: s.name,
          sectionNumber: s.sectionNumber,
        })),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/unified-agents/:agentType/capability-map — Capability-to-prompt mapping table */
router.get('/:agentType/capability-map', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const detail = unifiedAgentRegistry.getAgentDetail(agentType);
    if (!detail) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    res.json({
      agentType,
      map: detail.capabilityPromptMap,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONFIGURATION ====================

/** GET /api/unified-agents/:agentType/configuration — Agent configuration */
router.get('/:agentType/configuration', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    res.json({
      agentType,
      configuration: agent.configuration,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/unified-agents/:agentType/configuration — Update configuration */
router.patch('/:agentType/configuration', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const validation = AgentConfigurationUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid configuration update', details: validation.error.format() });
    }

    const updatedBy = getUserId(req);
    unifiedAgentRegistry.updateAgentConfiguration(agentType, validation.data as any, updatedBy);

    const agent = unifiedAgentRegistry.getAgent(agentType);
    res.json({
      success: true,
      message: 'Configuration updated',
      configuration: agent?.configuration,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RECOMMENDATIONS ====================

/** GET /api/unified-agents/:agentType/recommendations — List recommendations */
router.get('/:agentType/recommendations', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const minPriority = req.query.minPriority ? parseInt(req.query.minPriority as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const recommendations = unifiedAgentRegistry.getAgentRecommendations(agentType, {
      status: status as any,
      category: category as any,
      minPriority,
      limit,
    });

    res.json({
      agentType,
      total: recommendations.length,
      recommendations,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/unified-agents/:agentType/recommendations/:id/apply — Apply a recommendation */
router.post('/:agentType/recommendations/:id/apply', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const approvedBy = getUserId(req);

    // Pre-approve governance-gated recommendations before applying.
    // The user clicking "Apply" in the dashboard IS the explicit approval action.
    const recs = unifiedAgentRegistry.getAgentRecommendations(agentType);
    const recView = recs.find((r: any) => r.id === req.params.id);
    if (recView?.governance?.requiresExplicitApproval && recView.status !== 'approved') {
      unifiedAgentRegistry.approveAgentRecommendation(
        agentType, req.params.id, approvedBy,
        'Auto-approved via Apply action'
      );
    }

    unifiedAgentRegistry.applyAgentRecommendation(agentType, req.params.id, approvedBy);

    res.json({
      success: true,
      message: `Recommendation ${req.params.id} applied successfully`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to apply recommendation' });
  }
});

/** POST /api/unified-agents/:agentType/recommendations/:id/approve — Explicitly approve recommendation */
router.post('/:agentType/recommendations/:id/approve', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const approvedBy = getUserId(req);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

    unifiedAgentRegistry.approveAgentRecommendation(agentType, req.params.id, approvedBy, notes);

    res.json({
      success: true,
      message: `Recommendation ${req.params.id} approved`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/unified-agents/:agentType/recommendations/:id/reject — Reject a recommendation */
router.post('/:agentType/recommendations/:id/reject', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required for rejection' });

    const rejectedBy = getUserId(req);
    unifiedAgentRegistry.rejectAgentRecommendation(agentType, req.params.id, rejectedBy, reason);

    res.json({
      success: true,
      message: `Recommendation ${req.params.id} rejected`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VERSION CONTROL ====================

/** GET /api/unified-agents/:agentType/version-history — Version history */
router.get('/:agentType/version-history', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    res.json({
      agentType,
      currentVersion: agent.versionControl.currentVersion,
      totalVersions: agent.versionControl.totalVersions,
      history: agent.getVersionHistory(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/unified-agents/:agentType/rollback/:version — Rollback to a previous version */
router.post('/:agentType/rollback/:version', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    const rolledBackBy = getUserId(req);
    agent.rollbackToVersion(req.params.version, rolledBackBy);

    // Invalidate bridge cache so production picks up the rollback immediately
    if (agentType === 'voice') {
      try {
        const { invalidateVoiceAgentBridgeCache } = require('./voice-agent-bridge');
        invalidateVoiceAgentBridgeCache();
      } catch { /* bridge not loaded yet — safe to ignore */ }
    }

    res.json({
      success: true,
      message: `Rolled back to version ${req.params.version}`,
      currentVersion: agent.versionControl.currentVersion,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEARNING PIPELINE ====================

/** GET /api/unified-agents/:agentType/learning-pipeline — Pipeline state */
router.get('/:agentType/learning-pipeline', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const state = learningPipeline.getPipelineState(agentType);
    const history = learningPipeline.getAnalysisHistory(agentType);

    res.json({
      agentType,
      state,
      recentAnalyses: history.slice(-10),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/unified-agents/:agentType/learning-pipeline/ingest — Ingest performance data */
router.post('/:agentType/learning-pipeline/ingest', async (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const { sourceType, metrics, insights, sampleSize, timeRange } = req.body;
    if (!sourceType || !metrics) {
      return res.status(400).json({ error: 'sourceType and metrics are required' });
    }

    await learningPipeline.ingestPerformanceData(agentType, {
      sourceType,
      metrics,
      insights: insights || [],
      sampleSize: sampleSize || 1,
      timeRange: timeRange || { start: new Date(), end: new Date() },
    });

    res.json({ success: true, message: 'Data ingested' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/unified-agents/:agentType/learning-pipeline/analyze — Run analysis and generate recommendations */
router.post('/:agentType/learning-pipeline/analyze', async (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    const { performanceData } = req.body;
    if (!performanceData || !Array.isArray(performanceData)) {
      return res.status(400).json({ error: 'performanceData array is required' });
    }

    // Run analysis
    const analysis = await learningPipeline.analyzePerformanceData(
      agentType,
      agent.capabilities,
      agent.capabilityMappings,
      performanceData
    );

    // Generate recommendations from analysis
    const currentSections = Object.fromEntries(
      agent.promptSections.map(s => [s.id, s.content])
    );

    const recommendations = await learningPipeline.generateRecommendations(
      agentType,
      analysis,
      agent.capabilities,
      agent.capabilityMappings,
      currentSections
    );

    res.json({
      success: true,
      analysis: {
        id: analysis.id,
        findingsCount: analysis.findings.length,
        findings: analysis.findings,
      },
      recommendations: recommendations.map(r => ({
        id: r.id,
        title: r.title,
        category: r.category,
        priorityScore: r.priorityScore,
        targetSection: r.targetPromptSectionId,
        impact: r.impact,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/unified-agents/:agentType/learning-pipeline/collect-and-analyze
 * Auto-collect data from recent call quality records and run full analysis pipeline.
 * This is the "Run Full Analysis" action that collects real data from the database.
 */
router.post('/:agentType/learning-pipeline/collect-and-analyze', async (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;
    if (agentType !== 'voice') {
      return res.status(400).json({ error: 'Auto data collection is currently only available for the voice agent' });
    }

    const result = await learningPipeline.collectAndAnalyzeVoiceData();

    const state = learningPipeline.getPipelineState(agentType);
    const recs = learningPipeline.getRecommendations(agentType);

    res.json({
      success: true,
      findings: result.findings,
      recommendations: result.recommendations,
      pipelineState: state ? {
        status: state.status,
        lastRun: state.lastRun,
        collectors: state.activeCollectors.map(c => ({
          sourceType: c.sourceType,
          dataPoints: c.dataPointsCollected,
          lastCollected: c.lastCollectedAt,
        })),
        stats: state.stats,
      } : null,
      pendingRecommendations: recs.filter(r => r.status === 'pending').map(r => ({
        id: r.id,
        title: r.title,
        category: r.category,
        priorityScore: r.priorityScore,
        targetSection: r.targetPromptSectionId,
        impact: r.impact,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ASSEMBLED PROMPT ====================

/** GET /api/unified-agents/:agentType/assembled-prompt — Get the full assembled prompt (sections only) */
router.get('/:agentType/assembled-prompt', (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    res.json({
      agentType,
      version: agent.versionControl.currentVersion,
      promptVersion: agent.promptVersion,
      assembledPrompt: agent.assembleFoundationalPrompt(),
      sectionCount: agent.promptSections.filter(s => s.isActive).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/unified-agents/:agentType/assembled-prompt-with-oi
 * Get the full assembled prompt enriched with Organization Intelligence.
 *
 * This merges the agent's foundational prompt sections with:
 *  - Core Agent Identity (demand problem-solver, human-first warmth, authentic AI)
 *  - Organization-specific context (super org profile, compliance, policies)
 *  - Campaign & engagement learning summary
 */
router.get('/:agentType/assembled-prompt-with-oi', async (req: Request, res: Response) => {
  try {
    const agentType = validateAgentType(req, res);
    if (!agentType) return;

    const agent = unifiedAgentRegistry.getAgent(agentType);
    if (!agent) return res.status(404).json({ error: `Agent not found: ${agentType}` });

    const result = await agent.assemblePromptWithOrgIntelligence();

    res.json({
      agentType: result.agentType,
      version: result.version,
      promptVersion: agent.promptVersion,
      assembledPrompt: result.prompt,
      sectionCount: result.sectionCount,
      hasOrgIntelligence: result.hasOrgIntelligence,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRODUCTION PROMPT PREVIEW ====================

/**
 * GET /api/unified-agents/voice/production-prompt-preview
 *
 * Shows what the production voice agent would receive when the UA bridge
 * is active.  Includes layer breakdown, section list, token estimate,
 * version info, and bridge source status.
 *
 * Use this before flipping VOICE_AGENT_USE_UNIFIED_ARCHITECTURE=true
 * to verify the assembled prompt is correct.
 */
router.get('/voice/production-prompt-preview', async (req: Request, res: Response) => {
  try {
    const { getVoiceAgentFoundationalPrompt, invalidateVoiceAgentBridgeCache } = await import('./voice-agent-bridge');

    // Force fresh fetch (bypass cache) for preview accuracy
    invalidateVoiceAgentBridgeCache();
    const result = await getVoiceAgentFoundationalPrompt();

    const agent = unifiedAgentRegistry.getAgent('voice' as any);
    const sections = agent
      ? agent.promptSections.filter(s => s.isActive).map(s => ({
          id: s.id,
          name: s.name,
          sectionNumber: s.sectionNumber,
          category: s.category,
          versionHash: s.versionHash,
          contentLength: s.content.length,
        }))
      : [];

    // Rough token estimate (~4 chars per token for English text)
    const estimatedTokens = result.foundationalPrompt
      ? Math.ceil(result.foundationalPrompt.length / 4)
      : 0;

    const modeState = getVoiceArchitectureMode();
    const featureFlagEnabled = modeState.mode === 'unified';

    res.json({
      featureFlag: {
        name: 'voice_architecture_mode',
        enabled: featureFlagEnabled,
        architectureMode: modeState.mode,
        source: modeState.source,
        envDefaultMode: modeState.envDefaultMode,
        note: featureFlagEnabled
          ? 'UA path is ACTIVE — production calls use this prompt'
          : 'UA path is DISABLED — production calls use legacy fallback',
      },
      bridge: {
        source: result.source,
        agentVersion: result.agentVersion,
        versionHash: result.versionHash,
        sectionCount: result.sectionCount,
        hasKnowledgeHubSupplement: result.hasKnowledgeHubSupplement,
        note: 'Knowledge Hub supplement is disabled when using Unified Agent Architecture as the sole knowledge source.',
      },
      prompt: {
        assembledPrompt: result.foundationalPrompt,
        estimatedTokens,
        characterCount: result.foundationalPrompt?.length ?? 0,
      },
      sections,
      layers: [
        'Layer 1: UA Foundational Prompt (sections ordered by section_number)',
        'Layer 2: Campaign Persona Override (injected at call time)',
        'Layer 3: Campaign Script Overrides (injected at call time)',
        'Layer 4: Account & Contact Context (injected at call time)',
        'Layer 5: Voice Control Layer — ensureVoiceAgentControlLayer() (injected at call time)',
      ],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
