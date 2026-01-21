/**
 * Audit Logger Service
 * Logs all SMI Agent operations for governance and debugging
 * Tracks inputs, outputs, models used, and performance metrics
 */

import { db } from '../../../db';
import { smiAuditLog } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import type {
  SmiAuditEntry,
  SmiOperationContext,
  IGovernanceService,
} from '../types';

/**
 * Log an SMI operation to the audit log
 */
export async function logSmiAudit(entry: SmiAuditEntry): Promise<void> {
  try {
    await db.insert(smiAuditLog).values({
      operationType: entry.operationType,
      operationSubtype: entry.operationSubtype || null,
      entityType: entry.entityType || null,
      entityId: entry.entityId || null,
      inputData: entry.inputData || null,
      outputData: entry.outputData || null,
      confidence: entry.confidence?.toFixed(4) || null,
      modelUsed: entry.modelUsed || null,
      processingTimeMs: entry.processingTimeMs || null,
      tokensUsed: entry.tokensUsed || null,
      triggeredBy: entry.triggeredBy || null,
      triggeredBySystem: entry.triggeredBySystem || false,
      campaignId: entry.campaignId || null,
      sessionId: entry.sessionId || null,
    });
  } catch (error) {
    console.error('[AuditLogger] Error logging audit entry:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Get SMI audit log entries with filters
 */
export async function getSmiAuditLog(filters: {
  startDate?: Date;
  endDate?: Date;
  operationType?: string;
  operationSubtype?: string;
  entityType?: string;
  entityId?: string;
  campaignId?: string;
  triggeredBy?: string;
  limit?: number;
  offset?: number;
}): Promise<SmiAuditEntry[]> {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(gte(smiAuditLog.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(smiAuditLog.createdAt, filters.endDate));
  }
  if (filters.operationType) {
    conditions.push(eq(smiAuditLog.operationType, filters.operationType));
  }
  if (filters.operationSubtype) {
    conditions.push(eq(smiAuditLog.operationSubtype, filters.operationSubtype));
  }
  if (filters.entityType) {
    conditions.push(eq(smiAuditLog.entityType, filters.entityType));
  }
  if (filters.entityId) {
    conditions.push(eq(smiAuditLog.entityId, filters.entityId));
  }
  if (filters.campaignId) {
    conditions.push(eq(smiAuditLog.campaignId, filters.campaignId));
  }
  if (filters.triggeredBy) {
    conditions.push(eq(smiAuditLog.triggeredBy, filters.triggeredBy));
  }

  const query = db
    .select()
    .from(smiAuditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(smiAuditLog.createdAt))
    .limit(filters.limit || 100)
    .offset(filters.offset || 0);

  const results = await query;

  return results.map(row => ({
    operationType: row.operationType,
    operationSubtype: row.operationSubtype || undefined,
    entityType: row.entityType || undefined,
    entityId: row.entityId || undefined,
    inputData: (row.inputData as Record<string, any>) || undefined,
    outputData: (row.outputData as Record<string, any>) || undefined,
    confidence: row.confidence ? parseFloat(row.confidence as string) : undefined,
    modelUsed: row.modelUsed || undefined,
    processingTimeMs: row.processingTimeMs || undefined,
    tokensUsed: row.tokensUsed || undefined,
    triggeredBy: row.triggeredBy || undefined,
    triggeredBySystem: row.triggeredBySystem || undefined,
    campaignId: row.campaignId || undefined,
    sessionId: row.sessionId || undefined,
  }));
}

/**
 * Get audit statistics for a time period
 */
export async function getAuditStatistics(
  startDate: Date,
  endDate: Date
): Promise<{
  totalOperations: number;
  operationsByType: Record<string, number>;
  avgProcessingTimeMs: number;
  totalTokensUsed: number;
  topEntities: Array<{ entityType: string; entityId: string; count: number }>;
}> {
  // Total operations
  const totalResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(smiAuditLog)
    .where(
      and(
        gte(smiAuditLog.createdAt, startDate),
        lte(smiAuditLog.createdAt, endDate)
      )
    );

  // Operations by type
  const byTypeResult = await db.execute(sql`
    SELECT operation_type, COUNT(*) as count
    FROM smi_audit_log
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
    GROUP BY operation_type
    ORDER BY count DESC
  `);

  // Average processing time
  const avgTimeResult = await db
    .select({
      avgTime: sql<number>`AVG(processing_time_ms)`,
      totalTokens: sql<number>`SUM(tokens_used)`,
    })
    .from(smiAuditLog)
    .where(
      and(
        gte(smiAuditLog.createdAt, startDate),
        lte(smiAuditLog.createdAt, endDate)
      )
    );

  // Top entities
  const topEntitiesResult = await db.execute(sql`
    SELECT entity_type, entity_id, COUNT(*) as count
    FROM smi_audit_log
    WHERE created_at >= ${startDate} AND created_at <= ${endDate}
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
    GROUP BY entity_type, entity_id
    ORDER BY count DESC
    LIMIT 10
  `);

  const operationsByType: Record<string, number> = {};
  for (const row of (byTypeResult.rows || []) as any[]) {
    operationsByType[row.operation_type] = parseInt(row.count);
  }

  return {
    totalOperations: totalResult[0]?.count || 0,
    operationsByType,
    avgProcessingTimeMs: avgTimeResult[0]?.avgTime || 0,
    totalTokensUsed: avgTimeResult[0]?.totalTokens || 0,
    topEntities: ((topEntitiesResult.rows || []) as any[]).map(row => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      count: parseInt(row.count),
    })),
  };
}

/**
 * Create an audit context helper for tracking operations
 */
export function createAuditContext(
  baseContext: Partial<SmiOperationContext>
): {
  context: SmiOperationContext;
  startTimer: () => void;
  log: (result: Partial<SmiAuditEntry>) => Promise<void>;
} {
  let startTime: number;

  const context: SmiOperationContext = {
    operationType: baseContext.operationType || 'unknown',
    operationSubtype: baseContext.operationSubtype,
    entityType: baseContext.entityType,
    entityId: baseContext.entityId,
    campaignId: baseContext.campaignId,
    sessionId: baseContext.sessionId,
    triggeredBy: baseContext.triggeredBy,
    triggeredBySystem: baseContext.triggeredBySystem,
  };

  return {
    context,
    startTimer: () => {
      startTime = Date.now();
    },
    log: async (result: Partial<SmiAuditEntry>) => {
      const processingTimeMs = startTime ? Date.now() - startTime : undefined;

      await logSmiAudit({
        operationType: context.operationType,
        operationSubtype: context.operationSubtype,
        entityType: context.entityType,
        entityId: context.entityId,
        campaignId: context.campaignId,
        sessionId: context.sessionId,
        triggeredBy: context.triggeredBy,
        triggeredBySystem: context.triggeredBySystem,
        processingTimeMs,
        ...result,
      });
    },
  };
}

/**
 * Purge old audit logs (for maintenance)
 */
export async function purgeOldAuditLogs(
  retentionDays: number = 90
): Promise<number> {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await db.execute(sql`
    DELETE FROM smi_audit_log
    WHERE created_at < ${cutoffDate}
    RETURNING id
  `);

  return (result.rows || []).length;
}

/**
 * Audit Logger class for dependency injection
 */
export class AuditLogger implements Partial<IGovernanceService> {
  async logAudit(entry: SmiAuditEntry): Promise<void> {
    return logSmiAudit(entry);
  }

  async getAuditLog(filters: {
    startDate?: Date;
    endDate?: Date;
    operationType?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
  }): Promise<SmiAuditEntry[]> {
    return getSmiAuditLog(filters);
  }

  async getStatistics(startDate: Date, endDate: Date) {
    return getAuditStatistics(startDate, endDate);
  }

  createContext(baseContext: Partial<SmiOperationContext>) {
    return createAuditContext(baseContext);
  }
}
