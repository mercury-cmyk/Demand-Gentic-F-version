/**
 * Unified Preview Intelligence Gate
 *
 * Checks intelligence readiness before previews/tests. Components are split into:
 *
 * REQUIRED (auto-generatable — gate blocks if missing):
 * 1. Account Intelligence (problem hypothesis, recommended angle, tone)
 * 2. Problem Intelligence (detected problems, messaging package, outreach strategy)
 *
 * OPTIONAL (pre-configured — enhance quality but don't block):
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
    // Get campaign to find linked organization
    const [campaign] = await db
      .select({
        id: campaigns.id,
        problemIntelligenceOrgId: campaigns.problemIntelligenceOrgId,
        productServiceInfo: campaigns.productServiceInfo,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    // Check campaignOrganizations — the client org linked to this campaign
    let orgProfile: any = null;

    if (campaign?.problemIntelligenceOrgId) {
      const [profile] = await db
        .select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.id, campaign.problemIntelligenceOrgId))
        .limit(1);
      orgProfile = profile;
    }

    // Fallback: find the default active organization
    if (!orgProfile) {
      const [defaultOrg] = await db
        .select()
        .from(campaignOrganizations)
        .where(eq(campaignOrganizations.isActive, true))
        .limit(1);
      orgProfile = defaultOrg;
    }

    if (orgProfile) {
      const identity = orgProfile.identity as any;
      const hasIdentity = !!(identity && Object.keys(identity).length > 0);
      orgIntel = {
        available: hasIdentity,
        hasOfferings: !!(orgProfile.offerings && Object.keys(orgProfile.offerings as any).length > 0),
        hasIcp: !!(orgProfile.icp && Object.keys(orgProfile.icp as any).length > 0),
        hasPositioning: !!(orgProfile.positioning && Object.keys(orgProfile.positioning as any).length > 0),
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

  // Separate required (auto-generatable) from optional (pre-configured) components.
  // Required: Account Intelligence, Problem Intelligence — these can be auto-generated
  // Optional: Organization Intelligence, Solution Mapping — these need manual configuration
  // Production campaign calls don't check the gate at all, so we only require
  // what we can auto-generate. Optional components enhance quality but don't block.
  const requiredComponents = ['Account Intelligence', 'Problem Intelligence'];
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
 * - Account Intelligence (problem hypothesis, recommended angle, tone)
 * - Problem Intelligence (detected problems, messaging package, outreach strategy)
 *
 * Gate passes when auto-generatable components are available.
 * Organization Intelligence and Solution Mapping enhance quality but do NOT block,
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
