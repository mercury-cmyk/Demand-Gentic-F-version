/**
 * Backfill Missing Transcripts
 *
 * Finds call_sessions with recordings but no transcript, and attempts to
 * re-transcribe them using the same strategies as the regeneration endpoint.
 *
 * Usage: npx tsx scripts/backfill-missing-transcripts.ts [--limit=N] [--batch=N] [--dry-run]
 */

import 'dotenv/config';
import { db } from '../server/db';
import { callSessions } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

const args = process.argv.slice(2);
const getArg = (name: string, def: string) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : def;
};
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(getArg('limit', '500'));
const BATCH_SIZE = parseInt(getArg('batch', '5'));
const DELAY_MS = parseInt(getArg('delay', '500'));
const MIN_DURATION = parseInt(getArg('min-duration', '35'));

async function main() {
  console.log(`\n=== Backfill Missing Transcripts ===`);
  console.log(`Limit: ${LIMIT} | Batch: ${BATCH_SIZE} | Delay: ${DELAY_MS}ms | Min duration: ${MIN_DURATION}s | Dry run: ${DRY_RUN}\n`);

  // Find call_sessions with recording but no transcript
  const missing = await db.execute(sql`
    SELECT
      cs.id,
      cs.recording_url,
      cs.recording_s3_key,
      cs.telnyx_call_id,
      cs.telnyx_recording_id,
      cs.to_number_e164,
      cs.from_number,
      cs.started_at,
      cs.duration_sec,
      cs.campaign_id
    FROM call_sessions cs
    WHERE (cs.recording_url IS NOT NULL OR cs.recording_s3_key IS NOT NULL)
      AND (cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20)
      AND COALESCE(cs.duration_sec, 0) > ${MIN_DURATION}
      AND COALESCE(cs.duration_sec, 0) <= 600
    ORDER BY cs.started_at DESC
    LIMIT ${LIMIT}
  `);

  const rows = missing.rows as any[];
  console.log(`Found ${rows.length} calls with recordings but no transcript.\n`);

  // Analyze recording sources
  const stats = { hasGcs: 0, hasRecordingUrl: 0, hasTelnyxId: 0, hasPhone: 0 };
  for (const row of rows) {
    if (row.recording_s3_key) stats.hasGcs++;
    if (row.recording_url) stats.hasRecordingUrl++;
    if (row.telnyx_call_id || row.telnyx_recording_id) stats.hasTelnyxId++;
    if (row.to_number_e164 || row.from_number) stats.hasPhone++;
  }

  console.log(`Recording sources breakdown:`);
  console.log(`  GCS key:        ${stats.hasGcs}/${rows.length}`);
  console.log(`  Recording URL:  ${stats.hasRecordingUrl}/${rows.length}`);
  console.log(`  Telnyx ID:      ${stats.hasTelnyxId}/${rows.length}`);
  console.log(`  Phone number:   ${stats.hasPhone}/${rows.length}`);
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — showing first 10:');
    for (const row of rows.slice(0, 10)) {
      console.log(`  ${row.id} | dur=${row.duration_sec}s | s3=${row.recording_s3_key ? 'yes' : 'no'} | url=${row.recording_url ? 'yes' : 'no'} | telnyx=${row.telnyx_call_id || 'none'}`);
    }
    console.log(`\nRun without --dry-run to process.`);
    process.exit(0);
  }

  // Lazy-import transcription services
  const { getPresignedDownloadUrl } = await import('../server/services/gcs-recording-storage');
  const { transcribeFromRecording, submitToDeepgramBuffer } = await import('../server/services/deepgram-postcall-transcription');
  const { downloadGcsAudioAsBuffer } = await import('../server/services/gcs-recording-storage');

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      processed++;
      const RG = `[${processed}/${rows.length}]`;

      try {
        let audioUrl: string | null = null;
        let audioBuffer: Buffer | null = null;

        // Strategy A: Presign from GCS key
        if (row.recording_s3_key) {
          try {
            const presigned = await getPresignedDownloadUrl(row.recording_s3_key);
            if (presigned && !presigned.startsWith('gcs-internal://') && !presigned.startsWith('gs://')) {
              audioUrl = presigned;
            }
          } catch (_) {}
        }

        // Strategy B: Extract GCS key from recording URL
        if (!audioUrl && row.recording_url) {
          const gcsMatch = (row.recording_url || '').match(/\/([^/]+\/recordings\/[^?]+)/);
          if (gcsMatch) {
            try {
              const presigned = await getPresignedDownloadUrl(gcsMatch[1]);
              if (presigned && !presigned.startsWith('gcs-internal://') && !presigned.startsWith('gs://')) {
                audioUrl = presigned;
              }
            } catch (_) {}
          }
        }

        // Strategy C: Direct GCS buffer download
        if (!audioUrl) {
          const gcsKey = row.recording_s3_key || ((row.recording_url || '').match(/\/([^/]+\/recordings\/[^?]+)/) || [])[1];
          if (gcsKey) {
            try {
              audioBuffer = await downloadGcsAudioAsBuffer(gcsKey);
              if (!audioBuffer || audioBuffer.length < 1000) audioBuffer = null;
            } catch (_) { audioBuffer = null; }
          }
        }

        // Strategy D: Raw HTTPS recording URL
        if (!audioUrl && !audioBuffer && row.recording_url && /^https?:\/\//i.test(row.recording_url)) {
          audioUrl = row.recording_url;
        }

        // Strategy E: Telnyx phone search (expensive — last resort)
        if (!audioUrl && !audioBuffer && (row.to_number_e164 || row.from_number) && row.started_at) {
          try {
            const { searchRecordingsByDialedNumber } = await import('../server/services/telnyx-recordings');
            const phone = row.to_number_e164 || row.from_number;
            const searchStart = new Date(row.started_at);
            searchStart.setMinutes(searchStart.getMinutes() - 120);
            const searchEnd = new Date(row.started_at);
            searchEnd.setMinutes(searchEnd.getMinutes() + 120);

            const recordings = await searchRecordingsByDialedNumber(phone, searchStart, searchEnd);
            const completed = recordings.find((r: any) => r.status === 'completed');
            if (completed) {
              audioUrl = completed.download_urls?.mp3 || completed.download_urls?.wav || null;
              // Backfill telnyx IDs
              if (audioUrl && (completed.id || completed.call_control_id)) {
                await db.update(callSessions).set({
                  telnyxRecordingId: completed.id,
                  telnyxCallId: completed.call_control_id,
                  recordingUrl: audioUrl,
                } as any).where(eq(callSessions.id, row.id));
              }
            }
          } catch (_) {}
        }

        // Guard: reject non-HTTP URLs
        if (audioUrl && (audioUrl.startsWith('gcs-internal://') || audioUrl.startsWith('gs://'))) {
          audioUrl = null;
        }

        // Transcribe
        if (audioBuffer) {
          const transcript = await submitToDeepgramBuffer(audioBuffer);
          if (transcript && transcript.length >= 20) {
            await db.update(callSessions).set({ aiTranscript: transcript } as any).where(eq(callSessions.id, row.id));
            succeeded++;
            console.log(`${RG} OK ${row.id} — buffer transcription (${transcript.length} chars)`);
          } else {
            failed++;
            console.log(`${RG} FAIL ${row.id} — buffer transcription empty/short`);
          }
        } else if (audioUrl) {
          const result = await transcribeFromRecording(audioUrl, {
            telnyxCallId: row.telnyx_call_id || undefined,
            recordingS3Key: row.recording_s3_key || undefined,
          });
          if (result?.transcript && result.transcript.length >= 20) {
            await db.update(callSessions).set({ aiTranscript: result.transcript } as any).where(eq(callSessions.id, row.id));
            succeeded++;
            console.log(`${RG} OK ${row.id} — URL transcription (${result.transcript.length} chars)`);
          } else {
            failed++;
            console.log(`${RG} FAIL ${row.id} — URL transcription empty/short`);
          }
        } else {
          failed++;
          console.log(`${RG} FAIL ${row.id} — no audio source found`);
        }

      } catch (err: any) {
        failed++;
        console.error(`${RG} ERROR ${row.id}: ${err.message}`);
      }
    }

    // Progress update
    if (i + BATCH_SIZE < rows.length) {
      console.log(`\n--- Batch progress: ${processed}/${rows.length} (${succeeded} ok, ${failed} fail) ---\n`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total:     ${rows.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed:    ${failed}`);

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
