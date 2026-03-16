/**
 * AI Unified Pipeline Planner
 *
 * Generates full pipeline strategies from Organization Intelligence,
 * auto-creates draft campaigns, and enrolls target accounts.
 * Follows the ai-campaign-planner.ts pattern using Vertex AI reason().
 */

import { reason } from "./vertex-ai/vertex-client";
import { db } from "../db";
import {
  accountIntelligence,
  accounts,
  campaigns,
  campaignOrganizations,
  clientOrganizationLinks,
  unifiedPipelines,
  unifiedPipelineAccounts,
} from "@shared/schema";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  getOrganizationLearningSummary,
  type OrganizationProfile,
} from "../lib/org-intelligence-helper";
import type {
  PipelineStrategy,
  PipelineTargetCriteria,
} from "@shared/unified-pipeline-types";
import {
  createUnifiedPipeline,
  addCampaignToPipeline,
  enrollAccountsInPipeline,
} from "./unified-pipeline-engine";

// ─── OI Helpers (from ai-campaign-planner pattern) ───────────────────────────

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

function buildOIContextFromProfile(
  profile: OrganizationProfile | null,
  compiledOrgContext: string | null
): string {
  const parts: string[] = [];
  if (compiledOrgContext?.trim()) parts.push(compiledOrgContext.trim());
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
  const coreProducts = resolveFieldValue(offerings.coreProducts);
  if (coreProducts) parts.push(`Core Products/Services: ${coreProducts}`);
  const useCases = resolveFieldValue(offerings.useCases);
  if (useCases) parts.push(`Key Use Cases: ${useCases}`);
  const differentiators = resolveFieldValue(offerings.differentiators);
  if (differentiators) parts.push(`Differentiators: ${differentiators}`);
  const personas = resolveFieldValue(icp.personas);
  if (personas) parts.push(`Target Personas: ${personas}`);
  const industries = resolveFieldValue(icp.industries);
  if (industries) parts.push(`Target Industries: ${industries}`);
  const oneLiner = resolveFieldValue(positioning.oneLiner);
  if (oneLiner) parts.push(`Positioning: ${oneLiner}`);
  const emailAngles = resolveFieldValue(outreach.emailAngles);
  if (emailAngles) parts.push(`Email Angles: ${emailAngles}`);
  const callOpeners = resolveFieldValue(outreach.callOpeners);
  if (callOpeners) parts.push(`Call Openers: ${callOpeners}`);

  return parts.join("\n").trim();
}

async function getOrganizationProfile(organizationId: string): Promise<{
  profile: OrganizationProfile | null;
  compiledOrgContext: string | null;
}> {
  const [organization] = await db
    .select()
    .from(campaignOrganizations)
    .where(eq(campaignOrganizations.id, organizationId))
    .limit(1);

  if (!organization) return { profile: null, compiledOrgContext: null };

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
    compiledOrgContext: organization.compiledOrgContext || null,
  };
}

// ─── Pipeline Strategy Generation ────────────────────────────────────────────

export interface GeneratePipelineStrategyInput {
  objective?: string;
  targetBudget?: string;
  preferredChannels?: string[];
  estimatedDuration?: string;
  additionalContext?: string;
}

export async function generatePipelineStrategy(
  organizationId: string,
  input: GeneratePipelineStrategyInput
): Promise<{
  strategy: PipelineStrategy;
  thinking: string;
  oiSummary: string;
  model: string;
  durationMs: number;
}> {
  const startMs = Date.now();

  // 1. Gather OI context
  const [{ profile, compiledOrgContext }, learningSummary] = await Promise.all([
    getOrganizationProfile(organizationId),
    getOrganizationLearningSummary(),
  ]);
  const oiContext = buildOIContextFromProfile(profile, compiledOrgContext);

  const oiSummary = profile
    ? `Organization: ${resolveFieldValue((profile.identity as any)?.legalName)} | Domain: ${profile.domain}`
    : `Organization intelligence not configured for org ${organizationId}.`;

  // 2. Build the strategy generation prompt
  const channelsStr = input.preferredChannels?.length
    ? input.preferredChannels.join(', ')
    : 'All available (voice, email, content)';

  const prompt = `## Organization Intelligence (Mandatory Context)
All outputs must be aligned with this organizational context. Do not produce generic content.
${oiContext}

---

You are an expert B2B demand generation strategist. Using the Organization Intelligence above, design a unified account-based pipeline strategy.

This pipeline will be the single strategic umbrella that coordinates multiple campaigns (voice, email, content) toward one unified goal. Accounts (companies) — not individual contacts — are the primary tracking entity.

=== PIPELINE PARAMETERS ===
Objective: ${input.objective || 'Generate qualified pipeline — move target accounts from identification through to booked appointments and closed deals'}
Budget: ${input.targetBudget || 'Flexible — optimize for ROI'}
Preferred Channels: ${channelsStr}
Duration: ${input.estimatedDuration || '12 weeks'}
Additional Context: ${input.additionalContext || 'None'}

=== PAST PERFORMANCE LEARNINGS ===
${learningSummary || 'No historical data — use industry benchmarks.'}

=== FUNNEL STAGES ===
The pipeline uses these account-level funnel stages:
1. TARGET — Identified accounts matching ICP, not yet contacted
2. OUTREACH — Active multi-channel outreach in progress
3. ENGAGED — Account has responded positively (call answered, email replied, content downloaded)
4. QUALIFYING — In active qualification conversations (BANT assessment)
5. QUALIFIED — Confirmed fit, ready for appointment setting
6. APPOINTMENT_SET — Meeting/demo booked with decision-maker
7. CLOSED_WON — Deal signed
8. CLOSED_LOST — Disqualified or lost

=== INSTRUCTIONS ===
1. Ground ALL strategy in the Organization Intelligence — use real products, personas, pain points.
2. Define target account criteria (industries, company size, roles to target).
3. Specify which channels (voice, email, content) to deploy at each funnel stage.
4. Define stage advancement criteria — what signals move an account from one stage to the next.
5. Recommend campaign types to create: voice campaigns for calling, email campaigns for nurture.
6. Estimate volume: how many accounts at each stage, expected conversion rates.

Return ONLY valid JSON matching this schema:

{
  "objective": "string — the pipeline's strategic objective",
  "channelStrategy": {
    "voice": { "enabled": true/false, "description": "string", "targetVolume": number, "cadence": "string" },
    "email": { "enabled": true/false, "description": "string", "targetVolume": number, "cadence": "string" },
    "content": { "enabled": true/false, "description": "string", "targetVolume": number, "cadence": "string" },
    "summary": "string — overall channel mix strategy"
  },
  "funnelStrategy": {
    "stages": [
      {
        "stageId": "target|outreach|engaged|qualifying|qualified|appointment_set|closed_won",
        "advancementCriteria": "string — what signals advance an account to this stage",
        "expectedDuration": "string — e.g. '3-5 days'",
        "primaryChannel": "string — dominant channel for this stage"
      }
    ],
    "qualificationCriteria": "string — what qualifies an account as SQL",
    "appointmentBookingProcess": "string — how appointments are booked"
  },
  "targetCriteria": {
    "industries": ["string"],
    "companySize": { "min": number, "max": number },
    "regions": ["string"],
    "personas": ["string — job titles to target"],
    "keywords": ["string — intent/technology keywords"]
  },
  "estimatedTimeline": "string — e.g. '12 weeks'",
  "estimatedAccountVolume": number,
  "keyMessages": ["string — core messages for outreach"],
  "oiSnapshotSummary": "string — brief summary of OI used"
}`;

  // 3. Call reason() for deep strategic thinking
  const result = await reason(prompt, { temperature: 0.7 });

  // 4. Parse the strategy JSON
  let strategy: PipelineStrategy;
  try {
    const jsonMatch = result.answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");
    strategy = JSON.parse(jsonMatch[0]);
  } catch (parseError: any) {
    console.error("[PipelinePlanner] Failed to parse strategy:", parseError.message);
    throw new Error(`Failed to parse AI-generated pipeline strategy: ${parseError.message}`);
  }

  const durationMs = Date.now() - startMs;

  return {
    strategy,
    thinking: result.thinking,
    oiSummary,
    model: 'gemini-3-pro-preview',
    durationMs,
  };
}

// ─── Auto-Create Draft Campaigns from Strategy ──────────────────────────────

export async function autoCreateCampaignsFromStrategy(
  pipelineId: string,
  strategy: PipelineStrategy,
  clientAccountId: string,
  createdBy?: string
): Promise<{ campaignIds: string[] }> {
  const campaignIds: string[] = [];

  const channelStrategy = strategy.channelStrategy || {};

  // Create voice campaign if voice channel is enabled
  if ((channelStrategy as any).voice?.enabled) {
    const [voiceCampaign] = await db
      .insert(campaigns)
      .values({
        type: 'outbound' as any,
        name: `${strategy.objective || 'Pipeline'} — Voice Outreach`,
        status: 'draft' as any,
        clientAccountId,
        unifiedPipelineId: pipelineId,
        dialMode: 'ai_agent' as any,
        campaignObjective: strategy.objective || 'Account-based outreach via voice',
        targetAudienceDescription: strategy.targetCriteria?.personas?.join(', ') || '',
        enabledChannels: ['voice'],
        creationMode: 'agentic',
      })
      .returning({ id: campaigns.id });

    if (voiceCampaign) campaignIds.push(voiceCampaign.id);
  }

  // Create email campaign if email channel is enabled
  if ((channelStrategy as any).email?.enabled) {
    const [emailCampaign] = await db
      .insert(campaigns)
      .values({
        type: 'email' as any,
        name: `${strategy.objective || 'Pipeline'} — Email Nurture`,
        status: 'draft' as any,
        clientAccountId,
        unifiedPipelineId: pipelineId,
        dialMode: 'manual' as any,
        campaignObjective: strategy.objective || 'Account-based email nurture',
        targetAudienceDescription: strategy.targetCriteria?.personas?.join(', ') || '',
        enabledChannels: ['email'],
        creationMode: 'agentic',
      })
      .returning({ id: campaigns.id });

    if (emailCampaign) campaignIds.push(emailCampaign.id);
  }

  // Update pipeline campaign count
  if (campaignIds.length > 0) {
    await db
      .update(unifiedPipelines)
      .set({
        totalCampaigns: campaignIds.length,
        updatedAt: new Date(),
      })
      .where(eq(unifiedPipelines.id, pipelineId));
  }

  console.log(`[PipelinePlanner] Auto-created ${campaignIds.length} draft campaigns for pipeline ${pipelineId}`);
  return { campaignIds };
}

// ─── Auto-Enroll Target Accounts ─────────────────────────────────────────────

export async function autoEnrollTargetAccounts(
  pipelineId: string,
  criteria: PipelineTargetCriteria,
  limit: number = 500
): Promise<{ enrolled: number; matched: number }> {
  // Build query conditions based on ICP criteria
  const conditions: any[] = [];

  if (criteria.industries?.length) {
    conditions.push(
      inArray(accounts.industryStandardized, criteria.industries)
    );
  }

  if (criteria.companySize?.min) {
    conditions.push(
      sql`${accounts.staffCount} >= ${criteria.companySize.min}`
    );
  }
  if (criteria.companySize?.max) {
    conditions.push(
      sql`${accounts.staffCount} <= ${criteria.companySize.max}`
    );
  }

  if (criteria.regions?.length) {
    // Match against HQ state/city
    const regionConditions = criteria.regions.map((r) =>
      sql`(${accounts.hqState} ILIKE ${'%' + r + '%'} OR ${accounts.hqCity} ILIKE ${'%' + r + '%'})`
    );
    if (regionConditions.length > 0) {
      conditions.push(sql`(${sql.join(regionConditions, sql` OR `)})`);
    }
  }

  // Query matching accounts
  const matchedAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit);

  const accountIds = matchedAccounts.map((a) => a.id);
  const matched = accountIds.length;

  if (accountIds.length === 0) {
    return { enrolled: 0, matched: 0 };
  }

  // Enroll into pipeline
  const result = await enrollAccountsInPipeline(pipelineId, accountIds, 'ai');

  console.log(`[PipelinePlanner] Auto-enrolled ${result.enrolled} accounts (${matched} matched) into pipeline ${pipelineId}`);
  return { enrolled: result.enrolled, matched };
}

// ─── Convert Campaign Plan to Unified Pipeline ──────────────────────────────

export async function convertPlanToPipeline(
  planId: string,
  organizationId: string,
  clientAccountId: string,
  createdBy?: string
): Promise<{
  pipelineId: string;
  campaignIds: string[];
  accountsEnrolled: number;
}> {
  // 1. Generate pipeline strategy from OI
  const { strategy } = await generatePipelineStrategy(organizationId, {
    objective: `Full-funnel pipeline from approved campaign plan ${planId}`,
  });

  // 2. Create the unified pipeline
  const { id: pipelineId } = await createUnifiedPipeline({
    organizationId,
    clientAccountId,
    name: strategy.objective || `Pipeline from Plan ${planId}`,
    objective: strategy.objective,
    strategy,
    campaignPlanId: planId,
    createdBy,
  });

  // 3. Auto-create draft campaigns
  const { campaignIds } = await autoCreateCampaignsFromStrategy(
    pipelineId,
    strategy,
    clientAccountId,
    createdBy
  );

  // 4. Auto-enroll target accounts if criteria available
  let accountsEnrolled = 0;
  if (strategy.targetCriteria) {
    const enrollResult = await autoEnrollTargetAccounts(pipelineId, strategy.targetCriteria);
    accountsEnrolled = enrollResult.enrolled;
  }

  // 5. Update pipeline status to active
  await db
    .update(unifiedPipelines)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(unifiedPipelines.id, pipelineId));

  console.log(`[PipelinePlanner] Converted plan ${planId} → pipeline ${pipelineId} (${campaignIds.length} campaigns, ${accountsEnrolled} accounts)`);

  return { pipelineId, campaignIds, accountsEnrolled };
}
