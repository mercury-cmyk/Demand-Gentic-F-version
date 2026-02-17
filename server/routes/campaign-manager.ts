import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireRole } from '../auth';
import { campaigns } from '@shared/schema';
import { BRAND, TAGLINE, PILLARS, BRAND_VOICE, SOCIAL_PROFILES } from '@shared/brand-messaging';

const router = Router();

const generateQuarterlyPlanSchema = z.object({
  campaignName: z.string().min(1).max(200).optional(),
  campaignId: z.string().uuid().optional(),
  quarter: z.number().int().min(1).max(4).optional(),
  year: z.number().int().min(2024).max(2035).optional(),
  targetMarket: z.string().min(3).max(1000),
  primaryGoal: z.string().min(3).max(1000),
  valueProposition: z.string().min(3).max(1500),
  keyChallenges: z.array(z.string().min(2).max(300)).min(1).max(12),
  channels: z.array(z.enum(['email', 'phone', 'automation', 'social'])).min(1),
  internalOnly: z.boolean().optional().default(true),
});

const savePlanSchema = z.object({
  plan: z.record(z.any()),
  syncCampaignFields: z.boolean().optional().default(true),
});

const approvePlanSchema = z.object({
  notes: z.string().max(1000).optional(),
});

function getQuarterWindow(quarter?: number, year?: number) {
  const now = new Date();
  const q = quarter ?? Math.floor(now.getMonth() / 3) + 1;
  const y = year ?? now.getFullYear();
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0));
  return {
    quarter: q,
    year: y,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: `Q${q} ${y}`,
  };
}

function buildPlan(input: z.infer<typeof generateQuarterlyPlanSchema>, campaignContext?: { id: string; name: string; type: string }) {
  const quarterWindow = getQuarterWindow(input.quarter, input.year);
  const marketFocus = input.targetMarket;
  const campaignName = input.campaignName || campaignContext?.name || `Quarterly Campaign - ${quarterWindow.label}`;

  const coreNarrative = `${input.valueProposition}. We execute with ${TAGLINE.primary} for ${marketFocus}.`;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      cadence: 'quarterly',
      quarter: quarterWindow.quarter,
      year: quarterWindow.year,
      window: {
        label: quarterWindow.label,
        startDate: quarterWindow.startDate,
        endDate: quarterWindow.endDate,
      },
      scope: input.internalOnly ? 'internal-first' : 'shared',
      campaign: {
        id: campaignContext?.id ?? input.campaignId ?? null,
        name: campaignName,
        type: campaignContext?.type ?? null,
      },
    },
    brandPositioningAlignment: {
      brand: BRAND.company.parentBrand,
      product: BRAND.company.productName,
      promise: TAGLINE.corePromise,
      strategicIdentity: TAGLINE.identity,
      narrativeAnchor: TAGLINE.heroSubHeadline,
      pillarAlignment: PILLARS.map((pillar) => pillar.label),
    },
    messagingArchitecture: {
      coreNarrative,
      messageHouse: {
        heroMessage: input.primaryGoal,
        proofPoints: [
          'Reasoning-first engagement model',
          'Multi-channel orchestration across voice, email, and automation',
          'Compliance-first execution with full memory of interactions',
        ],
        challengeFraming: input.keyChallenges,
      },
      personaAngles: [
        {
          persona: 'Demand Generation Leader',
          pain: 'Channel fragmentation and weak conversion quality',
          message: 'Unify demand channels with measurable quarterly outcomes and governed execution.',
        },
        {
          persona: 'RevOps / Sales Operations',
          pain: 'Inconsistent process and poor lifecycle visibility',
          message: 'Create reliable outbound systems with clear handoff, QA, and attribution.',
        },
      ],
    },
    keyThemes: [
      `Problem-first demand for ${marketFocus}`,
      'Reasoning-led outbound with compliance by design',
      'Pipeline quality over activity vanity metrics',
      'Cross-channel consistency from first touch to booked meeting',
    ],
    emailCampaignStructures: [
      {
        format: 'Problem-led sequence',
        angle: 'Highlight critical business friction and opportunity cost',
        steps: ['Insight opener', 'Diagnostic question', 'Outcome framing', 'CTA for discovery'],
      },
      {
        format: 'Proof-led sequence',
        angle: 'Use credibility and execution confidence',
        steps: ['Proof snapshot', 'Relevance mapping', 'Risk reversal', 'Meeting CTA'],
      },
      {
        format: 'Executive POV sequence',
        angle: 'Leadership-level strategic narrative',
        steps: ['Executive narrative', 'Market framing', 'Strategic recommendation', 'Calendar CTA'],
      },
    ],
    contentStrategy: {
      monthlyFocus: [
        'Month 1: Positioning + market challenge framing',
        'Month 2: Solution proof + implementation confidence',
        'Month 3: Decision enablement + conversion assets',
      ],
      assets: [
        'Thought-leadership article per primary theme',
        'Persona-specific one-pager per buying role',
        'Quarterly solution brief aligned to sales talk tracks',
      ],
      distribution: ['Email nurtures', 'Sales enablement handoff', 'Client-facing landing pages'],
    },
    phoneOutreachStrategy: {
      openingFramework: 'Problem intelligence → role relevance → value hypothesis',
      discoveryQuestions: [
        'How are you currently addressing this operational gap?',
        'What happens if this remains unresolved next quarter?',
        'Which stakeholders are involved in evaluating alternatives?',
      ],
      objectionPlaybookThemes: ['Status quo comfort', 'Timing hesitation', 'Resource constraints'],
      callbackAndFollowUp: 'Every call disposition maps to next best action and sequence branch.',
    },
    automationSequenceDesign: {
      sequenceType: 'quarterly multi-touch',
      entryRules: ['ICP match', 'Not suppressed', 'No active contradictory sequence'],
      branchLogic: [
        'Email positive signal → prioritize call task',
        'No response by touch 3 → shift to educational angle',
        'Objection tagged → trigger objection-specific nurture branch',
      ],
      governance: ['Frequency caps per contact', 'Business-hour sending/calling guardrails', 'Suppression enforcement'],
    },
    channelOptimizationGuidance: {
      email: 'Lead with role-specific problem framing, keep CTA singular, test angle not just subject line.',
      phone: 'Use concise value hypotheses and consistent objection coding for optimization.',
      automation: 'Prioritize intent-driven branching over fixed linear cadences.',
      crossChannel: 'Maintain one narrative spine and one disposition taxonomy across all channels.',
    },
    socialMessagingPack: {
      companyProfile: {
        headline: SOCIAL_PROFILES.linkedin.headline,
        narrative: `${coreNarrative} ${TAGLINE.corePromise}`,
        quarterlyTheme: `Quarterly focus: ${quarterWindow.label} — ${input.primaryGoal}`,
      },
      individualProfiles: [
        {
          role: 'Executive / Founder',
          positioning: 'Strategic POV on market problems and transformation outcomes',
          style: 'Authoritative, evidence-backed, future-facing',
        },
        {
          role: 'Sales / Inside Team',
          positioning: 'Customer problem fluency + practical execution insights',
          style: 'Consultative, clear, and value-led',
        },
        {
          role: 'Marketing / Content',
          positioning: 'Theme amplification and buyer education',
          style: BRAND_VOICE.traits?.join(', ') ?? 'Insightful and audience-first',
        },
      ],
      consistencyRules: [
        'All social copy must map to quarterly core narrative and approved themes.',
        'Do not introduce claims not represented in campaign proof points.',
        'Use approved vocabulary and avoid anti-traits language.',
      ],
    },
    governance: {
      lifecycle: ['draft', 'internal_review', 'approved', 'launch_ready', 'active', 'optimizing'],
      approvalRequired: true,
    },
  };
}

router.use(requireAuth);

router.post('/plans/generate', async (req: Request, res: Response) => {
  try {
    const input = generateQuarterlyPlanSchema.parse(req.body);

    let campaignContext: { id: string; name: string; type: string } | undefined;
    if (input.campaignId) {
      const [campaign] = await db
        .select({ id: campaigns.id, name: campaigns.name, type: campaigns.type })
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }
      campaignContext = campaign;
    }

    const plan = buildPlan(input, campaignContext);

    res.json({
      success: true,
      plan,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CampaignManager] Plan generation failed:', error);
    res.status(500).json({ message: 'Failed to generate campaign plan' });
  }
});

router.get('/campaigns/:campaignId/plan', async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId;
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        campaignContextBrief: campaigns.campaignContextBrief,
        approvalStatus: campaigns.approvalStatus,
        approvedAt: campaigns.approvedAt,
        approvedById: campaigns.approvedById,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    let parsed: any = null;
    if (campaign.campaignContextBrief) {
      try {
        parsed = JSON.parse(campaign.campaignContextBrief);
      } catch {
        parsed = { raw: campaign.campaignContextBrief };
      }
    }

    res.json({
      success: true,
      campaignId: campaign.id,
      campaignName: campaign.name,
      approvalStatus: campaign.approvalStatus,
      approvedAt: campaign.approvedAt,
      approvedById: campaign.approvedById,
      plan: parsed?.campaignManagerPlan || null,
      planMeta: parsed?.campaignManagerMeta || null,
    });
  } catch (error) {
    console.error('[CampaignManager] Fetch plan failed:', error);
    res.status(500).json({ message: 'Failed to fetch campaign plan' });
  }
});

router.post('/campaigns/:campaignId/plan', async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId;
    const { plan, syncCampaignFields } = savePlanSchema.parse(req.body);

    const [campaign] = await db
      .select({ id: campaigns.id, campaignContextBrief: campaigns.campaignContextBrief })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    let existingBrief: any = {};
    if (campaign.campaignContextBrief) {
      try {
        existingBrief = JSON.parse(campaign.campaignContextBrief);
      } catch {
        existingBrief = { legacy: campaign.campaignContextBrief };
      }
    }

    const mergedBrief = {
      ...existingBrief,
      campaignManagerPlan: plan,
      campaignManagerMeta: {
        version: 'v1',
        updatedAt: new Date().toISOString(),
        updatedBy: req.user?.userId || null,
      },
    };

    const baseUpdate: Record<string, any> = {
      campaignContextBrief: JSON.stringify(mergedBrief),
      updatedAt: new Date(),
    };

    if (syncCampaignFields) {
      baseUpdate.campaignObjective =
        plan?.messagingArchitecture?.messageHouse?.heroMessage ||
        plan?.meta?.window?.label ||
        null;
      baseUpdate.successCriteria = 'Aligned execution across email, phone, and automation with approved narrative consistency';
      baseUpdate.talkingPoints = Array.isArray(plan?.keyThemes)
        ? plan.keyThemes
        : null;
    }

    await db.update(campaigns).set(baseUpdate).where(eq(campaigns.id, campaignId));

    res.json({
      success: true,
      message: 'Campaign plan saved successfully',
      campaignId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CampaignManager] Save plan failed:', error);
    res.status(500).json({ message: 'Failed to save campaign plan' });
  }
});

router.post('/campaigns/:campaignId/approve', requireRole('admin', 'campaign_manager'), async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId;
    const { notes } = approvePlanSchema.parse(req.body ?? {});

    const [campaign] = await db
      .select({ id: campaigns.id, campaignContextBrief: campaigns.campaignContextBrief })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    let existingBrief: any = {};
    if (campaign.campaignContextBrief) {
      try {
        existingBrief = JSON.parse(campaign.campaignContextBrief);
      } catch {
        existingBrief = { legacy: campaign.campaignContextBrief };
      }
    }

    const approvals = Array.isArray(existingBrief?.campaignManagerApprovals)
      ? existingBrief.campaignManagerApprovals
      : [];

    approvals.push({
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: req.user?.userId || null,
      notes: notes || null,
    });

    await db
      .update(campaigns)
      .set({
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedById: req.user?.userId || null,
        campaignContextBrief: JSON.stringify({
          ...existingBrief,
          campaignManagerApprovals: approvals,
        }),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    res.json({
      success: true,
      message: 'Campaign plan approved',
      campaignId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CampaignManager] Approval failed:', error);
    res.status(500).json({ message: 'Failed to approve campaign plan' });
  }
});

router.post('/campaigns/:campaignId/social-messaging', async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId;

    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        campaignContextBrief: campaigns.campaignContextBrief,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    let planNarrative = TAGLINE.heroDescription;
    if (campaign.campaignContextBrief) {
      try {
        const parsed = JSON.parse(campaign.campaignContextBrief);
        planNarrative =
          parsed?.campaignManagerPlan?.messagingArchitecture?.coreNarrative ||
          planNarrative;
      } catch {
        // Keep default narrative
      }
    }

    const socialPack = {
      campaignId,
      campaignName: campaign.name,
      generatedAt: new Date().toISOString(),
      companyProfile: {
        linkedinHeadline: SOCIAL_PROFILES.linkedin.headline,
        linkedinAbout: `${planNarrative} ${TAGLINE.corePromise}`,
      },
      individualProfileVariants: [
        {
          role: 'Founder / Executive',
          headline: `${BRAND.company.parentBrand} | Strategic Growth & Demand Transformation`,
          summary: 'I help B2B teams replace outbound noise with reasoning-first demand systems.',
        },
        {
          role: 'Sales Leader / SDR Team',
          headline: `${BRAND.company.productName} | Consultative Pipeline Acceleration`,
          summary: 'Focused on meaningful conversations, qualification integrity, and consistent conversion outcomes.',
        },
        {
          role: 'Marketing Leader',
          headline: `${BRAND.company.productName} | Narrative-Led Demand Generation`,
          summary: 'Aligning positioning, messaging, and channel execution into one quarterly growth narrative.',
        },
      ],
      consistencyChecklist: [
        'Use quarterly core narrative across company and individual profiles.',
        'Align language to approved pillars and brand voice traits.',
        'Avoid introducing channel-specific claims not present in campaign plan.',
      ],
    };

    res.json({ success: true, socialMessaging: socialPack });
  } catch (error) {
    console.error('[CampaignManager] Social messaging generation failed:', error);
    res.status(500).json({ message: 'Failed to generate social messaging pack' });
  }
});

export default router;
