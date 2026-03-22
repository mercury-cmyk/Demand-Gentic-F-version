/**
 * SMI Agent API Routes
 *
 * Provides API endpoints for:
 * - Title/Role Mapping
 * - Industry Classification
 * - Role Expansion
 * - Multi-Perspective Intelligence
 * - Contact Intelligence
 * - Solution Mapping
 * - Learning & Predictive Scoring
 * - Audit & Governance
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';

// Mapping services
import {
  mapTitle,
  mapTitlesBatch,
  getAdjacentRoles,
  getRoleTaxonomy,
  expandCampaignRolesToTitles,
  TitleMappingService,
} from '../services/smi-agent/mapping/title-mapping-service';

import {
  classifyIndustry,
  getIndustryIntelligence,
  getIndustryDepartmentPainPoints,
  getIndustryTaxonomy,
  IndustryMappingService,
} from '../services/smi-agent/mapping/industry-mapping-service';

import {
  expandRolesForCampaign,
  RoleExpansionService,
} from '../services/smi-agent/mapping/role-expansion-service';

// Intelligence services
import {
  generateMultiPerspectiveIntelligence,
  getCachedPerspectiveAnalysis,
  invalidatePerspectiveCache,
  PerspectiveEngine,
} from '../services/smi-agent/intelligence/perspective-engine';

import {
  generateContactIntelligence,
  getContactIntelligence,
  invalidateContactIntelligence,
  ContactIntelligenceService,
} from '../services/smi-agent/intelligence/contact-intelligence';

import {
  mapSolutionToProblemsAndRoles,
  getRecommendedTargets,
  SolutionMappingService,
} from '../services/smi-agent/intelligence/solution-mapping-service';

// Learning services
import {
  aggregateLearnings,
  getLearningInsights,
  LearningAggregator,
} from '../services/smi-agent/learning/learning-aggregator';

import {
  generatePredictiveScore,
  generateCampaignPredictiveScores,
  getContactPredictiveScore,
  PredictiveScorer,
} from '../services/smi-agent/learning/predictive-scorer';

import {
  recordLearningOutcome,
  processCallOutcomeForSMI,
  batchProcessLearningRecords,
  FeedbackProcessor,
} from '../services/smi-agent/learning/feedback-processor';

// Governance services
import {
  validateSmiOutput,
  OutputValidator,
} from '../services/smi-agent/governance/output-validator';

import {
  logSmiAudit,
  getSmiAuditLog,
  getAuditStatistics,
  AuditLogger,
} from '../services/smi-agent/governance/audit-logger';

const router = Router();

// ==================== TITLE MAPPING ROUTES ====================

/**
 * POST /api/smi/map-title
 * Map a single job title to a normalized role
 */
router.post('/map-title', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, context } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const result = await mapTitle(title, context);
    res.json({ mapping: result });
  } catch (error) {
    console.error('[SMI] Error mapping title:', error);
    res.status(500).json({ error: 'Failed to map title' });
  }
});

/**
 * POST /api/smi/map-titles
 * Batch map multiple job titles
 */
router.post('/map-titles', requireAuth, async (req: Request, res: Response) => {
  try {
    const { titles, context } = req.body;

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return res.status(400).json({ error: 'titles array is required' });
    }

    if (titles.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 titles per batch' });
    }

    const results = await mapTitlesBatch(titles, context);
    res.json({ mappings: results });
  } catch (error) {
    console.error('[SMI] Error batch mapping titles:', error);
    res.status(500).json({ error: 'Failed to batch map titles' });
  }
});

/**
 * GET /api/smi/role-taxonomy
 * Get the role taxonomy with optional filters
 */
router.get('/role-taxonomy', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      category,
      jobFunction,
      seniorityLevel,
      decisionAuthority,
      search,
      limit = '100',
    } = req.query;

    const roles = await getRoleTaxonomy({
      category: category as string | undefined,
      jobFunction: jobFunction as string | undefined,
      seniorityLevel: seniorityLevel as string | undefined,
      decisionAuthority: decisionAuthority as string | undefined,
      search: search as string | undefined,
      limit: parseInt(limit as string, 10),
    });

    res.json({ roles });
  } catch (error) {
    console.error('[SMI] Error getting role taxonomy:', error);
    res.status(500).json({ error: 'Failed to get role taxonomy' });
  }
});

/**
 * GET /api/smi/roles/:roleId/adjacent
 * Get adjacent/related roles
 */
router.get('/roles/:roleId/adjacent', requireAuth, async (req: Request, res: Response) => {
  try {
    const roleId = parseInt(req.params.roleId, 10);
    if (isNaN(roleId)) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }

    const { types } = req.query;
    const adjacencyTypes = types ? (types as string).split(',') : undefined;

    const adjacentRoles = await getAdjacentRoles(roleId, adjacencyTypes);
    res.json({ adjacentRoles });
  } catch (error) {
    console.error('[SMI] Error getting adjacent roles:', error);
    res.status(500).json({ error: 'Failed to get adjacent roles' });
  }
});

/**
 * POST /api/smi/expand-roles
 * Expand campaign roles to a title universe
 */
router.post('/expand-roles', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roleIds, campaignId, includeAdjacent = true, maxTitlesPerRole = 50 } = req.body;

    if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({ error: 'roleIds array is required' });
    }

    const expansion = await expandCampaignRolesToTitles(roleIds, {
      campaignId,
      includeAdjacent,
      maxTitlesPerRole,
    });

    res.json({ expansion });
  } catch (error) {
    console.error('[SMI] Error expanding roles:', error);
    res.status(500).json({ error: 'Failed to expand roles' });
  }
});

// ==================== INDUSTRY CLASSIFICATION ROUTES ====================

/**
 * POST /api/smi/classify-industry
 * Classify/normalize an industry
 */
router.post('/classify-industry', requireAuth, async (req: Request, res: Response) => {
  try {
    const { rawIndustry, sicCode, naicsCode, companyDescription } = req.body;

    if (!rawIndustry && !sicCode && !naicsCode) {
      return res.status(400).json({ error: 'At least one of rawIndustry, sicCode, or naicsCode is required' });
    }

    const classification = await classifyIndustry({
      rawIndustry,
      sicCode,
      naicsCode,
      companyDescription,
    });

    res.json({ classification });
  } catch (error) {
    console.error('[SMI] Error classifying industry:', error);
    res.status(500).json({ error: 'Failed to classify industry' });
  }
});

/**
 * GET /api/smi/industry-taxonomy
 * Get the industry taxonomy
 */
router.get('/industry-taxonomy', requireAuth, async (req: Request, res: Response) => {
  try {
    const { level, parentId, search, limit = '100' } = req.query;

    const industries = await getIndustryTaxonomy({
      level: level ? parseInt(level as string, 10) : undefined,
      parentId: parentId ? parseInt(parentId as string, 10) : undefined,
      search: search as string | undefined,
      limit: parseInt(limit as string, 10),
    });

    res.json({ industries });
  } catch (error) {
    console.error('[SMI] Error getting industry taxonomy:', error);
    res.status(500).json({ error: 'Failed to get industry taxonomy' });
  }
});

/**
 * GET /api/smi/industries/:id/intelligence
 * Get intelligence for a specific industry
 */
router.get('/industries/:id/intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    const industryId = parseInt(req.params.id, 10);
    if (isNaN(industryId)) {
      return res.status(400).json({ error: 'Invalid industry ID' });
    }

    const intelligence = await getIndustryIntelligence(industryId);
    if (!intelligence) {
      return res.status(404).json({ error: 'Industry not found' });
    }

    res.json({ intelligence });
  } catch (error) {
    console.error('[SMI] Error getting industry intelligence:', error);
    res.status(500).json({ error: 'Failed to get industry intelligence' });
  }
});

/**
 * GET /api/smi/industries/:id/departments/:dept/pain-points
 * Get pain points for industry-department combination
 */
router.get(
  '/industries/:id/departments/:dept/pain-points',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const industryId = parseInt(req.params.id, 10);
      if (isNaN(industryId)) {
        return res.status(400).json({ error: 'Invalid industry ID' });
      }

      const department = req.params.dept;
      const painPoints = await getIndustryDepartmentPainPoints(industryId, department);

      res.json({ painPoints });
    } catch (error) {
      console.error('[SMI] Error getting department pain points:', error);
      res.status(500).json({ error: 'Failed to get department pain points' });
    }
  }
);

// ==================== ROLE EXPANSION ROUTES ====================

/**
 * POST /api/smi/campaigns/:id/expand-roles
 * Expand roles for a specific campaign
 */
router.post('/campaigns/:id/expand-roles', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;
    const { roleSpecs, organizationId, includeAdjacent = true, maxTitlesPerRole = 50 } = req.body;

    if (!roleSpecs || !Array.isArray(roleSpecs) || roleSpecs.length === 0) {
      return res.status(400).json({ error: 'roleSpecs array is required' });
    }

    const expansion = await expandRolesForCampaign({
      campaignId,
      roleSpecs,
      organizationId,
      includeAdjacent,
      maxTitlesPerRole,
    });

    res.json({ expansion });
  } catch (error) {
    console.error('[SMI] Error expanding campaign roles:', error);
    res.status(500).json({ error: 'Failed to expand campaign roles' });
  }
});

// ==================== PERSPECTIVE INTELLIGENCE ROUTES ====================

/**
 * POST /api/smi/accounts/:id/perspectives
 * Generate multi-perspective intelligence for an account
 */
router.post('/accounts/:id/perspectives', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountId = req.params.id;
    const { contactRoleId, campaignContext, perspectiveCodes, forceRefresh = false } = req.body;

    const intelligence = await generateMultiPerspectiveIntelligence({
      accountId,
      contactRoleId,
      campaignContext,
      perspectiveCodes,
      forceRefresh,
    });

    res.json({ intelligence });
  } catch (error) {
    console.error('[SMI] Error generating perspective intelligence:', error);
    res.status(500).json({ error: 'Failed to generate perspective intelligence' });
  }
});

/**
 * GET /api/smi/accounts/:id/perspectives
 * Get cached perspective analysis for an account
 */
router.get('/accounts/:id/perspectives', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountId = req.params.id;
    const { perspectiveCode } = req.query;

    const analysis = await getCachedPerspectiveAnalysis(
      accountId,
      perspectiveCode as string | undefined
    );

    if (!analysis || analysis.length === 0) {
      return res.status(404).json({ error: 'No cached perspective analysis found' });
    }

    res.json({ perspectives: analysis });
  } catch (error) {
    console.error('[SMI] Error getting cached perspectives:', error);
    res.status(500).json({ error: 'Failed to get cached perspectives' });
  }
});

/**
 * DELETE /api/smi/accounts/:id/perspectives
 * Invalidate perspective cache for an account
 */
router.delete('/accounts/:id/perspectives', requireAuth, async (req: Request, res: Response) => {
  try {
    const accountId = req.params.id;
    await invalidatePerspectiveCache(accountId);
    res.json({ success: true });
  } catch (error) {
    console.error('[SMI] Error invalidating perspective cache:', error);
    res.status(500).json({ error: 'Failed to invalidate perspective cache' });
  }
});

// ==================== CONTACT INTELLIGENCE ROUTES ====================

/**
 * POST /api/smi/contacts/:id/intelligence
 * Generate intelligence for a contact
 */
router.post('/contacts/:id/intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    const contactId = req.params.id;
    const { campaignId, forceRefresh = false } = req.body;

    const intelligence = await generateContactIntelligence({
      contactId,
      campaignId,
      forceRefresh,
    });

    res.json({ intelligence });
  } catch (error) {
    console.error('[SMI] Error generating contact intelligence:', error);
    res.status(500).json({ error: 'Failed to generate contact intelligence' });
  }
});

/**
 * GET /api/smi/contacts/:id/intelligence
 * Get existing intelligence for a contact
 */
router.get('/contacts/:id/intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    const contactId = req.params.id;

    const intelligence = await getContactIntelligence(contactId);
    if (!intelligence) {
      return res.status(404).json({ error: 'Contact intelligence not found' });
    }

    res.json({ intelligence });
  } catch (error) {
    console.error('[SMI] Error getting contact intelligence:', error);
    res.status(500).json({ error: 'Failed to get contact intelligence' });
  }
});

/**
 * DELETE /api/smi/contacts/:id/intelligence
 * Invalidate contact intelligence
 */
router.delete('/contacts/:id/intelligence', requireAuth, async (req: Request, res: Response) => {
  try {
    const contactId = req.params.id;
    await invalidateContactIntelligence(contactId);
    res.json({ success: true });
  } catch (error) {
    console.error('[SMI] Error invalidating contact intelligence:', error);
    res.status(500).json({ error: 'Failed to invalidate contact intelligence' });
  }
});

// ==================== SOLUTION MAPPING ROUTES ====================

/**
 * POST /api/smi/solution-mapping
 * Map a solution to problems and roles
 */
router.post('/solution-mapping', requireAuth, async (req: Request, res: Response) => {
  try {
    const { solution, industryId, organizationId, maxProblems = 10, maxRoles = 10 } = req.body;

    if (!solution) {
      return res.status(400).json({ error: 'solution is required' });
    }

    const mapping = await mapSolutionToProblemsAndRoles({
      solution,
      industryId,
      organizationId,
      maxProblems,
      maxRoles,
    });

    res.json({ mapping });
  } catch (error) {
    console.error('[SMI] Error mapping solution:', error);
    res.status(500).json({ error: 'Failed to map solution' });
  }
});

/**
 * GET /api/smi/campaigns/:id/recommended-targets
 * Get recommended targets for a campaign
 */
router.get('/campaigns/:id/recommended-targets', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;
    const { limit = '50', minFitScore = '0.5' } = req.query;

    const targets = await getRecommendedTargets({
      campaignId,
      limit: parseInt(limit as string, 10),
      minFitScore: parseFloat(minFitScore as string),
    });

    res.json({ targets });
  } catch (error) {
    console.error('[SMI] Error getting recommended targets:', error);
    res.status(500).json({ error: 'Failed to get recommended targets' });
  }
});

// ==================== LEARNING ROUTES ====================

/**
 * POST /api/smi/learning/outcomes
 * Record a call outcome for learning
 */
router.post('/learning/outcomes', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = req.body;

    if (!input.callSessionId || !input.outcomeCode) {
      return res.status(400).json({ error: 'callSessionId and outcomeCode are required' });
    }

    await recordLearningOutcome(input);

    // Optionally process immediately
    if (req.body.processImmediately) {
      await processCallOutcomeForSMI(input);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[SMI] Error recording learning outcome:', error);
    res.status(500).json({ error: 'Failed to record learning outcome' });
  }
});

/**
 * POST /api/smi/learning/aggregate
 * Trigger learning aggregation
 */
router.post('/learning/aggregate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { scope = 'global', campaignId, organizationId, minSampleSize = 10 } = req.body;

    const insights = await aggregateLearnings({
      scope,
      campaignId,
      organizationId,
      minSampleSize,
    });

    res.json({ insights, count: insights.length });
  } catch (error) {
    console.error('[SMI] Error aggregating learnings:', error);
    res.status(500).json({ error: 'Failed to aggregate learnings' });
  }
});

/**
 * GET /api/smi/learning/insights
 * Get learning insights with filters
 */
router.get('/learning/insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      insightType,
      scope,
      campaignId,
      organizationId,
      minConfidence = '0.6',
      limit = '50',
    } = req.query;

    const insights = await getLearningInsights({
      insightType: insightType as string | undefined,
      scope: scope as string | undefined,
      campaignId: campaignId as string | undefined,
      organizationId: organizationId as string | undefined,
      minConfidence: parseFloat(minConfidence as string),
      limit: parseInt(limit as string, 10),
    });

    res.json({ insights });
  } catch (error) {
    console.error('[SMI] Error getting learning insights:', error);
    res.status(500).json({ error: 'Failed to get learning insights' });
  }
});

/**
 * POST /api/smi/learning/batch-process
 * Batch process unprocessed learning records
 */
router.post('/learning/batch-process', requireAuth, async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.body;

    const processedCount = await batchProcessLearningRecords(limit);
    res.json({ processedCount });
  } catch (error) {
    console.error('[SMI] Error batch processing learnings:', error);
    res.status(500).json({ error: 'Failed to batch process learnings' });
  }
});

// ==================== PREDICTIVE SCORING ROUTES ====================

/**
 * POST /api/smi/campaigns/:id/predictive-scores
 * Generate predictive scores for contacts in a campaign
 */
router.post('/campaigns/:id/predictive-scores', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.id;
    const { contactIds, forceRefresh = false, concurrency = 5 } = req.body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: 'contactIds array is required' });
    }

    if (contactIds.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 contacts per batch' });
    }

    const result = await generateCampaignPredictiveScores({
      campaignId,
      contactIds,
      forceRefresh,
      concurrency,
    });

    res.json(result);
  } catch (error) {
    console.error('[SMI] Error generating predictive scores:', error);
    res.status(500).json({ error: 'Failed to generate predictive scores' });
  }
});

/**
 * GET /api/smi/contacts/:cid/campaigns/:campId/score
 * Get predictive score for a contact in a campaign
 */
router.get(
  '/contacts/:cid/campaigns/:campId/score',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { cid: contactId, campId: campaignId } = req.params;

      const score = await getContactPredictiveScore(contactId, campaignId);
      if (!score) {
        return res.status(404).json({ error: 'Predictive score not found' });
      }

      res.json({ score });
    } catch (error) {
      console.error('[SMI] Error getting predictive score:', error);
      res.status(500).json({ error: 'Failed to get predictive score' });
    }
  }
);

/**
 * POST /api/smi/contacts/:id/predictive-score
 * Generate predictive score for a single contact
 */
router.post('/contacts/:id/predictive-score', requireAuth, async (req: Request, res: Response) => {
  try {
    const contactId = req.params.id;
    const { campaignId, forceRefresh = false } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId is required' });
    }

    const score = await generatePredictiveScore({
      contactId,
      campaignId,
      forceRefresh,
    });

    res.json({ score });
  } catch (error) {
    console.error('[SMI] Error generating predictive score:', error);
    res.status(500).json({ error: 'Failed to generate predictive score' });
  }
});

// ==================== GOVERNANCE & AUDIT ROUTES ====================

/**
 * POST /api/smi/validate
 * Validate an SMI output
 */
router.post('/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { outputType, output } = req.body;

    if (!outputType || !output) {
      return res.status(400).json({ error: 'outputType and output are required' });
    }

    const validation = await validateSmiOutput(outputType, output);
    res.json({ validation });
  } catch (error) {
    console.error('[SMI] Error validating output:', error);
    res.status(500).json({ error: 'Failed to validate output' });
  }
});

/**
 * GET /api/smi/audit
 * Get SMI audit log entries
 */
router.get('/audit', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      operationType,
      operationSubtype,
      entityType,
      entityId,
      campaignId,
      triggeredBy,
      startDate,
      endDate,
      limit = '100',
      offset = '0',
    } = req.query;

    const entries = await getSmiAuditLog({
      operationType: operationType as string | undefined,
      operationSubtype: operationSubtype as string | undefined,
      entityType: entityType as string | undefined,
      entityId: entityId as string | undefined,
      campaignId: campaignId as string | undefined,
      triggeredBy: triggeredBy as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({ entries, count: entries.length });
  } catch (error) {
    console.error('[SMI] Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

/**
 * GET /api/smi/audit/statistics
 * Get SMI audit statistics
 */
router.get('/audit/statistics', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const statistics = await getAuditStatistics(
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ statistics });
  } catch (error) {
    console.error('[SMI] Error getting audit statistics:', error);
    res.status(500).json({ error: 'Failed to get audit statistics' });
  }
});

/**
 * POST /api/smi/audit
 * Log an SMI audit entry (for external integrations)
 */
router.post('/audit', requireAuth, async (req: Request, res: Response) => {
  try {
    const entry = req.body;

    if (!entry.operationType) {
      return res.status(400).json({ error: 'operationType is required' });
    }

    await logSmiAudit({
      ...entry,
      triggeredBy: (req.user as any)?.id || entry.triggeredBy,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[SMI] Error logging audit entry:', error);
    res.status(500).json({ error: 'Failed to log audit entry' });
  }
});

export default router;