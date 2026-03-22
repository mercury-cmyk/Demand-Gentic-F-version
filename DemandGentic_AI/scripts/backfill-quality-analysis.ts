/**
 * Backfill Missing Conversation Quality Analysis
 *
 * Finds call_sessions that have transcripts but no call_quality_records entry,
 * runs analyzeConversationQuality(), and logs results via logCallIntelligence().
 *
 * Usage: npx tsx scripts/backfill-quality-analysis.ts [--limit=N] [--batch=N] [--dry-run]
 */

import 'dotenv/config';
import { db } from '../server/db';
import { callSessions, callQualityRecords, dialerCallAttempts } from '../shared/schema';
import { eq, and, isNotNull, sql, desc } from 'drizzle-orm';
import { analyzeConversationQuality } from '../server/services/conversation-quality-analyzer';
import { logCallIntelligence } from '../server/services/call-intelligence-logger';

const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : def;
};
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(getArg('limit', '5000'));
const BATCH_SIZE = parseInt(getArg('batch', '10'));
const DELAY_MS = parseInt(getArg('delay', '200'));

async function main() {
  console.log(`\n=== Backfill Missing Quality Analysis ===`);
  console.log(`Limit: ${LIMIT} | Batch: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms | Dry run: ${DRY_RUN}\n`);

  // Find call_sessions with transcript but no call_quality_records
  const missing = await db.execute(sql`
    SELECT
      cs.id,
      cs.ai_transcript,
      cs.duration_sec,
      cs.ai_disposition,
      cs.campaign_id,
      cs.contact_id,
      cs.started_at
    FROM call_sessions cs
    WHERE cs.ai_transcript IS NOT NULL
      AND length(cs.ai_transcript) >= 20
      AND COALESCE(cs.duration_sec, 0) > 35
      AND NOT EXISTS (
        SELECT 1 FROM call_quality_records cqr WHERE cqr.call_session_id = cs.id
      )
    ORDER BY cs.started_at DESC
    LIMIT ${LIMIT}
  `);

  const rows = missing.rows as any[];
  console.log(`Found ${rows.length} calls with transcript but no quality analysis.\n`);

  if (DRY_RUN) {
    console.log('DRY RUN — showing first 10:');
    for (const row of rows.slice(0, 10)) {
      console.log(`  ${row.id} | dur=${row.duration_sec}s | transcript=${(row.ai_transcript || '').length} chars | campaign=${row.campaign_id}`);
    }
    console.log(`\nRun without --dry-run to process.`);
    process.exit(0);
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i  setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total:     ${rows.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Skipped:   ${skipped}`);

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});