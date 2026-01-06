/**
 * Companies House Validation Service
 * Automates company validation for campaign leads using Companies House API
 * 
 * Caching Strategy:
 * - Validation data stored at account level (not lead level)
 * - 365-day TTL: API calls only made once per year per company
 * - Supports force refresh to override cache
 * - Deduplicates account IDs to prevent redundant API calls
 */

import { db } from '../db';
import { leads, accounts, contacts } from '@shared/schema';
import { eq, and, inArray, isNull, or, lt } from 'drizzle-orm';
import { validateCompany, type CompanyValidationResult } from './companies-house';
import { sql } from 'drizzle-orm';

export interface ValidationStats {
  processed: number;
  validated: number;
  active: number;
  inactive: number;
  notFound: number;
  apiErrors: number;
  errors: number;
  cached: number; // Number of companies using cached data
  apiCalls: number; // Number of actual API calls made
  errorDetails: Array<{ leadId: string; companyName: string; error: string }>;
}

/**
 * Check if account's CH validation is still valid
 * - Successful validations: 365-day TTL
 * - API errors: 24-hour TTL (retry sooner to avoid blocking on transient failures)
 */
function isCacheValid(validatedAt: Date | null, validationStatus: string | null): boolean {
  if (!validatedAt) return false;
  
  const now = new Date();
  const daysSinceValidation = (now.getTime() - validatedAt.getTime()) / (1000 * 60 * 60 * 24);
  
  // API errors get shorter TTL to allow retries
  if (validationStatus === 'api_error') {
    return daysSinceValidation < 1; // 24 hour TTL for errors
  }
  
  // Successful validations (validated, not_found) get full TTL
  return daysSinceValidation < 365;
}

/**
 * Validate account and cache results (or use existing cache)
 */
async function validateAndCacheAccount(
  accountId: string,
  companyName: string,
  force: boolean = false
): Promise<{ fromCache: boolean; validation: CompanyValidationResult }> {
  // Get account's cached validation data
  const [account] = await db
    .select({
      chValidatedAt: accounts.chValidatedAt,
      chValidationStatus: accounts.chValidationStatus,
      chCompanyNumber: accounts.chCompanyNumber,
      chLegalName: accounts.chLegalName,
      chStatus: accounts.chStatus,
      chIsActive: accounts.chIsActive,
      chDateOfCreation: accounts.chDateOfCreation,
      chAddress: accounts.chAddress,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  // Check if cache is valid and force refresh not requested
  if (!force && account && isCacheValid(account.chValidatedAt, account.chValidationStatus)) {
    const cacheType = account.chValidationStatus === 'api_error' ? 'error cache' : 'success cache';
    console.log(`[CompaniesHouseValidator] Using ${cacheType} for account ${accountId} (validated ${account.chValidatedAt?.toISOString()})`);
    
    // Return cached data in CompanyValidationResult format
    return {
      fromCache: true,
      validation: {
        found: account.chValidationStatus === 'validated',
        notFound: account.chValidationStatus === 'not_found',
        apiError: account.chValidationStatus === 'api_error',
        companyNumber: account.chCompanyNumber || undefined,
        legalName: account.chLegalName || undefined,
        status: account.chStatus || undefined,
        isActive: account.chIsActive || false,
        dateOfCreation: account.chDateOfCreation || undefined,
        address: account.chAddress as any || undefined,
      }
    };
  }

  // Cache expired or force refresh - make API call
  console.log(`[CompaniesHouseValidator] ${force ? 'Force refreshing' : 'Validating'} company via API: ${companyName}`);
  const validation = await validateCompany(companyName);

  // Update account with validation results
  let validationStatus: string;
  if (validation.found) {
    validationStatus = 'validated';
  } else if (validation.notFound) {
    validationStatus = 'not_found';
  } else if (validation.apiError) {
    validationStatus = 'api_error';
  } else {
    validationStatus = 'pending';
  }

  await db
    .update(accounts)
    .set({
      chValidatedAt: new Date(),
      chValidationStatus: validationStatus,
      chCompanyNumber: validation.companyNumber || null,
      chLegalName: validation.legalName || null,
      chStatus: validation.status || null,
      chIsActive: validation.isActive || false,
      chDateOfCreation: validation.dateOfCreation || null,
      chAddress: validation.address || null,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));

  return { fromCache: false, validation };
}

/**
 * Validate companies for all leads in a campaign
 * Uses account-level caching with 365-day TTL
 * 
 * @param campaignId - Campaign to validate
 * @param force - Force refresh even if cache is valid
 */
export async function validateCampaignCompanies(
  campaignId: string,
  force: boolean = false
): Promise<ValidationStats> {
  const stats: ValidationStats = {
    processed: 0,
    validated: 0,
    active: 0,
    inactive: 0,
    notFound: 0,
    apiErrors: 0,
    errors: 0,
    cached: 0,
    apiCalls: 0,
    errorDetails: [],
  };

  try {
    // Get all leads for this campaign with their account information
    const campaignLeads = await db
      .select({
        leadId: leads.id,
        contactId: leads.contactId,
        accountId: contacts.accountId,
        companyName: accounts.name,
        qaData: leads.qaData,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(leads.campaignId, campaignId));

    console.log(`[CompaniesHouseValidator] Found ${campaignLeads.length} leads for campaign ${campaignId}`);

    // Build account map: accountId -> { companyName, leads[] }
    const accountMap = new Map<string, { companyName: string; leadIds: string[] }>();
    const leadsWithoutAccount: string[] = [];

    for (const lead of campaignLeads) {
      stats.processed++;

      if (!lead.accountId) {
        stats.errors++;
        stats.errorDetails.push({
          leadId: lead.leadId,
          companyName: lead.companyName || 'N/A',
          error: 'Lead has no linked account',
        });
        leadsWithoutAccount.push(lead.leadId);
        continue;
      }

      if (!lead.companyName || lead.companyName.trim() === '') {
        stats.errors++;
        stats.errorDetails.push({
          leadId: lead.leadId,
          companyName: 'N/A',
          error: 'Account has no company name',
        });
        continue;
      }

      // Add to account map
      if (!accountMap.has(lead.accountId)) {
        accountMap.set(lead.accountId, {
          companyName: lead.companyName,
          leadIds: [],
        });
      }
      accountMap.get(lead.accountId)!.leadIds.push(lead.leadId);
    }

    console.log(`[CompaniesHouseValidator] Dedup: ${accountMap.size} unique accounts, ${leadsWithoutAccount.length} leads without accounts`);

    // Build lead lookup map to avoid O(n²) behavior
    const leadLookup = new Map<string, { qaData: unknown }>();
    for (const lead of campaignLeads) {
      leadLookup.set(lead.leadId, { qaData: lead.qaData });
    }

    // Validate each unique account
    for (const [accountId, accountData] of accountMap) {
      try {
        // Validate account (uses cache if valid)
        const { fromCache, validation } = await validateAndCacheAccount(
          accountId,
          accountData.companyName,
          force
        );

        // Track stats
        if (fromCache) {
          stats.cached++;
        } else {
          stats.apiCalls++;
          // Rate limiting: only delay after actual API calls
          await new Promise(resolve => setTimeout(resolve, 1200));
        }

        // Determine validation status
        let validationStatus = 'pending';
        if (validation.found) {
          validationStatus = 'validated';
          stats.validated++;
          if (validation.isActive) {
            stats.active++;
          } else {
            stats.inactive++;
          }
        } else if (validation.notFound) {
          validationStatus = 'not_found';
          stats.notFound++;
        } else if (validation.apiError) {
          validationStatus = 'api_error';
          stats.apiErrors++;
        }

        // Update all leads for this account (mirror account data to lead.qaData for backward compatibility)
        for (const leadId of accountData.leadIds) {
          const existingLead = leadLookup.get(leadId);
          const existingQaData = (existingLead?.qaData as Record<string, any>) || {};
          
          const updatedQaData = {
            ...existingQaData,
            ch_validation_status: validationStatus,
            ch_company_number: validation.companyNumber || null,
            ch_legal_name: validation.legalName || null,
            ch_status: validation.status || null,
            ch_is_active: validation.isActive || false,
            ch_date_of_creation: validation.dateOfCreation || null,
            ch_address: validation.address || null,
            ch_validated_at: new Date().toISOString(),
            ch_error: validation.error || null,
          };

          await db
            .update(leads)
            .set({
              qaData: updatedQaData,
              updatedAt: new Date(),
            })
            .where(eq(leads.id, leadId));
        }

      } catch (error) {
        stats.errors++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        for (const leadId of accountData.leadIds) {
          stats.errorDetails.push({
            leadId,
            companyName: accountData.companyName,
            error: errorMessage,
          });
        }
        console.error(`[CompaniesHouseValidator] Error validating account ${accountId} (${accountData.companyName}):`, error);
      }
    }

    console.log(`[CompaniesHouseValidator] Validation complete:`, {
      ...stats,
      cacheHitRate: stats.cached > 0 ? `${(stats.cached / (stats.cached + stats.apiCalls) * 100).toFixed(1)}%` : '0%',
    });
    return stats;

  } catch (error) {
    console.error('[CompaniesHouseValidator] Campaign validation error:', error);
    throw error;
  }
}

/**
 * Validate a single lead's company
 * Uses account-level caching with 365-day TTL
 * 
 * @param leadId - Lead to validate
 * @param force - Force refresh even if cache is valid
 */
export async function validateLeadCompany(
  leadId: string,
  force: boolean = false
): Promise<CompanyValidationResult> {
  try {
    // Get lead and account information
    const result = await db
      .select({
        leadId: leads.id,
        accountId: contacts.accountId,
        companyName: accounts.name,
        qaData: leads.qaData,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!result || result.length === 0) {
      throw new Error('Lead not found');
    }

    const lead = result[0];

    if (!lead.companyName || lead.companyName.trim() === '') {
      throw new Error('No company name for this lead');
    }

    if (!lead.accountId) {
      throw new Error('Lead has no linked account - cannot validate');
    }

    // Validate account (uses cache if valid)
    const { fromCache, validation } = await validateAndCacheAccount(
      lead.accountId,
      lead.companyName,
      force
    );

    // Determine validation status
    let validationStatus = 'pending';
    if (validation.found) {
      validationStatus = 'validated';
    } else if (validation.notFound) {
      validationStatus = 'not_found';
    } else if (validation.apiError) {
      validationStatus = 'api_error';
    }

    // Update lead qaData (mirror account data for backward compatibility)
    const existingQaData = (lead.qaData as Record<string, any>) || {};
    
    const updatedQaData = {
      ...existingQaData,
      ch_validation_status: validationStatus,
      ch_company_number: validation.companyNumber || null,
      ch_legal_name: validation.legalName || null,
      ch_status: validation.status || null,
      ch_is_active: validation.isActive || false,
      ch_date_of_creation: validation.dateOfCreation || null,
      ch_address: validation.address || null,
      ch_validated_at: new Date().toISOString(),
      ch_error: validation.error || null,
    };

    await db
      .update(leads)
      .set({
        qaData: updatedQaData,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    console.log(`[CompaniesHouseValidator] Lead ${leadId} validated ${fromCache ? '(from cache)' : '(API call)'}`);

    return validation;

  } catch (error) {
    console.error('[CompaniesHouseValidator] Error validating lead company:', error);
    throw error;
  }
}

/**
 * Get validation summary for a campaign
 */
export async function getCampaignValidationSummary(campaignId: string): Promise<{
  total: number;
  validated: number;
  active: number;
  inactive: number;
  notFound: number;
  apiErrors: number;
  pending: number;
}> {
  const campaignLeads = await db
    .select({
      qaData: leads.qaData,
    })
    .from(leads)
    .where(eq(leads.campaignId, campaignId));

  const summary = {
    total: campaignLeads.length,
    validated: 0,
    active: 0,
    inactive: 0,
    notFound: 0,
    apiErrors: 0,
    pending: 0,
  };

  for (const lead of campaignLeads) {
    const qaData = (lead.qaData as Record<string, any>) || {};
    
    if (qaData.ch_validation_status === 'found') {
      summary.validated++;
      if (qaData.ch_is_active === true) {
        summary.active++;
      } else {
        summary.inactive++;
      }
    } else if (qaData.ch_validation_status === 'not_found') {
      summary.notFound++;
    } else if (qaData.ch_validation_status === 'api_error') {
      summary.apiErrors++;
    } else {
      summary.pending++;
    }
  }

  return summary;
}
