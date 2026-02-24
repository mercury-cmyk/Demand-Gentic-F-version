/**
 * Client Campaign Planner Routes
 *
 * AI-powered campaign planning for client portal users.
 * Generates full-funnel, multi-channel campaign plans from Organization Intelligence.
 *
 * Mounted at: /api/client-portal/campaign-planner
 * Auth: requireClientAuth (Bearer token from client portal)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { clientCampaignPlans } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateCampaignPlan, getOISummaryForClient } from '../services/ai-campaign-planner';

const router = Router();

// ─── GET /status — Feature probe for client dashboard ───

router.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json({ enabled: true });
  } catch (error) {
    res.status(500).json({ enabled: false });
  }
});

// ─── GET /oi-summary — OI summary for display in the UI ───

router.get('/oi-summary', async (_req: Request, res: Response) => {
  try {
    const summary = await getOISummaryForClient();
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('[CampaignPlanner] Failed to fetch OI summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch organization intelligence' });
  }
});

// ─── POST /generate-plan — AI-powered full-funnel campaign plan generation ───

const generatePlanSchema = z.object({
  campaignGoal: z.string().max(1000).optional(),
  targetBudget: z.string().max(200).optional(),
  preferredChannels: z.array(z.enum(['voice', 'email', 'messaging'])).optional(),
  campaignDuration: z.string().max(200).optional(),
  additionalContext: z.string().max(2000).optional(),
});

router.post('/generate-plan', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    const clientUserId = req.clientUser?.clientUserId;
    if (!clientAccountId || !clientUserId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const input = generatePlanSchema.parse(req.body);

    const result = await generateCampaignPlan(input);

    // Auto-save the generated plan
    const [plan] = await db.insert(clientCampaignPlans).values({
      clientAccountId,
      createdByUserId: clientUserId,
      name: result.plan.planName || 'Campaign Plan',
      status: 'generated',
      campaignGoal: input.campaignGoal || null,
      targetBudget: input.targetBudget || null,
      preferredChannels: input.preferredChannels || null,
      campaignDuration: input.campaignDuration || null,
      additionalContext: input.additionalContext || null,
      generatedPlan: result.plan as any,
      oiSnapshotSummary: result.oiSummary,
      funnelStageCount: result.plan.funnelStrategy?.length || 0,
      channelCount: result.plan.channelStrategies?.length || 0,
      estimatedLeadVolume: result.plan.estimatedResults?.totalLeadVolume || null,
      aiModel: result.model,
      thinkingContent: result.thinking,
      generationDurationMs: result.durationMs,
    }).returning();

    res.json({
      success: true,
      plan,
      generatedPlan: result.plan,
    });
  } catch (error: any) {
    console.error('[CampaignPlanner] Plan generation failed:', error);

    if (error?.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }

    res.status(500).json({
      success: false,
      message: error?.message?.includes('cooldown')
        ? 'AI model is cooling down. Please try again in a moment.'
        : 'Failed to generate campaign plan. Please try again.',
    });
  }
});

// ─── GET /plans — List saved plans for the client ───

router.get('/plans', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const plans = await db.select({
      id: clientCampaignPlans.id,
      name: clientCampaignPlans.name,
      status: clientCampaignPlans.status,
      campaignGoal: clientCampaignPlans.campaignGoal,
      campaignDuration: clientCampaignPlans.campaignDuration,
      funnelStageCount: clientCampaignPlans.funnelStageCount,
      channelCount: clientCampaignPlans.channelCount,
      estimatedLeadVolume: clientCampaignPlans.estimatedLeadVolume,
      createdAt: clientCampaignPlans.createdAt,
      approvedAt: clientCampaignPlans.approvedAt,
    })
    .from(clientCampaignPlans)
    .where(eq(clientCampaignPlans.clientAccountId, clientAccountId))
    .orderBy(desc(clientCampaignPlans.createdAt))
    .limit(50);

    res.json({ success: true, plans });
  } catch (error) {
    console.error('[CampaignPlanner] Failed to list plans:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch plans' });
  }
});

// ─── GET /plans/:id — Get specific plan with full generated content ───

router.get('/plans/:id', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [plan] = await db.select()
      .from(clientCampaignPlans)
      .where(and(
        eq(clientCampaignPlans.id, req.params.id),
        eq(clientCampaignPlans.clientAccountId, clientAccountId),
      ))
      .limit(1);

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json({ success: true, plan });
  } catch (error) {
    console.error('[CampaignPlanner] Failed to fetch plan:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch plan' });
  }
});

// ─── PATCH /plans/:id/approve — Client approves a plan ───

router.patch('/plans/:id/approve', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser?.clientAccountId;
    if (!clientAccountId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [updated] = await db.update(clientCampaignPlans)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(clientCampaignPlans.id, req.params.id),
        eq(clientCampaignPlans.clientAccountId, clientAccountId),
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json({ success: true, plan: updated });
  } catch (error) {
    console.error('[CampaignPlanner] Failed to approve plan:', error);
    res.status(500).json({ success: false, message: 'Failed to approve plan' });
  }
});

export default router;
