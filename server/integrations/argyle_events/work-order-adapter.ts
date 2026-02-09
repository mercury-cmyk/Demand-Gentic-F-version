/**
 * Argyle Events Integration — Work Order Adapter
 * 
 * Adapter/wrapper layer that converts a submitted WorkOrderDraft into a WorkOrder
 * via the existing ordering system. This ensures existing order flows remain unchanged.
 */

import { db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { workOrders, workOrderDrafts, clientPortalActivityLogs } from '@shared/schema';
import type { DraftFieldsPayload } from './types';

/**
 * Generate a unique order number for a work order.
 */
function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WO-${dateStr}-${random}`;
}

/**
 * Submit a draft as a work order.
 * 
 * This adapter converts draft fields into the workOrders table format,
 * creates the work order, links it back to the draft, and logs the activity.
 * 
 * Existing order flows are NOT modified — this creates records in the same
 * workOrders table but via this isolated adapter.
 */
export async function submitDraftAsWorkOrder(
  draftId: string,
  clientAccountId: string,
  clientUserId?: string,
): Promise<{ workOrderId: string; orderNumber: string }> {
  // Fetch the draft
  const [draft] = await db
    .select()
    .from(workOrderDrafts)
    .where(eq(workOrderDrafts.id, draftId))
    .limit(1);

  if (!draft) {
    throw new Error('Draft not found');
  }

  if (draft.clientAccountId !== clientAccountId) {
    throw new Error('Unauthorized: draft does not belong to this client');
  }

  if (draft.status === 'submitted') {
    throw new Error('Draft has already been submitted');
  }

  if (!draft.leadCount || draft.leadCount <= 0) {
    throw new Error('Lead count is required and must be greater than 0');
  }

  const draftFields = draft.draftFields as DraftFieldsPayload;

  // Create work order from draft fields
  const orderNumber = generateOrderNumber();
  const [workOrder] = await db
    .insert(workOrders)
    .values({
      orderNumber,
      clientAccountId,
      clientUserId: clientUserId || null,
      title: draftFields.title || 'Argyle Event Campaign',
      description: draftFields.description || draftFields.context || '',
      orderType: 'lead_generation',
      priority: 'normal',
      status: 'submitted',
      targetLeadCount: draft.leadCount,
      targetTitles: draftFields.targetAudience || [],
      targetIndustries: draftFields.targetIndustries || [],
      targetRegions: draftFields.eventLocation ? [draftFields.eventLocation] : [],
      clientNotes: [
        draftFields.targetingNotes,
        draftFields.timingNotes,
        `Event: ${draftFields.sourceUrl}`,
      ].filter(Boolean).join('\n\n'),
      specialRequirements: draftFields.objective || '',
      organizationContext: draftFields.context || '',
      requestedStartDate: null,
      requestedEndDate: null,
      submittedAt: new Date(),
    })
    .returning({ id: workOrders.id });

  // Link draft to work order and mark as submitted
  await db
    .update(workOrderDrafts)
    .set({
      workOrderId: workOrder.id,
      status: 'submitted',
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workOrderDrafts.id, draftId));

  // Log activity
  try {
    await db.insert(clientPortalActivityLogs).values({
      clientAccountId,
      clientUserId: clientUserId || null,
      action: 'work_order_submitted',
      entityType: 'work_order',
      entityId: workOrder.id,
      details: {
        orderNumber,
        draftId,
        title: draftFields.title,
        leadCount: draft.leadCount,
        source: 'argyle_event_draft',
      },
    });
  } catch (e) {
    // Activity logging is non-critical
    console.error('[WorkOrderAdapter] Failed to log activity:', e);
  }

  console.log(`[WorkOrderAdapter] Draft ${draftId} submitted as work order ${orderNumber}`);

  return {
    workOrderId: workOrder.id,
    orderNumber,
  };
}
