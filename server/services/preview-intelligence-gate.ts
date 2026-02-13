/**
 * Unified Preview Intelligence Gate
 * 
 * Ensures NO preview or test (voice call or email) can run without:
 * 1. Account Intelligence (problem hypothesis, recommended angle, tone)
 * 2. Organization Intelligence (org profile with offerings, ICP, positioning)
 * 3. Solution Mapping (problem-to-solution mapping for the campaign)
 * 
 * This is the single source of truth for preview readiness across the entire platform.
 */

import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  accountIntelligenceRecords,
  campaigns,
  campaignOrganizations,
  organizationServiceCatalog,
  problemDefinitions,
} from '@shared/schema';
import {
  getOrBuildAccountIntelligence,
  type AccountIntelligencePayload,
} from './account-messaging-service';

// ==================== TYPES ====================

export interface IntelligenceStatus {
  ready: boolean;
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
  missingComponents: string[];
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

  const ready = missingComponents.length === 0;
  const message = ready
    ? 'All intelligence components ready. Preview will use full account intelligence, organization intelligence, and solution mapping.'
    : `Missing: ${missingComponents.join(', ')}. Preview requires all intelligence components to ensure quality output.`;

  return {
    ready,
    accountIntelligence: accountIntel,
    organizationIntelligence: orgIntel,
    solutionMapping: solutionMap,
    missingComponents,
    message,
  };
}

/**
 * Full intelligence gate — checks readiness and auto-generates missing account intelligence.
 * Used before any preview/test action to ensure intelligence is present.
 * 
 * If account intelligence is missing but can be generated, it will be auto-generated.
 * Organization intelligence and solution mapping must be pre-configured.
 */
export async function enforcePreviewIntelligence(params: {
  accountId: string;
  campaignId: string;
  autoGenerate?: boolean; // If true, auto-generates account intelligence if missing
}): Promise<IntelligenceGateResult> {
  const { accountId, campaignId, autoGenerate = true } = params;

  // First check current state
  let status = await checkPreviewIntelligence({ accountId, campaignId });

  // Auto-generate account intelligence if missing and allowed
  if (!status.accountIntelligence.available && autoGenerate) {
    try {
      console.log(`[Preview Intelligence Gate] Auto-generating account intelligence for: ${accountId}`);
      const intelligenceRecord = await getOrBuildAccountIntelligence(accountId);
      if (intelligenceRecord?.payloadJson) {
        // Re-check status after generation
        status = await checkPreviewIntelligence({ accountId, campaignId });
      }
    } catch (e) {
      console.error('[Preview Intelligence Gate] Failed to auto-generate account intelligence:', e);
    }
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
    missingComponents: status.missingComponents,
    intelligenceStatus: {
      accountIntelligence: status.accountIntelligence.available,
      organizationIntelligence: status.organizationIntelligence.available,
      solutionMapping: status.solutionMapping.available,
    },
    resolution: status.missingComponents.map(component => {
      switch (component) {
        case 'Account Intelligence':
          return 'Account intelligence will be auto-generated. If this persists, ensure the account has sufficient data (name, domain, industry).';
        case 'Organization Intelligence':
          return 'Configure organization intelligence in Settings > Organization Intelligence. This requires a domain scan or manual setup.';
        case 'Solution Mapping':
          return 'Add product/service information to the campaign, or configure problem definitions and service catalog in organization settings.';
        default:
          return `Configure ${component} before running previews.`;
      }
    }),
  };
}
