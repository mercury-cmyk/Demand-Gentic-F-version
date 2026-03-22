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
      AND (cs.ai_transcript IS NULL OR length(cs.ai_transcript)  ${MIN_DURATION}
      AND COALESCE(cs.duration_sec, 0)  r.status === 'completed');
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
    if (i + BATCH_SIZE  setTimeout(r, DELAY_MS));
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