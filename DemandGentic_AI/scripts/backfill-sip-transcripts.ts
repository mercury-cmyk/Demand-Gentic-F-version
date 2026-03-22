/**
 * Backfill SIP-era Missing Transcripts & Analysis
 *
 * After the TeXML → SIP transition, many calls captured real-time Gemini Live
 * transcripts but never persisted them. This script:
 *
 * 1. Finds call_attempts from the SIP era with missing transcripts
 * 2. Checks if call_sessions already has aiTranscript → copies to attempt
 * 3. Falls back to GCS buffer download → Deepgram transcription
 * 4. Triggers post-call analysis for calls that have transcript but no analysis
 *
 * Usage:
 *   npx tsx scripts/backfill-sip-transcripts.ts [options]
 *
 * Options:
 *   --dry-run           Show what would be processed without making changes
 *   --limit=N           Max rows to process (default: 200)
 *   --batch=N           Batch size for parallel processing (default: 3)
 *   --since=YYYY-MM-DD  Only process calls after this date (default: 30 days ago)
 *   --min-duration=N    Min call duration in seconds (default: 20)
 *   --analysis-only     Only backfill analysis for calls that already have transcripts
 */

import 'dotenv/config';
import { db } from '../server/db';
import { callSessions, dialerCallAttempts } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : def;
};

const DRY_RUN = args.includes('--dry-run');
const ANALYSIS_ONLY = args.includes('--analysis-only');
const LIMIT = parseInt(getArg('limit', '200'));
const BATCH_SIZE = parseInt(getArg('batch', '3'));
const DELAY_MS = parseInt(getArg('delay', '1000'));
const MIN_DURATION = parseInt(getArg('min-duration', '20'));

// Default: 30 days ago
const defaultSince = new Date();
defaultSince.setDate(defaultSince.getDate() - 30);
const SINCE = getArg('since', defaultSince.toISOString().split('T')[0]);

// ─── Stats tracking ──────────────────────────────────────────────────────
let stats = {
  total: 0,
  transcriptCopied: 0,
  transcriptFromGcs: 0,
  analysisFired: 0,
  skipped: 0,
  failed: 0,
};

// ─── Phase 1: Find missing transcripts ───────────────────────────────────
async function findMissingTranscripts() {
  console.log(`\n📋 Phase 1: Finding SIP call attempts with missing transcripts...`);
  console.log(`   Since: ${SINCE} | Min duration: ${MIN_DURATION}s | Limit: ${LIMIT}`);

  const rows = await db.execute(sql`
    SELECT
      da.id AS attempt_id,
      da.call_session_id,
      da.campaign_id,
      da.contact_id,
      da.call_duration_seconds,
      da.disposition,
      da.agent_type,
      da.created_at,
      cs.ai_transcript AS session_transcript,
      cs.recording_s3_key,
      cs.ai_analysis
    FROM dialer_call_attempts da
    LEFT JOIN call_sessions cs ON cs.id = da.call_session_id
    WHERE da.agent_type = 'ai'
      AND da.created_at >= ${SINCE}::timestamp
      AND COALESCE(da.call_duration_seconds, 0) >= ${MIN_DURATION}
      AND (da.ai_transcript IS NULL OR length(da.ai_transcript) = ${SINCE}::timestamp
      AND cs.ai_transcript IS NOT NULL
      AND length(cs.ai_transcript) >= 20
      AND (cs.ai_analysis IS NULL OR cs.ai_analysis::text = '{}' OR cs.ai_analysis::text = 'null')
      AND COALESCE(cs.duration_sec, 0) >= ${MIN_DURATION}
    ORDER BY cs.started_at DESC
    LIMIT ${LIMIT}
  `);

  return rows.rows as any[];
}

// ─── Process a single missing transcript ──────────────────────────────────
async function processTranscriptRow(row: any, idx: number, total: number) {
  const tag = `[${idx + 1}/${total}]`;

  // Strategy A: Session already has transcript → copy to attempt
  if (row.session_transcript && row.session_transcript.length >= 20) {
    if (DRY_RUN) {
      console.log(`${tag} DRY: Would copy session transcript (${row.session_transcript.length} chars) to attempt ${row.attempt_id}`);
      stats.transcriptCopied++;
      return;
    }

    await db.update(dialerCallAttempts)
      .set({ aiTranscript: row.session_transcript } as any)
      .where(eq(dialerCallAttempts.id, row.attempt_id));

    console.log(`${tag} ✅ Copied session transcript (${row.session_transcript.length} chars) → attempt ${row.attempt_id}`);
    stats.transcriptCopied++;
    return;
  }

  // Strategy B: GCS recording exists → download buffer + Deepgram
  if (row.recording_s3_key && row.call_session_id) {
    try {
      const { downloadGcsAudioAsBuffer } = await import('../server/lib/gcs');
      const { submitToDeepgramBuffer } = await import('../server/services/deepgram-postcall-transcription');

      if (DRY_RUN) {
        console.log(`${tag} DRY: Would download GCS key=${row.recording_s3_key} + Deepgram transcribe for attempt ${row.attempt_id}`);
        stats.transcriptFromGcs++;
        return;
      }

      const buffer = await downloadGcsAudioAsBuffer(row.recording_s3_key);
      if (!buffer || buffer.length  r.session_transcript && r.session_transcript.length >= 20).length;
    const hasGcs = missingTranscripts.filter(r => r.recording_s3_key).length;
    const noSource = missingTranscripts.length - hasSessionTranscript - (hasGcs - hasSessionTranscript);
    console.log(`  Session transcript available: ${hasSessionTranscript}`);
    console.log(`  GCS recording available:      ${hasGcs}`);
    console.log(`  No source:                    ${Math.max(0, noSource)}\n`);

    for (let i = 0; i  setTimeout(r, DELAY_MS));
      }
    }
  }

  // ── Phase 2: Analysis Backfill ──
  const missingAnalysis = await findMissingAnalysis();
  stats.total += missingAnalysis.length;
  console.log(`\nFound ${missingAnalysis.length} sessions with transcript but missing analysis.\n`);

  for (let i = 0; i  setTimeout(r, DELAY_MS));
    }
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  BACKFILL COMPLETE ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total rows found:      ${stats.total}`);
  console.log(`Transcript copied:     ${stats.transcriptCopied}`);
  console.log(`Transcript from GCS:   ${stats.transcriptFromGcs}`);
  console.log(`Analysis scheduled:    ${stats.analysisFired}`);
  console.log(`Skipped (no source):   ${stats.skipped}`);
  console.log(`Failed:                ${stats.failed}`);
  console.log();

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});