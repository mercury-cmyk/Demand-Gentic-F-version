import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  campaignSuppressionAccounts, 
  campaignSuppressionContacts,
  campaignSuppressionEmails,
  campaignSuppressionDomains,
  accounts,
  contacts,
  campaigns,
  agentQueue,
  insertCampaignSuppressionAccountSchema,
  insertCampaignSuppressionContactSchema,
  insertCampaignSuppressionEmailSchema,
  insertCampaignSuppressionDomainSchema,
  type CampaignSuppressionAccount,
  type CampaignSuppressionContact,
  type CampaignSuppressionEmail,
  type CampaignSuppressionDomain
} from '../../shared/schema';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as csv from 'fast-csv';
import { Readable } from 'stream';
import { normalizeDomain, normalizeCompanyName } from '../lib/campaign-suppression';
import {
  parseCSVStream,
  normalizeCompanyName as csvNormalizeCompanyName,
  extractDomain,
  isValidEmail,
  hasCSVHeaders,
  createCSVUploadResponse,
  createCSVErrorResponse,
} from '../lib/csv-utils';

const router = Router();

// ============================================================================
// CAMPAIGN SUPPRESSION - ACCOUNTS
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/suppressions/accounts
 * List all suppressed accounts for a campaign with account details
 */
router.get('/:campaignId/suppressions/accounts', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = '100', offset = '0' } = req.query;

    const suppressions = await db
      .select({
        id: campaignSuppressionAccounts.id,
        campaignId: campaignSuppressionAccounts.campaignId,
        accountId: campaignSuppressionAccounts.accountId,
        reason: campaignSuppressionAccounts.reason,
        addedBy: campaignSuppressionAccounts.addedBy,
        createdAt: campaignSuppressionAccounts.createdAt,
        accountName: accounts.name,
        accountDomain: accounts.domain,
        accountIndustry: accounts.industryStandardized,
      })
      .from(campaignSuppressionAccounts)
      .leftJoin(accounts, eq(campaignSuppressionAccounts.accountId, accounts.id))
      .where(eq(campaignSuppressionAccounts.campaignId, campaignId))
      .orderBy(campaignSuppressionAccounts.createdAt)
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(campaignSuppressionAccounts)
      .where(eq(campaignSuppressionAccounts.campaignId, campaignId));

    res.json({
      data: suppressions,
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching campaign account suppressions:', error);
    res.status(500).json({ error: 'Failed to fetch campaign account suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/accounts
 * Add account(s) to campaign suppression list
 * Body: { accountIds: string[], reason?: string }
 */
router.post('/:campaignId/suppressions/accounts', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    
    const bodySchema = z.object({
      accountIds: z.array(z.string()).min(1),
      reason: z.string().optional(),
    });

    const { accountIds, reason } = bodySchema.parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Validate accounts exist
    // Batch to avoid PostgreSQL parameter limits
    const existingAccounts: any[] = [];
    const BATCH_SIZE = 500;
    for (let i = 0; i  ({
      campaignId,
      accountId,
      reason: reason || 'Added via campaign suppression',
      addedBy: userId,
    }));

    const inserted = await db
      .insert(campaignSuppressionAccounts)
      .values(suppressionsToInsert)
      .onConflictDoNothing({
        target: [campaignSuppressionAccounts.campaignId, campaignSuppressionAccounts.accountId]
      })
      .returning();

    res.status(201).json({
      message: `Added ${inserted.length} account(s) to campaign suppression list`,
      added: inserted.length,
      skipped: accountIds.length - inserted.length,
      data: inserted,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error adding campaign account suppressions:', error);
    res.status(500).json({ error: 'Failed to add campaign account suppressions' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/suppressions/accounts/:id
 * Remove an account from campaign suppression list
 */
router.delete('/:campaignId/suppressions/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const deleted = await db
      .delete(campaignSuppressionAccounts)
      .where(
        and(
          eq(campaignSuppressionAccounts.id, id),
          eq(campaignSuppressionAccounts.campaignId, campaignId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Suppression record not found' });
    }

    res.status(200).json({ message: 'Account removed from campaign suppression list' });
  } catch (error) {
    console.error('Error deleting campaign account suppression:', error);
    res.status(500).json({ error: 'Failed to delete campaign account suppression' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/suppressions/accounts/bulk
 * Remove multiple accounts from campaign suppression list
 * Body: { ids: string[] }
 */
router.delete('/:campaignId/suppressions/accounts/bulk', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);

    const deleted = await db
      .delete(campaignSuppressionAccounts)
      .where(
        and(
          inArray(campaignSuppressionAccounts.id, ids),
          eq(campaignSuppressionAccounts.campaignId, campaignId)
        )
      )
      .returning();

    res.status(200).json({ 
      message: `Removed ${deleted.length} account(s) from campaign suppression list`,
      deleted: deleted.length 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error bulk deleting campaign account suppressions:', error);
    res.status(500).json({ error: 'Failed to bulk delete campaign account suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/accounts/upload
 * Upload CSV file with accounts to suppress (supports account_id, domain, or company_name columns)
 * Body: { csvContent: string }
 */
router.post('/:campaignId/suppressions/accounts/upload', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    const { csvContent } = z.object({ csvContent: z.string() }).parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse CSV - flexible parsing to handle various formats
    const accountIdentifiers: Array = [];
    const stream = Readable.from([csvContent]);

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv.parse({ headers: false, trim: true, skipEmptyLines: true }))
        .on('data', (row: string[]) => {
          // Skip header row if it looks like a header
          const firstCol = row[0]?.toLowerCase() || '';
          if (firstCol.includes('account') || firstCol.includes('domain') || firstCol.includes('company') || firstCol.includes('id')) {
            return; // Skip header row
          }

          // Process data rows - intelligently detect type
          const col1 = row[0]?.trim();
          if (!col1) return; // Skip empty rows

          // Check if it's a UUID (account ID)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(col1)) {
            accountIdentifiers.push({ type: 'id', value: col1 });
          } 
          // Check if it's a domain (contains dot and looks like domain)
          else if (col1.includes('.') && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(col1.replace(/^www\./i, ''))) {
            accountIdentifiers.push({ type: 'domain', value: col1.toLowerCase() });
          }
          // Otherwise treat as company name
          else {
            accountIdentifiers.push({ type: 'company', value: col1 });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (accountIdentifiers.length === 0) {
      return res.status(400).json({ 
        error: 'No valid identifiers found in CSV. CSV must have "account_id", "domain", or "company_name" column.' 
      });
    }

    // Find matching accounts - OPTIMIZED with bulk queries
    const matchedAccountIds = new Set();

    // Match by account ID (bulk query)
    const directIds = accountIdentifiers.filter(i => i.type === 'id').map(i => i.value);
    if (directIds.length > 0) {
      // Batch to avoid parameter limits
      const BATCH_SIZE = 500;
      for (let i = 0; i  matchedAccountIds.add(a.id));
      }
    }

    // Match by domain (bulk query with case-insensitive OR conditions)
    // FIXED: Use normalizeDomain() to match with same normalization as suppression checking
    const domains = accountIdentifiers
      .filter(i => i.type === 'domain')
      .map(i => normalizeDomain(i.value))
      .filter((d): d is string => d !== null);
    if (domains.length > 0) {
      // Build OR conditions matching normalized domains
      // Normalize account domains on-the-fly for comparison
      const domainConditions = domains.map(domain => {
        // Match using normalized domain comparison
        return sql`
          LOWER(REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(${accounts.domain}, '^https?://', '', 'i'),
              '^www\\.', '', 'i'
            ),
            '/$', '', 'i'
          )) = ${domain}
        `;
      });
      const found = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(or(...domainConditions));
      found.forEach(a => matchedAccountIds.add(a.id));
    }

    // Match by company name (bulk query with case-insensitive OR conditions)
    // FIXED: Use normalizeCompanyName() to match with same normalization as suppression checking
    const companyNames = accountIdentifiers
      .filter(i => i.type === 'company')
      .map(i => normalizeCompanyName(i.value))
      .filter((n): n is string => n !== null);
    if (companyNames.length > 0) {
      // Build OR conditions matching normalized company names
      // Normalize account names on-the-fly for comparison (removes suffixes like Inc, LLC, etc.)
      const nameConditions = companyNames.map(name => {
        // Match using normalized company name (same logic as normalizeCompanyName function)
        return sql`
          TRIM(REGEXP_REPLACE(
            LOWER(${accounts.name}),
            '\\s+(inc\\.?|incorporated|ltd\\.?|limited|llc|l\\.l\\.c\\.?|corp\\.?|corporation|co\\.?|company|plc|p\\.l\\.c\\.?|gmbh|ag|s\\.a\\.?|bv|nv)$',
            '',
            'i'
          )) = ${name}
        `;
      });
      const found = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(or(...nameConditions));
      found.forEach(a => matchedAccountIds.add(a.id));
    }

    if (matchedAccountIds.size === 0) {
      return res.status(400).json({ 
        error: 'No matching accounts found in database for the provided identifiers.' 
      });
    }

    // Insert suppressions
    const suppressionsToInsert = Array.from(matchedAccountIds).map(accountId => ({
      campaignId,
      accountId,
      reason: 'CSV bulk upload',
      addedBy: userId,
    }));

    const inserted = await db
      .insert(campaignSuppressionAccounts)
      .values(suppressionsToInsert)
      .onConflictDoNothing({
        target: [campaignSuppressionAccounts.campaignId, campaignSuppressionAccounts.accountId]
      })
      .returning();

    res.status(201).json({
      message: `Successfully processed CSV upload`,
      totalIdentifiers: accountIdentifiers.length,
      matchedAccounts: matchedAccountIds.size,
      added: inserted.length,
      duplicates: matchedAccountIds.size - inserted.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error uploading campaign account suppressions:', error);
    res.status(500).json({ error: 'Failed to upload campaign account suppressions' });
  }
});

// ============================================================================
// CAMPAIGN SUPPRESSION - CONTACTS
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/suppressions/contacts
 * List all suppressed contacts for a campaign with contact details
 */
router.get('/:campaignId/suppressions/contacts', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = '100', offset = '0' } = req.query;

    const suppressions = await db
      .select({
        id: campaignSuppressionContacts.id,
        campaignId: campaignSuppressionContacts.campaignId,
        contactId: campaignSuppressionContacts.contactId,
        reason: campaignSuppressionContacts.reason,
        addedBy: campaignSuppressionContacts.addedBy,
        createdAt: campaignSuppressionContacts.createdAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhone,
        contactAccountId: contacts.accountId,
      })
      .from(campaignSuppressionContacts)
      .leftJoin(contacts, eq(campaignSuppressionContacts.contactId, contacts.id))
      .where(eq(campaignSuppressionContacts.campaignId, campaignId))
      .orderBy(campaignSuppressionContacts.createdAt)
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(campaignSuppressionContacts)
      .where(eq(campaignSuppressionContacts.campaignId, campaignId));

    res.json({
      data: suppressions,
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching campaign contact suppressions:', error);
    res.status(500).json({ error: 'Failed to fetch campaign contact suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/contacts
 * Add contact(s) to campaign suppression list
 * Body: { contactIds: string[], reason?: string }
 */
router.post('/:campaignId/suppressions/contacts', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    
    const bodySchema = z.object({
      contactIds: z.array(z.string()).min(1),
      reason: z.string().optional(),
    });

    const { contactIds, reason } = bodySchema.parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Validate contacts exist
    // Batch to avoid PostgreSQL parameter limits
    const existingContacts: any[] = [];
    const BATCH_SIZE = 500;
    for (let i = 0; i  ({
      campaignId,
      contactId,
      reason: reason || 'Added via campaign suppression',
      addedBy: userId,
    }));

    const inserted = await db
      .insert(campaignSuppressionContacts)
      .values(suppressionsToInsert)
      .onConflictDoNothing({
        target: [campaignSuppressionContacts.campaignId, campaignSuppressionContacts.contactId]
      })
      .returning();

    res.status(201).json({
      message: `Added ${inserted.length} contact(s) to campaign suppression list`,
      added: inserted.length,
      skipped: contactIds.length - inserted.length,
      data: inserted,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error adding campaign contact suppressions:', error);
    res.status(500).json({ error: 'Failed to add campaign contact suppressions' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/suppressions/contacts/:id
 * Remove a contact from campaign suppression list
 */
router.delete('/:campaignId/suppressions/contacts/:id', async (req: Request, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const deleted = await db
      .delete(campaignSuppressionContacts)
      .where(
        and(
          eq(campaignSuppressionContacts.id, id),
          eq(campaignSuppressionContacts.campaignId, campaignId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Suppression record not found' });
    }

    res.status(200).json({ message: 'Contact removed from campaign suppression list' });
  } catch (error) {
    console.error('Error deleting campaign contact suppression:', error);
    res.status(500).json({ error: 'Failed to delete campaign contact suppression' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/suppressions/contacts/bulk
 * Remove multiple contacts from campaign suppression list
 * Body: { ids: string[] }
 */
router.delete('/:campaignId/suppressions/contacts/bulk', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);

    const deleted = await db
      .delete(campaignSuppressionContacts)
      .where(
        and(
          inArray(campaignSuppressionContacts.id, ids),
          eq(campaignSuppressionContacts.campaignId, campaignId)
        )
      )
      .returning();

    res.status(200).json({ 
      message: `Removed ${deleted.length} contact(s) from campaign suppression list`,
      deleted: deleted.length 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error bulk deleting campaign contact suppressions:', error);
    res.status(500).json({ error: 'Failed to bulk delete campaign contact suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/contacts/upload
 * Upload CSV file with contacts to suppress (supports contact_id or email columns)
 * Body: { csvContent: string }
 */
router.post('/:campaignId/suppressions/contacts/upload', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    const { csvContent } = z.object({ csvContent: z.string() }).parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse CSV
    const contactIdentifiers: Array = [];
    const stream = Readable.from([csvContent]);

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv.parse({ headers: true, trim: true }))
        .on('data', (row: any) => {
          // Try to extract contact identifier from various column names
          const contactId = row.contact_id || row.contactId || row.ContactID || row['Contact ID'];
          const email = row.email || row.Email || row.EMAIL || 
                       row['e-mail'] || row['E-mail'] || row['E-Mail'] ||
                       row['Email Address'] || row['email_address'];

          if (contactId && typeof contactId === 'string') {
            contactIdentifiers.push({ type: 'id', value: contactId.trim() });
          } else if (email && typeof email === 'string') {
            const trimmedEmail = email.trim().toLowerCase();
            // Basic email validation
            if (trimmedEmail.includes('@') && trimmedEmail.includes('.')) {
              contactIdentifiers.push({ type: 'email', value: trimmedEmail });
            }
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (contactIdentifiers.length === 0) {
      return res.status(400).json({ 
        error: 'No valid identifiers found in CSV. CSV must have "contact_id" or "email" column.' 
      });
    }

    // Find matching contacts
    const matchedContactIds = new Set();

    // Match by contact ID (batch to avoid parameter limits)
    const directIds = contactIdentifiers.filter(i => i.type === 'id').map(i => i.value);
    if (directIds.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i  matchedContactIds.add(c.id));
      }
    }

    // Match by email (batch to avoid parameter limits)
    const emails = contactIdentifiers.filter(i => i.type === 'email').map(i => i.value);
    if (emails.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i  matchedContactIds.add(c.id));
      }
    }

    if (matchedContactIds.size === 0) {
      return res.status(400).json({ 
        error: 'No matching contacts found in database for the provided identifiers.' 
      });
    }

    // Insert suppressions
    const suppressionsToInsert = Array.from(matchedContactIds).map(contactId => ({
      campaignId,
      contactId,
      reason: 'CSV bulk upload',
      addedBy: userId,
    }));

    const inserted = await db
      .insert(campaignSuppressionContacts)
      .values(suppressionsToInsert)
      .onConflictDoNothing({
        target: [campaignSuppressionContacts.campaignId, campaignSuppressionContacts.contactId]
      })
      .returning();

    res.status(201).json({
      message: `Successfully processed CSV upload`,
      totalIdentifiers: contactIdentifiers.length,
      matchedContacts: matchedContactIds.size,
      added: inserted.length,
      duplicates: matchedContactIds.size - inserted.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error uploading campaign contact suppressions:', error);
    res.status(500).json({ error: 'Failed to upload campaign contact suppressions' });
  }
});

/**
 * GET /api/campaigns/:campaignId/suppressions/stats
 * Get suppression match statistics for campaign queue
 * Returns counts of how many queue contacts match suppression lists
 */
router.get('/:campaignId/suppressions/stats', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get all contacts in campaign agent queue (for manual dial) or campaign queue (for power dial)
    const queueContacts = await db
      .select({
        contactId: agentQueue.contactId,
        accountId: agentQueue.accountId,
      })
      .from(agentQueue)
      .where(eq(agentQueue.campaignId, campaignId));

    if (queueContacts.length === 0) {
      return res.json({
        totalContacts: 0,
        suppressedByAccount: 0,
        suppressedByContact: 0,
        suppressedByDomain: 0,
        suppressedByEmail: 0,
        totalSuppressed: 0,
        suppressionRate: 0,
      });
    }

    const contactIds = queueContacts.map(c => c.contactId);
    const accountIds = Array.from(new Set(queueContacts.map(c => c.accountId)));

    // Get contacts with their account data for domain/email matching (batch to avoid parameter limits)
    const contactsWithAccounts: any[] = [];
    const BATCH_SIZE = 500;
    for (let i = 0; i ();
    if (accountIds.length > 0) {
      for (let i = 0; i  suppressedAccountIds.add(s.accountId));
      }
    }

    // Check contact suppressions (batch to avoid parameter limits)
    const suppressedContactIds = new Set();
    for (let i = 0; i  suppressedContactIds.add(s.contactId));
    }

    // Check domain suppressions
    const allDomains = contactsWithAccounts
      .map(c => c.accountDomain?.toLowerCase())
      .filter(d => d) as string[];
    
    const suppressedDomains = new Set();
    if (allDomains.length > 0) {
      const domainSuppressions = await db
        .select({ domainNorm: campaignSuppressionDomains.domainNorm })
        .from(campaignSuppressionDomains)
        .where(eq(campaignSuppressionDomains.campaignId, campaignId));
      
      domainSuppressions.forEach(s => suppressedDomains.add(s.domainNorm));
    }

    // Check email suppressions
    const allEmails = contactsWithAccounts
      .map(c => c.email?.toLowerCase())
      .filter(e => e) as string[];
    
    const suppressedEmails = new Set();
    if (allEmails.length > 0) {
      const emailSuppressions = await db
        .select({ emailNorm: campaignSuppressionEmails.emailNorm })
        .from(campaignSuppressionEmails)
        .where(eq(campaignSuppressionEmails.campaignId, campaignId));
      
      emailSuppressions.forEach(s => suppressedEmails.add(s.emailNorm));
    }

    // Calculate matches
    const totalSuppressedContacts = new Set();
    let suppressedByAccount = 0;
    let suppressedByContact = 0;
    let suppressedByDomain = 0;
    let suppressedByEmail = 0;

    for (const contact of contactsWithAccounts) {
      let isSuppressed = false;

      // Check account suppression
      if (contact.accountId && suppressedAccountIds.has(contact.accountId)) {
        suppressedByAccount++;
        isSuppressed = true;
      }

      // Check contact suppression
      if (suppressedContactIds.has(contact.contactId)) {
        suppressedByContact++;
        isSuppressed = true;
      }

      // Check domain suppression
      if (contact.accountDomain) {
        const domainNorm = contact.accountDomain.toLowerCase().replace(/^www\./, '');
        if (suppressedDomains.has(domainNorm)) {
          suppressedByDomain++;
          isSuppressed = true;
        }
      }

      // Check email suppression
      if (contact.email) {
        const emailNorm = contact.email.toLowerCase();
        if (suppressedEmails.has(emailNorm)) {
          suppressedByEmail++;
          isSuppressed = true;
        }
      }

      if (isSuppressed) {
        totalSuppressedContacts.add(contact.contactId);
      }
    }

    const totalContacts = queueContacts.length;
    const totalSuppressed = totalSuppressedContacts.size;
    const suppressionRate = totalContacts > 0 ? totalSuppressed / totalContacts : 0;

    res.json({
      totalContacts,
      suppressedByAccount,
      suppressedByContact,
      suppressedByDomain,
      suppressedByEmail,
      totalSuppressed,
      suppressionRate,
    });
  } catch (error) {
    console.error('Error calculating suppression stats:', error);
    res.status(500).json({ error: 'Failed to calculate suppression statistics' });
  }
});

/**
 * GET /api/campaigns/:campaignId/suppressions/check
 * Check if specific accounts or contacts are suppressed for a campaign
 * Query: ?accountIds=id1,id2&contactIds=id3,id4
 */
router.get('/:campaignId/suppressions/check', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { accountIds, contactIds } = req.query;

    const result: {
      suppressedAccounts: string[];
      suppressedContacts: string[];
    } = {
      suppressedAccounts: [],
      suppressedContacts: [],
    };

    // Check account suppressions (batch to avoid parameter limits)
    if (accountIds && typeof accountIds === 'string') {
      const accountIdArray = accountIds.split(',').filter(Boolean);
      if (accountIdArray.length > 0) {
        const BATCH_SIZE = 500;
        const allSuppressed: any[] = [];
        for (let i = 0; i  s.accountId);
      }
    }

    // Check contact suppressions (batch to avoid parameter limits)
    if (contactIds && typeof contactIds === 'string') {
      const contactIdArray = contactIds.split(',').filter(Boolean);
      if (contactIdArray.length > 0) {
        const BATCH_SIZE = 500;
        const allSuppressed: any[] = [];
        for (let i = 0; i  s.contactId);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error checking campaign suppressions:', error);
    res.status(500).json({ error: 'Failed to check campaign suppressions' });
  }
});

// ============================================================================
// CAMPAIGN SUPPRESSION - EMAILS
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/suppressions/emails
 * List all suppressed emails for a campaign
 */
router.get('/:campaignId/suppressions/emails', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = '100', offset = '0' } = req.query;

    const suppressions = await db
      .select()
      .from(campaignSuppressionEmails)
      .where(eq(campaignSuppressionEmails.campaignId, campaignId))
      .orderBy(campaignSuppressionEmails.createdAt)
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(campaignSuppressionEmails)
      .where(eq(campaignSuppressionEmails.campaignId, campaignId));

    res.json({
      data: suppressions,
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching campaign email suppressions:', error);
    res.status(500).json({ error: 'Failed to fetch campaign email suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/emails
 * Add email(s) to campaign suppression list
 * Body: { emails: string[], reason?: string }
 */
router.post('/:campaignId/suppressions/emails', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    
    const bodySchema = z.object({
      emails: z.array(z.string().email()).min(1),
      reason: z.string().optional(),
    });

    const { emails, reason } = bodySchema.parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Prepare suppression entries
    const suppressionEntries = emails.map(email => ({
      campaignId,
      email,
      emailNorm: email.toLowerCase().trim(),
      reason: reason || 'Manually added',
      addedBy: userId,
    }));

    // Insert suppressions (ignore duplicates)
    const inserted = await db
      .insert(campaignSuppressionEmails)
      .values(suppressionEntries)
      .onConflictDoNothing()
      .returning();

    res.status(201).json({
      message: `Added ${inserted.length} email(s) to campaign suppression list`,
      added: inserted.length,
      duplicates: emails.length - inserted.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error adding campaign email suppressions:', error);
    res.status(500).json({ error: 'Failed to add campaign email suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/emails/upload
 * Upload CSV file with emails to suppress
 * Expects multipart/form-data with 'file' field containing CSV
 */
router.post('/:campaignId/suppressions/emails/upload', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse CSV from request body (assuming it's sent as text/csv or multipart)
    const csvContent = req.body.csvContent || req.body;
    
    if (typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'CSV content must be provided as string' });
    }

    // Parse CSV and extract emails
    const emails: string[] = [];
    const stream = Readable.from([csvContent]);
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv.parse({ headers: true, trim: true }))
        .on('data', (row: any) => {
          // Try to find email column (common headers: email, Email, EMAIL, e-mail, etc.)
          const email = row.email || row.Email || row.EMAIL || 
                       row['e-mail'] || row['E-mail'] || row['E-Mail'] ||
                       row['Email Address'] || row['email_address'];
          
          if (email && typeof email === 'string') {
            const trimmedEmail = email.trim().toLowerCase();
            // Basic email validation
            if (trimmedEmail.includes('@') && trimmedEmail.includes('.')) {
              emails.push(trimmedEmail);
            }
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (emails.length === 0) {
      return res.status(400).json({ 
        error: 'No valid emails found in CSV. Ensure CSV has an "email" column.' 
      });
    }

    // Remove duplicates
    const uniqueEmails = [...new Set(emails)];

    // Prepare suppression entries
    const suppressionEntries = uniqueEmails.map(email => ({
      campaignId,
      email,
      emailNorm: email.toLowerCase().trim(),
      reason: 'CSV bulk upload',
      addedBy: userId,
    }));

    // Insert suppressions (ignore duplicates)
    const inserted = await db
      .insert(campaignSuppressionEmails)
      .values(suppressionEntries)
      .onConflictDoNothing()
      .returning();

    res.status(201).json({
      message: `Successfully processed CSV upload`,
      totalInFile: emails.length,
      uniqueEmails: uniqueEmails.length,
      added: inserted.length,
      duplicates: uniqueEmails.length - inserted.length,
    });
  } catch (error) {
    console.error('Error uploading campaign email suppressions:', error);
    res.status(500).json({ error: 'Failed to upload campaign email suppressions' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/suppressions/emails/:id
 * Remove email from campaign suppression list
 */
router.delete('/:campaignId/suppressions/emails/:id', async (req: Request, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const deleted = await db
      .delete(campaignSuppressionEmails)
      .where(
        and(
          eq(campaignSuppressionEmails.campaignId, campaignId),
          eq(campaignSuppressionEmails.id, id)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Suppression entry not found' });
    }

    res.status(200).json({ 
      message: 'Email removed from campaign suppression list',
      deleted: deleted[0]
    });
  } catch (error) {
    console.error('Error deleting campaign email suppression:', error);
    res.status(500).json({ error: 'Failed to delete campaign email suppression' });
  }
});

// ============================================================================
// CAMPAIGN SUPPRESSION - DOMAINS
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/suppressions/domains
 * List all suppressed domains for a campaign
 */
router.get('/:campaignId/suppressions/domains', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = '100', offset = '0' } = req.query;

    const suppressions = await db
      .select()
      .from(campaignSuppressionDomains)
      .where(eq(campaignSuppressionDomains.campaignId, campaignId))
      .orderBy(campaignSuppressionDomains.createdAt)
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    // Get total count
    const [{ count }] = await db
      .select({ count: sql`count(*)` })
      .from(campaignSuppressionDomains)
      .where(eq(campaignSuppressionDomains.campaignId, campaignId));

    res.json({
      data: suppressions,
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching campaign domain suppressions:', error);
    res.status(500).json({ error: 'Failed to fetch campaign domain suppressions' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/domains
 * Add domain(s)/company(s) to campaign suppression list
 * Body: { domains: string[], companyNames?: string[], reason?: string }
 */
router.post('/:campaignId/suppressions/domains', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    
    const bodySchema = z.object({
      domains: z.array(z.string()).min(1).optional(),
      companyNames: z.array(z.string()).min(1).optional(),
      reason: z.string().optional(),
    }).refine(data => data.domains || data.companyNames, {
      message: 'Either domains or companyNames must be provided',
    });

    const { domains = [], companyNames = [], reason } = bodySchema.parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const suppressionEntries = [];

    // Add domains
    for (const domain of domains) {
      const domainNorm = domain.toLowerCase().trim().replace(/^www\./, '');
      suppressionEntries.push({
        campaignId,
        domain,
        domainNorm,
        companyName: null,
        reason: reason || 'Manually added',
        addedBy: userId,
      });
    }

    // Add company names (as domains)
    for (const companyName of companyNames) {
      // Normalize company name to use as domain-like identifier
      const companyNorm = companyName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      suppressionEntries.push({
        campaignId,
        domain: companyName,
        domainNorm: companyNorm,
        companyName,
        reason: reason || 'Manually added',
        addedBy: userId,
      });
    }

    // Insert suppressions (ignore duplicates)
    const inserted = await db
      .insert(campaignSuppressionDomains)
      .values(suppressionEntries)
      .onConflictDoNothing()
      .returning();

    res.status(201).json({
      message: `Added ${inserted.length} domain(s)/company(s) to campaign suppression list`,
      added: inserted.length,
      duplicates: suppressionEntries.length - inserted.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error adding campaign domain suppressions:', error);
    res.status(500).json({ error: 'Failed to add campaign domain suppressions' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/suppressions/domains/:id
 * Remove domain from campaign suppression list
 */
router.delete('/:campaignId/suppressions/domains/:id', async (req: Request, res: Response) => {
  try {
    const { campaignId, id } = req.params;

    const deleted = await db
      .delete(campaignSuppressionDomains)
      .where(
        and(
          eq(campaignSuppressionDomains.campaignId, campaignId),
          eq(campaignSuppressionDomains.id, id)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Suppression entry not found' });
    }

    res.status(200).json({ 
      message: 'Domain removed from campaign suppression list',
      deleted: deleted[0]
    });
  } catch (error) {
    console.error('Error deleting campaign domain suppression:', error);
    res.status(500).json({ error: 'Failed to delete campaign domain suppression' });
  }
});

/**
 * POST /api/campaigns/:campaignId/suppressions/domains/upload
 * Upload CSV file with domains/companies to suppress (supports domain or company_name columns)
 * Body: { csvContent: string }
 */
router.post('/:campaignId/suppressions/domains/upload', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;
    const { csvContent } = z.object({ csvContent: z.string() }).parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse CSV - flexible parsing to handle various formats
    const domainEntries: Array = [];
    const stream = Readable.from([csvContent]);

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv.parse({ headers: false, trim: true, skipEmptyLines: true }))
        .on('data', (row: string[]) => {
          // Skip header row if it looks like a header
          const firstCol = row[0]?.toLowerCase() || '';
          if (firstCol.includes('domain') || firstCol.includes('company')) {
            return; // Skip header row
          }

          // Process data rows - support 1 or 2 columns
          const col1 = row[0]?.trim();
          const col2 = row[1]?.trim();

          if (!col1) return; // Skip empty rows

          // Check if first column looks like a domain or company name
          const isDomain = col1.includes('.') || col1.includes('@');
          
          if (isDomain) {
            // Extract domain from email or URL
            let domain = col1;
            if (domain.includes('@')) {
              domain = domain.split('@')[1] || domain;
            }
            const domainNorm = domain.toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
            domainEntries.push({ 
              domain: domainNorm,      // Store normalized domain for display
              domainNorm: domainNorm,  // Store normalized domain for matching
              companyName: col2 || null 
            });
          } else {
            // Treat as company name
            // Store original company name in domain field for display
            // Store normalized version in domainNorm for matching
            const companyNorm = col1.toLowerCase().replace(/[^a-z0-9]/g, '');
            domainEntries.push({ 
              domain: col1,           // Original company name for display
              domainNorm: companyNorm, // Normalized for matching
              companyName: col1       // Original company name
            });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (domainEntries.length === 0) {
      return res.status(400).json({ 
        error: 'No valid entries found in CSV. CSV must have "domain" or "company_name" column.' 
      });
    }

    // Insert suppressions
    const suppressionsToInsert = domainEntries.map(entry => ({
      campaignId,
      domain: entry.domain,
      domainNorm: entry.domainNorm,
      companyName: entry.companyName,
      reason: 'CSV bulk upload',
      addedBy: userId,
    }));

    const inserted = await db
      .insert(campaignSuppressionDomains)
      .values(suppressionsToInsert)
      .onConflictDoNothing()
      .returning();

    res.status(201).json({
      message: `Successfully processed CSV upload`,
      totalEntries: domainEntries.length,
      added: inserted.length,
      duplicates: domainEntries.length - inserted.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error uploading campaign domain suppressions:', error);
    res.status(500).json({ error: 'Failed to upload campaign domain suppressions' });
  }
});

// ============================================================================
// SMART UNIFIED SUPPRESSION UPLOAD
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/suppressions/upload
 * Unified smart CSV upload that accepts company names and/or emails
 * Automatically extracts domains from emails and categorizes suppressions
 * Body: { csvContent: string }
 */
router.post('/:campaignId/suppressions/upload', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = (req as any).user?.id;

    const bodySchema = z.object({
      csvContent: z.string().min(1),
    });

    const { csvContent } = bodySchema.parse(req.body);

    // Validate campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Parse and process CSV with shared utilities
    const parseResult = parseCSVWithAutoDelimiter>(csvContent, {
      headers: true, // Always try headers first
      transformHeader: normalizeCSVHeader,
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      console.error('[UNIFIED UPLOAD] CSV parsing failed:', parseResult.errors);
      return res.status(400).json(createCSVErrorResponse(
        new Error('CSV parsing failed: ' + parseResult.errors.map(e => e.message).join(', ')),
        'CSV upload'
      ));
    }

    console.log('[UNIFIED UPLOAD] Parsed', parseResult.data.length, 'rows');

    // Categorize rows into emails, domains, and company names using processCSVRows
    type ProcessedRow = {
      type: 'email' | 'company' | 'domain';
      value: string;
      domain?: string;
    };

    const { results: processedRows, errors: processingErrors, skipped } = await processCSVRows, ProcessedRow>(
      parseResult.data,
      (row, index) => {
        // Try to extract email
        const emailValue = (
          row.email || 
          row.emailaddress ||
          row.mail
        )?.toString().trim();
        
        if (emailValue && isValidEmail(emailValue)) {
          return {
            type: 'email',
            value: emailValue.toLowerCase(),
            domain: extractDomain(emailValue) || undefined,
          };
        }
        
        // Try to extract domain
        const domainValue = row.domain?.toString().trim();
        if (domainValue) {
          const normalized = normalizeDomain(domainValue);
          if (normalized) {
            return {
              type: 'domain',
              value: normalized,
            };
          }
        }
        
        // Try to extract company name
        const companyValue = (
          row.companyname ||
          row.company ||
          row.account ||
          row.accountname
        )?.toString().trim();
        
        if (companyValue) {
          const normalized = csvNormalizeCompanyName(companyValue);
          if (normalized) {
            return {
              type: 'company',
              value: companyValue,
            };
          }
        }
        
        // Fallback: try first value
        const fallbackValue = Object.values(row)[0]?.toString().trim();
        if (fallbackValue) {
          if (isValidEmail(fallbackValue)) {
            return {
              type: 'email',
              value: fallbackValue.toLowerCase(),
              domain: extractDomain(fallbackValue) || undefined,
            };
          } else {
            // Try as domain first
            const normalizedDomain = normalizeDomain(fallbackValue);
            if (normalizedDomain && fallbackValue.includes('.')) {
              return {
                type: 'domain',
                value: normalizedDomain,
              };
            }
            // Otherwise try as company
            const normalized = csvNormalizeCompanyName(fallbackValue);
            if (normalized) {
              return {
                type: 'company',
                value: fallbackValue,
              };
            }
          }
        }
        
        throw new Error('Row must contain a valid email, domain, or company name');
      },
      { collectErrors: true, skipInvalid: true }
    );

    // Organize results into sets
    const results = {
      companyNames: new Set(),
      emails: new Set(),
      domains: new Set(),
    };

    processedRows.forEach(row => {
      if (row.type === 'email') {
        results.emails.add(row.value);
        if (row.domain) {
          results.domains.add(row.domain);
        }
      } else if (row.type === 'domain') {
        results.domains.add(row.value);
      } else if (row.type === 'company') {
        results.companyNames.add(row.value);
      }
    });

    console.log('[UNIFIED UPLOAD] Results collected:', {
      companyNames: results.companyNames.size,
      emails: results.emails.size,
      domains: results.domains.size,
      skipped,
      errors: processingErrors.length,
    });

    // Insert company name suppressions (as domains)
    const companyInserted = [];
    if (results.companyNames.size > 0) {
      const companySuppressions = Array.from(results.companyNames).map(name => ({
        campaignId,
        domain: null, // NULL for company-name-only suppressions
        domainNorm: csvNormalizeCompanyName(name), // Normalized for matching
        companyName: name, // Original for display
        reason: 'Unified CSV upload',
        addedBy: userId,
      }));

      console.log('[SMART UPLOAD] Attempting to insert', companySuppressions.length, 'company suppressions');
      
      try {
        const inserted = await db
          .insert(campaignSuppressionDomains)
          .values(companySuppressions)
          .onConflictDoNothing()
          .returning();
        
        companyInserted.push(...inserted);
        console.log('[SMART UPLOAD] Company suppressions inserted:', inserted.length, 'out of', companySuppressions.length);
      } catch (error) {
        console.error('[SMART UPLOAD] Error inserting company suppressions:', error);
      }
    }

    // Insert email suppressions
    const emailInserted = [];
    if (results.emails.size > 0) {
      const emailSuppressions = Array.from(results.emails).map(email => ({
        campaignId,
        email,
        emailNorm: email.toLowerCase(),
        reason: 'Unified CSV upload',
        addedBy: userId,
      }));

      console.log('[SMART UPLOAD] Attempting to insert', emailSuppressions.length, 'email suppressions');
      
      try {
        const inserted = await db
          .insert(campaignSuppressionEmails)
          .values(emailSuppressions)
          .onConflictDoNothing()
          .returning();
        
        emailInserted.push(...inserted);
        console.log('[SMART UPLOAD] Email suppressions inserted:', inserted.length, 'out of', emailSuppressions.length);
      } catch (error) {
        console.error('[SMART UPLOAD] Error inserting email suppressions:', error);
      }
    }

    // Insert domain suppressions (extracted from emails)
    const domainInserted = [];
    if (results.domains.size > 0) {
      const domainSuppressions = Array.from(results.domains).map(domain => ({
        campaignId,
        domain,
        domainNorm: domain.toLowerCase(),
        companyName: null,
        reason: 'Unified CSV upload (extracted from email)',
        addedBy: userId,
      }));

      console.log('[SMART UPLOAD] Attempting to insert', domainSuppressions.length, 'domain suppressions');
      
      try {
        const inserted = await db
          .insert(campaignSuppressionDomains)
          .values(domainSuppressions)
          .onConflictDoNothing()
          .returning();
        
        domainInserted.push(...inserted);
        console.log('[SMART UPLOAD] Domain suppressions inserted:', inserted.length, 'out of', domainSuppressions.length);
      } catch (error) {
        console.error('[SMART UPLOAD] Error inserting domain suppressions:', error);
      }
    }

    console.log('[SMART UPLOAD] Insertion complete:', {
      companyInserted: companyInserted.length,
      emailInserted: emailInserted.length,
      domainInserted: domainInserted.length,
    });

    // Use standardized CSV upload response
    res.status(201).json(createCSVUploadResponse({
      total: parseResult.data.length,
      processed: processedRows.length,
      errors: processingErrors,
      skipped,
      metadata: {
        companyNames: {
          found: results.companyNames.size,
          added: companyInserted.length,
          duplicates: results.companyNames.size - companyInserted.length,
        },
        emails: {
          found: results.emails.size,
          added: emailInserted.length,
          duplicates: results.emails.size - emailInserted.length,
        },
        domains: {
          found: results.domains.size,
          added: domainInserted.length,
          duplicates: results.domains.size - domainInserted.length,
        },
        totalAdded: companyInserted.length + emailInserted.length + domainInserted.length,
      },
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[UNIFIED UPLOAD] Error processing CSV upload:', error);
    res.status(500).json(createCSVErrorResponse(error, 'CSV upload'));
  }
});

// ============================================================================
// DEPRECATED ENDPOINTS - REDIRECT TO UNIFIED UPLOAD
// ============================================================================

/**
 * @deprecated Use POST /api/campaigns/:campaignId/suppressions/upload instead
 * This endpoint is kept for backward compatibility but will be removed
 */
router.post('/:campaignId/suppressions/smart-upload', async (req: Request, res: Response) => {
  console.warn('[DEPRECATED] /smart-upload endpoint used - please migrate to /upload');
  res.status(301).json({
    error: 'This endpoint has moved',
    message: 'Please use POST /api/campaigns/:campaignId/suppressions/upload instead.',
    migrateURL: `/api/campaigns/${req.params.campaignId}/suppressions/upload`,
  });
});

/**
 * @deprecated Use POST /api/campaigns/:campaignId/suppressions/upload instead
 * The unified endpoint auto-detects and processes all suppression types
 */
router.post('/:campaignId/suppressions/accounts/upload', (req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/campaigns/:campaignId/suppressions/upload instead. The unified endpoint automatically detects and processes account suppressions.',
    migrateURL: `/api/campaigns/${req.params.campaignId}/suppressions/upload`,
  });
});

/**
 * @deprecated Use POST /api/campaigns/:campaignId/suppressions/upload instead
 */
router.post('/:campaignId/suppressions/contacts/upload', (req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/campaigns/:campaignId/suppressions/upload instead. The unified endpoint automatically detects and processes contact suppressions.',
    migrateURL: `/api/campaigns/${req.params.campaignId}/suppressions/upload`,
  });
});

/**
 * @deprecated Use POST /api/campaigns/:campaignId/suppressions/upload instead
 */
router.post('/:campaignId/suppressions/emails/upload', (req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/campaigns/:campaignId/suppressions/upload instead. The unified endpoint automatically detects and processes email suppressions.',
    migrateURL: `/api/campaigns/${req.params.campaignId}/suppressions/upload`,
  });
});

/**
 * @deprecated Use POST /api/campaigns/:campaignId/suppressions/upload instead
 */
router.post('/:campaignId/suppressions/domains/upload', (req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Please use POST /api/campaigns/:campaignId/suppressions/upload instead. The unified endpoint automatically detects and processes domain suppressions.',
    migrateURL: `/api/campaigns/${req.params.campaignId}/suppressions/upload`,
  });
});

export default router;