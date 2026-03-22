/**
 * Argyle Events Integration — Sync Runner
 * 
 * Orchestrates the full event sync cycle:
 * 1. Fetch events from Argyle website
 * 2. Upsert ExternalEvent records
 * 3. Create/update WorkOrderDraft records with edit-safe merge
 * 
 * Key invariants:
 * - Only runs for the Argyle client (hard client gate)
 * - Feature flag must be enabled
 * - Client edits are NEVER overwritten on re-sync
 * - lead_count is always preserved
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import { externalEvents, workOrderDrafts, clientAccounts } from '@shared/schema';
import { fetchAllEvents } from './scraper';
import { generateSourceFields, enrichWithLLM } from './draft-generator';
import { isFeatureEnabled } from '../../feature-flags';
import type { ArgyleEvent, EventSyncResult, SyncRunResult, DraftFieldsPayload } from './types';

const SOURCE_PROVIDER = 'argyle';

/**
 * Hard client gate: resolve the Argyle client account ID.
 * Returns null if client not found or feature flag is off.
 */
export async function resolveArgyleClientId(): Promise {
  if (!isFeatureEnabled('argyle_event_drafts')) {
    console.log('[SyncRunner] Feature flag argyle_event_drafts is OFF');
    return null;
  }

  const [argyleClient] = await db
    .select({ id: clientAccounts.id, name: clientAccounts.name })
    .from(clientAccounts)
    .where(eq(clientAccounts.name, 'Argyle'))
    .limit(1);

  if (!argyleClient) {
    console.log('[SyncRunner] No client account named "Argyle" found');
    return null;
  }

  return argyleClient.id;
}

/**
 * Verify a given client account ID belongs to Argyle.
 */
export async function isArgyleClient(clientAccountId: string): Promise {
  const [client] = await db
    .select({ name: clientAccounts.name })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, clientAccountId))
    .limit(1);

  return client?.name === 'Argyle';
}

/**
 * Edit-safe merge: update draft fields without overwriting client edits.
 * 
 * Strategy:
 * - source_fields: always overwritten with latest parsed data
 * - draft_fields: only update fields NOT in edited_fields set
 * - edited_fields: never cleared (only client can reset)
 * - lead_count: NEVER overwritten
 */
function mergeFields(
  newSourceFields: DraftFieldsPayload,
  existingDraftFields: Record,
  editedFields: string[],
): Record {
  const merged = { ...existingDraftFields };
  const editedSet = new Set(editedFields);

  for (const [key, value] of Object.entries(newSourceFields)) {
    // Never overwrite fields the client has edited
    if (editedSet.has(key)) continue;
    // Never overwrite lead_count via sync
    if (key === 'lead_count') continue;
    merged[key] = value;
  }

  return merged;
}

/**
 * Upsert a single external event and its associated draft.
 */
async function syncSingleEvent(
  event: ArgyleEvent,
  clientId: string,
  useLLM: boolean = false,
): Promise {
  try {
    // Check if event already exists
    const [existing] = await db
      .select()
      .from(externalEvents)
      .where(
        and(
          eq(externalEvents.clientId, clientId),
          eq(externalEvents.sourceProvider, SOURCE_PROVIDER),
          eq(externalEvents.externalId, event.externalId),
        )
      )
      .limit(1);

    let eventId: string;
    let eventAction: 'created' | 'updated' | 'unchanged';

    if (!existing) {
      // Create new event
      const [created] = await db
        .insert(externalEvents)
        .values({
          clientId,
          sourceProvider: SOURCE_PROVIDER,
          externalId: event.externalId,
          sourceUrl: event.sourceUrl,
          sourceHash: event.sourceHash || null,
          title: event.title,
          community: event.community || null,
          eventType: event.eventType || null,
          location: event.location || null,
          startAtIso: event.dateIso ? new Date(event.dateIso) : null,
          startAtHuman: event.dateHuman || null,
          needsDateReview: event.needsDateReview || false,
          overviewExcerpt: event.overviewExcerpt || null,
          agendaExcerpt: event.agendaExcerpt || null,
          speakersExcerpt: event.speakersExcerpt || null,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
        })
        .returning({ id: externalEvents.id });

      eventId = created.id;
      eventAction = 'created';
    } else if (existing.sourceHash !== event.sourceHash) {
      // Update existing event (source data changed)
      await db
        .update(externalEvents)
        .set({
          sourceHash: event.sourceHash || null,
          title: event.title,
          community: event.community || null,
          eventType: event.eventType || null,
          location: event.location || null,
          startAtIso: event.dateIso ? new Date(event.dateIso) : null,
          startAtHuman: event.dateHuman || null,
          needsDateReview: event.needsDateReview || false,
          overviewExcerpt: event.overviewExcerpt || null,
          agendaExcerpt: event.agendaExcerpt || null,
          speakersExcerpt: event.speakersExcerpt || null,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
          updatedAt: new Date(),
        })
        .where(eq(externalEvents.id, existing.id));

      eventId = existing.id;
      eventAction = 'updated';
    } else {
      // No changes
      await db
        .update(externalEvents)
        .set({ lastSyncedAt: new Date() })
        .where(eq(externalEvents.id, existing.id));

      eventId = existing.id;
      eventAction = 'unchanged';
    }

    // Generate source fields (with optional LLM enrichment)
    const sourceFields = useLLM
      ? await enrichWithLLM(event)
      : generateSourceFields(event);

    // Upsert draft
    const draftAction = await upsertDraft(eventId, clientId, sourceFields, eventAction);

    return {
      externalId: event.externalId,
      title: event.title,
      action: eventAction,
      draftAction,
    };
  } catch (error: any) {
    console.error(`[SyncRunner] Error syncing event ${event.externalId}:`, error.message);
    return {
      externalId: event.externalId,
      title: event.title,
      action: 'error',
      error: error.message,
    };
  }
}

/**
 * Upsert a work order draft for an external event.
 * Preserves client edits on re-sync.
 */
async function upsertDraft(
  eventId: string,
  clientId: string,
  sourceFields: DraftFieldsPayload,
  eventAction: 'created' | 'updated' | 'unchanged',
): Promise {
  // Check for existing draft linked to this event
  const [existingDraft] = await db
    .select()
    .from(workOrderDrafts)
    .where(eq(workOrderDrafts.externalEventId, eventId))
    .limit(1);

  if (!existingDraft) {
    // Create new draft
    await db.insert(workOrderDrafts).values({
      clientAccountId: clientId,
      externalEventId: eventId,
      status: 'draft',
      sourceFields: sourceFields as any,
      draftFields: sourceFields as any,
      editedFields: [],
    });
    return 'created';
  }

  // Draft exists — only update if event data changed
  if (eventAction === 'unchanged') {
    return 'unchanged';
  }

  // Don't touch drafted/submitted drafts that have been submitted
  if (existingDraft.status === 'submitted') {
    return 'unchanged';
  }

  // Edit-safe merge
  const mergedDraftFields = mergeFields(
    sourceFields,
    existingDraft.draftFields as Record,
    (existingDraft.editedFields as string[]) || [],
  );

  await db
    .update(workOrderDrafts)
    .set({
      sourceFields: sourceFields as any,
      draftFields: mergedDraftFields as any,
      updatedAt: new Date(),
    })
    .where(eq(workOrderDrafts.id, existingDraft.id));

  return 'updated';
}

/**
 * Main sync entry point.
 * Fetches all events from Argyle and upserts into DB.
 * 
 * @param useLLM - Whether to use LLM enrichment (default: false for speed)
 */
export async function runArgyleEventSync(useLLM: boolean = false): Promise {
  const startedAt = new Date().toISOString();

  // Resolve Argyle client (hard gate)
  const clientId = await resolveArgyleClientId();
  if (!clientId) {
    return {
      provider: SOURCE_PROVIDER,
      clientId: '',
      startedAt,
      completedAt: new Date().toISOString(),
      eventsFound: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsUnchanged: 0,
      eventsErrored: 0,
      draftsCreated: 0,
      draftsUpdated: 0,
      results: [],
    };
  }

  console.log(`[SyncRunner] Starting Argyle event sync for client ${clientId}`);

  // Fetch all events from Argyle
  const events = await fetchAllEvents();

  // Sync each event
  const results: EventSyncResult[] = [];
  for (const event of events) {
    const result = await syncSingleEvent(event, clientId, useLLM);
    results.push(result);
  }

  const completedAt = new Date().toISOString();

  const syncResult: SyncRunResult = {
    provider: SOURCE_PROVIDER,
    clientId,
    startedAt,
    completedAt,
    eventsFound: events.length,
    eventsCreated: results.filter(r => r.action === 'created').length,
    eventsUpdated: results.filter(r => r.action === 'updated').length,
    eventsUnchanged: results.filter(r => r.action === 'unchanged').length,
    eventsErrored: results.filter(r => r.action === 'error').length,
    draftsCreated: results.filter(r => r.draftAction === 'created').length,
    draftsUpdated: results.filter(r => r.draftAction === 'updated').length,
    results,
  };

  console.log(`[SyncRunner] Sync complete:`, {
    eventsFound: syncResult.eventsFound,
    created: syncResult.eventsCreated,
    updated: syncResult.eventsUpdated,
    unchanged: syncResult.eventsUnchanged,
    errors: syncResult.eventsErrored,
    draftsCreated: syncResult.draftsCreated,
    draftsUpdated: syncResult.draftsUpdated,
  });

  return syncResult;
}