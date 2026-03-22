/**
 * Verification Smart Trigger Utilities
 * 
 * Helper functions to determine when verification campaigns meet eligibility
 * thresholds to trigger automated workflow orchestration.
 */

import { sql } from 'drizzle-orm';
import type { workerDb } from '../db';

type Database = typeof workerDb;

export interface JobTitleCoverage {
  total: number;
  withTitles: number;
  percentage: number;
  meetsThreshold: boolean; // >= 20%
}

/**
 * Calculate job title coverage for a verification campaign
 * 
 * Uses COUNT(*) FILTER for efficient single-query calculation of:
 * - Total contacts in campaign
 * - Contacts with non-null, non-empty job titles
 * - Percentage coverage
 * - Whether 20% threshold is met
 * 
 * @param db - Database connection (supports worker pool or main db)
 * @param campaignId - Verification campaign ID
 * @returns Job title coverage statistics
 */
export async function getJobTitleCoverage(
  db: Database,
  campaignId: string
): Promise {
  const result = await db.execute(sql`
    SELECT 
      COUNT(*)::text as total,
      COUNT(*) FILTER (
        WHERE title IS NOT NULL 
          AND TRIM(title) != ''
      )::text as with_titles
    FROM verification_contacts
    WHERE campaign_id = ${campaignId}
  `);

  // Coerce bigint results to number
  const total = Number(result.rows[0]?.total || '0');
  const withTitles = Number(result.rows[0]?.with_titles || '0');
  
  // Guard against division by zero
  const percentage = total > 0 ? (withTitles / total) * 100 : 0;
  
  return {
    total,
    withTitles,
    percentage,
    meetsThreshold: percentage >= 20
  };
}

/**
 * Check if workflow has already been triggered for this campaign
 * 
 * @param db - Database connection
 * @param campaignId - Verification campaign ID
 * @returns true if workflow was previously triggered
 */
export async function isWorkflowAlreadyTriggered(
  db: Database,
  campaignId: string
): Promise {
  const result = await db.execute(sql`
    SELECT workflow_triggered_at
    FROM verification_campaigns
    WHERE id = ${campaignId}
  `);

  return result.rows[0]?.workflow_triggered_at !== null;
}

/**
 * Mark campaign as having triggered workflow
 * 
 * @param db - Database connection
 * @param campaignId - Verification campaign ID
 */
export async function markWorkflowTriggered(
  db: Database,
  campaignId: string
): Promise {
  await db.execute(sql`
    UPDATE verification_campaigns
    SET workflow_triggered_at = NOW()
    WHERE id = ${campaignId}
  `);
}