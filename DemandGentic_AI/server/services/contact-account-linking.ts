import { accounts, contacts } from '@shared/schema';
import { extractCompanyNameFromDomain, extractRootDomain, normalizeDomain } from '@shared/domain-utils';
import { and, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { isFreeEmailDomain, normalizeName } from '../normalization';

const ACCOUNT_DOMAIN_INDEX_TTL_MS = 5 * 60 * 1000;
const CONTACT_BATCH_SIZE = 2000;
const UPDATE_BATCH_SIZE = 1000;
const BACKFILL_BATCH_SIZE = 5000;

type AccountDomainRecord = {
  id: string;
  name: string | null;
};

type AccountDomainIndex = {
  loadedAt: number;
  byDomain: Map;
};

type CorporateDomainResolution =
  | { status: 'ok'; domain: string }
  | { status: 'missing_email' | 'invalid_email' | 'free_email' | 'invalid_domain'; domain: null };

export interface ContactAccountLinkStats {
  scannedContacts: number;
  candidateContacts: number;
  linkedToExistingAccounts: number;
  linkedToCreatedAccounts: number;
  createdAccounts: number;
  skippedMissingEmail: number;
  skippedInvalidEmail: number;
  skippedFreeEmailDomain: number;
  skippedInvalidDomain: number;
  unmatchedDomains: number;
}

export interface ContactAccountLinkAudit {
  totalContacts: number;
  contactsWithAccount: number;
  contactsMissingAccount: number;
  missingAccountWithCorporateEmail: number;
  missingAccountMatchableToExistingAccount: number;
  missingAccountRequiringNewAccount: number;
  recentContacts7d: number;
  recentMissingAccount7d: number;
  recentMissingAccountWithCorporateEmail7d: number;
}

let cachedAccountDomainIndex: AccountDomainIndex | null = null;

function chunkArray(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index > {
  const cacheIsFresh =
    !forceRefresh &&
    cachedAccountDomainIndex &&
    Date.now() - cachedAccountDomainIndex.loadedAt ();

  for (const row of rows) {
    const candidates = [
      row.domainNormalized,
      row.websiteDomain,
      row.domain,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeAccountLookupDomain(candidate);
      if (!normalized || byDomain.has(normalized)) {
        continue;
      }

      byDomain.set(normalized, {
        id: row.id,
        name: row.name,
      });
    }
  }

  cachedAccountDomainIndex = {
    loadedAt: Date.now(),
    byDomain,
  };

  return byDomain;
}

export function invalidateAccountDomainIndex(): void {
  cachedAccountDomainIndex = null;
}

async function createAccountsForDomains(domainsToCreate: string[]): Promise;
}> {
  const uniqueDomains = Array.from(new Set(domainsToCreate.filter(Boolean)));

  if (uniqueDomains.length === 0) {
    return {
      createdCount: 0,
      accountIdsByDomain: new Map(),
    };
  }

  const newAccountRows = uniqueDomains.map((domain) => {
    const accountName = extractCompanyNameFromDomain(domain) || domain;

    return {
      name: accountName,
      nameNormalized: normalizeName(accountName),
      domain,
      domainNormalized: domain,
      websiteDomain: domain,
    };
  });

  const insertedAccounts = await db
    .insert(accounts)
    .values(newAccountRows)
    .onConflictDoNothing({ target: accounts.domainNormalized })
    .returning({
      id: accounts.id,
      domainNormalized: accounts.domainNormalized,
    });

  invalidateAccountDomainIndex();
  const refreshedIndex = await getAccountDomainIndex(true);
  const accountIdsByDomain = new Map();

  for (const domain of uniqueDomains) {
    const account = refreshedIndex.get(domain);
    if (account) {
      accountIdsByDomain.set(domain, account.id);
    }
  }

  return {
    createdCount: insertedAccounts.length,
    accountIdsByDomain,
  };
}

async function updateContactAccountIds(
  updates: Array,
): Promise {
  for (const chunk of chunkArray(updates, UPDATE_BATCH_SIZE)) {
    const values = chunk.map(({ contactId, accountId }) => sql`(${contactId}::varchar, ${accountId}::varchar)`);

    await db.execute(sql`
      UPDATE contacts AS c
      SET
        account_id = v.account_id,
        updated_at = NOW()
      FROM (
        VALUES ${sql.join(values, sql`, `)}
      ) AS v(contact_id, account_id)
      WHERE c.id = v.contact_id
        AND c.account_id IS NULL
    `);
  }
}

export async function linkContactsToAccountsByDomain(
  contactIds: string[],
): Promise {
  const uniqueContactIds = Array.from(new Set(contactIds.filter(Boolean)));
  const stats: ContactAccountLinkStats = {
    scannedContacts: uniqueContactIds.length,
    candidateContacts: 0,
    linkedToExistingAccounts: 0,
    linkedToCreatedAccounts: 0,
    createdAccounts: 0,
    skippedMissingEmail: 0,
    skippedInvalidEmail: 0,
    skippedFreeEmailDomain: 0,
    skippedInvalidDomain: 0,
    unmatchedDomains: 0,
  };

  if (uniqueContactIds.length === 0) {
    return stats;
  }

  const candidateContacts: Array = [];

  for (const chunk of chunkArray(uniqueContactIds, CONTACT_BATCH_SIZE)) {
    const rows = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        emailNormalized: contacts.emailNormalized,
      })
      .from(contacts)
      .where(
        and(
          inArray(contacts.id, chunk),
          isNull(contacts.accountId),
          isNull(contacts.deletedAt),
        ),
      );

    candidateContacts.push(...rows);
  }

  stats.candidateContacts = candidateContacts.length;

  const contactsByDomain = new Map();

  for (const contact of candidateContacts) {
    const resolution = resolveCorporateEmailDomain(contact.emailNormalized || contact.email);

    if (resolution.status !== 'ok') {
      if (resolution.status === 'missing_email') stats.skippedMissingEmail++;
      if (resolution.status === 'invalid_email') stats.skippedInvalidEmail++;
      if (resolution.status === 'free_email') stats.skippedFreeEmailDomain++;
      if (resolution.status === 'invalid_domain') stats.skippedInvalidDomain++;
      continue;
    }

    const existing = contactsByDomain.get(resolution.domain) || [];
    existing.push(contact.id);
    contactsByDomain.set(resolution.domain, existing);
  }

  if (contactsByDomain.size === 0) {
    return stats;
  }

  const accountIndex = await getAccountDomainIndex();
  const accountIdsByDomain = new Map();
  const missingDomains: string[] = [];

  for (const domain of contactsByDomain.keys()) {
    const existingAccount = accountIndex.get(domain);
    if (existingAccount) {
      accountIdsByDomain.set(domain, existingAccount.id);
    } else {
      missingDomains.push(domain);
    }
  }

  if (missingDomains.length > 0) {
    const created = await createAccountsForDomains(missingDomains);
    stats.createdAccounts += created.createdCount;

    for (const [domain, accountId] of created.accountIdsByDomain) {
      accountIdsByDomain.set(domain, accountId);
    }
  }

  const updates: Array = [];

  for (const [domain, ids] of contactsByDomain) {
    const accountId = accountIdsByDomain.get(domain);

    if (!accountId) {
      stats.unmatchedDomains++;
      continue;
    }

    const matchedExistingAccount = accountIndex.has(domain);
    if (matchedExistingAccount) {
      stats.linkedToExistingAccounts += ids.length;
    } else {
      stats.linkedToCreatedAccounts += ids.length;
    }

    for (const contactId of ids) {
      updates.push({ contactId, accountId });
    }
  }

  if (updates.length > 0) {
    await updateContactAccountIds(updates);
  }

  return stats;
}

async function collectMissingAccountContacts(): Promise> {
  return db
    .select({
      id: contacts.id,
      email: contacts.email,
      emailNormalized: contacts.emailNormalized,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(isNull(contacts.accountId), isNull(contacts.deletedAt)));
}

export async function auditContactAccountLinks(): Promise {
  const summaryResult = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_contacts,
      COUNT(account_id)::int AS contacts_with_account,
      COUNT(*) FILTER (WHERE account_id IS NULL AND deleted_at IS NULL)::int AS contacts_missing_account,
      COUNT(*) FILTER (
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND deleted_at IS NULL
      )::int AS recent_contacts_7d,
      COUNT(*) FILTER (
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND account_id IS NULL
          AND deleted_at IS NULL
      )::int AS recent_missing_account_7d
    FROM contacts
  `);

  const [summaryRow] = summaryResult.rows as Array;

  const missingContacts = await collectMissingAccountContacts();
  const accountIndex = await getAccountDomainIndex();

  let missingAccountWithCorporateEmail = 0;
  let missingAccountMatchableToExistingAccount = 0;
  let missingAccountRequiringNewAccount = 0;
  let recentMissingAccountWithCorporateEmail7d = 0;

  for (const contact of missingContacts) {
    const resolution = resolveCorporateEmailDomain(contact.emailNormalized || contact.email);
    if (resolution.status !== 'ok') {
      continue;
    }

    missingAccountWithCorporateEmail++;

    const isRecent = contact.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (isRecent) {
      recentMissingAccountWithCorporateEmail7d++;
    }

    if (accountIndex.has(resolution.domain)) {
      missingAccountMatchableToExistingAccount++;
    } else {
      missingAccountRequiringNewAccount++;
    }
  }

  return {
    totalContacts: summaryRow?.total_contacts ?? 0,
    contactsWithAccount: summaryRow?.contacts_with_account ?? 0,
    contactsMissingAccount: summaryRow?.contacts_missing_account ?? 0,
    missingAccountWithCorporateEmail,
    missingAccountMatchableToExistingAccount,
    missingAccountRequiringNewAccount,
    recentContacts7d: summaryRow?.recent_contacts_7d ?? 0,
    recentMissingAccount7d: summaryRow?.recent_missing_account_7d ?? 0,
    recentMissingAccountWithCorporateEmail7d,
  };
}

export async function backfillMissingContactAccountLinks(options?: {
  batchSize?: number;
  maxContacts?: number;
}): Promise {
  const batchSize = options?.batchSize && options.batchSize > 0
    ? options.batchSize
    : BACKFILL_BATCH_SIZE;

  let idQuery = db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(isNull(contacts.accountId), isNull(contacts.deletedAt)));

  if (options?.maxContacts && options.maxContacts > 0) {
    idQuery = idQuery.limit(options.maxContacts);
  }

  const idRows = await idQuery;

  const stats: ContactAccountLinkStats = {
    scannedContacts: 0,
    candidateContacts: 0,
    linkedToExistingAccounts: 0,
    linkedToCreatedAccounts: 0,
    createdAccounts: 0,
    skippedMissingEmail: 0,
    skippedInvalidEmail: 0,
    skippedFreeEmailDomain: 0,
    skippedInvalidDomain: 0,
    unmatchedDomains: 0,
  };

  for (const chunk of chunkArray(idRows.map((row) => row.id), batchSize)) {
    const chunkStats = await linkContactsToAccountsByDomain(chunk);
    stats.scannedContacts += chunkStats.scannedContacts;
    stats.candidateContacts += chunkStats.candidateContacts;
    stats.linkedToExistingAccounts += chunkStats.linkedToExistingAccounts;
    stats.linkedToCreatedAccounts += chunkStats.linkedToCreatedAccounts;
    stats.createdAccounts += chunkStats.createdAccounts;
    stats.skippedMissingEmail += chunkStats.skippedMissingEmail;
    stats.skippedInvalidEmail += chunkStats.skippedInvalidEmail;
    stats.skippedFreeEmailDomain += chunkStats.skippedFreeEmailDomain;
    stats.skippedInvalidDomain += chunkStats.skippedInvalidDomain;
    stats.unmatchedDomains += chunkStats.unmatchedDomains;
  }

  return stats;
}