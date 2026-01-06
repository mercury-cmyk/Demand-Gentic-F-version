import { db } from '../db';
import { accounts, verificationContacts } from '@shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { normalizeDomain, isValidDomain } from '@shared/domain-utils';

/**
 * Backfill Account Domains from Contact Emails
 * 
 * For accounts missing domain field, extract domain from associated contact emails
 * and update the account record. Uses proper domain validation and normalization.
 * Skips personal email domains and invalid domains.
 */

const PERSONAL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'naver.com', 'qq.com', 'live.com', '163.com',
  'protonmail.com', 'yandex.com', 'gmx.com', 'zoho.com', 'mail.ru',
  'yahoo.co', 'yahoo.con', 'googlemail.com', 'inbox.com', 'fastmail.com'
];

/**
 * Extract domain from email using the same logic as import
 */
function extractDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.toLowerCase().trim().match(/@(.+)$/);
  return match ? match[1] : null;
}

/**
 * Validate domain format and quality using shared utilities
 * Combined with additional corporate domain checks
 */
function isValidCorporateDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().trim();
  
  // Check if personal domain first (quick reject)
  if (PERSONAL_DOMAINS.includes(normalized)) {
    return false;
  }
  
  // Must not have double dots (typos like "acit..com") - check before isValidDomain
  if (normalized.includes('..')) {
    return false;
  }
  
  // Must not start or end with dot
  if (normalized.startsWith('.') || normalized.endsWith('.')) {
    return false;
  }
  
  // Must not contain spaces
  if (normalized.includes(' ')) {
    return false;
  }
  
  // Use the shared validation utility that handles TLD validation properly
  // This accepts all legitimate TLDs including long modern gTLDs (.international, .construction, etc.)
  if (!isValidDomain(normalized)) {
    return false;
  }
  
  // Must not be localhost or example domains
  const invalidDomains = ['localhost', 'example.com', 'test.com', 'domain.com'];
  if (invalidDomains.includes(normalized)) {
    return false;
  }
  
  return true;
}

function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.includes(domain.toLowerCase());
}

export async function backfillAccountDomainsForCampaign(campaignId: string): Promise<{
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{ accountId: string; accountName: string; domain: string; action: string }>;
}> {
  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    details: [] as Array<{ accountId: string; accountName: string; domain: string; action: string }>,
  };

  console.log(`[Domain Backfill] Starting for campaign ${campaignId}...`);

  // Find all accounts in this campaign that are missing domains
  const accountsWithMissingDomains = await db.execute(sql`
    SELECT DISTINCT
      a.id,
      a.name,
      a.domain
    FROM accounts a
    INNER JOIN verification_contacts c ON c.account_id = a.id
    WHERE c.campaign_id = ${campaignId}
      AND c.deleted = false
      AND (a.domain IS NULL OR a.domain = '')
    ORDER BY a.name
  `);

  console.log(`[Domain Backfill] Found ${accountsWithMissingDomains.rows.length} accounts missing domains`);

  for (const accountRow of accountsWithMissingDomains.rows as any[]) {
    stats.processed++;

    try {
      // Get all contacts for this account with emails
      const contacts = await db
        .select({ email: verificationContacts.email })
        .from(verificationContacts)
        .where(
          sql`${verificationContacts.accountId} = ${accountRow.id} 
              AND ${verificationContacts.campaignId} = ${campaignId}
              AND ${verificationContacts.email} IS NOT NULL
              AND ${verificationContacts.email} != ''
              AND ${verificationContacts.deleted} = false`
        );

      if (contacts.length === 0) {
        stats.skipped++;
        stats.details.push({
          accountId: accountRow.id,
          accountName: accountRow.name,
          domain: '',
          action: 'skipped_no_emails',
        });
        continue;
      }

      // Extract and validate domains from all contact emails
      const domains = new Map<string, number>(); // normalized domain -> count
      for (const contact of contacts) {
        const rawDomain = extractDomainFromEmail(contact.email);
        if (!rawDomain) continue;
        
        // Validate domain quality
        if (!isValidCorporateDomain(rawDomain)) {
          continue; // Skip invalid/personal domains
        }
        
        // Normalize domain using the same utility as imports
        const normalized = normalizeDomain(rawDomain);
        if (!normalized) continue;
        
        domains.set(normalized, (domains.get(normalized) || 0) + 1);
      }

      if (domains.size === 0) {
        stats.skipped++;
        stats.details.push({
          accountId: accountRow.id,
          accountName: accountRow.name,
          domain: '',
          action: 'skipped_no_valid_corporate_emails',
        });
        continue;
      }

      // Select the most frequent corporate domain
      let selectedDomain = '';
      let maxCount = 0;
      for (const [domain, count] of Array.from(domains.entries())) {
        if (count > maxCount) {
          maxCount = count;
          selectedDomain = domain;
        }
      }

      // Double-check the selected domain is valid before updating
      if (!isValidCorporateDomain(selectedDomain)) {
        stats.skipped++;
        stats.details.push({
          accountId: accountRow.id,
          accountName: accountRow.name,
          domain: selectedDomain,
          action: 'skipped_invalid_domain_format',
        });
        continue;
      }

      // Update the account with the validated, normalized domain
      await db
        .update(accounts)
        .set({
          domain: selectedDomain,
          domainNormalized: normalizeDomain(selectedDomain),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountRow.id));

      stats.updated++;
      stats.details.push({
        accountId: accountRow.id,
        accountName: accountRow.name,
        domain: selectedDomain,
        action: 'updated',
      });

      console.log(`[Domain Backfill] Updated "${accountRow.name}" with domain: ${selectedDomain}`);
    } catch (error) {
      stats.errors++;
      console.error(`[Domain Backfill] Error processing account ${accountRow.id}:`, error);
      stats.details.push({
        accountId: accountRow.id,
        accountName: accountRow.name || 'Unknown',
        domain: '',
        action: 'error',
      });
    }
  }

  console.log(`[Domain Backfill] Complete. Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  return stats;
}
