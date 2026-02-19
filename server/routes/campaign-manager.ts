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

function normalizeListFromText(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n|;|\|/g)
    .map((item) => item.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean);
}

function uniqueOrdered(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function buildProductMessages(
  valueProposition: string,
  campaignProductInfo?: string | null,
  campaignTalkingPoints?: string[] | null,
): string[] {
  const productInfoPoints = normalizeListFromText(campaignProductInfo);
  const valuePropChunks = normalizeListFromText(valueProposition);
  const pointsFromValueProp = valuePropChunks.length > 0 ? valuePropChunks : [valueProposition.trim()];

  return uniqueOrdered([
    ...productInfoPoints,
    ...(campaignTalkingPoints || []),
    ...pointsFromValueProp,
  ]).slice(0, 8);
}

function buildPlan(
  input: z.infer<typeof generateQuarterlyPlanSchema>,
  campaignContext?: {
    id: string;
    name: string;
    type: string;
    campaignObjective?: string | null;
    productServiceInfo?: string | null;
    talkingPoints?: string[] | null;
    successCriteria?: string | null;
  },
) {
  const quarterWindow = getQuarterWindow(input.quarter, input.year);
  const marketFocus = input.targetMarket;
  const campaignName = input.campaignName || campaignContext?.name || `Quarterly Campaign - ${quarterWindow.label}`;
  const primaryGoal = campaignContext?.campaignObjective || input.primaryGoal;
  const productMessages = buildProductMessages(
    input.valueProposition,
    campaignContext?.productServiceInfo,
    campaignContext?.talkingPoints ?? null,
  );

  const proofPoints = uniqueOrdered([
    ...productMessages.slice(0, 4),
    'Reasoning-first engagement model',
    'Multi-channel orchestration across voice, email, and automation',
    'Compliance-first execution with full memory of interactions',
  ]).slice(0, 7);

  const successCriteria =
    campaignContext?.successCriteria ||
    `Qualified meetings generated with buying-team alignment by end of ${quarterWindow.label}`;

  const coreNarrative = `${input.valueProposition}. We execute with ${TAGLINE.primary} for ${marketFocus} using product-led messaging tied to measurable commercial outcomes.`;

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
      productSignalsCount: productMessages.length,
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
        heroMessage: primaryGoal,
        proofPoints,
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
      ...(productMessages.length > 0 ? [`Product-led value narrative: ${productMessages[0]}`] : []),
      'Reasoning-led outbound with compliance by design',
      'Pipeline quality over activity vanity metrics',
      'Cross-channel consistency from first touch to booked meeting',
    ].slice(0, 5),
    productPositioning: {
      summary:
        campaignContext?.productServiceInfo ||
        `Position ${BRAND.company.productName} as the operational system for consistent demand generation outcomes.`,
      keyProductMessages: productMessages,
      differentiationFocus: [
        'Unified channel orchestration across outbound motions',
        'Reasoning-first execution over static script-based outreach',
        'Governed approval flow with campaign-level consistency controls',
      ],
    },
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
        ...(productMessages[0] ? [`How are you currently solving around "${productMessages[0]}" today?`] : []),
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
      social: 'Align company and individual narrative with product outcomes and buyer pains for the quarter.',
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
    outcomeModel: {
      primarySuccessCriteria: successCriteria,
      secondarySignals: [
        'Higher meeting acceptance rate from target personas',
        'Improved qualified-conversation to meeting conversion',
        'Consistent talking-point coverage across channels',
      ],
    },
    campaignSourceContext: {
      campaignObjective: campaignContext?.campaignObjective || null,
      productServiceInfo: campaignContext?.productServiceInfo || null,
      inheritedTalkingPoints: campaignContext?.talkingPoints || [],
      inheritedSuccessCriteria: campaignContext?.successCriteria || null,
    },
  };
}

router.use(requireAuth);

router.post('/plans/generate', async (req: Request, res: Response) => {
  try {
    const input = generateQuarterlyPlanSchema.parse(req.body);

    let campaignContext:
      | {
          id: string;
          name: string;
          type: string;
          campaignObjective?: string | null;
          productServiceInfo?: string | null;
          talkingPoints?: string[] | null;
          successCriteria?: string | null;
        }
      | undefined;
    if (input.campaignId) {
      const [campaign] = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          type: campaigns.type,
          campaignObjective: campaigns.campaignObjective,
          productServiceInfo: campaigns.productServiceInfo,
          talkingPoints: campaigns.talkingPoints,
          successCriteria: campaigns.successCriteria,
        })
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
      baseUpdate.successCriteria =
        plan?.outcomeModel?.primarySuccessCriteria ||
        'Aligned execution across email, phone, and automation with approved narrative consistency';
      baseUpdate.talkingPoints = Array.isArray(plan?.productPositioning?.keyProductMessages)
        ? plan.productPositioning.keyProductMessages
        : Array.isArray(plan?.keyThemes)
          ? plan.keyThemes
          : null;
      baseUpdate.productServiceInfo =
        plan?.productPositioning?.summary ||
        (Array.isArray(plan?.productPositioning?.keyProductMessages)
          ? plan.productPositioning.keyProductMessages.slice(0, 4).join('; ')
          : null);
    }

    if (syncCampaignFields && baseUpdate.productServiceInfo && typeof baseUpdate.productServiceInfo !== 'string') {
      baseUpdate.productServiceInfo = JSON.stringify(baseUpdate.productServiceInfo);
    }

    if (syncCampaignFields && Array.isArray(baseUpdate.talkingPoints)) {
      baseUpdate.talkingPoints = baseUpdate.talkingPoints.slice(0, 12);
    }

    if (syncCampaignFields && typeof baseUpdate.campaignObjective === 'string') {
      baseUpdate.campaignObjective = baseUpdate.campaignObjective.slice(0, 1200);
    }

    if (syncCampaignFields && typeof baseUpdate.successCriteria === 'string') {
      baseUpdate.successCriteria = baseUpdate.successCriteria.slice(0, 1200);
    }

    if (syncCampaignFields && typeof baseUpdate.productServiceInfo === 'string') {
      baseUpdate.productServiceInfo = baseUpdate.productServiceInfo.slice(0, 4000);
    }

    await db.update(campaigns).set(baseUpdate).where(eq(campaigns.id, campaignId));

    res.json({
      success: true,
      message: 'Campaign plan saved successfully',
      campaignId,
      syncedFields: syncCampaignFields
        ? {
            campaignObjective: baseUpdate.campaignObjective ?? null,
            successCriteria: baseUpdate.successCriteria ?? null,
            hasProductServiceInfo: Boolean(baseUpdate.productServiceInfo),
            talkingPointsCount: Array.isArray(baseUpdate.talkingPoints) ? baseUpdate.talkingPoints.length : 0,
          }
        : null,
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
