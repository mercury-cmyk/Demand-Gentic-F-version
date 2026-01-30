/**
 * Unified Email Generation Routes
 *
 * API endpoints for AI-powered email generation using the unified router.
 * Supports multiple providers with automatic fallback.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  emailGenerationLogs,
  emailProviderConfig,
  campaigns,
} from '../../shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { unifiedEmailRouter } from '../services/unified-email-router';
import { coreEmailAgent } from '../services/agents/core-email-agent';

const router = Router();

// =============================================================================
// Email Generation Endpoints
// =============================================================================

/**
 * POST /api/email/generate
 * Generate an email using the unified router
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      // Generation type
      generationType: z.enum(['campaign', 'follow_up', 'transactional', 'personalized']).default('campaign'),
      requestSource: z.enum(['campaign_send', 'client_portal', 'agentic_hub', 'api', 'preview']).default('api'),

      // Context IDs
      campaignId: z.string().optional(),
      accountId: z.string().optional(),
      contactId: z.string().optional(),

      // Campaign context
      campaignContext: z.object({
        campaignType: z.string(),
        campaignName: z.string(),
        objective: z.string(),
        targetAudience: z.string(),
        valueProposition: z.string().optional(),
        callToAction: z.string().optional(),
        landingPageUrl: z.string().optional(),
      }).optional(),

      // Contact context for personalization
      contactContext: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        industry: z.string().optional(),
      }).optional(),

      // Organization context
      organizationContext: z.string().optional(),

      // Additional instructions
      additionalInstructions: z.string().optional(),

      // Provider preferences
      preferredProvider: z.enum(['gemini', 'gpt4o', 'deepseek']).optional(),
      allowFallback: z.boolean().default(true),
      useCache: z.boolean().default(true),
    });

    const request = schema.parse(req.body);

    const response = await unifiedEmailRouter.generateEmail(request);

    res.json(response);
  } catch (error: any) {
    console.error('Error generating email:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to generate email', message: error.message });
  }
});

/**
 * POST /api/email/generate/campaign
 * Generate a campaign email with simpler input
 */
router.post('/generate/campaign', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      campaignId: z.string(),
      campaignType: z.string(),
      campaignName: z.string(),
      objective: z.string(),
      targetAudience: z.string(),
      valueProposition: z.string().optional(),
      callToAction: z.string().optional(),
      landingPageUrl: z.string().optional(),
      organizationContext: z.string().optional(),
      additionalInstructions: z.string().optional(),
      preferredProvider: z.enum(['gemini', 'gpt4o', 'deepseek']).optional(),
    });

    const data = schema.parse(req.body);

    const response = await coreEmailAgent.generateCampaignEmailUnified(
      {
        campaignId: data.campaignId,
        campaignType: data.campaignType,
        campaignName: data.campaignName,
        objective: data.objective,
        targetAudience: data.targetAudience,
        valueProposition: data.valueProposition,
        callToAction: data.callToAction,
        landingPageUrl: data.landingPageUrl,
      },
      {
        organizationContext: data.organizationContext,
        additionalInstructions: data.additionalInstructions,
        requestSource: 'api',
        preferredProvider: data.preferredProvider,
      }
    );

    res.json(response);
  } catch (error: any) {
    console.error('Error generating campaign email:', error);
    res.status(500).json({ error: 'Failed to generate email', message: error.message });
  }
});

/**
 * POST /api/email/generate/batch
 * Generate personalized emails for multiple contacts
 */
router.post('/generate/batch', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      campaignId: z.string(),
      campaignType: z.string(),
      campaignName: z.string(),
      objective: z.string(),
      targetAudience: z.string(),
      valueProposition: z.string().optional(),
      callToAction: z.string().optional(),
      landingPageUrl: z.string().optional(),
      organizationContext: z.string().optional(),
      contacts: z.array(z.object({
        contactId: z.string(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        industry: z.string().optional(),
      })).min(1).max(100),
      preferredProvider: z.enum(['gemini', 'gpt4o', 'deepseek']).optional(),
    });

    const data = schema.parse(req.body);

    const results = await coreEmailAgent.generateBatchEmails(
      {
        campaignId: data.campaignId,
        campaignType: data.campaignType,
        campaignName: data.campaignName,
        objective: data.objective,
        targetAudience: data.targetAudience,
        valueProposition: data.valueProposition,
        callToAction: data.callToAction,
        landingPageUrl: data.landingPageUrl,
      },
      data.contacts,
      {
        organizationContext: data.organizationContext,
        requestSource: 'campaign_send',
        preferredProvider: data.preferredProvider,
      }
    );

    // Convert Map to object for JSON response
    const resultsObj: Record<string, any> = {};
    results.forEach((value, key) => {
      resultsObj[key] = value;
    });

    res.json({
      totalContacts: data.contacts.length,
      successful: Object.values(resultsObj).filter(r => r.success).length,
      failed: Object.values(resultsObj).filter(r => !r.success).length,
      results: resultsObj,
    });
  } catch (error: any) {
    console.error('Error generating batch emails:', error);
    res.status(500).json({ error: 'Failed to generate batch emails', message: error.message });
  }
});

/**
 * POST /api/email/generate/preview
 * Preview email generation without logging (for UI preview)
 */
router.post('/generate/preview', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      campaignType: z.string(),
      campaignName: z.string(),
      objective: z.string(),
      targetAudience: z.string(),
      valueProposition: z.string().optional(),
      callToAction: z.string().optional(),
      contactContext: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        industry: z.string().optional(),
      }).optional(),
      organizationContext: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const response = await unifiedEmailRouter.generateEmail({
      requestSource: 'preview',
      generationType: 'campaign',
      campaignContext: {
        campaignType: data.campaignType,
        campaignName: data.campaignName,
        objective: data.objective,
        targetAudience: data.targetAudience,
        valueProposition: data.valueProposition,
        callToAction: data.callToAction,
      },
      contactContext: data.contactContext,
      organizationContext: data.organizationContext,
      useCache: false, // Don't cache preview requests
    });

    res.json(response);
  } catch (error: any) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview', message: error.message });
  }
});

// =============================================================================
// Generation Logs & Analytics
// =============================================================================

/**
 * GET /api/email/logs
 * Get email generation logs
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const campaignId = req.query.campaignId as string;
    const provider = req.query.provider as string;
    const status = req.query.status as string;

    let query = db.select().from(emailGenerationLogs);

    const conditions = [];
    if (campaignId) {
      conditions.push(eq(emailGenerationLogs.campaignId, campaignId));
    }
    if (provider) {
      conditions.push(eq(emailGenerationLogs.provider, provider as any));
    }
    if (status) {
      conditions.push(eq(emailGenerationLogs.status, status as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const logs = await query
      .orderBy(desc(emailGenerationLogs.requestedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      logs,
      pagination: { limit, offset, hasMore: logs.length === limit },
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/email/logs/:requestId
 * Get a specific generation log
 */
router.get('/logs/:requestId', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;

    const logs = await db
      .select()
      .from(emailGenerationLogs)
      .where(eq(emailGenerationLogs.requestId, requestId))
      .limit(1);

    if (logs.length === 0) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json(logs[0]);
  } catch (error: any) {
    console.error('Error fetching log:', error);
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

/**
 * GET /api/email/analytics
 * Get email generation analytics
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get aggregate stats
    const stats = await db
      .select({
        totalRequests: sql<number>`COUNT(*)`,
        successfulRequests: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`,
        failedRequests: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
        cachedRequests: sql<number>`COUNT(*) FILTER (WHERE status = 'cached')`,
        avgLatencyMs: sql<number>`AVG(latency_ms)`,
        fallbacksUsed: sql<number>`COUNT(*) FILTER (WHERE fallback_used = true)`,
      })
      .from(emailGenerationLogs)
      .where(gte(emailGenerationLogs.requestedAt, startDate));

    // Get provider breakdown
    const providerStats = await db
      .select({
        provider: emailGenerationLogs.provider,
        count: sql<number>`COUNT(*)`,
        successRate: sql<number>`ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*), 2)`,
        avgLatencyMs: sql<number>`AVG(latency_ms)`,
      })
      .from(emailGenerationLogs)
      .where(gte(emailGenerationLogs.requestedAt, startDate))
      .groupBy(emailGenerationLogs.provider);

    // Get generation type breakdown
    const typeStats = await db
      .select({
        generationType: emailGenerationLogs.generationType,
        count: sql<number>`COUNT(*)`,
      })
      .from(emailGenerationLogs)
      .where(gte(emailGenerationLogs.requestedAt, startDate))
      .groupBy(emailGenerationLogs.generationType);

    // Get daily trend
    const dailyTrend = await db
      .select({
        date: sql<string>`DATE(requested_at)`,
        count: sql<number>`COUNT(*)`,
        successCount: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`,
      })
      .from(emailGenerationLogs)
      .where(gte(emailGenerationLogs.requestedAt, startDate))
      .groupBy(sql`DATE(requested_at)`)
      .orderBy(sql`DATE(requested_at)`);

    res.json({
      period: { days, startDate },
      summary: stats[0],
      byProvider: providerStats,
      byType: typeStats,
      dailyTrend,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * GET /api/email/providers
 * Get email provider configurations
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await db
      .select()
      .from(emailProviderConfig)
      .orderBy(emailProviderConfig.priority);

    res.json(providers);
  } catch (error: any) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

/**
 * PUT /api/email/providers/:provider
 * Update provider configuration
 */
router.put('/providers/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    const schema = z.object({
      isEnabled: z.boolean().optional(),
      isPrimary: z.boolean().optional(),
      priority: z.number().optional(),
      maxRetries: z.number().optional(),
      requestsPerMinute: z.number().optional(),
      tokensPerMinute: z.number().optional(),
      defaultModel: z.string().optional(),
      defaultTemperature: z.number().optional(),
      defaultMaxTokens: z.number().optional(),
      monthlyBudget: z.number().optional(),
    });

    const updates = schema.parse(req.body);

    const existing = await db
      .select()
      .from(emailProviderConfig)
      .where(eq(emailProviderConfig.provider, provider as any))
      .limit(1);

    if (existing.length === 0) {
      // Create new config
      await db.insert(emailProviderConfig).values({
        provider: provider as any,
        displayName: provider.charAt(0).toUpperCase() + provider.slice(1),
        defaultModel: updates.defaultModel || 'default',
        ...updates,
      });
    } else {
      // Update existing
      await db
        .update(emailProviderConfig)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(emailProviderConfig.provider, provider as any));
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating provider:', error);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

/**
 * POST /api/email/providers/:provider/health-check
 * Manually trigger health check for a provider
 */
router.post('/providers/:provider/health-check', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    // Simple health check - try to generate a minimal email
    const testRequest = {
      requestSource: 'api' as const,
      generationType: 'campaign' as const,
      campaignContext: {
        campaignType: 'health_check',
        campaignName: 'Provider Health Check',
        objective: 'Verify provider is working',
        targetAudience: 'Test',
      },
      preferredProvider: provider as any,
      allowFallback: false,
      useCache: false,
    };

    const startTime = Date.now();
    const response = await unifiedEmailRouter.generateEmail(testRequest);
    const latencyMs = Date.now() - startTime;

    // Update provider health
    await db
      .update(emailProviderConfig)
      .set({
        isHealthy: response.success,
        lastHealthCheck: new Date(),
        consecutiveFailures: response.success ? 0 : db.raw('consecutive_failures + 1'),
        averageLatencyMs: latencyMs,
        updatedAt: new Date(),
      } as any)
      .where(eq(emailProviderConfig.provider, provider as any));

    res.json({
      provider,
      healthy: response.success,
      latencyMs,
      error: response.error,
    });
  } catch (error: any) {
    console.error('Error checking provider health:', error);
    res.status(500).json({ error: 'Health check failed', message: error.message });
  }
});

export default router;
