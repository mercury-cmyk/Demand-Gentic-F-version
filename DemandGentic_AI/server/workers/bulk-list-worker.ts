/**
 * Bulk List Operation Worker
 * Processes large-scale list operations using filter criteria instead of IDs
 */

import { Job } from 'bullmq';
import { db } from '../db';
import { contacts, lists, accounts } from '@shared/schema';
import { and, sql, inArray, or, eq, like, isNull, isNotNull, gte, lte } from 'drizzle-orm';

export interface FilterCondition {
  field: string;
  operator: string;
  value: any;
}

export interface FilterGroup {
  operator: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface BulkListJobData {
  listId: string;
  entityType: 'contact' | 'account';
  filterCriteria: {
    searchQuery?: string;
    filterGroup?: FilterGroup;
    appliedFilters?: Record;
  };
  userId: string;
}

export interface BulkListJobResult {
  success: boolean;
  totalProcessed: number;
  totalAdded: number;
  listId: string;
  error?: string;
}

/**
 * Build where clause from filter criteria
 */
export function buildWhereClauseForFilters(filterCriteria: BulkListJobData['filterCriteria']) {
  const conditions: any[] = [];

  // Search query
  if (filterCriteria.searchQuery) {
    const searchTerm = `%${filterCriteria.searchQuery.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`LOWER(${contacts.firstName})`, searchTerm),
        like(sql`LOWER(${contacts.lastName})`, searchTerm),
        like(sql`LOWER(${contacts.email})`, searchTerm),
        like(sql`LOWER(${contacts.jobTitle})`, searchTerm)
      )
    );
  }

  // Filter group (advanced filters)
  if (filterCriteria.filterGroup?.conditions?.length) {
    const groupConditions = filterCriteria.filterGroup.conditions.map(condition => {
      const column = contacts[condition.field as keyof typeof contacts] as any;
      if (!column) return null;

      switch (condition.operator) {
        case 'equals':
          return eq(column, condition.value as any);
        case 'notEquals':
          return sql`${column} != ${condition.value}`;
        case 'contains':
          return like(sql`LOWER(${column})`, `%${condition.value.toLowerCase()}%`);
        case 'notContains':
          return sql`LOWER(${column}) NOT LIKE ${`%${condition.value.toLowerCase()}%`}`;
        case 'isEmpty':
          return or(isNull(column), eq(column, ''));
        case 'isNotEmpty':
          return and(isNotNull(column), sql`${column} != ''`);
        case 'greaterThan':
          return sql`${column} > ${condition.value}`;
        case 'lessThan':
          return sql`${column}  c !== null);

    if (groupConditions.length > 0) {
      if (filterCriteria.filterGroup.operator === 'AND') {
        conditions.push(and(...groupConditions));
      } else {
        conditions.push(or(...groupConditions));
      }
    }
  }

  // Applied filters (simple filters)
  if (filterCriteria.appliedFilters && Object.keys(filterCriteria.appliedFilters).length > 0) {
    Object.entries(filterCriteria.appliedFilters).forEach(([field, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        const column = contacts[field as keyof typeof contacts] as any;
        if (column) {
          conditions.push(eq(column, value as any));
        }
      }
    });
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Process bulk list operation
 */
export async function processBulkListOperation(job: Job): Promise {
  const { listId, entityType, filterCriteria } = job.data;
  
  console.log(`[BulkListWorker] Starting job ${job.id} - List: ${listId}, Type: ${entityType}`);

  try {
    // Verify list exists
    const list = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
    if (!list || list.length === 0) {
      throw new Error('List not found');
    }

    if (list[0].entityType !== entityType) {
      throw new Error(`List type mismatch: expected ${entityType}, got ${list[0].entityType}`);
    }

    // Build where clause
    const whereClause = buildWhereClauseForFilters(filterCriteria);

    // Fetch matching contact IDs using cursor-based pagination (more reliable than offset)
    const BATCH_SIZE = 1000;
    let lastId: string | null = null;
    const allContactIds: string[] = [];
    
    while (true) {
      const query = db.select({ id: contacts.id })
        .from(contacts)
        .limit(BATCH_SIZE)
        .orderBy(contacts.id);

      const conditions = [whereClause];
      if (lastId) {
        conditions.push(sql`${contacts.id} > ${lastId}`);
      }

      const finalWhere = conditions.filter(c => c).length > 0 
        ? and(...conditions.filter(c => c)) 
        : undefined;

      if (finalWhere) {
        query.where(finalWhere);
      }

      const batch = await query;
      
      if (batch.length === 0) break;
      
      allContactIds.push(...batch.map(c => c.id));
      lastId = batch[batch.length - 1].id;

      // Update progress
      await job.updateProgress({
        processed: allContactIds.length,
        status: 'fetching',
        percent: Math.min(95, Math.floor((allContactIds.length / 10000) * 100)), // Estimate
      });

      console.log(`[BulkListWorker] Fetched ${allContactIds.length} contacts so far...`);
    }

    console.log(`[BulkListWorker] Total contacts found: ${allContactIds.length}`);

    // Update progress
    await job.updateProgress({
      processed: allContactIds.length,
      status: 'adding',
    });

    // Add to list (merge with existing and deduplicate)
    const existingIds = list[0].recordIds || [];
    const mergedIds = Array.from(new Set([...existingIds, ...allContactIds]));
    const addedCount = mergedIds.length - existingIds.length;

    await db.update(lists)
      .set({ 
        recordIds: mergedIds,
        updatedAt: new Date()
      })
      .where(eq(lists.id, listId));

    console.log(`[BulkListWorker] Job ${job.id} completed - Added ${addedCount} new contacts (${allContactIds.length} matched, ${existingIds.length} already in list)`);

    return {
      success: true,
      totalProcessed: allContactIds.length,
      totalAdded: addedCount,
      listId,
    };
  } catch (error: any) {
    console.error(`[BulkListWorker] Job ${job.id} failed:`, error);
    return {
      success: false,
      totalProcessed: 0,
      totalAdded: 0,
      listId,
      error: error.message,
    };
  }
}