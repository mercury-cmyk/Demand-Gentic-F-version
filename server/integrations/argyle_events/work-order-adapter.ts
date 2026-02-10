/**
 * Argyle Events Integration — Work Order Adapter
 * 
 * Adapter/wrapper layer that converts a submitted WorkOrderDraft into a WorkOrder
 * via the existing ordering system. This ensures existing order flows remain unchanged.
 */

import { db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { workOrderDrafts, clientPortalActivityLogs } from '@shared/schema';
import type { DraftFieldsPayload } from './types';

/**
 * Normalize array fields to string[] for text[] columns.
 * Handles: string[], [{label,value}], null, undefined
 */
export function normalizeToStringArray(input: any): string[] {
  if (!input || !Array.isArray(input)) return [];
  return input
    .filter((item: any) => item != null && item !== '')
    .map((item: any) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) return item.value || item.label || '';
      return String(item);
    })
    .filter(Boolean);
}

/**
 * Convert JS arrays to PostgreSQL text[] literal format: '{val1,val2,...}'
 */
export function toPgTextArray(arr: string[]): string {
  if (arr.length === 0) return '{}';
  return `{${arr.map(s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` ).join(',')}}`;  
}

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
  // NOTE: Using raw SQL because workOrders.organizationContext exists in Drizzle schema
  // but NOT in the actual database (known schema drift). Drizzle insert would fail.
  const orderNumber = generateOrderNumber();
  const clientNotes = [
    draftFields.targetingNotes,
    draftFields.timingNotes,
    `Event: ${draftFields.sourceUrl}`,
  ].filter(Boolean).join('\n\n');

  const targetTitles = normalizeToStringArray(draftFields.targetAudience);
  const targetIndustries = normalizeToStringArray(draftFields.targetIndustries);
  const targetRegions = draftFields.eventLocation ? [draftFields.eventLocation] : [];

  const workOrderResult = await db.execute(sql`
    INSERT INTO work_orders (
      order_number, client_account_id, client_user_id, title, description,
      order_type, priority, status, target_lead_count,
      target_titles, target_industries, target_regions,
      client_notes, special_requirements,
      requested_start_date, requested_end_date, submitted_at
    ) VALUES (
      ${orderNumber}, ${clientAccountId}, ${clientUserId || null},
      ${draftFields.title || 'Argyle Event Campaign'},
      ${draftFields.description || draftFields.context || ''},
      'lead_generation', 'normal', 'submitted', ${draft.leadCount},
      ${toPgTextArray(targetTitles)}::text[],
      ${toPgTextArray(targetIndustries)}::text[],
      ${toPgTextArray(targetRegions)}::text[],
      ${clientNotes}, ${draftFields.objective || ''},
      NULL, NULL, NOW()
    ) RETURNING id
  `);

  const rows = (workOrderResult as any).rows || workOrderResult;
  const workOrderId = Array.isArray(rows) ? rows[0]?.id : (rows as any)?.id;
  if (!workOrderId) {
    throw new Error('Failed to create work order — no ID returned');
  }

  // Link draft to work order and mark as submitted
  await db
    .update(workOrderDrafts)
    .set({
      workOrderId: workOrderId,
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
      entityId: workOrderId,
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
    workOrderId: workOrderId,
    orderNumber,
  };
}
