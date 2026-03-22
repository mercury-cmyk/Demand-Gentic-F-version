/**
 * Argyle Events Integration — Project Bridge
 *
 * Converts submitted Argyle event drafts into clientProject entries
 * so they appear in the Admin Project Requests view for approval.
 *
 * Idempotent: will not create duplicate projects for the same
 * (clientAccountId, externalEventId) pair.
 *
 * On admin approval, the existing admin-project-requests flow
 * auto-creates a campaign linked via clientAccountId + projectId,
 * making it visible in the client dashboard.
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import {
  clientProjects,
  externalEvents,
  workOrderDrafts,
  clientPortalActivityLogs,
} from '@shared/schema';
import type { DraftFieldsPayload } from './types';

export interface ProjectBridgeResult {
  projectId: string;
  created: boolean;
  status: string;
}

/**
 * Create (or return existing) clientProject from a submitted Argyle event draft.
 *
 * Idempotency: checks (clientAccountId, externalEventId). If a project already
 * exists for this event+client, returns it without modification.
 */
export async function createProjectFromDraft(
  draftId: string,
  clientAccountId: string,
  clientUserId?: string,
): Promise {
  // 1. Fetch the draft with its event
  const [draft] = await db
    .select()
    .from(workOrderDrafts)
    .where(eq(workOrderDrafts.id, draftId))
    .limit(1);

  if (!draft) {
    throw new Error(`[ProjectBridge] Draft ${draftId} not found`);
  }

  if (draft.clientAccountId !== clientAccountId) {
    throw new Error('[ProjectBridge] Unauthorized: draft does not belong to this client');
  }

  if (!draft.externalEventId) {
    throw new Error('[ProjectBridge] Draft has no linked external event');
  }

  // 2. Idempotency check: does a project already exist for this event+client?
  const [existing] = await db
    .select({ id: clientProjects.id, status: clientProjects.status })
    .from(clientProjects)
    .where(
      and(
        eq(clientProjects.clientAccountId, clientAccountId),
        eq(clientProjects.externalEventId, draft.externalEventId),
      ),
    )
    .limit(1);

  if (existing) {
    console.log(`[ProjectBridge] Project already exists for event ${draft.externalEventId}: ${existing.id}`);
    return { projectId: existing.id, created: false, status: existing.status };
  }

  // 3. Fetch event metadata for richer project info
  const [event] = await db
    .select()
    .from(externalEvents)
    .where(eq(externalEvents.id, draft.externalEventId))
    .limit(1);

  const draftFields = (draft.draftFields || {}) as DraftFieldsPayload;

  // 4. Build project name & description from event + draft
  const projectName = draftFields.title || event?.title || 'Argyle Event Campaign';
  const projectDescription = buildDescription(draftFields, event);

  // 5. Create the project in 'pending' status (ready for admin review)
  // Note: createdBy must reference a real user; use null if clientUserId is not a valid user FK
  const [project] = await db
    .insert(clientProjects)
    .values({
      clientAccountId,
      name: projectName,
      description: projectDescription,
      status: 'pending',
      requestedLeadCount: draft.leadCount || null,
      externalEventId: draft.externalEventId,
      projectType: 'call_campaign',
      createdBy: null, // Client user ID doesn't map to users table FK; admin sets on approval
    })
    .returning();

  // 6. Log activity
  try {
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId,
      clientUserId: clientUserId || null,
      action: 'event_project_created',
      entityType: 'project',
      entityId: project.id,
      details: {
        source: 'argyle_event_bridge',
        draftId,
        externalEventId: draft.externalEventId,
        eventTitle: event?.title,
        leadCount: draft.leadCount,
      },
    });
  } catch (e) {
    console.error('[ProjectBridge] Activity log failed (non-critical):', e);
  }

  console.log(`[ProjectBridge] Created project ${project.id} for event ${draft.externalEventId}`);

  return { projectId: project.id, created: true, status: project.status };
}

/**
 * Build a rich description from draft fields + event metadata.
 */
function buildDescription(fields: DraftFieldsPayload, event: any): string {
  const parts: string[] = [];

  if (fields.context) parts.push(fields.context);
  if (fields.objective) parts.push(`Objective: ${fields.objective}`);

  if (event) {
    if (event.community) parts.push(`Community: ${event.community}`);
    if (event.eventType) parts.push(`Event Type: ${event.eventType}`);
    if (event.location) parts.push(`Location: ${event.location}`);
    if (event.startAtHuman) parts.push(`Date: ${event.startAtHuman}`);
    if (event.sourceUrl) parts.push(`Source: ${event.sourceUrl}`);
  }

  if (fields.targetAudience?.length) {
    parts.push(`Target Audience: ${fields.targetAudience.join(', ')}`);
  }
  if (fields.targetIndustries?.length) {
    parts.push(`Target Industries: ${fields.targetIndustries.join(', ')}`);
  }

  return parts.join('\n\n') || 'Lead generation campaign from Argyle event';
}

/**
 * Get the project status for a given external event + client.
 * Returns null if no project exists.
 */
export async function getProjectForEvent(
  clientAccountId: string,
  externalEventId: string,
): Promise {
  const [project] = await db
    .select({
      id: clientProjects.id,
      status: clientProjects.status,
    })
    .from(clientProjects)
    .where(
      and(
        eq(clientProjects.clientAccountId, clientAccountId),
        eq(clientProjects.externalEventId, externalEventId),
      ),
    )
    .limit(1);

  if (!project) return null;

  return {
    projectId: project.id,
    status: project.status,
  };
}