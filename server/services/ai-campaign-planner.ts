/**
 * AI Campaign Planner Service
 *
 * Generates full-funnel, multi-channel campaign plans purely from Organization Intelligence.
 * Uses Vertex AI reason() for deep strategic thinking.
 */

import { reason, generateJSON } from "./vertex-ai/vertex-client";
import { db } from "../db";
import { accountIntelligence, campaignOrganizations, clientOrganizationLinks } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import {
  getOrganizationLearningSummary,
  type OrganizationProfile,
} from "../lib/org-intelligence-helper";

// ─── OI Extract Utilities (reused from campaign-manager pattern) ───

function resolveFieldValue(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field.trim();
  if (Array.isArray(field)) {
    return field
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof field === "object" && field.value) return String(field.value).trim();
  return "";
}

function isEmptyObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  return Object.keys(value as Record<string, unknown>).length === 0;
}

function buildPromptWithOI(existingPrompt: string, oiContext: string): string {
  if (!oiContext.trim()) return existingPrompt;
  return `## Organization Intelligence (Mandatory Context)
All outputs must be aligned with this organizational context. Do not produce generic content.
${oiContext}

---

${existingPrompt}`;
}

function buildOIContextFromProfile(
  profile: OrganizationProfile | null,
  compiledOrgContext: string | null
): string {
  const parts: string[] = [];

  if (compiledOrgContext?.trim()) {
    parts.push(compiledOrgContext.trim());
  }

  if (!profile) return parts.join("\n").trim();

  const identity = (profile.identity || {}) as any;
  const offerings = (profile.offerings || {}) as any;
  const icp = (profile.icp || {}) as any;
  const positioning = (profile.positioning || {}) as any;
  const outreach = (profile.outreach || {}) as any;

  if (profile.domain) parts.push(`Domain: ${profile.domain}`);

  const desc = resolveFieldValue(identity.description);
  if (desc) parts.push(`Description: ${desc}`);
  const legalName = resolveFieldValue(identity.legalName);
  if (legalName) parts.push(`Organization: ${legalName}`);
  const regions = resolveFieldValue(identity.regions);
  if (regions) parts.push(`Regions: ${regions}`);

  const coreProducts = resolveFieldValue(offerings.coreProducts);
  if (coreProducts) parts.push(`Core Products/Services: ${coreProducts}`);
  const useCases = resolveFieldValue(offerings.useCases);
  if (useCases) parts.push(`Key Use Cases: ${useCases}`);
  const problemsSolved = resolveFieldValue(offerings.problemsSolved);
  if (problemsSolved) parts.push(`Problems Solved: ${problemsSolved}`);
  const differentiators = resolveFieldValue(offerings.differentiators);
  if (differentiators) parts.push(`Differentiators: ${differentiators}`);

  const personas = resolveFieldValue(icp.personas);
  if (personas) parts.push(`Target Personas: ${personas}`);
  const industries = resolveFieldValue(icp.industries);
  if (industries) parts.push(`Target Industries: ${industries}`);
  const objections = resolveFieldValue(icp.objections);
  if (objections) parts.push(`Common Objections: ${objections}`);

  const oneLiner = resolveFieldValue(positioning.oneLiner);
  if (oneLiner) parts.push(`Positioning: ${oneLiner}`);
  const valueProposition = resolveFieldValue(positioning.valueProposition);
  if (valueProposition) parts.push(`Value Proposition: ${valueProposition}`);
  const competitors = resolveFieldValue(positioning.competitors);
  if (competitors) parts.push(`Competitive Landscape: ${competitors}`);

  const emailAngles = resolveFieldValue(outreach.emailAngles);
  if (emailAngles) parts.push(`Email Messaging Angles: ${emailAngles}`);
  const callOpeners = resolveFieldValue(outreach.callOpeners);
  if (callOpeners) parts.push(`Call Openers: ${callOpeners}`);

  return parts.join("\n").trim();
}

async function getClientScopedOrganizationProfile(clientAccountId: string): Promise<{
  profile: OrganizationProfile | null;
  organizationId: string | null;
  compiledOrgContext: string | null;
}> {
  const [orgLink] = await db
    .select({
      organizationId: clientOrganizationLinks.campaignOrganizationId,
    })
    .from(clientOrganizationLinks)
    .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
    .orderBy(
      desc(clientOrganizationLinks.isPrimary),
      desc(clientOrganizationLinks.updatedAt),
      desc(clientOrganizationLinks.createdAt)
    )
    .limit(1);

  if (!orgLink) {
    return {
      profile: null,
      organizationId: null,
      compiledOrgContext: null,
    };
  }

  const [organization] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, orgLink.organizationId))
    .limit(1);

  if (!organization) {
    return {
      profile: null,
      organizationId: orgLink.organizationId,
      compiledOrgContext: null,
    };
  }

  let identity = organization.identity;
  let offerings = organization.offerings;
  let icp = organization.icp;
  let positioning = organization.positioning;
  let outreach = organization.outreach;

  if (organization.domain && isEmptyObject(identity) && isEmptyObject(offerings)) {
    const [aiProfile] = await db
      .select()
      .from(accountIntelligence)
      .where(eq(accountIntelligence.domain, organization.domain))
      .orderBy(desc(accountIntelligence.createdAt))
      .limit(1);

    if (aiProfile) {
      identity = aiProfile.identity || identity;
      offerings = aiProfile.offerings || offerings;
      icp = aiProfile.icp || icp;
      positioning = aiProfile.positioning || positioning;
      outreach = aiProfile.outreach || outreach;
    }
  }

  return {
    profile: {
      domain: organization.domain || "",
      identity: identity || {},
      offerings: offerings || {},
      icp: icp || {},
      positioning: positioning || {},
      outreach: outreach || {},
    },
    organizationId: organization.id,
    compiledOrgContext: organization.compiledOrgContext || null,
  };
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

function extractPositioningOneLiner(profile: OrganizationProfile | null): string | null {
  if (!profile?.positioning) return null;
  const pos = profile.positioning as any;
  return pos?.oneLiner?.value || pos?.oneLiner || pos?.valueProposition?.value || pos?.valueProposition || null;
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

// ─── Type Definitions ───

export interface FunnelStageStrategy {
  stage: 'awareness' | 'engaged' | 'qualifying' | 'qualified_sql' | 'appointment' | 'closed_won';
  stageLabel: string;
  objective: string;
  primaryChannels: ('voice' | 'email' | 'messaging')[];
  secondaryChannels: ('voice' | 'email' | 'messaging')[];
  tactics: string[];
  messagingTheme: string;
  kpis: { metric: string; target: string }[];
  estimatedConversionRate: string;
  estimatedVolumeAtStage: string;
  durationDays: number;
  automationTriggers: string[];
}

export interface ChannelStrategy {
  channel: 'voice' | 'email' | 'messaging';
  overallRole: string;
  funnelStageUsage: {
    stage: string;
    approach: string;
    sequenceOutline: string[];
    messageTemplateGuidance: string;
  }[];
  cadence: string;
  personalization: string;
  complianceNotes: string;
}

export interface PersonaStrategy {
  personaTitle: string;
  painPoints: string[];
  messagingAngle: string;
  preferredChannel: 'voice' | 'email' | 'messaging';
  callScript: {
    opener: string;
    discoveryQuestions: string[];
    valueStatement: string;
    objectionHandlers: { objection: string; response: string }[];
    closeAttempt: string;
  };
  emailSequence: {
    subject: string;
    previewText: string;
    bodyTheme: string;
    cta: string;
  }[];
}

export interface CampaignPlanOutput {
  planName: string;
  executiveSummary: string;
  campaignStrategy: {
    positioning: string;
    coreNarrative: string;
    differentiators: string[];
    targetMarketSummary: string;
  };
  funnelStrategy: FunnelStageStrategy[];
  channelStrategies: ChannelStrategy[];
  personaStrategies: PersonaStrategy[];
  timeline: {
    totalDurationWeeks: number;
    phases: {
      phaseName: string;
      weekRange: string;
      activities: string[];
      milestone: string;
    }[];
  };
  kpiFramework: {
    primaryKpis: { metric: string; target: string; measurementMethod: string }[];
    secondaryKpis: { metric: string; target: string }[];
  };
  estimatedResults: {
    totalLeadVolume: string;
    qualifiedLeads: string;
    expectedAppointments: string;
    estimatedClosedWon: string;
    timeToFirstResults: string;
    confidenceLevel: 'high' | 'medium' | 'low';
    assumptions: string[];
  };
  budgetGuidance: {
    estimatedRange: string;
    allocationByChannel: { channel: string; percentAllocation: number; rationale: string }[];
  };
  learningIntegration: {
    appliedInsights: string[];
    risksIdentified: string[];
    mitigationStrategies: string[];
  };
}

export interface GeneratePlanInput {
  campaignGoal?: string;
  targetBudget?: string;
  preferredChannels?: string[];
  campaignDuration?: string;
  additionalContext?: string;
}

// ─── Main AI Plan Generation ───

export async function generateCampaignPlan(
  input: GeneratePlanInput,
  clientAccountId: string
): Promise<{
  plan: CampaignPlanOutput;
  thinking: string;
  oiSummary: string;
  model: string;
  durationMs: number;
}> {
  const startMs = Date.now();

  // 1. Gather client-scoped OI context
  const [{ profile, organizationId, compiledOrgContext }, learningSummary] = await Promise.all([
    getClientScopedOrganizationProfile(clientAccountId),
    getOrganizationLearningSummary(),
  ]);
  const oiContext = buildOIContextFromProfile(profile, compiledOrgContext);

  // 2. Build a human-readable OI summary for audit
  const orgName = extractOrgIdentityName(profile) || "Unknown Organization";
  const oiSummary = profile
    ? `Organization: ${orgName} | Org ID: ${organizationId || "N/A"} | Products: ${extractOfferingProducts(profile).join(", ") || "N/A"} | ICP: ${extractIcpPersonas(profile).map((p) => p.title).join(", ") || "N/A"} | Differentiators: ${extractOfferingDifferentiators(profile).join(", ") || "N/A"}`
    : `Organization intelligence not configured for client account ${clientAccountId}.`;

  // 3. Build the comprehensive campaign planning prompt
  const channelsStr = input.preferredChannels?.length
    ? input.preferredChannels.join(', ')
    : 'All available (voice, email, messaging)';

  const planningPrompt = `You are a world-class B2B demand generation strategist with deep expertise in multi-channel campaign orchestration. Using the Organization Intelligence provided above, create a comprehensive full-funnel campaign plan that will generate a flow of high-quality leads from top to bottom of the funnel.

=== CAMPAIGN PARAMETERS ===
Goal: ${input.campaignGoal || 'Generate qualified pipeline and high-quality leads from OI-derived ICP — appointments, SQLs, and closed-won deals'}
Budget: ${input.targetBudget || 'Flexible — optimize for ROI'}
Preferred Channels: ${channelsStr}
Duration: ${input.campaignDuration || 'Quarterly (12 weeks)'}
Additional Context: ${input.additionalContext || 'None'}

=== PAST PERFORMANCE LEARNINGS ===
${learningSummary || 'No historical campaign data available — use industry benchmarks for B2B demand generation.'}

=== FULL-FUNNEL STAGE DEFINITIONS ===
Your plan MUST cover all 6 funnel stages with appropriate multi-channel orchestration:

1. AWARENESS (Top-of-Funnel): Initial outreach to cold accounts matching ICP. Goal: generate interest and engagement.
   - Primary: email (awareness sequences, content-led outreach)
   - Secondary: messaging (LinkedIn, SMS touchpoints)

2. ENGAGED: Accounts showing interest (opened emails, clicked links, responded to outreach). Goal: deepen engagement and begin qualification.
   - Primary: email (value-add content, case studies) + messaging (personalized follow-ups)
   - Secondary: voice (warm intro calls to engaged contacts)

3. QUALIFYING: Active qualification conversations underway. Goal: determine fit, budget, authority, need, timeline.
   - Primary: voice (AI-powered qualification calls — discovery, BANT assessment)
   - Secondary: email (supporting materials, meeting confirmations)

4. QUALIFIED / SQL: Confirmed fit and interest, sales-qualified and ready for appointment setting. Goal: book meetings with decision-makers.
   - Primary: voice (appointment setting calls with decision-makers)
   - Secondary: email (calendar links, prep materials)

5. APPOINTMENT: Meeting scheduled or completed with key decision-maker. Goal: present solution, handle objections, move to proposal.
   - Primary: voice (follow-up calls, objection handling) + email (proposals, ROI decks)

6. CLOSED / WON: Deal signed and onboarding begins. Goal: smooth handoff and retention.
   - Primary: email (welcome sequence, onboarding)

=== CHANNEL CAPABILITIES ===
- VOICE: AI-powered voice agents (Gemini Live) for outbound calling. Strengths: real-time objection handling, qualification, appointment setting, building rapport, BANT assessment.
- EMAIL: Mercury email service with multi-step sequence engine. Strengths: scale, awareness nurture, content delivery, follow-up automation, meeting reminders.
- MESSAGING: Account-level messaging briefs, SMS, and LinkedIn messaging. Strengths: quick touchpoints, reminders, event invitations, micro-engagements.

=== INSTRUCTIONS ===
1. Ground ALL messaging in the Organization Intelligence — use real product names, real personas, real pain points, real value propositions. NO generic placeholders.
2. Each funnel stage must have specific channel assignments, tactics, messaging themes, and KPIs.
3. Persona strategies must include detailed voice call scripts (opener, discovery questions, value statement, objection handlers, close attempt) and email sequences (subject, preview, theme, CTA) tailored to their specific pain points.
4. If learning data is available, explicitly reference how past performance informs this plan.
5. The timeline must be realistic with clear phases and milestones.
6. Estimated results must be based on industry benchmarks adjusted for the org's specifics.
7. Channel strategies must include per-stage usage, cadence recommendations, and personalization guidance.

Return ONLY a valid JSON object matching this exact schema (no markdown, no code fences, just raw JSON):

{
  "planName": "string — descriptive campaign plan name",
  "executiveSummary": "string — 2-3 paragraph executive summary",
  "campaignStrategy": {
    "positioning": "string",
    "coreNarrative": "string",
    "differentiators": ["string"],
    "targetMarketSummary": "string"
  },
  "funnelStrategy": [
    {
      "stage": "awareness|engaged|qualifying|qualified_sql|appointment|closed_won",
      "stageLabel": "string — human-readable label",
      "objective": "string",
      "primaryChannels": ["voice"|"email"|"messaging"],
      "secondaryChannels": ["voice"|"email"|"messaging"],
      "tactics": ["string"],
      "messagingTheme": "string",
      "kpis": [{"metric": "string", "target": "string"}],
      "estimatedConversionRate": "string — e.g. 15-25%",
      "estimatedVolumeAtStage": "string — e.g. 200-350 accounts",
      "durationDays": 14,
      "automationTriggers": ["string — what moves a lead to the next stage"]
    }
  ],
  "channelStrategies": [
    {
      "channel": "voice|email|messaging",
      "overallRole": "string",
      "funnelStageUsage": [
        {
          "stage": "string",
          "approach": "string",
          "sequenceOutline": ["string"],
          "messageTemplateGuidance": "string"
        }
      ],
      "cadence": "string",
      "personalization": "string",
      "complianceNotes": "string"
    }
  ],
  "personaStrategies": [
    {
      "personaTitle": "string",
      "painPoints": ["string"],
      "messagingAngle": "string",
      "preferredChannel": "voice|email|messaging",
      "callScript": {
        "opener": "string",
        "discoveryQuestions": ["string"],
        "valueStatement": "string",
        "objectionHandlers": [{"objection": "string", "response": "string"}],
        "closeAttempt": "string"
      },
      "emailSequence": [
        {
          "subject": "string",
          "previewText": "string",
          "bodyTheme": "string",
          "cta": "string"
        }
      ]
    }
  ],
  "timeline": {
    "totalDurationWeeks": 12,
    "phases": [
      {
        "phaseName": "string",
        "weekRange": "string — e.g. Week 1-3",
        "activities": ["string"],
        "milestone": "string"
      }
    ]
  },
  "kpiFramework": {
    "primaryKpis": [{"metric": "string", "target": "string", "measurementMethod": "string"}],
    "secondaryKpis": [{"metric": "string", "target": "string"}]
  },
  "estimatedResults": {
    "totalLeadVolume": "string",
    "qualifiedLeads": "string",
    "expectedAppointments": "string",
    "estimatedClosedWon": "string",
    "timeToFirstResults": "string",
    "confidenceLevel": "high|medium|low",
    "assumptions": ["string"]
  },
  "budgetGuidance": {
    "estimatedRange": "string",
    "allocationByChannel": [{"channel": "string", "percentAllocation": 50, "rationale": "string"}]
  },
  "learningIntegration": {
    "appliedInsights": ["string"],
    "risksIdentified": ["string"],
    "mitigationStrategies": ["string"]
  }
}`;

  // 4. Inject client-scoped OI and call reason() for deep thinking, with fallback to generateJSON on rate limit
  const enrichedPrompt = buildPromptWithOI(planningPrompt, oiContext);

  let thinking = '';
  let answer = '';
  let modelUsed = 'gemini-3-pro-preview';

  try {
    const result = await reason(enrichedPrompt, {
      temperature: 0.4,
      maxTokens: 16384,
    });
    thinking = result.thinking;
    answer = result.answer;
  } catch (reasonError: any) {
    // Fallback to generateJSON (gemini-flash) on rate limit / 429
    const code = Number(reasonError?.code ?? reasonError?.status ?? reasonError?.statusCode ?? 0);
    const msg = String(reasonError?.message || '').toLowerCase();
    const isRateLimit = code === 429 || msg.includes('rate') || msg.includes('resource_exhausted') || msg.includes('quota');

    if (isRateLimit) {
      console.warn('[CampaignPlanner] reason() rate-limited, falling back to generateJSON (gemini-flash)');
      const fallbackPlan = await generateJSON<CampaignPlanOutput>(enrichedPrompt, {
        temperature: 0.4,
        maxTokens: 16384,
      });
      modelUsed = 'gemini-2.0-flash-001 (fallback)';
      const durationMs = Date.now() - startMs;
      return { plan: fallbackPlan, thinking: '[fallback: rate-limited, used gemini-flash]', oiSummary, model: modelUsed, durationMs };
    }
    throw reasonError;
  }

  // 5. Parse the JSON from the AI response
  let plan: CampaignPlanOutput;
  try {
    // Strip markdown code fences if present
    let cleaned = answer.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    plan = JSON.parse(cleaned);
  } catch (parseError) {
    // Try to extract JSON from within the response
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      plan = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse AI campaign plan response: ${(parseError as Error).message}`);
    }
  }

  const durationMs = Date.now() - startMs;

  return {
    plan,
    thinking,
    oiSummary,
    model: modelUsed,
    durationMs,
  };
}

// ─── OI Summary for Client Display ───

export async function getOISummaryForClient(clientAccountId: string): Promise<{
  hasOI: boolean;
  orgName: string | null;
  orgDescription: string | null;
  orgIndustry: string | null;
  valueProposition: string | null;
  coreProducts: string[];
  icpPersonas: Array<{ title: string; painPoints?: string[] }>;
  icpIndustries: string[];
  differentiators: string[];
  emailAngles: string[];
  callOpeners: string[];
  learningSummary: string | null;
}> {
  const [{ profile }, learningSummary] = await Promise.all([
    getClientScopedOrganizationProfile(clientAccountId),
    getOrganizationLearningSummary(),
  ]);

  if (!profile) {
    return {
      hasOI: false,
      orgName: null,
      orgDescription: null,
      orgIndustry: null,
      valueProposition: null,
      coreProducts: [],
      icpPersonas: [],
      icpIndustries: [],
      differentiators: [],
      emailAngles: [],
      callOpeners: [],
      learningSummary: null,
    };
  }

  return {
    hasOI: true,
    orgName: extractOrgIdentityName(profile),
    orgDescription: extractOrgDescription(profile),
    orgIndustry: extractOrgIndustry(profile),
    valueProposition: extractPositioningOneLiner(profile),
    coreProducts: extractOfferingProducts(profile),
    icpPersonas: extractIcpPersonas(profile),
    icpIndustries: extractIcpIndustries(profile),
    differentiators: extractOfferingDifferentiators(profile),
    emailAngles: extractOutreachEmailAngles(profile),
    callOpeners: extractOutreachCallOpeners(profile),
    learningSummary: learningSummary || null,
  };
}
