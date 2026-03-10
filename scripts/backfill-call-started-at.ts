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

  // Find all call attempts with a disposition but no callStartedAt
  const rows = await db
    .select({
      id: dialerCallAttempts.id,
      createdAt: dialerCallAttempts.createdAt,
      callEndedAt: dialerCallAttempts.callEndedAt,
      callDurationSeconds: dialerCallAttempts.callDurationSeconds,
    })
    .from(dialerCallAttempts)
    .where(
      sql`${dialerCallAttempts.callStartedAt} IS NULL AND ${dialerCallAttempts.disposition} IS NOT NULL`
    );

  console.log(`[Backfill callStartedAt] Found ${rows.length} records to backfill`);

  let updated = 0;
  for (const row of rows) {
    let callStartedAt: Date;

    if (row.callEndedAt && row.callDurationSeconds && row.callDurationSeconds > 0) {
      // Best estimate: endedAt minus duration
      callStartedAt = new Date(row.callEndedAt.getTime() - row.callDurationSeconds * 1000);
    } else if (row.createdAt) {
      // Fallback: createdAt + 2s connection delay
      callStartedAt = new Date(row.createdAt.getTime() + 2000);
    } else {
      console.warn(`  Skipping ${row.id}: no timing data available`);
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY-RUN] Would set callStartedAt=${callStartedAt.toISOString()} for ${row.id}`);
    } else {
      await db
        .update(dialerCallAttempts)
        .set({ callStartedAt, updatedAt: new Date() })
        .where(sql`${dialerCallAttempts.id} = ${row.id}`);
      updated++;
    }
  }

  console.log(`[Backfill callStartedAt] Done. ${dryRun ? "Would update" : "Updated"} ${dryRun ? rows.length : updated} records.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[Backfill callStartedAt] Fatal error:", err);
  process.exit(1);
});
