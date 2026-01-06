/**
 * CAV Address & Phone Merger - Account Level
 * 
 * Analyzes CAV custom field addresses and phone numbers from contacts within the same company (domain)
 * and selects the best/most complete data to populate account HQ fields.
 * 
 * Strategy:
 * 1. Group contacts by account domain
 * 2. For each domain, check if account has HQ address/phone fields
 * 3. If missing, analyze all CAV addresses and phones from contacts
 * 4. Select the most complete address that matches contact country
 * 5. Select the most common phone number
 * 6. Update account HQ fields with merged CAV data (conditional on missing fields)
 */

import { db } from '../db';
import { accounts, verificationContacts } from '@shared/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';

// Address components from CAV custom fields
interface CavAddress {
  addr1: string;
  addr2: string;
  addr3: string;
  town: string;
  state: string;
  postcode: string;
  contactId: string;
  contactCountry: string | null;
}

// Phone data from CAV custom fields
interface CavPhone {
  phone: string;
  contactId: string;
}

// Address score and metadata
interface ScoredAddress {
  address: CavAddress;
  completenessScore: number;
  frequency: number; // How many contacts share this address
  matchesCountry: boolean;
}

/**
 * Extract CAV address from contact custom fields
 */
function extractCavAddress(contact: any): CavAddress | null {
  const customFields = contact.custom_fields;
  
  if (!customFields || typeof customFields !== 'object') {
    return null;
  }
  
  const addr1 = customFields['custom_cav_addr1'] || '';
  const addr2 = customFields['custom_cav_addr2'] || '';
  const addr3 = customFields['custom_cav_addr3'] || '';
  const town = customFields['custom_cav_town'] || '';
  const state = customFields['custom_cav_state'] || '';
  const postcode = customFields['custom_cav_postcode'] || '';
  
  // Only return if at least addr1 and town are present
  if (!addr1 || !town) {
    return null;
  }
  
  return {
    addr1: String(addr1).trim(),
    addr2: String(addr2).trim(),
    addr3: String(addr3).trim(),
    town: String(town).trim(),
    state: String(state).trim(),
    postcode: String(postcode).trim(),
    contactId: contact.id,
    contactCountry: contact.contactCountry || contact.contact_country || null,
  };
}

/**
 * Extract CAV phone from contact custom fields
 */
function extractCavPhone(contact: any): CavPhone | null {
  const customFields = contact.custom_fields;
  
  if (!customFields || typeof customFields !== 'object') {
    return null;
  }
  
  // Try various key patterns
  const phone = customFields['custom_cav_tel'] || 
                customFields['Custom_CAV TEL'] ||
                customFields['CAV-Tel'] || 
                customFields['CAV_Tel'] || '';
  
  if (!phone || String(phone).trim() === '') {
    return null;
  }
  
  return {
    phone: String(phone).trim(),
    contactId: contact.id,
  };
}

/**
 * Calculate completeness score for an address
 * Higher score = more complete address
 */
function calculateCompletenessScore(address: CavAddress): number {
  let score = 0;
  
  // Required fields
  if (address.addr1) score += 30;
  if (address.town) score += 30;
  
  // Important fields
  if (address.state) score += 15;
  if (address.postcode) score += 15;
  
  // Optional fields
  if (address.addr2) score += 5;
  if (address.addr3) score += 5;
  
  return score;
}

/**
 * Create a unique key for address comparison (for frequency counting)
 */
function getAddressKey(address: CavAddress): string {
  return [
    address.addr1.toLowerCase(),
    address.town.toLowerCase(),
    address.state.toLowerCase(),
    address.postcode.toLowerCase()
  ].join('|');
}

/**
 * Check if address matches the expected country
 */
function addressMatchesCountry(
  address: CavAddress,
  expectedCountry: string | null
): boolean {
  if (!expectedCountry) return true; // No country constraint
  if (!address.contactCountry) return true; // Assume match if no country
  
  const normalizedExpected = expectedCountry.toLowerCase().trim();
  const normalizedActual = address.contactCountry.toLowerCase().trim();
  
  return normalizedExpected === normalizedActual;
}

/**
 * Select the best CAV address from a list of contacts
 * Prioritizes: Country match > Completeness > Frequency
 */
export function selectBestCavAddress(
  contacts: any[],
  preferredCountry: string | null = null
): CavAddress | null {
  // Extract all CAV addresses
  const cavAddresses = contacts
    .map(extractCavAddress)
    .filter((addr): addr is CavAddress => addr !== null);
  
  if (cavAddresses.length === 0) {
    return null;
  }
  
  // Calculate frequency map
  const frequencyMap = new Map<string, number>();
  for (const addr of cavAddresses) {
    const key = getAddressKey(addr);
    frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);
  }
  
  // Score each unique address
  const scoredAddresses: ScoredAddress[] = [];
  const seenKeys = new Set<string>();
  
  for (const addr of cavAddresses) {
    const key = getAddressKey(addr);
    
    if (seenKeys.has(key)) {
      continue; // Already scored this address
    }
    seenKeys.add(key);
    
    scoredAddresses.push({
      address: addr,
      completenessScore: calculateCompletenessScore(addr),
      frequency: frequencyMap.get(key) || 1,
      matchesCountry: addressMatchesCountry(addr, preferredCountry),
    });
  }
  
  // Sort by priority: Country match > Completeness > Frequency
  scoredAddresses.sort((a, b) => {
    // 1. Country match (true first)
    if (a.matchesCountry !== b.matchesCountry) {
      return a.matchesCountry ? -1 : 1;
    }
    
    // 2. Completeness score (higher first)
    if (a.completenessScore !== b.completenessScore) {
      return b.completenessScore - a.completenessScore;
    }
    
    // 3. Frequency (higher first)
    return b.frequency - a.frequency;
  });
  
  return scoredAddresses[0]?.address || null;
}

/**
 * Check if account has HQ address fields populated
 */
function hasHqAddress(account: any): boolean {
  return !!(
    account.hqStreet1 ||
    account.hqStreet2 ||
    account.hqStreet3
  );
}

/**
 * Check if account has main phone populated
 */
function hasMainPhone(account: any): boolean {
  return !!(account.mainPhone && account.mainPhone.trim() !== '');
}

/**
 * Check if account HQ country matches the majority of contact countries
 * Returns true if there's a mismatch (needs replacement)
 */
function hasCountryMismatch(account: any, contacts: any[]): {
  hasMismatch: boolean;
  preferredCountry: string | null;
} {
  // Get all contact countries
  const contactCountries = contacts
    .map(c => c.contactCountry)
    .filter(country => country && country.trim() !== '');
  
  if (contactCountries.length === 0) {
    return { hasMismatch: false, preferredCountry: null };
  }
  
  // Find the most common contact country
  const countryFrequency = new Map<string, number>();
  for (const country of contactCountries) {
    const normalized = country.toLowerCase().trim();
    countryFrequency.set(normalized, (countryFrequency.get(normalized) || 0) + 1);
  }
  
  let preferredCountry: string | null = null;
  let maxCount = 0;
  
  for (const [country, count] of Array.from(countryFrequency.entries())) {
    if (count > maxCount) {
      maxCount = count;
      preferredCountry = country;
    }
  }
  
  // Check if account HQ country matches
  const accountCountry = account.hqCountry?.toLowerCase().trim() || '';
  const hasMismatch = !!(preferredCountry && accountCountry && accountCountry !== preferredCountry);
  
  // Return the original casing
  const originalCountry = contactCountries.find(
    c => c.toLowerCase().trim() === preferredCountry
  );
  
  return {
    hasMismatch,
    preferredCountry: originalCountry || preferredCountry,
  };
}

/**
 * Select the best CAV phone from a list of contacts
 * Prioritizes: Most frequent phone number
 */
export function selectBestCavPhone(contacts: any[]): string | null {
  // Extract all CAV phones
  const cavPhones = contacts
    .map(extractCavPhone)
    .filter((phone): phone is CavPhone => phone !== null);
  
  if (cavPhones.length === 0) {
    return null;
  }
  
  // Calculate frequency map
  const frequencyMap = new Map<string, number>();
  for (const cavPhone of cavPhones) {
    const normalized = cavPhone.phone.toLowerCase().trim();
    frequencyMap.set(normalized, (frequencyMap.get(normalized) || 0) + 1);
  }
  
  // Find most frequent phone
  let bestPhone: string | null = null;
  let maxFrequency = 0;
  
  for (const [phone, frequency] of Array.from(frequencyMap.entries())) {
    if (frequency > maxFrequency) {
      maxFrequency = frequency;
      bestPhone = phone;
    }
  }
  
  // Return the original casing from the first occurrence
  if (bestPhone) {
    const original = cavPhones.find(
      p => p.phone.toLowerCase().trim() === bestPhone
    );
    return original?.phone || bestPhone;
  }
  
  return null;
}

/**
 * Merge CAV addresses and phones for a single account
 * Conditional: Updates fields that are missing OR have country mismatch
 * Returns true if account was updated
 */
export async function mergeCavAddressForAccount(
  accountId: string,
  campaignId?: string
): Promise<{ updated: boolean; reason: string; updatedFields: string[] }> {
  // Get account
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  
  if (!account) {
    return { updated: false, reason: 'Account not found', updatedFields: [] };
  }
  
  // Get all verification contacts for this account (with same domain)
  let contactsQuery = db
    .select()
    .from(verificationContacts)
    .where(
      and(
        eq(verificationContacts.accountId, accountId),
        eq(verificationContacts.deleted, false)
      )
    );
  
  // Optionally filter by campaign
  if (campaignId) {
    contactsQuery = db
      .select()
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.accountId, accountId),
          eq(verificationContacts.campaignId, campaignId),
          eq(verificationContacts.deleted, false)
        )
      ) as any;
  }
  
  const contacts = await contactsQuery;
  
  if (contacts.length === 0) {
    return { updated: false, reason: 'No contacts found for account', updatedFields: [] };
  }
  
  // Check for country mismatch
  const countryCheck = hasCountryMismatch(account, contacts);
  const preferredCountry = countryCheck.preferredCountry;
  
  // Determine what needs updating
  const addressMissing = !hasHqAddress(account);
  const phoneMissing = !hasMainPhone(account);
  const addressNeedsUpdate = addressMissing || (hasHqAddress(account) && countryCheck.hasMismatch);
  const phoneNeedsUpdate = phoneMissing; // Phone doesn't have country association
  
  if (!addressNeedsUpdate && !phoneNeedsUpdate) {
    return { 
      updated: false, 
      reason: 'Account HQ address and phone match contact country',
      updatedFields: []
    };
  }
  
  // Select best CAV address if needed (MUST match contact country)
  let bestAddress: CavAddress | null = null;
  if (addressNeedsUpdate) {
    bestAddress = selectBestCavAddress(contacts, preferredCountry);
  }
  
  // Select best CAV phone if needed
  let bestPhone: string | null = null;
  if (phoneNeedsUpdate) {
    bestPhone = selectBestCavPhone(contacts);
  }
  
  // Check if we have anything to update
  if (!bestAddress && !bestPhone) {
    return { 
      updated: false, 
      reason: 'No valid CAV addresses or phones found matching contact country',
      updatedFields: []
    };
  }
  
  // Build update object conditionally
  const updates: any = {
    updatedAt: new Date(),
  };
  const updatedFields: string[] = [];
  
  // Update address fields if needed (missing or country mismatch)
  if (addressNeedsUpdate && bestAddress) {
    updates.hqStreet1 = bestAddress.addr1 || null;
    updates.hqStreet2 = bestAddress.addr2 || null;
    updates.hqStreet3 = bestAddress.addr3 || null;
    updates.hqCity = bestAddress.town || null;
    updates.hqState = bestAddress.state || null;
    updates.hqPostalCode = bestAddress.postcode || null;
    // Update country to match contacts
    if (preferredCountry) {
      updates.hqCountry = preferredCountry;
      updatedFields.push('hqCountry');
    }
    updatedFields.push('hqAddress');
  }
  
  // Update phone if it was missing
  if (phoneNeedsUpdate && bestPhone) {
    updates.mainPhone = bestPhone;
    updatedFields.push('mainPhone');
  }
  
  // Update account with merged data
  await db
    .update(accounts)
    .set(updates)
    .where(eq(accounts.id, accountId));
  
  const updateReason = countryCheck.hasMismatch 
    ? `Replaced HQ data with CAV data matching contact country (${preferredCountry})`
    : `Merged CAV data from ${contacts.length} contact(s)`;
  
  return {
    updated: true,
    reason: `${updateReason}: ${updatedFields.join(', ')}`,
    updatedFields,
  };
}

/**
 * Merge CAV addresses and phones for all accounts in a campaign
 * Returns statistics about the merge operation
 */
export async function mergeCavAddressesForCampaign(
  campaignId: string
): Promise<{
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{ accountId: string; accountName: string; result: string; updatedFields: string[] }>;
}> {
  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    details: [] as Array<{ accountId: string; accountName: string; result: string; updatedFields: string[] }>,
  };
  
  console.log(`[CAV Merger] Starting campaign merge for campaign ${campaignId}...`);
  
  // Get all unique account IDs from campaign contacts
  const accountIds = await db
    .selectDistinct({ accountId: verificationContacts.accountId })
    .from(verificationContacts)
    .where(
      and(
        eq(verificationContacts.campaignId, campaignId),
        eq(verificationContacts.deleted, false),
        sql`${verificationContacts.accountId} IS NOT NULL`
      )
    );
  
  console.log(`[CAV Merger] Found ${accountIds.length} accounts to process`);
  
  // Process each account
  for (const { accountId } of accountIds) {
    if (!accountId) continue;
    
    stats.processed++;
    
    try {
      // Get account name for reporting
      const [account] = await db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);
      
      const accountName = account?.name || 'Unknown';
      
      const result = await mergeCavAddressForAccount(accountId, campaignId);
      
      if (result.updated) {
        stats.updated++;
        console.log(`[CAV Merger] ✓ ${accountName}: ${result.updatedFields.join(', ')}`);
      } else {
        stats.skipped++;
      }
      
      stats.details.push({
        accountId,
        accountName,
        result: result.reason,
        updatedFields: result.updatedFields,
      });
    } catch (error) {
      stats.errors++;
      console.error(`[CAV Merger] ✗ Error:`, error);
      stats.details.push({
        accountId,
        accountName: 'Error',
        result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        updatedFields: [],
      });
    }
  }
  
  console.log(`[CAV Merger] Complete: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`);
  
  return stats;
}

/**
 * Merge CAV addresses for all accounts (system-wide)
 * Use with caution - processes entire database
 */
export async function mergeCavAddressesGlobal(
  options: {
    onlyEmptyHq?: boolean; // Only process accounts without HQ addresses
    limit?: number; // Limit number of accounts to process
  } = {}
): Promise<{
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}> {
  const { onlyEmptyHq = true, limit } = options;
  
  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  
  // Get accounts to process
  let accountsQuery = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(isNull(accounts.deletedAt));
  
  if (onlyEmptyHq) {
    accountsQuery = db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(
        and(
          isNull(accounts.deletedAt),
          isNull(accounts.hqStreet1),
          isNull(accounts.hqStreet2),
          isNull(accounts.hqStreet3)
        )
      ) as any;
  }
  
  if (limit) {
    accountsQuery = accountsQuery.limit(limit) as any;
  }
  
  const accountsToProcess = await accountsQuery;
  
  console.log(`[CAV Merger] Processing ${accountsToProcess.length} accounts...`);
  
  // Process each account
  for (const account of accountsToProcess) {
    stats.processed++;
    
    try {
      const result = await mergeCavAddressForAccount(account.id);
      
      if (result.updated) {
        stats.updated++;
        console.log(`[CAV Merger] ✓ Updated ${account.name}: ${result.reason}`);
      } else {
        stats.skipped++;
      }
    } catch (error) {
      stats.errors++;
      console.error(`[CAV Merger] ✗ Error for ${account.name}:`, error);
    }
  }
  
  console.log(`[CAV Merger] Complete: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`);
  
  return stats;
}
