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

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const transcript = row.ai_transcript || '';
      if (transcript.length < 20) {
        skipped++;
        continue;
      }

      try {
        processed++;

        // Find matching dialer_call_attempt for this session
        let dialerCallAttemptId: string | null = null;
        try {
          const [attempt] = await db
            .select({ id: dialerCallAttempts.id })
            .from(dialerCallAttempts)
            .where(eq(dialerCallAttempts.callSessionId, row.id))
            .limit(1);
          if (attempt) dialerCallAttemptId = attempt.id;
        } catch (_) {}

        // Run conversation quality analysis
        const result = await analyzeConversationQuality({
          transcript,
          interactionType: 'live_call',
          analysisStage: 'post_call',
          callDurationSeconds: row.duration_sec || 0,
          disposition: row.ai_disposition || undefined,
          campaignId: row.campaign_id || undefined,
        });

        if ((result as any).status === 'error' || !result.overallScore) {
          console.log(`  [${processed}/${rows.length}] SKIP ${row.id} — analysis returned error`);
          failed++;
          continue;
        }

        // Log to call_quality_records via the proper logger
        const logResult = await logCallIntelligence({
          callSessionId: row.id,
          dialerCallAttemptId: dialerCallAttemptId || undefined,
          campaignId: row.campaign_id || undefined,
          contactId: row.contact_id || undefined,
          qualityAnalysis: result,
          fullTranscript: transcript,
        });

        if (logResult.success) {
          succeeded++;
          if (processed % 10 === 0 || processed <= 5) {
            console.log(`  [${processed}/${rows.length}] OK ${row.id} — Score: ${result.overallScore} (record: ${logResult.recordId})`);
          }
        } else {
          failed++;
          console.log(`  [${processed}/${rows.length}] FAIL ${row.id} — ${logResult.error}`);
        }

        // Also update aiAnalysis on the session
        await db.update(callSessions)
          .set({
            aiAnalysis: {
              conversationQuality: {
                overallScore: result.overallScore,
                summary: result.summary,
                qualityDimensions: result.qualityDimensions,
                campaignAlignment: result.campaignAlignment,
                dispositionReview: result.dispositionReview,
                issues: result.issues,
                recommendations: result.recommendations,
                breakdowns: result.breakdowns,
                performanceGaps: result.performanceGaps,
                flowCompliance: result.flowCompliance,
                learningSignals: result.learningSignals,
                nextBestActions: result.nextBestActions,
                promptUpdates: result.promptUpdates,
                metadata: result.metadata,
              }
            }
          } as any)
          .where(eq(callSessions.id, row.id));

      } catch (err: any) {
        failed++;
        console.error(`  [${processed}/${rows.length}] ERROR ${row.id}: ${err.message}`);
      }
    }

    // Progress update every batch
    if (i + BATCH_SIZE < rows.length) {
      console.log(`\n--- Batch progress: ${processed}/${rows.length} (${succeeded} ok, ${failed} fail, ${skipped} skip) ---\n`);
      await new Promise(r => setTimeout(r, DELAY_MS));
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
