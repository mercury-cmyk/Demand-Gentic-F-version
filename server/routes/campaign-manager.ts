import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireRole } from '../auth';
import { campaigns, campaignOrganizations } from '@shared/schema';
import { BRAND, TAGLINE, PILLARS, BRAND_VOICE, SOCIAL_PROFILES } from '@shared/brand-messaging';
import { generateJSON } from '../services/vertex-ai/vertex-client';
import {
  getOrganizationProfile,
  getOrganizationPromptSettings,
  getOrganizationLearningSummary,
  type OrganizationProfile,
  type OrganizationPromptSettings,
} from '../lib/org-intelligence-helper';

const router = Router();

const generateQuarterlyPlanSchema = z.object({
  campaignName: z.string().min(1).max(200).optional(),
  campaignId: z.string().uuid().optional(),
  quarter: z.number().int().min(1).max(4).optional(),
  year: z.number().int().min(2024).max(2035).optional(),
  targetMarket: z.string().min(3).max(1000),
  primaryGoal: z.string().min(3).max(1000),
  valueProposition: z.string().min(3).max(1500),
  keyChallenges: z.array(z.string().min(2)).min(1).max(12),
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

interface OrgIntelligenceContext {
  profile: OrganizationProfile | null;
  settings: OrganizationPromptSettings;
  learningSummary: string;
}

async function fetchOrgIntelligenceContext(): Promise<OrgIntelligenceContext> {
  const [profile, settings, learningSummary] = await Promise.all([
    getOrganizationProfile(),
    getOrganizationPromptSettings(),
    getOrganizationLearningSummary(),
  ]);
  return { profile, settings, learningSummary };
}

function extractOrgIdentityName(profile: OrganizationProfile | null): string | null {
  if (!profile?.identity) return null;
  const identity = profile.identity as any;
  return identity?.legalName?.value || identity?.legalName || null;
}

function extractOrgDescription(profile: OrganizationProfile | null): string | null {
  if (!profile?.identity) return null;
  const identity = profile.identity as any;
  return identity?.description?.value || identity?.description || null;
}

function extractOrgIndustry(profile: OrganizationProfile | null): string | null {
  if (!profile?.identity) return null;
  const identity = profile.identity as any;
  return identity?.industry?.value || identity?.industry || null;
}

function extractIcpIndustries(profile: OrganizationProfile | null): string[] {
  if (!profile?.icp) return [];
  const icp = profile.icp as any;
  const industries = icp?.industries?.value || icp?.industries;
  if (typeof industries === 'string') return industries.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(industries)) return industries.map((i: any) => typeof i === 'string' ? i : i?.value || String(i));
  return [];
}

function extractIcpPersonas(profile: OrganizationProfile | null): Array<{ title: string; painPoints?: string[]; goals?: string[] }> {
  if (!profile?.icp) return [];
  const icp = profile.icp as any;
  const personas = icp?.personas?.value || icp?.personas;
  if (!Array.isArray(personas)) return [];
  return personas.map((p: any) => {
    if (typeof p === 'string') return { title: p };
    return {
      title: p.title || p.role || String(p),
      painPoints: Array.isArray(p.painPoints) ? p.painPoints : [],
      goals: Array.isArray(p.goals) ? p.goals : [],
    };
  });
}

function extractIcpObjections(profile: OrganizationProfile | null): string[] {
  if (!profile?.icp) return [];
  const icp = profile.icp as any;
  const objections = icp?.objections?.value || icp?.objections;
  if (typeof objections === 'string') return objections.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(objections)) return objections.map((o: any) => typeof o === 'string' ? o : String(o));
  return [];
}

function extractPositioningOneLiner(profile: OrganizationProfile | null): string | null {
  if (!profile?.positioning) return null;
  const pos = profile.positioning as any;
  return pos?.oneLiner?.value || pos?.oneLiner || pos?.valueProposition?.value || pos?.valueProposition || null;
}

function extractPositioningWhyUs(profile: OrganizationProfile | null): string[] {
  if (!profile?.positioning) return [];
  const pos = profile.positioning as any;
  const whyUs = pos?.whyUs?.value || pos?.whyUs;
  if (typeof whyUs === 'string') return whyUs.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(whyUs)) return whyUs.map((w: any) => typeof w === 'string' ? w : String(w));
  return [];
}

function extractPositioningCompetitors(profile: OrganizationProfile | null): string[] {
  if (!profile?.positioning) return [];
  const pos = profile.positioning as any;
  const competitors = pos?.competitors?.value || pos?.competitors;
  if (typeof competitors === 'string') return competitors.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(competitors)) return competitors.map((c: any) => typeof c === 'string' ? c : String(c));
  return [];
}

function extractOfferingProducts(profile: OrganizationProfile | null): string[] {
  if (!profile?.offerings) return [];
  const off = profile.offerings as any;
  const products = off?.coreProducts?.value || off?.coreProducts;
  if (typeof products === 'string') return products.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(products)) return products.map((p: any) => typeof p === 'string' ? p : String(p));
  return [];
}

function extractOfferingDifferentiators(profile: OrganizationProfile | null): string[] {
  if (!profile?.offerings) return [];
  const off = profile.offerings as any;
  const diff = off?.differentiators?.value || off?.differentiators;
  if (typeof diff === 'string') return diff.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(diff)) return diff.map((d: any) => typeof d === 'string' ? d : String(d));
  return [];
}

function extractOfferingProblemsSolved(profile: OrganizationProfile | null): string[] {
  if (!profile?.offerings) return [];
  const off = profile.offerings as any;
  const problems = off?.problemsSolved?.value || off?.problemsSolved;
  if (typeof problems === 'string') return problems.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(problems)) return problems.map((p: any) => typeof p === 'string' ? p : String(p));
  return [];
}

function extractOutreachEmailAngles(profile: OrganizationProfile | null): string[] {
  if (!profile?.outreach) return [];
  const out = profile.outreach as any;
  const angles = out?.emailAngles?.value || out?.emailAngles;
  if (typeof angles === 'string') return angles.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(angles)) return angles.map((a: any) => typeof a === 'string' ? a : String(a));
  return [];
}

function extractOutreachCallOpeners(profile: OrganizationProfile | null): string[] {
  if (!profile?.outreach) return [];
  const out = profile.outreach as any;
  const openers = out?.callOpeners?.value || out?.callOpeners;
  if (typeof openers === 'string') return openers.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (Array.isArray(openers)) return openers.map((o: any) => typeof o === 'string' ? o : String(o));
  return [];
}

function extractOutreachObjectionHandlers(profile: OrganizationProfile | null): Array<{ objection: string; response: string }> {
  if (!profile?.outreach) return [];
  const out = profile.outreach as any;
  const handlers = out?.objectionHandlers?.value || out?.objectionHandlers;
  if (!Array.isArray(handlers)) return [];
  return handlers.map((h: any) => ({
    objection: h.objection || String(h),
    response: h.response || '',
  }));
}

function buildPlan(
  input: z.infer<typeof generateQuarterlyPlanSchema>,
  orgContext: OrgIntelligenceContext,
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
  const profile = orgContext.profile;

  // --- Org intelligence as primary source, user input as override ---
  const orgName = extractOrgIdentityName(profile);
  const orgDescription = extractOrgDescription(profile);
  const orgIndustry = extractOrgIndustry(profile);
  const orgOneLiner = extractPositioningOneLiner(profile);
  const orgWhyUs = extractPositioningWhyUs(profile);
  const orgCompetitors = extractPositioningCompetitors(profile);
  const orgProducts = extractOfferingProducts(profile);
  const orgDifferentiators = extractOfferingDifferentiators(profile);
  const orgProblemsSolved = extractOfferingProblemsSolved(profile);
  const orgIcpIndustries = extractIcpIndustries(profile);
  const orgPersonas = extractIcpPersonas(profile);
  const orgObjections = extractIcpObjections(profile);
  const orgEmailAngles = extractOutreachEmailAngles(profile);
  const orgCallOpeners = extractOutreachCallOpeners(profile);
  const orgObjectionHandlers = extractOutreachObjectionHandlers(profile);

  // Target market: prefer org ICP industries, then user input
  const marketFocus = orgIcpIndustries.length > 0
    ? `${orgIcpIndustries.join(', ')} organizations`
    : input.targetMarket;

  const campaignName = input.campaignName || campaignContext?.name || `Quarterly Campaign - ${quarterWindow.label}`;

  // Primary goal: prefer campaign objective, then user input
  const primaryGoal = campaignContext?.campaignObjective || input.primaryGoal;

  // Value proposition: prefer org positioning, then user input
  const valueProposition = orgOneLiner || input.valueProposition;

  // Product messages: combine org offerings + campaign info + user input
  const orgProductMessages = uniqueOrdered([
    ...orgProducts,
    ...orgProblemsSolved.slice(0, 3),
  ]);
  const productMessages = buildProductMessages(
    valueProposition,
    campaignContext?.productServiceInfo,
    campaignContext?.talkingPoints ?? null,
  );
  const allProductMessages = uniqueOrdered([
    ...orgProductMessages,
    ...productMessages,
  ]).slice(0, 10);

  // Proof points: org differentiators + why us + product messages
  const proofPoints = uniqueOrdered([
    ...orgDifferentiators.slice(0, 3),
    ...orgWhyUs.slice(0, 2),
    ...allProductMessages.slice(0, 3),
    'Reasoning-first engagement model',
    'Multi-channel orchestration across voice, email, and automation',
    'Compliance-first execution with full memory of interactions',
  ]).slice(0, 8);

  const successCriteria =
    campaignContext?.successCriteria ||
    `Qualified meetings generated with buying-team alignment by end of ${quarterWindow.label}`;

  // Core narrative driven by org intelligence
  const narrativeBase = orgDescription || valueProposition;
  const coreNarrative = `${narrativeBase}. We execute with ${TAGLINE.primary} for ${marketFocus} using product-led messaging tied to measurable commercial outcomes.`;

  // Build persona angles from org ICP personas, fallback to defaults
  const personaAngles = orgPersonas.length > 0
    ? orgPersonas.slice(0, 4).map((persona) => ({
        persona: persona.title,
        pain: persona.painPoints?.[0] || 'Operational friction and inconsistent outcomes',
        message: persona.goals?.[0] || `Targeted strategy for ${persona.title} aligned with quarterly objectives.`,
      }))
    : [
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
      ];

  // Objection themes from org intelligence
  const objectionThemes = orgObjections.length > 0
    ? orgObjections.slice(0, 5)
    : orgObjectionHandlers.length > 0
      ? orgObjectionHandlers.slice(0, 5).map((h) => h.objection)
      : ['Status quo comfort', 'Timing hesitation', 'Resource constraints'];

  // Key challenges: combine user input with org problems
  const keyChallenges = input.keyChallenges.length > 0
    ? input.keyChallenges
    : orgProblemsSolved.slice(0, 5);

  // Email campaign structures from org outreach angles
  const emailStructures = orgEmailAngles.length >= 3
    ? orgEmailAngles.slice(0, 4).map((angle, idx) => ({
        format: `${angle} sequence`,
        angle,
        steps: idx === 0
          ? ['Insight opener', 'Diagnostic question', 'Outcome framing', 'CTA for discovery']
          : idx === 1
            ? ['Proof snapshot', 'Relevance mapping', 'Risk reversal', 'Meeting CTA']
            : idx === 2
              ? ['Executive narrative', 'Market framing', 'Strategic recommendation', 'Calendar CTA']
              : ['Hook', 'Value bridge', 'Social proof', 'CTA'],
      }))
    : [
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
      ];

  // Phone discovery questions from org call openers + context
  const discoveryQuestions = [
    ...(orgCallOpeners.length > 0
      ? orgCallOpeners.slice(0, 3)
      : [
          'How are you currently addressing this operational gap?',
          'What happens if this remains unresolved next quarter?',
          'Which stakeholders are involved in evaluating alternatives?',
        ]),
    ...(allProductMessages[0] ? [`How are you currently solving around "${allProductMessages[0]}" today?`] : []),
  ];

  // Differentiation focus from org
  const differentiationFocus = orgDifferentiators.length >= 3
    ? orgDifferentiators.slice(0, 4)
    : [
        'Unified channel orchestration across outbound motions',
        'Reasoning-first execution over static script-based outreach',
        'Governed approval flow with campaign-level consistency controls',
      ];

  // Content assets from org offerings
  const contentAssets = [
    ...(orgProducts.length > 0 ? [`Solution brief for ${orgProducts[0]}`] : []),
    'Thought-leadership article per primary theme',
    'Persona-specific one-pager per buying role',
    'Quarterly solution brief aligned to sales talk tracks',
    ...(orgProducts.length > 1 ? [`Product comparison guide: ${orgProducts.slice(0, 3).join(' vs ')}`] : []),
  ].slice(0, 5);

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
      productSignalsCount: allProductMessages.length,
      sourceOfTruth: 'organization-intelligence',
    },
    organizationIntelligenceSummary: {
      orgName: orgName || BRAND.company.parentBrand,
      orgDescription: orgDescription || null,
      orgIndustry: orgIndustry || null,
      icpIndustries: orgIcpIndustries,
      icpPersonas: orgPersonas.map((p) => p.title),
      competitors: orgCompetitors,
      coreProducts: orgProducts,
      differentiators: orgDifferentiators,
      hasOrgIntelligence: Boolean(profile),
    },
    brandPositioningAlignment: {
      brand: orgName || BRAND.company.parentBrand,
      product: BRAND.company.productName,
      promise: orgOneLiner || TAGLINE.corePromise,
      strategicIdentity: orgDescription || TAGLINE.identity,
      narrativeAnchor: TAGLINE.heroSubHeadline,
      pillarAlignment: PILLARS.map((pillar) => pillar.label),
    },
    messagingArchitecture: {
      coreNarrative,
      messageHouse: {
        heroMessage: primaryGoal,
        proofPoints,
        challengeFraming: keyChallenges,
      },
      personaAngles,
    },
    keyThemes: [
      `Problem-first demand for ${marketFocus}`,
      ...(allProductMessages.length > 0 ? [`Product-led value narrative: ${allProductMessages[0]}`] : []),
      'Reasoning-led outbound with compliance by design',
      'Pipeline quality over activity vanity metrics',
      'Cross-channel consistency from first touch to booked meeting',
    ].slice(0, 5),
    productPositioning: {
      summary:
        campaignContext?.productServiceInfo ||
        orgDescription ||
        `Position ${BRAND.company.productName} as the operational system for consistent demand generation outcomes.`,
      keyProductMessages: allProductMessages,
      differentiationFocus,
    },
    emailCampaignStructures: emailStructures,
    contentStrategy: {
      monthlyFocus: [
        'Month 1: Positioning + market challenge framing',
        'Month 2: Solution proof + implementation confidence',
        'Month 3: Decision enablement + conversion assets',
      ],
      assets: contentAssets,
      distribution: ['Email nurtures', 'Sales enablement handoff', 'Client-facing landing pages'],
    },
    phoneOutreachStrategy: {
      openingFramework: orgCallOpeners.length > 0
        ? orgCallOpeners[0]
        : 'Problem intelligence → role relevance → value hypothesis',
      discoveryQuestions,
      objectionPlaybookThemes: objectionThemes,
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
        narrative: `${coreNarrative} ${orgOneLiner || TAGLINE.corePromise}`,
        quarterlyTheme: `Quarterly focus: ${quarterWindow.label} — ${primaryGoal}`,
      },
      individualProfiles: orgPersonas.length > 0
        ? orgPersonas.slice(0, 3).map((persona) => ({
            role: persona.title,
            positioning: `${persona.title} perspective on market problems and transformation outcomes`,
            style: 'Consultative, evidence-backed, value-led',
          }))
        : [
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
      complianceContext: orgContext.settings.compliancePolicy ? 'Organization compliance policy applied' : 'Default compliance policy applied',
    },
    performanceLearnings: orgContext.learningSummary || null,
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

/**
 * GET /org-context
 * Returns org intelligence data for the campaign manager frontend to use as form defaults.
 * Organization intelligence is the primary source of truth for quarterly planning.
 */
router.get('/org-context', async (_req: Request, res: Response) => {
  try {
    const orgContext = await fetchOrgIntelligenceContext();
    const profile = orgContext.profile;

    res.json({
      success: true,
      hasOrgIntelligence: Boolean(profile),
      orgContext: {
        orgName: extractOrgIdentityName(profile),
        orgDescription: extractOrgDescription(profile),
        orgIndustry: extractOrgIndustry(profile),
        domain: profile?.domain || null,
        targetMarket: extractIcpIndustries(profile).length > 0
          ? `${extractIcpIndustries(profile).join(', ')} organizations`
          : null,
        valueProposition: extractPositioningOneLiner(profile),
        keyChallenges: extractOfferingProblemsSolved(profile),
        icpPersonas: extractIcpPersonas(profile).map((p) => p.title),
        coreProducts: extractOfferingProducts(profile),
        differentiators: extractOfferingDifferentiators(profile),
        competitors: extractPositioningCompetitors(profile),
        whyUs: extractPositioningWhyUs(profile),
        emailAngles: extractOutreachEmailAngles(profile),
        callOpeners: extractOutreachCallOpeners(profile),
        learningSummary: orgContext.learningSummary || null,
      },
    });
  } catch (error) {
    console.error('[CampaignManager] Failed to fetch org context:', error);
    res.status(500).json({ message: 'Failed to fetch organization intelligence context' });
  }
});

/**
 * POST /generate-context
 * AI-generates campaign context fields (objective, talking points, success criteria,
 * product/service info, target audience, objections) from Organization Intelligence.
 * Requires an organizationId so the AI can ground its output in real OI data.
 */
const generateContextSchema = z.object({
  organizationId: z.string().min(1),
  campaignType: z.string().optional().default('call'),
  campaignName: z.string().optional(),
  // Allow partial pre-existing values to refine generation
  existingObjective: z.string().optional(),
  existingTalkingPoints: z.array(z.string()).optional(),
});

router.post('/generate-context', async (req: Request, res: Response) => {
  try {
    const input = generateContextSchema.parse(req.body);

    // 1. Fetch the selected organization's intelligence
    const [org] = await db.select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.id, input.organizationId))
      .limit(1);

    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Extract OI sections
    const identity = (org.identity as any) || {};
    const offerings = (org.offerings as any) || {};
    const icp = (org.icp as any) || {};
    const positioning = (org.positioning as any) || {};
    const outreach = (org.outreach as any) || {};

    const orgName = identity?.legalName?.value || identity?.legalName || org.name;
    const orgDescription = identity?.description?.value || identity?.description || '';
    const orgIndustry = identity?.industry?.value || identity?.industry || org.industry || '';

    // Products / offerings
    const coreProducts = Array.isArray(offerings?.coreProducts?.value)
      ? offerings.coreProducts.value
      : Array.isArray(offerings?.coreProducts)
        ? offerings.coreProducts
        : [];
    const problemsSolved = Array.isArray(offerings?.problemsSolved?.value)
      ? offerings.problemsSolved.value
      : Array.isArray(offerings?.problemsSolved)
        ? offerings.problemsSolved
        : [];
    const differentiators = Array.isArray(offerings?.differentiators?.value)
      ? offerings.differentiators.value
      : Array.isArray(offerings?.differentiators)
        ? offerings.differentiators
        : [];

    // ICP
    const icpIndustries = Array.isArray(icp?.industries?.value)
      ? icp.industries.value
      : Array.isArray(icp?.industries)
        ? icp.industries
        : [];
    const personas = Array.isArray(icp?.personas?.value)
      ? icp.personas.value
      : Array.isArray(icp?.personas)
        ? icp.personas
        : [];
    const objections = Array.isArray(icp?.objections?.value)
      ? icp.objections.value
      : Array.isArray(icp?.objections)
        ? icp.objections
        : [];

    // Positioning
    const oneLiner = positioning?.oneLiner?.value || positioning?.oneLiner || '';
    const whyUs = Array.isArray(positioning?.whyUs?.value)
      ? positioning.whyUs.value
      : Array.isArray(positioning?.whyUs)
        ? positioning.whyUs
        : [];
    const competitors = Array.isArray(positioning?.competitors?.value)
      ? positioning.competitors.value
      : Array.isArray(positioning?.competitors)
        ? positioning.competitors
        : [];

    // Outreach
    const callOpeners = Array.isArray(outreach?.callOpeners?.value)
      ? outreach.callOpeners.value
      : Array.isArray(outreach?.callOpeners)
        ? outreach.callOpeners
        : [];
    const emailAngles = Array.isArray(outreach?.emailAngles?.value)
      ? outreach.emailAngles.value
      : Array.isArray(outreach?.emailAngles)
        ? outreach.emailAngles
        : [];

    // Build OI context block for the AI
    const oiContext = [
      `Organization: ${orgName}`,
      orgDescription && `Description: ${orgDescription}`,
      orgIndustry && `Industry: ${orgIndustry}`,
      oneLiner && `Value Proposition: ${oneLiner}`,
      coreProducts.length > 0 && `Core Products/Services: ${coreProducts.join(', ')}`,
      problemsSolved.length > 0 && `Problems Solved: ${problemsSolved.join(', ')}`,
      differentiators.length > 0 && `Differentiators: ${differentiators.join(', ')}`,
      icpIndustries.length > 0 && `Target Industries: ${icpIndustries.join(', ')}`,
      personas.length > 0 && `Target Personas: ${personas.map((p: any) => typeof p === 'string' ? p : p.title || p.role || JSON.stringify(p)).join(', ')}`,
      whyUs.length > 0 && `Why Choose Us: ${whyUs.join('; ')}`,
      competitors.length > 0 && `Competitors: ${competitors.join(', ')}`,
      callOpeners.length > 0 && `Call Openers: ${callOpeners.join(' | ')}`,
      emailAngles.length > 0 && `Email Angles: ${emailAngles.join(' | ')}`,
      objections.length > 0 && `Common Objections: ${objections.map((o: any) => typeof o === 'string' ? o : o.objection || JSON.stringify(o)).join('; ')}`,
    ].filter(Boolean).join('\n');

    // Campaign type label
    const typeLabels: Record<string, string> = {
      appointment_generation: 'Appointment Generation / Meeting Booking',
      high_quality_leads: 'High Quality Lead Generation',
      live_webinar: 'Webinar Registration',
      content_syndication: 'Content Syndication Follow-up',
      executive_dinner: 'Executive Dinner/Event RSVP',
      call: 'Outbound Calling',
    };
    const typeLabel = typeLabels[input.campaignType] || input.campaignType;

    const prompt = `You are a B2B demand generation strategist. Based on the Organization Intelligence below, generate campaign context fields for a "${typeLabel}" campaign${input.campaignName ? ` named "${input.campaignName}"` : ''}.

=== ORGANIZATION INTELLIGENCE ===
${oiContext}

=== INSTRUCTIONS ===
Generate a complete, ready-to-use campaign context. Every field must be grounded in the Organization Intelligence above — use real product names, real value props, real target personas. Do NOT use generic placeholders.

${input.existingObjective ? `The user has already written this objective (refine it): "${input.existingObjective}"` : ''}
${input.existingTalkingPoints?.length ? `The user has these talking points (expand on them): ${input.existingTalkingPoints.join('; ')}` : ''}

Return ONLY a valid JSON object with these fields:
{
  "campaignObjective": "A clear, specific 1-2 sentence campaign objective grounded in the org's offerings and target audience",
  "talkingPoints": ["5-7 specific talking points using real product names, metrics, and differentiators"],
  "successCriteria": "One clear success criteria statement for what counts as a successful call",
  "productServiceInfo": "2-3 sentence summary of the product/service being promoted, with specific features and benefits",
  "targetAudienceDescription": "Specific description of the target audience including titles, industries, company size, and pain points",
  "campaignObjections": [
    {"objection": "Common objection text", "response": "Recommended response using org intelligence"}
  ]
}

Be specific, actionable, and grounded in the organization's real data. No generic filler.`;

    const result = await generateJSON<{
      campaignObjective: string;
      talkingPoints: string[];
      successCriteria: string;
      productServiceInfo: string;
      targetAudienceDescription: string;
      campaignObjections: Array<{ objection: string; response: string }>;
    }>(prompt, { temperature: 0.4, maxTokens: 2000 });

    res.json({
      success: true,
      generated: result,
      organizationName: orgName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    console.error('[CampaignManager] Generate context failed:', error);
    res.status(500).json({ message: 'Failed to generate campaign context' });
  }
});

router.post('/plans/generate', async (req: Request, res: Response) => {
  try {
    const input = generateQuarterlyPlanSchema.parse(req.body);

    // Fetch org intelligence as the primary source of truth
    const orgContext = await fetchOrgIntelligenceContext();

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

    const plan = buildPlan(input, orgContext, campaignContext);

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
