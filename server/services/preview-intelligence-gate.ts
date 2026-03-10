/**
 * Unified Preview Intelligence Gate
 *
 * Checks intelligence readiness before previews/tests. Components are split into:
 *
 * REQUIRED (auto-generatable — gate blocks if missing):
 * 1. Account Intelligence (problem hypothesis, recommended angle, tone)
 *
 * OPTIONAL (pre-configured — enhance quality but don't block):
 * 2. Problem Intelligence (detected problems, messaging package, outreach strategy)
 * 3. Organization Intelligence (org profile with offerings, ICP, positioning)
 * 4. Solution Mapping (problem-to-solution mapping for the campaign)
 *
 * This matches production campaign calls which don't check the gate at all.
 * Required components are auto-generated if missing. Optional components are
 * reported in status but never block previews or test calls.
 */

import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  accountIntelligenceRecords,
  campaigns,
  campaignOrganizations,
  campaignAccountProblems,
  organizationServiceCatalog,
  problemDefinitions,
} from '@shared/schema';
import {
  getOrBuildAccountIntelligence,
  type AccountIntelligencePayload,
} from './account-messaging-service';
import {
  generateAccountProblemIntelligence,
} from './problem-intelligence/problem-generation-engine';
import {
  runOrganizationResearch,
  type StructuredIntelligence,
} from './organization-research-service';

// ==================== TYPES ====================

export interface IntelligenceStatus {
  ready: boolean;              // True when core (auto-generatable) intelligence is available
  fullyEnriched: boolean;      // True when ALL components including optional are available
  accountIntelligence: {
    available: boolean;
    confidence: number | null;
    problemHypothesis: string | null;
    recommendedAngle: string | null;
    lastUpdated: Date | null;
  };
  organizationIntelligence: {
    available: boolean;
    hasOfferings: boolean;
    hasIcp: boolean;
    hasPositioning: boolean;
    orgName: string | null;
  };
  solutionMapping: {
    available: boolean;
    hasProductInfo: boolean;
    hasProblemDefinitions: boolean;
    hasServiceCatalog: boolean;
  };
  problemIntelligence: {
    available: boolean;
    confidence: number | null;
    detectedProblemsCount: number;
    hasMesagingPackage: boolean;
    hasOutreachStrategy: boolean;
    lastUpdated: Date | null;
  };
  missingComponents: string[];          // All missing (required + optional)
  missingRequiredComponents: string[];   // Only auto-generatable components that are missing
  missingOptionalComponents: string[];   // Pre-configured components that are missing (don't block)
  message: string;
}

export interface IntelligenceGateResult {
  passed: boolean;
  status: IntelligenceStatus;
  accountIntelligencePayload: AccountIntelligencePayload | null;
}

type ResolvedCampaignOrganization = {
  campaign: {
    id: string;
    problemIntelligenceOrgId: string | null;
    productServiceInfo: string | null;
  } | null;
  organization: typeof campaignOrganizations.$inferSelect | null;
};

async function resolveCampaignOrganization(campaignId: string): Promise<ResolvedCampaignOrganization> {
  const [campaign] = await db
    .select({
      id: campaigns.id,
      problemIntelligenceOrgId: campaigns.problemIntelligenceOrgId,
      productServiceInfo: campaigns.productServiceInfo,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return { campaign: null, organization: null };
  }

  let organization: typeof campaignOrganizations.$inferSelect | null = null;

  if (campaign.problemIntelligenceOrgId) {
    const [linkedOrg] = await db
      .select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.id, campaign.problemIntelligenceOrgId))
      .limit(1);
    organization = linkedOrg || null;
  }

  if (!organization) {
    const [defaultOrg] = await db
      .select()
      .from(campaignOrganizations)
      .where(
        and(
          eq(campaignOrganizations.isActive, true),
          eq(campaignOrganizations.isDefault, true),
        )
      )
      .limit(1);
    organization = defaultOrg || null;
  }

  if (!organization) {
    const [fallbackOrg] = await db
      .select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.isActive, true))
      .orderBy(desc(campaignOrganizations.isDefault), campaignOrganizations.name)
      .limit(1);
    organization = fallbackOrg || null;
  }

  return { campaign, organization };
}

function hasStructuredIntelligenceSection(section: unknown): boolean {
  return !!section && typeof section === 'object' && Object.keys(section as Record<string, unknown>).length > 0;
}

export function normalizeOrganizationWebsiteUrl(domain: string | null | undefined): string | null {
  const trimmed = String(domain || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^www\./i, '')}`;
}

export function mapOrganizationResearchToCampaignOrganizationIntelligence(intelligence: StructuredIntelligence): {
  identity: Record<string, unknown>;
  offerings: Record<string, unknown>;
  icp: Record<string, unknown>;
  positioning: Record<string, unknown>;
  outreach: Record<string, unknown>;
} {
  return {
    identity: {
      legalName: intelligence.identity.legalName,
      description: intelligence.identity.description,
      industry: intelligence.identity.industry,
      foundedYear: intelligence.identity.foundedYear,
      headquarters: intelligence.identity.headquarters,
    },
    offerings: {
      coreProducts: intelligence.offerings.coreProducts,
      useCases: intelligence.offerings.useCases,
      problemsSolved: intelligence.offerings.problemsSolved,
      differentiators: intelligence.offerings.differentiators,
    },
    icp: {
      industries: intelligence.icp.targetIndustries,
      personas: intelligence.icp.targetPersonas,
      companySize: intelligence.icp.companySize,
      buyingSignals: intelligence.icp.buyingSignals,
    },
    positioning: {
      oneLiner: intelligence.positioning.oneLiner,
      valueProposition: intelligence.positioning.valueProposition,
      competitors: intelligence.positioning.competitors,
      whyUs: intelligence.positioning.whyChooseUs,
    },
    outreach: {
      emailAngles: intelligence.outreach.emailAngles,
      callOpeners: intelligence.outreach.callOpeners,
      objectionHandlers: intelligence.outreach.objectionHandlers,
    },
  };
}

async function autoGenerateOrganizationIntelligence(campaignId: string): Promise<boolean> {
  const resolved = await resolveCampaignOrganization(campaignId);
  const organization = resolved.organization;

  if (!resolved.campaign || !organization) {
    console.warn(`[Preview Intelligence Gate] No campaign organization available for ${campaignId}`);
    return false;
  }

  const websiteUrl = normalizeOrganizationWebsiteUrl(organization.domain);
  if (!websiteUrl) {
    console.warn(`[Preview Intelligence Gate] Skipping organization intelligence generation for ${campaignId}: organization ${organization.id} has no domain`);
    return false;
  }

  const research = await runOrganizationResearch({
    organizationName: organization.name,
    websiteUrl,
    industry: organization.industry || undefined,
    notes: resolved.campaign.productServiceInfo || undefined,
  });

  const mapped = mapOrganizationResearchToCampaignOrganizationIntelligence(research.intelligence);

  await db
    .update(campaignOrganizations)
    .set({
      identity: {
        ...((organization.identity as Record<string, unknown>) || {}),
        ...mapped.identity,
      },
      offerings: {
        ...((organization.offerings as Record<string, unknown>) || {}),
        ...mapped.offerings,
      },
      icp: {
        ...((organization.icp as Record<string, unknown>) || {}),
        ...mapped.icp,
      },
      positioning: {
        ...((organization.positioning as Record<string, unknown>) || {}),
        ...mapped.positioning,
      },
      outreach: {
        ...((organization.outreach as Record<string, unknown>) || {}),
        ...mapped.outreach,
      },
      compiledOrgContext: research.compiledContext,
      description:
        organization.description ||
        research.intelligence.identity.description.value ||
        null,
      industry:
        organization.industry ||
        research.intelligence.identity.industry.value ||
        null,
      updatedAt: new Date(),
    })
    .where(eq(campaignOrganizations.id, organization.id));

  if (!resolved.campaign.problemIntelligenceOrgId) {
    await db
      .update(campaigns)
      .set({
        problemIntelligenceOrgId: organization.id,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  }

  return true;
}

// ==================== CORE GATE FUNCTION ====================

/**
 * Check intelligence readiness for a preview/test operation.
 * Returns detailed status of all required intelligence components.
 */
export async function checkPreviewIntelligence(params: {
  accountId: string;
  campaignId: string;
}): Promise<IntelligenceStatus> {
  const { accountId, campaignId } = params;
  const missingComponents: string[] = [];

  // 1. Check Account Intelligence
  let accountIntel = {
    available: false,
    confidence: null as number | null,
    problemHypothesis: null as string | null,
    recommendedAngle: null as string | null,
    lastUpdated: null as Date | null,
  };

  try {
    const [latestRecord] = await db
      .select()
      .from(accountIntelligenceRecords)
      .where(eq(accountIntelligenceRecords.accountId, accountId))
      .orderBy(desc(accountIntelligenceRecords.version))
      .limit(1);

    if (latestRecord && latestRecord.payloadJson) {
      const payload = latestRecord.payloadJson as AccountIntelligencePayload;
      accountIntel = {
        available: true,
        confidence: payload.confidence || latestRecord.confidence || null,
        problemHypothesis: payload.problem_hypothesis || null,
        recommendedAngle: payload.recommended_angle || null,
        lastUpdated: latestRecord.createdAt || null,
      };
    } else {
      missingComponents.push('Account Intelligence');
    }
  } catch (e) {
    console.warn('[Preview Intelligence Gate] Error checking account intelligence:', e);
    missingComponents.push('Account Intelligence');
  }

  // 2. Check Organization Intelligence (campaignOrganizations — the CLIENT's org running the campaign)
  let orgIntel = {
    available: false,
    hasOfferings: false,
    hasIcp: false,
    hasPositioning: false,
    orgName: null as string | null,
  };

  try {
    const { organization: orgProfile } = await resolveCampaignOrganization(campaignId);

    if (orgProfile) {
      const identity = orgProfile.identity as any;
      const hasIdentity = hasStructuredIntelligenceSection(identity);
      orgIntel = {
        available: hasIdentity,
        hasOfferings: hasStructuredIntelligenceSection(orgProfile.offerings),
        hasIcp: hasStructuredIntelligenceSection(orgProfile.icp),
        hasPositioning: hasStructuredIntelligenceSection(orgProfile.positioning),
        orgName: identity?.legalName?.value || identity?.legalName || orgProfile.name || null,
      };
      // Available if identity exists — offerings/icp/positioning are bonuses
      if (!hasIdentity) {
        missingComponents.push('Organization Intelligence');
      }
    } else {
      missingComponents.push('Organization Intelligence');
    }
  } catch (e) {
    console.warn('[Preview Intelligence Gate] Error checking org intelligence:', e);
    missingComponents.push('Organization Intelligence');
  }

  // 3. Check Solution Mapping (campaign product info + problem definitions + service catalog)
  let solutionMap = {
    available: false,
    hasProductInfo: false,
    hasProblemDefinitions: false,
    hasServiceCatalog: false,
  };

  try {
    const [campaign] = await db
      .select({
        productServiceInfo: campaigns.productServiceInfo,
        problemIntelligenceOrgId: campaigns.problemIntelligenceOrgId,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    const hasProductInfo = !!(campaign?.productServiceInfo && campaign.productServiceInfo.trim().length > 0);

    // Check for problem definitions linked to this campaign's org
    let hasProblemDefs = false;
    let hasServiceCatalog = false;

    if (campaign?.problemIntelligenceOrgId) {
      const problemDefs = await db
        .select({ id: problemDefinitions.id })
        .from(problemDefinitions)
        .where(eq(problemDefinitions.organizationId, campaign.problemIntelligenceOrgId as any))
        .limit(1);
      hasProblemDefs = problemDefs.length > 0;

      const services = await db
        .select({ id: organizationServiceCatalog.id })
        .from(organizationServiceCatalog)
        .where(eq(organizationServiceCatalog.organizationId, campaign.problemIntelligenceOrgId as any))
        .limit(1);
      hasServiceCatalog = services.length > 0;
    }

    solutionMap = {
      available: hasProductInfo || hasProblemDefs || hasServiceCatalog,
      hasProductInfo,
      hasProblemDefinitions: hasProblemDefs,
      hasServiceCatalog,
    };

    if (!solutionMap.available) {
      missingComponents.push('Solution Mapping');
    }
  } catch (e) {
    console.warn('[Preview Intelligence Gate] Error checking solution mapping:', e);
    missingComponents.push('Solution Mapping');
  }

  // 4. Check Problem Intelligence (campaign-account problem detection, messaging, outreach)
  let problemIntel = {
    available: false,
    confidence: null as number | null,
    detectedProblemsCount: 0,
    hasMesagingPackage: false,
    hasOutreachStrategy: false,
    lastUpdated: null as Date | null,
  };

  try {
    const [problemRecord] = await db
      .select()
      .from(campaignAccountProblems)
      .where(
        and(
          eq(campaignAccountProblems.campaignId, campaignId),
          eq(campaignAccountProblems.accountId, accountId)
        )
      )
      .limit(1);

    if (problemRecord) {
      const detectedProblems = (problemRecord.detectedProblems as any[]) || [];
      const messagingPackage = problemRecord.messagingPackage as any;
      const outreachStrategy = problemRecord.outreachStrategy as any;

      const hasDetectedProblems = detectedProblems.length > 0;
      const hasMessaging = !!(messagingPackage && messagingPackage.primaryAngle);
      const hasOutreach = !!(outreachStrategy && outreachStrategy.recommendedApproach);

      problemIntel = {
        available: hasDetectedProblems || hasMessaging,
        confidence: problemRecord.confidence || null,
        detectedProblemsCount: detectedProblems.length,
        hasMesagingPackage: hasMessaging,
        hasOutreachStrategy: hasOutreach,
        lastUpdated: problemRecord.generatedAt || problemRecord.createdAt || null,
      };

      if (!problemIntel.available) {
        missingComponents.push('Problem Intelligence');
      }
    } else {
      missingComponents.push('Problem Intelligence');
    }
  } catch (e) {
    console.warn('[Preview Intelligence Gate] Error checking problem intelligence:', e);
    missingComponents.push('Problem Intelligence');
  }

  // Separate required from optional components.
  // Required: Account Intelligence — Preview Studio should unlock once the core
  // account context exists.
  // Optional: Problem Intelligence, Organization Intelligence, Solution Mapping.
  // Production campaign calls don't check the gate at all, so we only require
  // the minimum context needed for a useful preview. Everything else improves
  // quality but should not block testing.
  const requiredComponents = ['Account Intelligence'];
  const missingRequiredComponents = missingComponents.filter(c => requiredComponents.includes(c));
  const missingOptionalComponents = missingComponents.filter(c => !requiredComponents.includes(c));

  const ready = missingRequiredComponents.length === 0;
  const fullyEnriched = missingComponents.length === 0;

  let message: string;
  if (fullyEnriched) {
    message = 'All intelligence components ready. Preview will use full account intelligence, organization intelligence, solution mapping, and problem intelligence.';
  } else if (ready) {
    message = `Core intelligence ready. Optional enhancements missing: ${missingOptionalComponents.join(', ')}. Preview will proceed with available intelligence.`;
  } else {
    message = `Required intelligence missing: ${missingRequiredComponents.join(', ')}. These will be auto-generated before preview starts.`;
  }

  return {
    ready,
    fullyEnriched,
    accountIntelligence: accountIntel,
    organizationIntelligence: orgIntel,
    solutionMapping: solutionMap,
    problemIntelligence: problemIntel,
    missingComponents,
    missingRequiredComponents,
    missingOptionalComponents,
    message,
  };
}

/**
 * Full intelligence gate — checks readiness and auto-generates missing intelligence.
 * Used before any preview/test action to ensure core intelligence is present.
 *
 * Auto-generates (if missing and autoGenerate=true):
 * - Account Intelligence (required to unlock Preview Studio)
 * - Problem Intelligence (best-effort enhancement)
 *
 * Gate passes when account intelligence is available.
 * Problem Intelligence, Organization Intelligence, and Solution Mapping enhance quality but do NOT block,
 * matching the behavior of production campaign calls which skip the gate entirely.
 */
export async function enforcePreviewIntelligence(params: {
  accountId: string;
  campaignId: string;
  autoGenerate?: boolean; // If true, auto-generates account + problem intelligence if missing
}): Promise<IntelligenceGateResult> {
  const { accountId, campaignId, autoGenerate = true } = params;

  // First check current state
  let status = await checkPreviewIntelligence({ accountId, campaignId });

  let generatedAnything = false;

  // Auto-generate account intelligence if missing and allowed
  if (!status.accountIntelligence.available && autoGenerate) {
    try {
      console.log(`[Preview Intelligence Gate] Auto-generating account intelligence for: ${accountId}`);
      const intelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      if (intelligenceRecord?.payloadJson) {
        generatedAnything = true;
      }
    } catch (e) {
      console.error('[Preview Intelligence Gate] Failed to auto-generate account intelligence:', e);
    }
  }

  if (!status.organizationIntelligence.available && autoGenerate) {
    try {
      console.log(`[Preview Intelligence Gate] Auto-generating organization intelligence for campaign ${campaignId}`);
      const generated = await autoGenerateOrganizationIntelligence(campaignId);
      if (generated) {
        generatedAnything = true;
      }
    } catch (e) {
      console.error('[Preview Intelligence Gate] Failed to auto-generate organization intelligence:', e);
    }
  }

  // Auto-generate problem intelligence if missing and allowed
  if (!status.problemIntelligence.available && autoGenerate) {
    try {
      console.log(`[Preview Intelligence Gate] Auto-generating problem intelligence for account ${accountId} in campaign ${campaignId}`);
      const problemIntel = await generateAccountProblemIntelligence({ campaignId, accountId });
      if (problemIntel) {
        generatedAnything = true;
      }
    } catch (e) {
      console.error('[Preview Intelligence Gate] Failed to auto-generate problem intelligence:', e);
    }
  }

  // Re-check status after any generation
  if (generatedAnything) {
    status = await checkPreviewIntelligence({ accountId, campaignId });
  }

  // Get the account intelligence payload for use downstream
  let accountIntelligencePayload: AccountIntelligencePayload | null = null;
  if (status.accountIntelligence.available) {
    try {
      const record = await getOrBuildAccountIntelligence(accountId);
      accountIntelligencePayload = record?.payloadJson as AccountIntelligencePayload || null;
    } catch (e) {
      // Already checked above
    }
  }

  return {
    passed: status.ready,
    status,
    accountIntelligencePayload,
  };
}

/**
 * Express-compatible error response for failed intelligence gate.
 */
export function intelligenceGateErrorResponse(status: IntelligenceStatus) {
  return {
    error: 'Intelligence gate failed',
    message: status.message,
    missingComponents: status.missingRequiredComponents,
    missingOptionalComponents: status.missingOptionalComponents,
    intelligenceStatus: {
      accountIntelligence: status.accountIntelligence.available,
      organizationIntelligence: status.organizationIntelligence.available,
      solutionMapping: status.solutionMapping.available,
      problemIntelligence: status.problemIntelligence.available,
    },
    resolution: status.missingRequiredComponents.map(component => {
      switch (component) {
        case 'Account Intelligence':
          return 'Account intelligence will be auto-generated. If this persists, ensure the account has sufficient data (name, domain, industry).';
        case 'Organization Intelligence':
          return 'Configure organization intelligence in Settings > Organization Intelligence. This requires a domain scan or manual setup.';
        case 'Solution Mapping':
          return 'Add product/service information to the campaign, or configure problem definitions and service catalog in organization settings.';
        case 'Problem Intelligence':
          return 'Problem intelligence will be auto-generated. If this persists, ensure account signals are available (industry, tech stack, etc.) and problem definitions are configured.';
        default:
          return `Configure ${component} before running previews.`;
      }
    }),
  };
}
