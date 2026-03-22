/**
 * Backfill callStartedAt for dialer_call_attempts that have a disposition
 * but were never assigned a callStartedAt timestamp.
 *
 * This happened because the voice-dialer's call-end handler set
 * callEndedAt / disposition / connected but never set callStartedAt.
 *
 * Strategy:
 *   1. If callEndedAt and callDurationSeconds exist → derive: callEndedAt - duration
 *   2. Else fall back to createdAt + 2s (estimated connection delay)
 *
 * Usage:  npx tsx scripts/backfill-call-started-at.ts [--dry-run]
 */

import "dotenv/config";
import { db } from "../server/db";
import { dialerCallAttempts } from "@shared/schema";
import { isNull, isNotNull, sql } from "drizzle-orm";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[Backfill callStartedAt] Mode: ${dryRun ? "DRY-RUN" : "LIVE"}`);

  // Count affected rows first
  const [countRow] = await db
    .select({ count: sql`COUNT(*)::int` })
    .from(dialerCallAttempts)
    .where(
      sql`${dialerCallAttempts.callStartedAt} IS NULL AND ${dialerCallAttempts.disposition} IS NOT NULL`
    );

  const total = countRow?.count || 0;
  console.log(`[Backfill callStartedAt] Found ${total} records to backfill`);

  if (total === 0) {
    console.log("[Backfill callStartedAt] Nothing to do.");
    process.exit(0);
  }

  if (dryRun) {
    console.log(`[Backfill callStartedAt] DRY-RUN: Would update ${total} records.`);
    process.exit(0);
  }

  // Process in batches of 2000 to avoid Neon pooler timeouts
  const BATCH_SIZE = 2000;
  let totalUpdated = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const result = await db.execute(sql`
      WITH batch AS (
        SELECT id FROM dialer_call_attempts
        WHERE call_started_at IS NULL AND disposition IS NOT NULL
        LIMIT ${BATCH_SIZE}
      )
      UPDATE dialer_call_attempts dca
      SET
        call_started_at = CASE
          WHEN dca.call_ended_at IS NOT NULL AND dca.call_duration_seconds IS NOT NULL AND dca.call_duration_seconds > 0
            THEN dca.call_ended_at - (dca.call_duration_seconds * INTERVAL '1 second')
          ELSE dca.created_at + INTERVAL '2 seconds'
        END,
        updated_at = NOW()
      FROM batch
      WHERE dca.id = batch.id
    `);

    const updatedCount = (result as any).rowCount ?? (result as any).count ?? 0;
    totalUpdated += updatedCount;
    console.log(`[Backfill callStartedAt] Batch ${batchNum}: updated ${updatedCount} rows (total: ${totalUpdated}/${total})`);

    if (updatedCount === 0) break;
  }

  console.log(`[Backfill callStartedAt] Done. Updated ${totalUpdated} records.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[Backfill callStartedAt] Fatal error:", err);
  process.exit(1);
});