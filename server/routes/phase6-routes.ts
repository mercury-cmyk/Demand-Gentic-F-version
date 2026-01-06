// File: server/routes/phase6-routes.ts
// Phase 6 Advanced Features API Routes

import express, { Router, Request, Response } from 'express';
import { 
  createABTest, 
  getABTestResults, 
  declareWinner, 
  trackABTestMetric,
  exportResults as exportABTestResults 
} from '../services/ab-test-service';
import {
  ConditionalContentProcessor,
  ConditionalBlockManager,
} from '../services/conditional-personalization-service';
import {
  getCampaignMetrics,
  getDailyMetrics,
  getLinkPerformance,
  getEngagementSegments,
  generateAnalyticsReport,
  calculateEngagementScore,
} from '../services/analytics-service';
import {
  webhookService,
  createWebhookEvents,
  WebhookEventType,
} from '../services/webhook-service';
import { hubspotService } from '../services/hubspot-service';
import { salesforceService } from '../services/salesforce-service';

const router = Router();

// ====================
// A/B Testing Routes
// ====================

/**
 * POST /api/campaigns/:id/ab-tests
 * Create a new A/B test for a campaign
 */
router.post('/campaigns/:id/ab-tests', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { name, variantA, variantB, splitPercentage = 50 } = req.body;

    if (!name || !variantA || !variantB) {
      return res.status(400).json({
        error: 'Missing required fields: name, variantA, variantB',
      });
    }

    const test = await createABTest(campaignId, {
      name,
      variantA,
      variantB,
      splitPercentage,
    });

    res.status(201).json({
      success: true,
      data: test,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to create A/B test',
      message: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:id/ab-tests/:testId
 * Get A/B test results
 */
router.get('/campaigns/:id/ab-tests/:testId', async (req: Request, res: Response) => {
  try {
    const { campaignId, testId } = req.params;

    const results = await getABTestResults(testId);

    res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get A/B test results',
      message: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:id/ab-tests/:testId/declare-winner
 * Manually declare winner
 */
router.post('/campaigns/:id/ab-tests/:testId/declare-winner', async (req: Request, res: Response) => {
  try {
    const { campaignId, testId } = req.params;
    const { winner } = req.body; // 'A' or 'B'

    if (!winner || !['A', 'B'].includes(winner)) {
      return res.status(400).json({
        error: 'Invalid winner. Must be "A" or "B"',
      });
    }

    const result = await declareWinner(testId, winner);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to declare winner',
      message: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:id/ab-tests/:testId/export
 * Export A/B test results as CSV
 */
router.post('/campaigns/:id/ab-tests/:testId/export', async (req: Request, res: Response) => {
  try {
    const { campaignId, testId } = req.params;

    const csv = await exportABTestResults(testId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ab-test-${testId}.csv"`
    );
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to export A/B test results',
      message: error.message,
    });
  }
});

// ====================
// Conditional Personalization Routes
// ====================

/**
 * POST /api/campaigns/:id/conditional-blocks
 * Create conditional content block
 */
router.post('/campaigns/:id/conditional-blocks', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { blockName, conditions, content, blockType } = req.body;

    if (!blockName || !conditions || !content) {
      return res.status(400).json({
        error: 'Missing required fields: blockName, conditions, content',
      });
    }

    const manager = new ConditionalBlockManager();
    const block = manager.addBlock({
      id: `block_${Date.now()}`,
      campaignId,
      name: blockName,
      type: blockType || 'text',
      conditions,
      content,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: block,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to create conditional block',
      message: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:id/process-email
 * Process email with conditional content
 */
router.post('/campaigns/:id/process-email', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { emailTemplate, contactData } = req.body;

    if (!emailTemplate || !contactData) {
      return res.status(400).json({
        error: 'Missing required fields: emailTemplate, contactData',
      });
    }

    const processor = new ConditionalContentProcessor();
    const processedEmail = await processor.processEmail(
      emailTemplate,
      contactData
    );

    res.json({
      success: true,
      data: {
        originalTemplate: emailTemplate,
        processedTemplate: processedEmail.html,
        plainText: processedEmail.text,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to process email',
      message: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:id/validate-template
 * Validate conditional template syntax
 */
router.post('/campaigns/:id/validate-template', async (req: Request, res: Response) => {
  try {
    const { template } = req.body;

    if (!template) {
      return res.status(400).json({
        error: 'Missing required field: template',
      });
    }

    const processor = new ConditionalContentProcessor();
    const validation = processor.validateContent(template);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Validation error',
      message: error.message,
    });
  }
});

// ====================
// Analytics Dashboard Routes
// ====================

/**
 * GET /api/campaigns/:id/metrics
 * Get campaign metrics
 */
router.get('/campaigns/:id/metrics', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const metrics = await getCampaignMetrics(campaignId);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch campaign metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:id/metrics/daily
 * Get daily metrics for time-series analysis
 */
router.get('/campaigns/:id/metrics/daily', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { days = 30 } = req.query;

    const dailyMetrics = await getDailyMetrics(
      campaignId,
      parseInt(days as string)
    );

    res.json({
      success: true,
      data: dailyMetrics,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch daily metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:id/links
 * Get link performance
 */
router.get('/campaigns/:id/links', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const linkPerformance = await getLinkPerformance(campaignId);

    res.json({
      success: true,
      data: linkPerformance,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch link performance',
      message: error.message,
    });
  }
});

/**
 * GET /api/campaigns/:id/segments
 * Get engagement segments
 */
router.get('/campaigns/:id/segments', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const segments = await getEngagementSegments(campaignId);

    res.json({
      success: true,
      data: segments,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch engagement segments',
      message: error.message,
    });
  }
});

/**
 * POST /api/campaigns/:id/analytics/report
 * Generate comprehensive analytics report
 */
router.post('/campaigns/:id/analytics/report', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { format = 'json' } = req.body;

    const report = await generateAnalyticsReport(campaignId);

    if (format === 'csv') {
      // Convert to CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="analytics-${campaignId}.csv"`
      );
      // TODO: Implement CSV export
      res.send('Not implemented');
    } else {
      res.json({
        success: true,
        data: report,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to generate analytics report',
      message: error.message,
    });
  }
});

// ====================
// Webhook Routes
// ====================

/**
 * POST /api/webhooks
 * Register a new webhook
 */
router.post('/webhooks', async (req: Request, res: Response) => {
  try {
    const { url, events, secret } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({
        error: 'Missing required fields: url, events (array)',
      });
    }

    const webhook = await webhookService.registerWebhook(url, events, secret);

    res.status(201).json({
      success: true,
      data: webhook,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to register webhook',
      message: error.message,
    });
  }
});

/**
 * GET /api/webhooks
 * List all webhooks
 */
router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const webhooks = await webhookService.listWebhooks();

    res.json({
      success: true,
      data: webhooks,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch webhooks',
      message: error.message,
    });
  }
});

/**
 * GET /api/webhooks/:id
 * Get webhook details
 */
router.get('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const webhook = await webhookService.getWebhook(id);

    if (!webhook) {
      return res.status(404).json({
        error: 'Webhook not found',
      });
    }

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch webhook',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/webhooks/:id
 * Update webhook
 */
router.patch('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    await webhookService.updateWebhook(id, updates);

    const updated = await webhookService.getWebhook(id);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to update webhook',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete webhook
 */
router.delete('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await webhookService.deleteWebhook(id);

    res.json({
      success: true,
      message: 'Webhook deleted',
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to delete webhook',
      message: error.message,
    });
  }
});

/**
 * GET /api/webhooks/:id/deliveries
 * Get webhook delivery history
 */
router.get('/webhooks/:id/deliveries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const history = await webhookService.getDeliveryHistory(id);

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch delivery history',
      message: error.message,
    });
  }
});

/**
 * POST /api/webhooks/:id/deliveries/:deliveryId/retry
 * Retry failed delivery
 */
router.post(
  '/webhooks/:id/deliveries/:deliveryId/retry',
  async (req: Request, res: Response) => {
    try {
      const { id, deliveryId } = req.params;

      await webhookService.retryDelivery(deliveryId);

      res.json({
        success: true,
        message: 'Retry initiated',
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to retry delivery',
        message: error.message,
      });
    }
  }
);

// ====================
// CRM Integration Routes
// ====================

/**
 * POST /api/integrations/hubspot/sync-contact
 * Sync contact to HubSpot
 */
router.post(
  '/integrations/hubspot/sync-contact',
  async (req: Request, res: Response) => {
    try {
      const { email, firstName, lastName, phone, customFields } = req.body;

      const contact = await hubspotService.syncContact({
        email,
        firstName,
        lastName,
        phone,
        customFields,
      });

      res.json({
        success: true,
        data: contact,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to sync contact to HubSpot',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/integrations/hubspot/log-event
 * Log campaign event to HubSpot
 */
router.post(
  '/integrations/hubspot/log-event',
  async (req: Request, res: Response) => {
    try {
      const { email, eventType, metadata } = req.body;

      await hubspotService.logCampaignEvent(email, eventType, metadata);

      res.json({
        success: true,
        message: 'Event logged to HubSpot',
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to log event to HubSpot',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/integrations/salesforce/sync-lead
 * Sync lead to Salesforce
 */
router.post(
  '/integrations/salesforce/sync-lead',
  async (req: Request, res: Response) => {
    try {
      const { email, firstName, lastName, phone, company, customFields } =
        req.body;

      const lead = await salesforceService.syncLead({
        email,
        firstName,
        lastName,
        phone,
        company,
        customFields,
      });

      res.json({
        success: true,
        data: lead,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to sync lead to Salesforce',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/integrations/salesforce/log-engagement
 * Log engagement in Salesforce
 */
router.post(
  '/integrations/salesforce/log-engagement',
  async (req: Request, res: Response) => {
    try {
      const { leadId, engagementType, metadata } = req.body;

      await salesforceService.logCampaignEngagement(
        leadId,
        engagementType,
        metadata
      );

      res.json({
        success: true,
        message: 'Engagement logged to Salesforce',
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to log engagement to Salesforce',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/integrations/test
 * Test CRM connections
 */
router.post('/integrations/test', async (req: Request, res: Response) => {
  try {
    const { providers = ['hubspot', 'salesforce'] } = req.body;

    const results: Record<string, boolean> = {};

    if (providers.includes('hubspot')) {
      results.hubspot = await hubspotService.testConnection();
    }

    if (providers.includes('salesforce')) {
      results.salesforce = await salesforceService.testConnection();
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to test integrations',
      message: error.message,
    });
  }
});

export default router;
