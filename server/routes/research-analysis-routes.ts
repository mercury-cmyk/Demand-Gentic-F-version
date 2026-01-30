/**
 * Research & Analysis API Routes
 *
 * REST API endpoints for the Core Research & Analysis Agent.
 * Provides access to quality control, scoring, and analysis operations.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { coreResearchAnalysisAgent } from '../services/agents/core-research-analysis-agent';

const router = Router();

// ==================== LEAD ANALYSIS ====================

/**
 * POST /api/research/leads/:leadId/analyze
 * Analyze a single lead for quality
 */
router.post('/leads/:leadId/analyze', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const optionsSchema = z.object({
      campaignId: z.string().optional(),
      icpCriteria: z.object({
        industries: z.array(z.string()).optional(),
        companySizeRange: z.tuple([z.number(), z.number()]).optional(),
        revenueRange: z.tuple([z.number(), z.number()]).optional(),
        jobTitles: z.array(z.string()).optional(),
        seniorityLevels: z.array(z.string()).optional(),
        geographies: z.array(z.string()).optional(),
      }).optional(),
      customWeights: z.record(z.number()).optional(),
      includeRecommendations: z.boolean().optional(),
    });

    const options = optionsSchema.parse(req.body);
    const result = await coreResearchAnalysisAgent.analyzeLeadQuality(leadId, options);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error analyzing lead:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/research/leads/batch-analyze
 * Analyze multiple leads in batch
 */
router.post('/leads/batch-analyze', async (req: Request, res: Response) => {
  const schema = z.object({
    leadIds: z.array(z.string()).min(1).max(100),
    options: z.object({
      campaignId: z.string().optional(),
      icpCriteria: z.object({}).passthrough().optional(),
    }).optional(),
  });

  try {
    const { leadIds, options } = schema.parse(req.body);

    const results = await Promise.all(
      leadIds.map((id) => coreResearchAnalysisAgent.analyzeLeadQuality(id, options))
    );

    const summary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      qualified: results.filter((r) => r.qualificationStatus === 'qualified').length,
      notQualified: results.filter((r) => r.qualificationStatus === 'not_qualified').length,
      needsReview: results.filter((r) => r.qualificationStatus === 'needs_review').length,
      averageScore: results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.scores.overall, 0) / results.length)
        : 0,
    };

    res.json({ results, summary });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error batch analyzing leads:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMAIL ANALYSIS ====================

/**
 * POST /api/research/emails/analyze
 * Analyze email content for quality
 */
router.post('/emails/analyze', async (req: Request, res: Response) => {
  const schema = z.object({
    subject: z.string().min(1),
    preheader: z.string().optional(),
    htmlContent: z.string().optional(),
    textContent: z.string().optional(),
    senderName: z.string().optional(),
    senderEmail: z.string().email().optional(),
    campaignId: z.string().optional(),
    checkDeliverability: z.boolean().optional(),
    checkCompliance: z.boolean().optional(),
    targetAudience: z.string().optional(),
  });

  try {
    const parsed = schema.parse(req.body);

    const emailContent = {
      subject: parsed.subject,
      preheader: parsed.preheader,
      htmlContent: parsed.htmlContent,
      textContent: parsed.textContent,
      senderName: parsed.senderName,
      senderEmail: parsed.senderEmail,
    };

    const options = {
      campaignId: parsed.campaignId,
      checkDeliverability: parsed.checkDeliverability,
      checkCompliance: parsed.checkCompliance,
      targetAudience: parsed.targetAudience,
    };

    const result = await coreResearchAnalysisAgent.analyzeEmailQuality(emailContent, options);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error analyzing email:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CALL ANALYSIS ====================

/**
 * POST /api/research/calls/:callId/analyze
 * Analyze a call for quality
 */
router.post('/calls/:callId/analyze', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;

    const optionsSchema = z.object({
      campaignId: z.string().optional(),
      includeTranscript: z.boolean().optional(),
      evaluateDisposition: z.boolean().optional(),
    });

    const options = optionsSchema.parse(req.body);
    const result = await coreResearchAnalysisAgent.analyzeCallQuality(callId, options);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error analyzing call:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ENGAGEMENT ANALYSIS ====================

/**
 * POST /api/research/contacts/:contactId/engagement
 * Analyze engagement for a contact
 */
router.post('/contacts/:contactId/engagement', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const optionsSchema = z.object({
      campaignId: z.string().optional(),
      lookbackDays: z.number().min(1).max(365).optional(),
      channels: z.array(z.enum(['email', 'call', 'web'])).optional(),
    });

    const options = optionsSchema.parse(req.body);
    const result = await coreResearchAnalysisAgent.analyzeEngagement(contactId, options);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error analyzing engagement:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== ACCOUNT SCORING ====================

/**
 * POST /api/research/accounts/:accountId/health
 * Calculate account health score
 */
router.post('/accounts/:accountId/health', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    const optionsSchema = z.object({
      campaignId: z.string().optional(),
      includeHistory: z.boolean().optional(),
      includeOpportunities: z.boolean().optional(),
    });

    const options = optionsSchema.parse(req.body);
    const result = await coreResearchAnalysisAgent.scoreAccountHealth(accountId, options);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error scoring account health:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== COMMUNICATION QUALITY ====================

/**
 * POST /api/research/contacts/:contactId/communication-quality
 * Analyze cross-channel communication quality
 */
router.post('/contacts/:contactId/communication-quality', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const optionsSchema = z.object({
      campaignId: z.string().optional(),
      channels: z.array(z.enum(['email', 'call', 'sms'])).optional(),
      lookbackDays: z.number().min(1).max(365).optional(),
    });

    const options = optionsSchema.parse(req.body);
    const result = await coreResearchAnalysisAgent.analyzeCommunicationQuality(contactId, options);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error analyzing communication quality:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== NEXT BEST ACTIONS ====================

/**
 * POST /api/research/next-best-actions
 * Generate next best action recommendations
 */
router.post('/next-best-actions', async (req: Request, res: Response) => {
  const schema = z.object({
    contactId: z.string().optional(),
    accountId: z.string().optional(),
    campaignId: z.string().optional(),
    limit: z.number().min(1).max(20).default(5),
    channels: z.array(z.enum(['email', 'call', 'sms'])).optional(),
  });

  try {
    const context = schema.parse(req.body);

    if (!context.contactId && !context.accountId) {
      return res.status(400).json({ error: 'Either contactId or accountId is required' });
    }

    const result = await coreResearchAnalysisAgent.generateNextBestActions(context);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error generating NBAs:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SCORING MODELS ====================

/**
 * GET /api/research/scoring-models
 * List available scoring model configurations
 */
router.get('/scoring-models', async (_req: Request, res: Response) => {
  try {
    const models = coreResearchAnalysisAgent.listScoringConfigs();
    res.json({ models });
  } catch (error: any) {
    console.error('[ResearchAPI] Error listing scoring models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/research/scoring-models/:modelId
 * Get scoring model configuration details
 */
router.get('/scoring-models/:modelId', async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const config = coreResearchAnalysisAgent.getScoringConfig(modelId);

    if (!config) {
      return res.status(404).json({ error: 'Scoring model not found' });
    }

    res.json({ id: modelId, config });
  } catch (error: any) {
    console.error('[ResearchAPI] Error getting scoring model:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/research/scoring-models
 * Create a custom scoring model configuration
 */
router.post('/scoring-models', async (req: Request, res: Response) => {
  const schema = z.object({
    id: z.string().min(1).max(100),
    weights: z.record(z.number().min(0).max(1)),
    thresholds: z.object({
      exceptional: z.number().min(0).max(100),
      good: z.number().min(0).max(100),
      acceptable: z.number().min(0).max(100),
      below_standard: z.number().min(0).max(100),
    }),
    normalization: z.enum(['linear', 'logarithmic', 'sigmoid']).optional(),
    customRules: z.array(z.object({
      id: z.string(),
      condition: z.string(),
      action: z.enum(['bonus', 'penalty', 'override', 'flag']),
      value: z.union([z.number(), z.string()]),
      priority: z.number(),
    })).optional(),
  });

  try {
    const config = schema.parse(req.body);

    // Validate weights sum to 1
    const weightSum = Object.values(config.weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(weightSum - 1) > 0.01) {
      return res.status(400).json({ error: 'Weights must sum to 1.0' });
    }

    coreResearchAnalysisAgent.registerScoringConfig(config.id, {
      weights: config.weights,
      thresholds: config.thresholds,
      normalization: config.normalization || 'linear',
      customRules: config.customRules,
    });

    res.json({ success: true, id: config.id });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('[ResearchAPI] Error creating scoring model:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== AGENT STATUS ====================

/**
 * GET /api/research/status
 * Get Research & Analysis Agent status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const agent = coreResearchAnalysisAgent;

    res.json({
      id: agent.id,
      name: agent.name,
      channel: agent.channel,
      status: agent.status,
      promptVersion: agent.promptVersion,
      scoringModels: agent.listScoringConfigs(),
      capabilities: [
        'lead_quality',
        'email_quality',
        'call_quality',
        'communication_quality',
        'engagement',
        'account_health',
        'next_best_action',
      ],
    });
  } catch (error: any) {
    console.error('[ResearchAPI] Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
