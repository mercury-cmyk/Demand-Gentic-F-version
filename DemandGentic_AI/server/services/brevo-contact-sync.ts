/**
 * Brevo Contact Sync Service
 *
 * Two-way contact synchronization between DemandGentic CRM and Brevo:
 *   - Push: Export contacts to Brevo lists for email campaigns
 *   - Pull: Import Brevo contacts into CRM (dedup by emailNormalized)
 *   - Sync suppression: Honour Brevo blacklist / unsubscribes
 *
 * Uses the Brevo REST API v3: https://developers.brevo.com/reference
 */

import { db } from '../db';
import { contacts, emailSuppressionList, segments, lists, emailSends, emailEvents } from '@shared/schema';
import { eq, and, isNull, inArray, sql, desc } from 'drizzle-orm';
import { storage } from '../storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBrevoApiBase(): string {
  return process.env.BREVO_API_BASE || 'https://api.brevo.com/v3';
}

function getBrevoApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY environment variable is not set');
  return key;
}

async function brevoFetch(path: string, options: RequestInit = {}): Promise {
  const base = getBrevoApiBase();
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'api-key': getBrevoApiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrevoContact {
  email: string;
  id?: number;
  emailBlacklisted?: boolean;
  smsBlacklisted?: boolean;
  listIds?: number[];
  attributes?: Record;
  createdAt?: string;
  modifiedAt?: string;
}

export interface BrevoList {
  id: number;
  name: string;
  totalSubscribers: number;
  totalBlacklisted: number;
  folderId: number;
  createdAt: string;
  dynamicList?: boolean;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface BrevoEmailCampaign {
  id: number;
  name: string;
  subject?: string;
  type: string;
  status: string;
  sentDate?: string;
  createdAt: string;
  modifiedAt?: string;
  statistics?: {
    globalStats?: BrevoGlobalStats;
    campaignStats?: BrevoGlobalStats[];
    listStats?: Record;
  };
  recipients?: { lists: number[]; exclusionLists?: number[] };
  tag?: string;
}

export interface BrevoGlobalStats {
  uniqueClicks?: number;
  clickers?: number;
  complaints?: number;
  delivered?: number;
  sent?: number;
  softBounces?: number;
  hardBounces?: number;
  uniqueViews?: number;
  trackableViews?: number;
  unsubscriptions?: number;
  viewed?: number;
}

export interface BrevoEngagementReport {
  campaignId: number;
  campaignName: string;
  subject?: string;
  status: string;
  sentDate?: string;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  hardBounces: number;
  softBounces: number;
  unsubscriptions: number;
  complaints: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  unsubscribeRate: number;
}

export interface BlocklistEntry {
  email: string;
  emailBlacklisted: boolean;
  smsBlacklisted: boolean;
  reason?: string;
  source: 'brevo' | 'crm' | 'both';
  brevoId?: number;
  crmContactId?: string;
  crmSuppressionReason?: string;
}

// ---------------------------------------------------------------------------
// Brevo API wrappers
// ---------------------------------------------------------------------------

/** Get all Brevo contact lists */
export async function listBrevoLists(): Promise {
  const lists: BrevoList[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const res = await brevoFetch(`/contacts/lists?limit=${limit}&offset=${offset}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brevo API error listing lists (${res.status}): ${text}`);
    }
    const data = await res.json() as { lists: BrevoList[]; count: number };
    lists.push(...data.lists);
    if (lists.length >= data.count) break;
    offset += limit;
  }

  return lists;
}

/** Get contacts from a specific Brevo list (paginated) */
export async function getBrevoListContacts(listId: number, limit = 500, offset = 0): Promise {
  const res = await brevoFetch(`/contacts/lists/${listId}/contacts?limit=${limit}&offset=${offset}&modifiedSince=&sort=desc`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error fetching list contacts (${res.status}): ${text}`);
  }
  return res.json() as Promise;
}

/** Get a single Brevo contact by email */
export async function getBrevoContact(email: string): Promise {
  const res = await brevoFetch(`/contacts/${encodeURIComponent(email)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error fetching contact (${res.status}): ${text}`);
  }
  return res.json() as Promise;
}

/** Create or update a contact in Brevo */
export async function upsertBrevoContact(email: string, attributes: Record, listIds?: number[]): Promise {
  const payload: Record = {
    email,
    attributes,
    updateEnabled: true,
  };
  if (listIds?.length) {
    payload.listIds = listIds;
  }

  const res = await brevoFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // 201 = created, 204 = updated
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Brevo upsert contact error (${res.status}): ${text}`);
  }
}

/** Get Brevo transactional blocklist (blacklisted contacts) */
export async function getBrevoBlocklist(limit = 500, offset = 0): Promise }[]; count: number }> {
  const res = await brevoFetch(`/contacts?limit=${limit}&offset=${offset}&modifiedSince=&sort=desc`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error fetching contacts (${res.status}): ${text}`);
  }
  const data = await res.json() as { contacts: BrevoContact[]; count: number };

  const blacklisted = data.contacts
    .filter(c => c.emailBlacklisted)
    .map(c => ({
      email: c.email,
      reason: { emailBlacklisted: true, brevoId: c.id },
    }));

  return { contacts: blacklisted, count: data.count };
}

// ---------------------------------------------------------------------------
// Push: CRM → Brevo
// ---------------------------------------------------------------------------

/**
 * Export contacts from CRM to a Brevo list.
 * Creates contacts in Brevo with CRM attributes mapped.
 * Skips contacts on the suppression list.
 */
export async function pushContactsToBrevo(
  contactIds: string[],
  brevoListId: number,
): Promise {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (!contactIds.length) return result;

  // Fetch contacts from CRM
  const crmContacts = await db
    .select()
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, contactIds),
        isNull(contacts.deletedAt),
        eq(contacts.isInvalid, false),
      ),
    );

  // Fetch suppression list emails to skip
  const suppressedRows = await db
    .select({ emailNormalized: emailSuppressionList.emailNormalized })
    .from(emailSuppressionList);
  const suppressedEmails = new Set(suppressedRows.map(r => r.emailNormalized));

  for (const contact of crmContacts) {
    const email = contact.emailNormalized || contact.email;
    if (!email) {
      result.skipped++;
      continue;
    }

    if (suppressedEmails.has(email.toLowerCase())) {
      result.skipped++;
      continue;
    }

    try {
      const attributes: Record = {};
      if (contact.firstName) attributes.FIRSTNAME = contact.firstName;
      if (contact.lastName) attributes.LASTNAME = contact.lastName;
      if (contact.fullName) attributes.FULLNAME = contact.fullName;
      if (contact.jobTitle) attributes.JOBTITLE = contact.jobTitle;
      if (contact.directPhone || contact.mobilePhone) {
        attributes.PHONE = contact.directPhone || contact.mobilePhone;
      }
      if (contact.city) attributes.CITY = contact.city;
      if (contact.state) attributes.STATE = contact.state;
      if (contact.country) attributes.COUNTRY = contact.country;
      if (contact.department) attributes.DEPARTMENT = contact.department;
      if (contact.seniorityLevel) attributes.SENIORITY = contact.seniorityLevel;
      // Store CRM ID for reverse mapping
      attributes.CRM_CONTACT_ID = contact.id;

      await upsertBrevoContact(email, attributes, [brevoListId]);
      result.created++;
    } catch (err: any) {
      result.errors.push(`${email}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Bulk push via Brevo import API (batches of up to 8000).
 * More efficient for large exports.
 */
export async function bulkPushContactsToBrevo(
  contactIds: string[],
  brevoListId: number,
): Promise {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!contactIds.length) return result;

  const crmContacts = await db
    .select()
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, contactIds),
        isNull(contacts.deletedAt),
        eq(contacts.isInvalid, false),
      ),
    );

  const suppressedRows = await db
    .select({ emailNormalized: emailSuppressionList.emailNormalized })
    .from(emailSuppressionList);
  const suppressedEmails = new Set(suppressedRows.map(r => r.emailNormalized));

  const validContacts = crmContacts.filter(c => {
    const email = c.emailNormalized || c.email;
    if (!email) { result.skipped++; return false; }
    if (suppressedEmails.has(email.toLowerCase())) { result.skipped++; return false; }
    return true;
  });

  // Brevo import endpoint accepts up to 8000 contacts per request
  const BATCH_SIZE = 8000;
  for (let i = 0; i  {
      const email = (c.emailNormalized || c.email)!;
      const attrs: Record = { CRM_CONTACT_ID: c.id };
      if (c.firstName) attrs.FIRSTNAME = c.firstName;
      if (c.lastName) attrs.LASTNAME = c.lastName;
      if (c.fullName) attrs.FULLNAME = c.fullName;
      if (c.jobTitle) attrs.JOBTITLE = c.jobTitle;
      if (c.directPhone || c.mobilePhone) attrs.PHONE = c.directPhone || c.mobilePhone;
      if (c.city) attrs.CITY = c.city;
      if (c.state) attrs.STATE = c.state;
      if (c.country) attrs.COUNTRY = c.country;
      return { email, attributes: attrs };
    });

    try {
      const res = await brevoFetch('/contacts/import', {
        method: 'POST',
        body: JSON.stringify({
          jsonBody,
          listIds: [brevoListId],
          updateExistingContacts: true,
          emptyContactsAttributes: false,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        result.errors.push(`Batch ${i / BATCH_SIZE + 1}: Brevo import error (${res.status}): ${text}`);
      } else {
        result.created += batch.length;
      }
    } catch (err: any) {
      result.errors.push(`Batch ${i / BATCH_SIZE + 1}: ${err.message}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Pull: Brevo → CRM
// ---------------------------------------------------------------------------

/**
 * Import contacts from a Brevo list into the CRM.
 * - Deduplicates by emailNormalized (unique index)
 * - Updates existing contacts with Brevo attributes if `updateExisting` is true
 * - Skips blacklisted Brevo contacts
 * - Skips contacts already on the CRM suppression list
 */
export async function pullContactsFromBrevo(
  brevoListId: number,
  options: { updateExisting?: boolean; sourceTag?: string } = {},
): Promise {
  const { updateExisting = false, sourceTag = 'brevo-sync' } = options;
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // Load suppression list
  const suppressedRows = await db
    .select({ emailNormalized: emailSuppressionList.emailNormalized })
    .from(emailSuppressionList);
  const suppressedEmails = new Set(suppressedRows.map(r => r.emailNormalized));

  let offset = 0;
  const limit = 500;

  while (true) {
    const page = await getBrevoListContacts(brevoListId, limit, offset);
    if (!page.contacts.length) break;

    for (const bc of page.contacts) {
      const email = (bc.email || '').toLowerCase().trim();
      if (!email) { result.skipped++; continue; }
      if (bc.emailBlacklisted) { result.skipped++; continue; }
      if (suppressedEmails.has(email)) { result.skipped++; continue; }

      try {
        // Check if contact already exists in CRM
        const [existing] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.emailNormalized, email), isNull(contacts.deletedAt)))
          .limit(1);

        const attrs = (bc.attributes || {}) as Record;
        const firstName = attrs.FIRSTNAME || attrs.PRENOM || null;
        const lastName = attrs.LASTNAME || attrs.NOM || null;
        const fullName = firstName && lastName
          ? `${firstName} ${lastName}`
          : firstName || lastName || email.split('@')[0];

        if (existing) {
          if (updateExisting) {
            const updateData: Record = { updatedAt: new Date() };
            if (firstName) updateData.firstName = firstName;
            if (lastName) updateData.lastName = lastName;
            if (attrs.PHONE) updateData.directPhone = attrs.PHONE;
            if (attrs.CITY) updateData.city = attrs.CITY;
            if (attrs.STATE) updateData.state = attrs.STATE;
            if (attrs.COUNTRY) updateData.country = attrs.COUNTRY;
            if (attrs.JOBTITLE) updateData.jobTitle = attrs.JOBTITLE;
            if (attrs.DEPARTMENT) updateData.department = attrs.DEPARTMENT;

            await db.update(contacts).set(updateData).where(eq(contacts.id, existing.id));
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          // Create new contact
          await db.insert(contacts).values({
            email,
            emailNormalized: email,
            fullName,
            firstName,
            lastName,
            jobTitle: attrs.JOBTITLE || null,
            directPhone: attrs.PHONE || null,
            department: attrs.DEPARTMENT || null,
            city: attrs.CITY || null,
            state: attrs.STATE || null,
            country: attrs.COUNTRY || null,
            seniorityLevel: attrs.SENIORITY || null,
            sourceSystem: 'brevo',
            sourceRecordId: bc.id?.toString() || null,
            list: sourceTag,
            emailStatus: 'valid',
            customFields: { brevoListIds: bc.listIds },
          });
          result.created++;
        }
      } catch (err: any) {
        // Unique constraint race — treat as skip
        if (err.message?.includes('unique') || err.code === '23505') {
          result.skipped++;
        } else {
          result.errors.push(`${email}: ${err.message}`);
        }
      }
    }

    offset += limit;
    if (offset >= page.count) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Suppression sync: Brevo blacklist → CRM suppression list
// ---------------------------------------------------------------------------

/**
 * Sync Brevo blacklisted contacts into CRM suppression list.
 * Ensures contacts that are blacklisted in Brevo are suppressed in CRM.
 */
export async function syncBrevoBlacklist(): Promise {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  let offset = 0;
  const limit = 500;

  while (true) {
    const res = await brevoFetch(`/contacts?limit=${limit}&offset=${offset}&sort=desc`);
    if (!res.ok) {
      const text = await res.text();
      result.errors.push(`Brevo API error (${res.status}): ${text}`);
      break;
    }

    const data = await res.json() as { contacts: BrevoContact[]; count: number };
    const blacklisted = data.contacts.filter(c => c.emailBlacklisted);

    for (const bc of blacklisted) {
      const email = (bc.email || '').toLowerCase().trim();
      if (!email) continue;

      try {
        // Check if already in suppression list
        const [existing] = await db
          .select({ id: emailSuppressionList.id })
          .from(emailSuppressionList)
          .where(eq(emailSuppressionList.emailNormalized, email))
          .limit(1);

        if (existing) {
          result.skipped++;
          continue;
        }

        // Find linked CRM contact
        const [crmContact] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.emailNormalized, email), isNull(contacts.deletedAt)))
          .limit(1);

        await db.insert(emailSuppressionList).values({
          email: bc.email,
          emailNormalized: email,
          reason: 'unsubscribe',
          contactId: crmContact?.id || null,
          metadata: { source: 'brevo_blacklist_sync', brevoId: bc.id },
        });

        // Mark CRM contact as suppressed
        if (crmContact) {
          await db.update(contacts).set({
            emailStatus: 'unsubscribed',
            updatedAt: new Date(),
          }).where(eq(contacts.id, crmContact.id));
        }

        result.created++;
      } catch (err: any) {
        if (err.message?.includes('unique') || err.code === '23505') {
          result.skipped++;
        } else {
          result.errors.push(`${email}: ${err.message}`);
        }
      }
    }

    offset += limit;
    if (offset >= data.count) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Segment & List → Brevo push
// ---------------------------------------------------------------------------

/**
 * Push a CRM segment's contacts to a Brevo list.
 * Resolves segment definition → contact IDs → bulk push.
 */
export async function pushSegmentToBrevo(segmentId: string, brevoListId: number): Promise {
  const segment = await storage.getSegment(segmentId);
  if (!segment) throw new Error(`Segment ${segmentId} not found`);

  const segmentContacts = await storage.getContacts(segment.definitionJson as any);
  const contactIds = segmentContacts.map(c => c.id);

  console.log(`[Brevo Sync] Pushing segment "${segment.name}" (${contactIds.length} contacts) to Brevo list ${brevoListId}`);
  return bulkPushContactsToBrevo(contactIds, brevoListId);
}

/**
 * Push a CRM static list's contacts to a Brevo list.
 * Reads recordIds from the list → bulk push.
 */
export async function pushListToBrevo(listId: string, brevoListId: number): Promise {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
  if (!list) throw new Error(`List ${listId} not found`);

  const recordIds = list.recordIds || [];
  if (!recordIds.length) return { created: 0, updated: 0, skipped: 0, errors: [] };

  // If account-type list, resolve to contacts
  let contactIds: string[];
  if (list.entityType === 'account') {
    const accountContacts = await db.select({ id: contacts.id })
      .from(contacts)
      .where(and(inArray(contacts.accountId, recordIds), isNull(contacts.deletedAt)));
    contactIds = accountContacts.map(c => c.id);
  } else {
    contactIds = recordIds;
  }

  console.log(`[Brevo Sync] Pushing list "${list.name}" (${contactIds.length} contacts) to Brevo list ${brevoListId}`);
  return bulkPushContactsToBrevo(contactIds, brevoListId);
}

/**
 * Create a new list in Brevo and return its ID.
 */
export async function createBrevoList(name: string, folderId: number = 1): Promise {
  const res = await brevoFetch('/contacts/lists', {
    method: 'POST',
    body: JSON.stringify({ name, folderId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo create list error (${res.status}): ${text}`);
  }
  const data = await res.json() as { id: number };
  return { id: data.id, name };
}

// ---------------------------------------------------------------------------
// Brevo Email Campaign integration
// ---------------------------------------------------------------------------

/** List Brevo email campaigns with optional status filter */
export async function listBrevoCampaigns(options: { status?: string; limit?: number; offset?: number } = {}): Promise {
  const { status, limit = 50, offset = 0 } = options;
  let path = `/emailCampaigns?limit=${limit}&offset=${offset}&sort=desc`;
  if (status) path += `&status=${status}`;

  const res = await brevoFetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error listing campaigns (${res.status}): ${text}`);
  }
  return res.json() as Promise;
}

/** Get a single Brevo campaign with full stats */
export async function getBrevoCampaign(campaignId: number): Promise {
  const res = await brevoFetch(`/emailCampaigns/${campaignId}?statistics=globalStats`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error fetching campaign (${res.status}): ${text}`);
  }
  return res.json() as Promise;
}

// ---------------------------------------------------------------------------
// Engagement Reporting
// ---------------------------------------------------------------------------

/**
 * Get engagement report for a Brevo email campaign.
 * Fetches stats from Brevo API and computes rates.
 */
export async function getBrevoCampaignEngagement(campaignId: number): Promise {
  const campaign = await getBrevoCampaign(campaignId);
  const gs = campaign.statistics?.globalStats || ({} as BrevoGlobalStats);

  const sent = gs.sent || 0;
  const delivered = gs.delivered || 0;
  const uniqueOpens = gs.uniqueViews || 0;
  const uniqueClicks = gs.uniqueClicks || 0;
  const hardBounces = gs.hardBounces || 0;
  const softBounces = gs.softBounces || 0;
  const unsubscriptions = gs.unsubscriptions || 0;
  const complaints = gs.complaints || 0;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    subject: campaign.subject,
    status: campaign.status,
    sentDate: campaign.sentDate,
    sent,
    delivered,
    uniqueOpens,
    uniqueClicks,
    hardBounces,
    softBounces,
    unsubscriptions,
    complaints,
    deliveryRate: sent > 0 ? delivered / sent : 0,
    openRate: delivered > 0 ? uniqueOpens / delivered : 0,
    clickRate: delivered > 0 ? uniqueClicks / delivered : 0,
    clickToOpenRate: uniqueOpens > 0 ? uniqueClicks / uniqueOpens : 0,
    bounceRate: sent > 0 ? (hardBounces + softBounces) / sent : 0,
    unsubscribeRate: delivered > 0 ? unsubscriptions / delivered : 0,
  };
}

/**
 * Get engagement reports for all sent Brevo campaigns.
 */
export async function getAllBrevoEngagementReports(limit = 50): Promise {
  const { campaigns } = await listBrevoCampaigns({ status: 'sent', limit });
  const reports: BrevoEngagementReport[] = [];

  for (const campaign of campaigns) {
    try {
      const report = await getBrevoCampaignEngagement(campaign.id);
      reports.push(report);
    } catch (err: any) {
      console.warn(`[Brevo Sync] Failed to get engagement for campaign ${campaign.id}: ${err.message}`);
    }
  }

  return reports;
}

/**
 * Get aggregated Brevo account-level email statistics.
 */
export async function getBrevoAccountStats(): Promise {
  // Use the SMTP statistics endpoint
  const res = await brevoFetch('/smtp/statistics/aggregatedReport');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error fetching stats (${res.status}): ${text}`);
  }
  const data = await res.json() as Record;

  return {
    totalSent: data.requests || 0,
    totalDelivered: data.delivered || 0,
    totalOpens: data.uniqueOpens || data.opens || 0,
    totalClicks: data.uniqueClicks || data.clicks || 0,
    totalHardBounces: data.hardBounces || 0,
    totalSoftBounces: data.softBounces || 0,
    totalUnsubscribed: data.unsubscribed || 0,
    totalComplaints: data.spamReports || 0,
    totalBlocked: data.blocked || 0,
  };
}

/**
 * Get Brevo SMTP statistics broken down by day.
 */
export async function getBrevoStatsByDay(days = 30): Promise> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const start = startDate.toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];

  const res = await brevoFetch(`/smtp/statistics/reports?startDate=${start}&endDate=${end}&days=${days}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo API error fetching daily stats (${res.status}): ${text}`);
  }

  const data = await res.json() as { reports: Array> };
  return (data.reports || []).map((r: any) => ({
    date: r.date,
    delivered: r.delivered || 0,
    opens: r.uniqueOpens || r.opens || 0,
    clicks: r.uniqueClicks || r.clicks || 0,
    hardBounces: r.hardBounces || 0,
    softBounces: r.softBounces || 0,
    unsubscribed: r.unsubscribed || 0,
    complaints: r.spamReports || 0,
  }));
}

// ---------------------------------------------------------------------------
// Blocklist management (unified CRM + Brevo)
// ---------------------------------------------------------------------------

/**
 * Add an email to Brevo blocklist (blacklist).
 */
export async function addToBrevoBlocklist(email: string): Promise {
  // Update the contact as blacklisted in Brevo
  const res = await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify({ emailBlacklisted: true }),
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Brevo blocklist add error (${res.status}): ${text}`);
  }
}

/**
 * Remove an email from Brevo blocklist.
 */
export async function removeFromBrevoBlocklist(email: string): Promise {
  const res = await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify({ emailBlacklisted: false }),
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Brevo blocklist remove error (${res.status}): ${text}`);
  }
}

/**
 * Get unified blocklist view: combines CRM suppression list + Brevo blacklist.
 * Returns a merged, deduplicated list showing source of each entry.
 */
export async function getUnifiedBlocklist(limit = 200, offset = 0): Promise {
  // 1. CRM suppression list
  const suppressions = await db
    .select({
      email: emailSuppressionList.email,
      emailNormalized: emailSuppressionList.emailNormalized,
      reason: emailSuppressionList.reason,
      contactId: emailSuppressionList.contactId,
    })
    .from(emailSuppressionList)
    .orderBy(desc(emailSuppressionList.addedAt));

  // 2. Build map from CRM
  const entryMap = new Map();
  for (const s of suppressions) {
    entryMap.set(s.emailNormalized, {
      email: s.email,
      emailBlacklisted: true,
      smsBlacklisted: false,
      source: 'crm',
      crmContactId: s.contactId || undefined,
      crmSuppressionReason: s.reason,
    });
  }

  // 3. Fetch Brevo blacklisted contacts (paginated)
  let brevoOffset = 0;
  const brevoLimit = 500;
  while (true) {
    const res = await brevoFetch(`/contacts?limit=${brevoLimit}&offset=${brevoOffset}&sort=desc`);
    if (!res.ok) break;

    const data = await res.json() as { contacts: BrevoContact[]; count: number };
    for (const bc of data.contacts) {
      if (!bc.emailBlacklisted) continue;
      const normalized = bc.email.toLowerCase().trim();
      const existing = entryMap.get(normalized);
      if (existing) {
        existing.source = 'both';
        existing.brevoId = bc.id;
        existing.emailBlacklisted = true;
        existing.smsBlacklisted = bc.smsBlacklisted || false;
      } else {
        entryMap.set(normalized, {
          email: bc.email,
          emailBlacklisted: true,
          smsBlacklisted: bc.smsBlacklisted || false,
          source: 'brevo',
          brevoId: bc.id,
        });
      }
    }

    brevoOffset += brevoLimit;
    if (brevoOffset >= data.count) break;
  }

  const all = Array.from(entryMap.values());
  return {
    entries: all.slice(offset, offset + limit),
    total: all.length,
  };
}

/**
 * Add email to both Brevo blocklist AND CRM suppression list.
 */
export async function blockEmailEverywhere(email: string, reason: 'hard_bounce' | 'unsubscribe' | 'spam_complaint' | 'manual' = 'manual'): Promise {
  const normalized = email.toLowerCase().trim();

  // 1. Block in Brevo
  try {
    await addToBrevoBlocklist(email);
  } catch (err: any) {
    console.warn(`[Brevo Sync] Failed to blocklist in Brevo: ${err.message}`);
  }

  // 2. Add to CRM suppression list (if not already)
  const [existing] = await db
    .select({ id: emailSuppressionList.id })
    .from(emailSuppressionList)
    .where(eq(emailSuppressionList.emailNormalized, normalized))
    .limit(1);

  if (!existing) {
    const [crmContact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.emailNormalized, normalized), isNull(contacts.deletedAt)))
      .limit(1);

    await db.insert(emailSuppressionList).values({
      email,
      emailNormalized: normalized,
      reason,
      contactId: crmContact?.id || null,
      metadata: { source: 'brevo_sync_block', blockedAt: new Date().toISOString() },
    });

    // Update CRM contact
    if (crmContact) {
      await db.update(contacts).set({
        emailStatus: reason === 'unsubscribe' ? 'unsubscribed' : reason === 'spam_complaint' ? 'spam_complaint' : 'blocked',
        isInvalid: reason === 'hard_bounce',
        invalidReason: reason === 'hard_bounce' ? 'Blocked via Brevo sync' : null,
        updatedAt: new Date(),
      }).where(eq(contacts.id, crmContact.id));
    }
  }
}

/**
 * Remove email from both Brevo blocklist AND CRM suppression list.
 */
export async function unblockEmailEverywhere(email: string): Promise {
  const normalized = email.toLowerCase().trim();

  // 1. Unblock in Brevo
  try {
    await removeFromBrevoBlocklist(email);
  } catch (err: any) {
    console.warn(`[Brevo Sync] Failed to remove from Brevo blocklist: ${err.message}`);
  }

  // 2. Remove from CRM suppression list
  await db.delete(emailSuppressionList)
    .where(eq(emailSuppressionList.emailNormalized, normalized));

  // 3. Restore CRM contact email status
  const [crmContact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.emailNormalized, normalized), isNull(contacts.deletedAt)))
    .limit(1);

  if (crmContact) {
    await db.update(contacts).set({
      emailStatus: 'valid',
      isInvalid: false,
      invalidReason: null,
      updatedAt: new Date(),
    }).where(eq(contacts.id, crmContact.id));
  }
}

// ---------------------------------------------------------------------------
// CRM ↔ Brevo engagement cross-reference
// ---------------------------------------------------------------------------

/**
 * Get combined engagement stats for a CRM campaign that was sent via Brevo.
 * Merges local emailEvents data with Brevo's campaign stats.
 */
export async function getCombinedCampaignEngagement(crmCampaignId: string, brevoCampaignId?: number): Promise {
  // CRM stats from local DB
  const [sendStats] = await db
    .select({
      totalSent: sql`COUNT(*)::int`,
      delivered: sql`COUNT(CASE WHEN ${emailSends.status} = 'sent' THEN 1 END)::int`,
      bounced: sql`COUNT(CASE WHEN ${emailSends.status} = 'bounced' THEN 1 END)::int`,
    })
    .from(emailSends)
    .where(eq(emailSends.campaignId, crmCampaignId));

  const [eventStats] = await db
    .select({
      opened: sql`COUNT(CASE WHEN ${emailEvents.type} = 'opened' THEN 1 END)::int`,
      clicked: sql`COUNT(CASE WHEN ${emailEvents.type} = 'clicked' THEN 1 END)::int`,
      unsubscribed: sql`COUNT(CASE WHEN ${emailEvents.type} = 'unsubscribed' THEN 1 END)::int`,
      complained: sql`COUNT(CASE WHEN ${emailEvents.type} = 'complained' THEN 1 END)::int`,
    })
    .from(emailEvents)
    .where(eq(emailEvents.campaignId, crmCampaignId));

  let brevoReport: BrevoEngagementReport | null = null;
  if (brevoCampaignId) {
    try {
      brevoReport = await getBrevoCampaignEngagement(brevoCampaignId);
    } catch { /* Brevo campaign may not exist */ }
  }

  return {
    crm: {
      totalSent: sendStats?.totalSent || 0,
      delivered: sendStats?.delivered || 0,
      opened: eventStats?.opened || 0,
      clicked: eventStats?.clicked || 0,
      bounced: sendStats?.bounced || 0,
      unsubscribed: eventStats?.unsubscribed || 0,
      complained: eventStats?.complained || 0,
    },
    brevo: brevoReport,
  };
}