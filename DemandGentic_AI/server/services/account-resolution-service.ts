/**
 * Account Resolution Service
 *
 * Resolves account IDs from lists, campaigns, and segments.
 * Shared by both the synchronous intelligence/gather endpoint
 * and the async OI batch pipeline worker.
 */

import { db } from '../db';
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm';
import {
  lists, contacts, accounts, segments, campaigns, campaignQueue,
} from '@shared/schema';
import { buildFilterQuery } from '../filter-builder';
import type { FilterGroup } from '@shared/filter-types';

// ==================== Utility helpers ====================

export function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0);
  return Array.from(new Set(cleaned));
}

export function chunkArray(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i ;
}> {
  const accountIds = new Set();
  const breakdown: Array = [];

  if (listIds.length === 0) return { accountIds: [], breakdown };

  const listRows = await db
    .select({
      id: lists.id,
      name: lists.name,
      entityType: lists.entityType,
      recordIds: lists.recordIds,
    })
    .from(lists)
    .where(inArray(lists.id, listIds));

  for (const row of listRows) {
    const ids = Array.isArray(row.recordIds) ? row.recordIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    let resolvedCount = 0;

    if (row.entityType === 'account') {
      for (const id of ids) accountIds.add(id);
      resolvedCount = ids.length;
    } else if (row.entityType === 'contact' && ids.length > 0) {
      const resolved = new Set();
      for (const chunk of chunkArray(ids, 500)) {
        const contactsWithAccount = await db
          .select({ accountId: contacts.accountId })
          .from(contacts)
          .where(
            and(
              inArray(contacts.id, chunk),
              isNotNull(contacts.accountId),
              isNull(contacts.deletedAt)
            )
          );
        for (const c of contactsWithAccount) {
          if (c.accountId) resolved.add(c.accountId);
        }
      }
      for (const id of resolved) accountIds.add(id);
      resolvedCount = resolved.size;
    }

    breakdown.push({
      listId: row.id,
      listName: row.name || row.id,
      entityType: row.entityType,
      resolvedAccounts: resolvedCount,
    });
  }

  return {
    accountIds: Array.from(accountIds),
    breakdown,
  };
}

export async function resolveAccountIdsFromCampaign(campaignId: string): Promise {
  const accountIds = new Set();
  const sources = {
    queue: 0,
    directRefs: 0,
    audienceLists: 0,
    audienceSegments: 0,
    audienceFilter: 0,
  };

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      audienceRefs: campaigns.audienceRefs,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return {
      campaignName: null,
      accountIds: [],
      sources,
    };
  }

  // 1) Existing queue entries
  const queued = await db
    .selectDistinct({ accountId: campaignQueue.accountId })
    .from(campaignQueue)
    .where(
      and(
        eq(campaignQueue.campaignId, campaignId),
        isNotNull(campaignQueue.accountId)
      )
    );

  for (const row of queued) {
    if (row.accountId) accountIds.add(row.accountId);
  }
  sources.queue = queued.length;

  const refs = (campaign.audienceRefs || {}) as any;

  // 2) Direct account refs in audience payload
  const directRefs = uniqueStrings([...(Array.isArray(refs?.accounts) ? refs.accounts : []), ...(Array.isArray(refs?.accountIds) ? refs.accountIds : []), ...(Array.isArray(refs?.selectedAccounts) ? refs.selectedAccounts : [])]);
  for (const id of directRefs) accountIds.add(id);
  sources.directRefs = directRefs.length;

  // 3) List refs in campaign audience
  const audienceListIds = uniqueStrings([...(Array.isArray(refs?.lists) ? refs.lists : []), ...(Array.isArray(refs?.selectedLists) ? refs.selectedLists : [])]);
  if (audienceListIds.length > 0) {
    const fromLists = await resolveAccountIdsFromLists(audienceListIds);
    for (const id of fromLists.accountIds) accountIds.add(id);
    sources.audienceLists = fromLists.accountIds.length;
  }

  // 4) Segment refs in campaign audience
  const segmentIds = uniqueStrings([...(Array.isArray(refs?.segments) ? refs.segments : []), ...(Array.isArray(refs?.selectedSegments) ? refs.selectedSegments : [])]);
  if (segmentIds.length > 0) {
    const segmentRows = await db
      .select({
        id: segments.id,
        entityType: segments.entityType,
        definitionJson: segments.definitionJson,
      })
      .from(segments)
      .where(inArray(segments.id, segmentIds));

    for (const segment of segmentRows) {
      try {
        const definition = (segment.definitionJson || {}) as FilterGroup;
        const table = segment.entityType === 'account' ? accounts : contacts;
        const filterSql = buildFilterQuery(definition, table as any);
        if (!filterSql) continue;

        if (segment.entityType === 'account') {
          const rows = await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(filterSql);
          for (const row of rows) accountIds.add(row.id);
          sources.audienceSegments += rows.length;
        } else {
          const rows = await db
            .selectDistinct({ accountId: contacts.accountId })
            .from(contacts)
            .where(
              and(
                filterSql,
                isNotNull(contacts.accountId),
                isNull(contacts.deletedAt)
              )
            );
          for (const row of rows) {
            if (row.accountId) accountIds.add(row.accountId);
          }
          sources.audienceSegments += rows.length;
        }
      } catch (error) {
        console.warn(`[AccountResolution] Failed to resolve segment ${segment.id} for campaign ${campaignId}:`, error);
      }
    }
  }

  // 5) Filter-group refs in campaign audience
  if (refs?.filterGroup) {
    try {
      const filterSql = buildFilterQuery(refs.filterGroup as FilterGroup, contacts as any);
      if (filterSql) {
        const rows = await db
          .selectDistinct({ accountId: contacts.accountId })
          .from(contacts)
          .where(
            and(
              filterSql,
              isNotNull(contacts.accountId),
              isNull(contacts.deletedAt)
            )
          );
        for (const row of rows) {
          if (row.accountId) accountIds.add(row.accountId);
        }
        sources.audienceFilter += rows.length;
      }
    } catch (error) {
      console.warn(`[AccountResolution] Failed to resolve filterGroup for campaign ${campaignId}:`, error);
    }
  }

  // 6) Explicit all-contacts mode
  if (refs?.allContacts === true) {
    const rows = await db
      .selectDistinct({ accountId: contacts.accountId })
      .from(contacts)
      .where(and(isNotNull(contacts.accountId), isNull(contacts.deletedAt)));
    for (const row of rows) {
      if (row.accountId) accountIds.add(row.accountId);
    }
    sources.audienceFilter += rows.length;
  }

  return {
    campaignName: campaign.name,
    accountIds: Array.from(accountIds),
    sources,
  };
}