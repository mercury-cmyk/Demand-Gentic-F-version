import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  campaignSuppressionAccounts, 
  campaignSuppressionContacts,
  campaignSuppressionEmails,
  campaignSuppressionDomains,
  suppressionPhones,
  globalDnc,
  accounts,
  contacts,
  campaigns,
  leads,
  callSessions,
  callJobs,
  callDispositions,
  dispositions,
} from '../../shared/schema';
import { eq, and, or, inArray, sql, desc, gte, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import * as csv from 'fast-csv';
import { Readable } from 'stream';
import { normalizeDomain, normalizeCompanyName } from '../lib/campaign-suppression';
import { parsePhoneNumberWithError, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';

const router = Router();

interface SuppressionEntry {
  id: string;
  type: 'account' | 'contact' | 'domain' | 'phone' | 'global_dnc';
  identifier: string;
  name: string | null;
  source: string;
  reason: string | null;
  campaignId: string | null;
  campaignName: string | null;
  createdAt: Date;
  addedBy: string | null;
}

/**
 * GET /api/telemarketing/suppressions
 * Get all telemarketing suppressions across all sources with filtering
 * Campaign/source filtering applied at SQL level for performance
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      type = 'all', 
      campaign: campaignFilter = 'all',
      source: sourceFilter = 'all',
      limit = '200',
      offset = '0'
    } = req.query;

    const suppressions: SuppressionEntry[] = [];
    const limitNum = Math.min(parseInt(limit as string) || 200, 500); // Cap at 500
    const offsetNum = parseInt(offset as string) || 0;

    // Helper to derive source from reason field
    const deriveSource = (reason: string | null, isGlobalDnc: boolean = false): string => {
      if (isGlobalDnc) return 'DNC';
      if (!reason) return 'Uploaded';
      const reasonLower = reason.toLowerCase();
      if (reasonLower.includes('csv') || reasonLower.includes('upload') || reasonLower.includes('import')) return 'Uploaded';
      if (reasonLower.includes('qualified') || reasonLower.includes('converted')) return 'Qualified';
      if (reasonLower.includes('dnc') || reasonLower.includes('do not call')) return 'DNC';
      return 'Uploaded';
    };

    // Helper to check source filter match
    const matchesSourceFilter = (source: string): boolean => {
      if (sourceFilter === 'all') return true;
      const sourceLower = source.toLowerCase();
      if (sourceFilter === 'upload') return sourceLower === 'uploaded';
      if (sourceFilter === 'qualified') return sourceLower === 'qualified';
      if (sourceFilter === 'dnc') return sourceLower === 'dnc';
      return true;
    };

    // Skip campaign-linked tables if filter is 'global' (only global suppressions)
    const includesCampaignLinked = campaignFilter !== 'global';
    // Skip global tables if filter is a specific campaign ID
    const includesGlobal = campaignFilter === 'all' || campaignFilter === 'global';

    // 1. Get campaign suppression accounts (only if not filtered to global-only)
    if ((type === 'all' || type === 'account') && includesCampaignLinked) {
      let accountQuery = db
        .select({
          id: campaignSuppressionAccounts.id,
          campaignId: campaignSuppressionAccounts.campaignId,
          accountId: campaignSuppressionAccounts.accountId,
          reason: campaignSuppressionAccounts.reason,
          addedBy: campaignSuppressionAccounts.addedBy,
          createdAt: campaignSuppressionAccounts.createdAt,
          accountName: accounts.name,
          accountDomain: accounts.domain,
          campaignName: campaigns.name,
        })
        .from(campaignSuppressionAccounts)
        .leftJoin(accounts, eq(campaignSuppressionAccounts.accountId, accounts.id))
        .leftJoin(campaigns, eq(campaignSuppressionAccounts.campaignId, campaigns.id));

      // Apply campaign filter at SQL level
      if (campaignFilter !== 'all' && campaignFilter !== 'global') {
        accountQuery = accountQuery.where(eq(campaignSuppressionAccounts.campaignId, campaignFilter as string)) as any;
      }

      const accountResults = await accountQuery;

      for (const row of accountResults) {
        const source = deriveSource(row.reason);
        if (!matchesSourceFilter(source)) continue;

        suppressions.push({
          id: `account_${row.id}`,
          type: 'account',
          identifier: row.accountDomain || row.accountId,
          name: row.accountName,
          source,
          reason: row.reason,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          createdAt: row.createdAt,
          addedBy: row.addedBy,
        });
      }
    }

    // 2. Get campaign suppression contacts (only if not filtered to global-only)
    if ((type === 'all' || type === 'contact') && includesCampaignLinked) {
      let contactQuery = db
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
          campaignName: campaigns.name,
        })
        .from(campaignSuppressionContacts)
        .leftJoin(contacts, eq(campaignSuppressionContacts.contactId, contacts.id))
        .leftJoin(campaigns, eq(campaignSuppressionContacts.campaignId, campaigns.id));

      // Apply campaign filter at SQL level
      if (campaignFilter !== 'all' && campaignFilter !== 'global') {
        contactQuery = contactQuery.where(eq(campaignSuppressionContacts.campaignId, campaignFilter as string)) as any;
      }

      const contactResults = await contactQuery;

      for (const row of contactResults) {
        const source = deriveSource(row.reason);
        if (!matchesSourceFilter(source)) continue;

        suppressions.push({
          id: `contact_${row.id}`,
          type: 'contact',
          identifier: row.contactEmail || row.contactPhone || row.contactId,
          name: row.contactFirstName && row.contactLastName 
            ? `${row.contactFirstName} ${row.contactLastName}` 
            : row.contactFirstName || row.contactLastName || null,
          source,
          reason: row.reason,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          createdAt: row.createdAt,
          addedBy: row.addedBy,
        });
      }
    }

    // 3. Get campaign suppression domains (only if not filtered to global-only)
    if ((type === 'all' || type === 'domain') && includesCampaignLinked) {
      let domainQuery = db
        .select({
          id: campaignSuppressionDomains.id,
          campaignId: campaignSuppressionDomains.campaignId,
          domain: campaignSuppressionDomains.domain,
          domainNorm: campaignSuppressionDomains.domainNorm,
          companyName: campaignSuppressionDomains.companyName,
          reason: campaignSuppressionDomains.reason,
          addedBy: campaignSuppressionDomains.addedBy,
          createdAt: campaignSuppressionDomains.createdAt,
          campaignName: campaigns.name,
        })
        .from(campaignSuppressionDomains)
        .leftJoin(campaigns, eq(campaignSuppressionDomains.campaignId, campaigns.id));

      // Apply campaign filter at SQL level
      if (campaignFilter !== 'all' && campaignFilter !== 'global') {
        domainQuery = domainQuery.where(eq(campaignSuppressionDomains.campaignId, campaignFilter as string)) as any;
      }

      const domainResults = await domainQuery;

      for (const row of domainResults) {
        const source = deriveSource(row.reason);
        if (!matchesSourceFilter(source)) continue;

        suppressions.push({
          id: `domain_${row.id}`,
          type: 'domain',
          identifier: row.domain || row.domainNorm || '',
          name: row.companyName,
          source,
          reason: row.reason,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          createdAt: row.createdAt,
          addedBy: row.addedBy,
        });
      }
    }

    // 4. Get global phone suppressions (DNC) - only if filtering to global or all
    if ((type === 'all' || type === 'phone') && includesGlobal) {
      const phoneResults = await db
        .select({
          id: suppressionPhones.id,
          phoneE164: suppressionPhones.phoneE164,
          reason: suppressionPhones.reason,
          source: suppressionPhones.source,
          createdAt: suppressionPhones.createdAt,
        })
        .from(suppressionPhones);

      for (const row of phoneResults) {
        const source = deriveSource(row.reason || row.source);
        if (!matchesSourceFilter(source)) continue;

        suppressions.push({
          id: `phone_${row.id}`,
          type: 'phone',
          identifier: row.phoneE164,
          name: null,
          source,
          reason: row.reason,
          campaignId: null,
          campaignName: null,
          createdAt: row.createdAt,
          addedBy: null,
        });
      }
    }

    // 5. Get global DNC entries (from call dispositions) - only if filtering to global or all
    if ((type === 'all' || type === 'global_dnc') && includesGlobal) {
      const dncResults = await db
        .select({
          id: globalDnc.id,
          contactId: globalDnc.contactId,
          phoneE164: globalDnc.phoneE164,
          reason: globalDnc.reason,
          source: globalDnc.source,
          createdBy: globalDnc.createdBy,
          createdAt: globalDnc.createdAt,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
        })
        .from(globalDnc)
        .leftJoin(contacts, eq(globalDnc.contactId, contacts.id));

      for (const row of dncResults) {
        const source = 'DNC'; // Global DNC entries are always marked as DNC
        if (!matchesSourceFilter(source)) continue;

        suppressions.push({
          id: `dnc_${row.id}`,
          type: 'global_dnc',
          identifier: row.phoneE164 || row.contactId || '',
          name: row.contactFirstName && row.contactLastName 
            ? `${row.contactFirstName} ${row.contactLastName}` 
            : row.contactFirstName || row.contactLastName || null,
          source,
          reason: row.reason,
          campaignId: null,
          campaignName: null,
          createdAt: row.createdAt,
          addedBy: row.createdBy,
        });
      }
    }

    // Apply any remaining campaign filtering (for edge cases)
    let filteredSuppressions = suppressions;

    // Sort by createdAt desc
    filteredSuppressions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const stats = {
      total: filteredSuppressions.length,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      byCampaign: {} as Record<string, number>,
      recentAdditions: filteredSuppressions.filter(s => new Date(s.createdAt) >= weekAgo).length,
    };

    for (const s of filteredSuppressions) {
      stats.byType[s.type] = (stats.byType[s.type] || 0) + 1;
      stats.bySource[s.source] = (stats.bySource[s.source] || 0) + 1;
      if (s.campaignName) {
        stats.byCampaign[s.campaignName] = (stats.byCampaign[s.campaignName] || 0) + 1;
      }
    }

    // Apply pagination
    const paginatedSuppressions = filteredSuppressions.slice(offsetNum, offsetNum + limitNum);

    res.json({
      suppressions: paginatedSuppressions,
      stats,
      total: filteredSuppressions.length,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('Error fetching telemarketing suppressions:', error);
    res.status(500).json({ error: 'Failed to fetch suppressions' });
  }
});

/**
 * POST /api/telemarketing/suppressions/upload
 * Upload suppression data (phone numbers, emails, domains, company names)
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { csvContent, targetCampaignId } = z.object({
      csvContent: z.string(),
      targetCampaignId: z.string().optional(),
    }).parse(req.body);

    // Parse the content
    const lines = csvContent.split(/[\r\n]+/).filter(line => line.trim());
    
    const phones: string[] = [];
    const emails: string[] = [];
    const domains: string[] = [];
    const companyNames: string[] = [];

    for (const line of lines) {
      const value = line.trim();
      if (!value) continue;

      // Skip header rows
      if (value.toLowerCase().includes('phone') || 
          value.toLowerCase().includes('email') || 
          value.toLowerCase().includes('domain') ||
          value.toLowerCase().includes('company')) {
        continue;
      }

      // Detect type
      // Phone number detection (starts with + or contains mostly digits)
      if (value.startsWith('+') || /^[\d\s\-()]{7,}$/.test(value)) {
        try {
          const cleanPhone = value.replace(/[\s\-()]/g, '');
          if (isValidPhoneNumber(cleanPhone, 'GB') || isValidPhoneNumber(cleanPhone)) {
            const parsed = parsePhoneNumberWithError(cleanPhone, 'GB' as CountryCode);
            phones.push(parsed.format('E.164'));
          } else if (/^\+?\d{7,15}$/.test(cleanPhone)) {
            phones.push(cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`);
          }
        } catch {
          // Not a valid phone, try other types
        }
      }
      // Email detection
      else if (value.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        emails.push(value.toLowerCase());
      }
      // Domain detection (has dot, no spaces, looks like domain)
      else if (value.includes('.') && !value.includes(' ') && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
        domains.push(normalizeDomain(value) || value.toLowerCase());
      }
      // Company name (everything else)
      else if (value.length > 1) {
        companyNames.push(value);
      }
    }

    let added = 0;

    // Add phone suppressions
    if (phones.length > 0) {
      const phoneInserts = phones.map(phone => ({
        phoneE164: phone,
        reason: 'CSV upload',
        source: 'CSV upload',
      }));

      try {
        const inserted = await db
          .insert(suppressionPhones)
          .values(phoneInserts)
          .onConflictDoNothing()
          .returning();
        added += inserted.length;
      } catch (error) {
        console.error('Error inserting phone suppressions:', error);
      }
    }

    // Add domain/company suppressions to campaign if targetCampaignId provided
    if (targetCampaignId && (domains.length > 0 || companyNames.length > 0)) {
      const domainInserts = [
        ...domains.map(domain => ({
          campaignId: targetCampaignId,
          domain,
          domainNorm: normalizeDomain(domain) || domain,
          companyName: null as string | null,
          reason: 'CSV upload',
          addedBy: userId,
        })),
        ...companyNames.map(name => ({
          campaignId: targetCampaignId,
          domain: null as string | null,
          domainNorm: normalizeCompanyName(name) || name.toLowerCase(),
          companyName: name,
          reason: 'CSV upload',
          addedBy: userId,
        })),
      ];

      try {
        const inserted = await db
          .insert(campaignSuppressionDomains)
          .values(domainInserts)
          .onConflictDoNothing()
          .returning();
        added += inserted.length;
      } catch (error) {
        console.error('Error inserting domain suppressions:', error);
      }
    }

    // Add email suppressions to campaign if targetCampaignId provided
    if (targetCampaignId && emails.length > 0) {
      const emailInserts = emails.map(email => ({
        campaignId: targetCampaignId,
        email,
        emailNorm: email.toLowerCase().trim(),
        reason: 'CSV upload',
        addedBy: userId,
      }));

      try {
        const inserted = await db
          .insert(campaignSuppressionEmails)
          .values(emailInserts)
          .onConflictDoNothing()
          .returning();
        added += inserted.length;
      } catch (error) {
        console.error('Error inserting email suppressions:', error);
      }
    }

    res.status(201).json({
      message: 'Upload complete',
      added,
      details: {
        phones: phones.length,
        emails: emails.length,
        domains: domains.length,
        companyNames: companyNames.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error uploading suppressions:', error);
    res.status(500).json({ error: 'Failed to upload suppressions' });
  }
});

/**
 * POST /api/telemarketing/suppressions/copy-to-campaign
 * Copy selected suppressions to another campaign
 */
router.post('/copy-to-campaign', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { ids, targetCampaignId } = z.object({
      ids: z.array(z.string()).min(1),
      targetCampaignId: z.string(),
    }).parse(req.body);

    // Verify target campaign exists and is telemarketing type
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, targetCampaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Target campaign not found' });
    }

    let copied = 0;

    // Parse IDs and copy based on type
    for (const id of ids) {
      const [typePrefix, sourceId] = id.split('_');
      
      try {
        if (typePrefix === 'account') {
          const [source] = await db
            .select()
            .from(campaignSuppressionAccounts)
            .where(eq(campaignSuppressionAccounts.id, sourceId))
            .limit(1);

          if (source) {
            await db
              .insert(campaignSuppressionAccounts)
              .values({
                campaignId: targetCampaignId,
                accountId: source.accountId,
                reason: `Copied from campaign: ${source.reason || 'N/A'}`,
                addedBy: userId,
              })
              .onConflictDoNothing();
            copied++;
          }
        } else if (typePrefix === 'contact') {
          const [source] = await db
            .select()
            .from(campaignSuppressionContacts)
            .where(eq(campaignSuppressionContacts.id, sourceId))
            .limit(1);

          if (source) {
            await db
              .insert(campaignSuppressionContacts)
              .values({
                campaignId: targetCampaignId,
                contactId: source.contactId,
                reason: `Copied from campaign: ${source.reason || 'N/A'}`,
                addedBy: userId,
              })
              .onConflictDoNothing();
            copied++;
          }
        } else if (typePrefix === 'domain') {
          const [source] = await db
            .select()
            .from(campaignSuppressionDomains)
            .where(eq(campaignSuppressionDomains.id, sourceId))
            .limit(1);

          if (source) {
            await db
              .insert(campaignSuppressionDomains)
              .values({
                campaignId: targetCampaignId,
                domain: source.domain,
                domainNorm: source.domainNorm,
                companyName: source.companyName,
                reason: `Copied from campaign: ${source.reason || 'N/A'}`,
                addedBy: userId,
              })
              .onConflictDoNothing();
            copied++;
          }
        }
        // Global DNC and phone suppressions don't need copying - they're already global
      } catch (error) {
        console.error(`Error copying suppression ${id}:`, error);
      }
    }

    res.json({
      message: `Copied ${copied} suppressions to campaign`,
      copied,
      targetCampaignId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error copying suppressions:', error);
    res.status(500).json({ error: 'Failed to copy suppressions' });
  }
});

/**
 * DELETE /api/telemarketing/suppressions/bulk
 * Delete multiple suppression entries
 */
router.delete('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({
      ids: z.array(z.string()).min(1),
    }).parse(req.body);

    let deleted = 0;

    for (const id of ids) {
      const [typePrefix, sourceId] = id.split('_');
      
      try {
        if (typePrefix === 'account') {
          const result = await db
            .delete(campaignSuppressionAccounts)
            .where(eq(campaignSuppressionAccounts.id, sourceId))
            .returning();
          deleted += result.length;
        } else if (typePrefix === 'contact') {
          const result = await db
            .delete(campaignSuppressionContacts)
            .where(eq(campaignSuppressionContacts.id, sourceId))
            .returning();
          deleted += result.length;
        } else if (typePrefix === 'domain') {
          const result = await db
            .delete(campaignSuppressionDomains)
            .where(eq(campaignSuppressionDomains.id, sourceId))
            .returning();
          deleted += result.length;
        } else if (typePrefix === 'phone') {
          const result = await db
            .delete(suppressionPhones)
            .where(eq(suppressionPhones.id, parseInt(sourceId)))
            .returning();
          deleted += result.length;
        } else if (typePrefix === 'dnc') {
          const result = await db
            .delete(globalDnc)
            .where(eq(globalDnc.id, sourceId))
            .returning();
          deleted += result.length;
        }
      } catch (error) {
        console.error(`Error deleting suppression ${id}:`, error);
      }
    }

    res.json({
      message: `Deleted ${deleted} suppression entries`,
      deleted,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error deleting suppressions:', error);
    res.status(500).json({ error: 'Failed to delete suppressions' });
  }
});

/**
 * GET /api/telemarketing/suppressions/export
 * Export suppression list as CSV or JSON
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { 
      format = 'csv',
      type = 'all',
      campaignId,
      source,
      ids,
    } = req.query;

    // Re-fetch data with same logic as list endpoint
    // For simplicity, we'll build the data inline
    const suppressions: SuppressionEntry[] = [];

    // Get all suppression types
    if (type === 'all' || type === 'account') {
      const accountResults = await db
        .select({
          id: campaignSuppressionAccounts.id,
          campaignId: campaignSuppressionAccounts.campaignId,
          accountId: campaignSuppressionAccounts.accountId,
          reason: campaignSuppressionAccounts.reason,
          addedBy: campaignSuppressionAccounts.addedBy,
          createdAt: campaignSuppressionAccounts.createdAt,
          accountName: accounts.name,
          accountDomain: accounts.domain,
          campaignName: campaigns.name,
        })
        .from(campaignSuppressionAccounts)
        .leftJoin(accounts, eq(campaignSuppressionAccounts.accountId, accounts.id))
        .leftJoin(campaigns, eq(campaignSuppressionAccounts.campaignId, campaigns.id));

      for (const row of accountResults) {
        suppressions.push({
          id: `account_${row.id}`,
          type: 'account',
          identifier: row.accountDomain || row.accountId,
          name: row.accountName,
          source: row.reason?.includes('CSV') ? 'CSV upload' : 'Imported',
          reason: row.reason,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          createdAt: row.createdAt,
          addedBy: row.addedBy,
        });
      }
    }

    if (type === 'all' || type === 'contact') {
      const contactResults = await db
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
          campaignName: campaigns.name,
        })
        .from(campaignSuppressionContacts)
        .leftJoin(contacts, eq(campaignSuppressionContacts.contactId, contacts.id))
        .leftJoin(campaigns, eq(campaignSuppressionContacts.campaignId, campaigns.id));

      for (const row of contactResults) {
        suppressions.push({
          id: `contact_${row.id}`,
          type: 'contact',
          identifier: row.contactEmail || row.contactPhone || row.contactId,
          name: row.contactFirstName && row.contactLastName 
            ? `${row.contactFirstName} ${row.contactLastName}` 
            : row.contactFirstName || row.contactLastName || null,
          source: row.reason?.includes('CSV') ? 'CSV upload' : 'Imported',
          reason: row.reason,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          createdAt: row.createdAt,
          addedBy: row.addedBy,
        });
      }
    }

    if (type === 'all' || type === 'domain') {
      const domainResults = await db
        .select({
          id: campaignSuppressionDomains.id,
          campaignId: campaignSuppressionDomains.campaignId,
          domain: campaignSuppressionDomains.domain,
          companyName: campaignSuppressionDomains.companyName,
          reason: campaignSuppressionDomains.reason,
          addedBy: campaignSuppressionDomains.addedBy,
          createdAt: campaignSuppressionDomains.createdAt,
          campaignName: campaigns.name,
        })
        .from(campaignSuppressionDomains)
        .leftJoin(campaigns, eq(campaignSuppressionDomains.campaignId, campaigns.id));

      for (const row of domainResults) {
        suppressions.push({
          id: `domain_${row.id}`,
          type: 'domain',
          identifier: row.domain || '',
          name: row.companyName,
          source: row.reason?.includes('CSV') ? 'CSV upload' : 'Imported',
          reason: row.reason,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          createdAt: row.createdAt,
          addedBy: row.addedBy,
        });
      }
    }

    if (type === 'all' || type === 'phone') {
      const phoneResults = await db
        .select()
        .from(suppressionPhones);

      for (const row of phoneResults) {
        suppressions.push({
          id: `phone_${row.id}`,
          type: 'phone',
          identifier: row.phoneE164,
          name: null,
          source: row.source || 'Manual entry',
          reason: row.reason,
          campaignId: null,
          campaignName: null,
          createdAt: row.createdAt,
          addedBy: null,
        });
      }
    }

    if (type === 'all' || type === 'global_dnc') {
      const dncResults = await db
        .select({
          id: globalDnc.id,
          contactId: globalDnc.contactId,
          phoneE164: globalDnc.phoneE164,
          reason: globalDnc.reason,
          source: globalDnc.source,
          createdBy: globalDnc.createdBy,
          createdAt: globalDnc.createdAt,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
        })
        .from(globalDnc)
        .leftJoin(contacts, eq(globalDnc.contactId, contacts.id));

      for (const row of dncResults) {
        suppressions.push({
          id: `dnc_${row.id}`,
          type: 'global_dnc',
          identifier: row.phoneE164 || row.contactId || '',
          name: row.contactFirstName && row.contactLastName 
            ? `${row.contactFirstName} ${row.contactLastName}` 
            : row.contactFirstName || row.contactLastName || null,
          source: row.source || 'Call disposition',
          reason: row.reason,
          campaignId: null,
          campaignName: null,
          createdAt: row.createdAt,
          addedBy: row.createdBy,
        });
      }
    }

    // Filter by specific IDs if provided
    let filteredSuppressions = suppressions;
    if (ids) {
      const idSet = new Set((ids as string).split(','));
      filteredSuppressions = suppressions.filter(s => idSet.has(s.id));
    }

    // Filter by campaign if provided
    if (campaignId) {
      filteredSuppressions = filteredSuppressions.filter(s => s.campaignId === campaignId);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="suppressions.json"');
      return res.json(filteredSuppressions);
    }

    // CSV format
    const csvData = filteredSuppressions.map(s => ({
      type: s.type,
      identifier: s.identifier,
      name: s.name || '',
      source: s.source,
      reason: s.reason || '',
      campaign: s.campaignName || 'Global',
      date_added: s.createdAt.toISOString(),
    }));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="suppressions.csv"');

    const csvStream = csv.format({ headers: true });
    csvStream.pipe(res);
    
    for (const row of csvData) {
      csvStream.write(row);
    }
    
    csvStream.end();
  } catch (error) {
    console.error('Error exporting suppressions:', error);
    res.status(500).json({ error: 'Failed to export suppressions' });
  }
});

/**
 * GET /api/telemarketing/suppressions/qualified-leads
 * Get qualified leads that can be added to suppressions
 * These are contacts from call sessions with 'converted_qualified' disposition
 */
router.get('/qualified-leads', async (req: Request, res: Response) => {
  try {
    const { campaignId, limit = '100', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = parseInt(offset as string) || 0;

    // Get qualified leads with their associated contacts and campaigns
    let query = db
      .select({
        leadId: leads.id,
        contactId: leads.contactId,
        campaignId: leads.campaignId,
        campaignName: campaigns.name,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        contactPhone: contacts.directPhone,
        accountId: contacts.accountId,
        accountName: accounts.name,
        accountDomain: accounts.domain,
        qaStatus: leads.qaStatus,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(accounts, eq(contacts.accountId, accounts.id))
      .leftJoin(campaigns, eq(leads.campaignId, campaigns.id))
      .orderBy(desc(leads.createdAt))
      .limit(limitNum)
      .offset(offsetNum);

    // Apply campaign filter if provided
    if (campaignId && campaignId !== 'all') {
      query = query.where(eq(leads.campaignId, campaignId as string)) as any;
    }

    const qualifiedLeads = await query;

    // Get total count for pagination
    let countQuery = db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(leads);
    
    if (campaignId && campaignId !== 'all') {
      countQuery = countQuery.where(eq(leads.campaignId, campaignId as string)) as any;
    }
    
    const [{ count: total }] = await countQuery;

    // Check which contacts are already suppressed
    const contactIds = qualifiedLeads.map(l => l.contactId).filter(Boolean) as string[];
    const accountIds = qualifiedLeads.map(l => l.accountId).filter(Boolean) as string[];

    const existingContactSuppressions = contactIds.length > 0 
      ? await db
          .select({ contactId: campaignSuppressionContacts.contactId })
          .from(campaignSuppressionContacts)
          .where(inArray(campaignSuppressionContacts.contactId, contactIds))
      : [];
    
    const existingAccountSuppressions = accountIds.length > 0
      ? await db
          .select({ accountId: campaignSuppressionAccounts.accountId })
          .from(campaignSuppressionAccounts)
          .where(inArray(campaignSuppressionAccounts.accountId, accountIds))
      : [];

    const suppressedContactIds = new Set(existingContactSuppressions.map(s => s.contactId));
    const suppressedAccountIds = new Set(existingAccountSuppressions.map(s => s.accountId));

    const leadsWithStatus = qualifiedLeads.map(lead => ({
      ...lead,
      contactName: lead.contactFirstName && lead.contactLastName
        ? `${lead.contactFirstName} ${lead.contactLastName}`
        : lead.contactFirstName || lead.contactLastName || 'Unknown',
      isContactSuppressed: suppressedContactIds.has(lead.contactId || ''),
      isAccountSuppressed: suppressedAccountIds.has(lead.accountId || ''),
    }));

    res.json({
      leads: leadsWithStatus,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error('Error fetching qualified leads:', error);
    res.status(500).json({ error: 'Failed to fetch qualified leads' });
  }
});

/**
 * POST /api/telemarketing/suppressions/add-from-leads
 * Add contacts from qualified leads to campaign suppressions
 */
router.post('/add-from-leads', async (req: Request, res: Response) => {
  try {
    const { leadIds, targetCampaignId, suppressType = 'contact', reason } = req.body;
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds array is required' });
    }
    
    if (!targetCampaignId) {
      return res.status(400).json({ error: 'targetCampaignId is required' });
    }

    // Get the leads with contact/account info
    const leadsToSuppress = await db
      .select({
        leadId: leads.id,
        contactId: leads.contactId,
        accountId: contacts.accountId,
        email: contacts.email,
      })
      .from(leads)
      .leftJoin(contacts, eq(leads.contactId, contacts.id))
      .where(inArray(leads.id, leadIds));

    let added = 0;
    let skipped = 0;

    for (const lead of leadsToSuppress) {
      try {
        if (suppressType === 'contact' && lead.contactId) {
          // Check if already suppressed
          const existing = await db.query.campaignSuppressionContacts.findFirst({
            where: and(
              eq(campaignSuppressionContacts.campaignId, targetCampaignId),
              eq(campaignSuppressionContacts.contactId, lead.contactId)
            ),
          });
          
          if (!existing) {
            await db.insert(campaignSuppressionContacts).values({
              id: crypto.randomUUID(),
              campaignId: targetCampaignId,
              contactId: lead.contactId,
              reason: reason || 'Added from qualified lead - prevent re-calling',
              addedBy: 'system',
              createdAt: new Date(),
            });
            added++;
          } else {
            skipped++;
          }
        } else if (suppressType === 'account' && lead.accountId) {
          // Check if already suppressed
          const existing = await db.query.campaignSuppressionAccounts.findFirst({
            where: and(
              eq(campaignSuppressionAccounts.campaignId, targetCampaignId),
              eq(campaignSuppressionAccounts.accountId, lead.accountId)
            ),
          });
          
          if (!existing) {
            await db.insert(campaignSuppressionAccounts).values({
              id: crypto.randomUUID(),
              campaignId: targetCampaignId,
              accountId: lead.accountId,
              reason: reason || 'Added from qualified lead - prevent re-calling',
              addedBy: 'system',
              createdAt: new Date(),
            });
            added++;
          } else {
            skipped++;
          }
        }
      } catch (insertError) {
        console.error('Error inserting suppression:', insertError);
        skipped++;
      }
    }

    res.json({
      success: true,
      added,
      skipped,
      total: leadIds.length,
    });
  } catch (error) {
    console.error('Error adding suppressions from leads:', error);
    res.status(500).json({ error: 'Failed to add suppressions from leads' });
  }
});

export default router;
