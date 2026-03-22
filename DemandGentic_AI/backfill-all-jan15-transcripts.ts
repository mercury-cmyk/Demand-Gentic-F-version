import { pool, db } from "./server/db";
import { sql } from "drizzle-orm";
import { leads, callSessions, campaignTestCalls } from "./shared/schema";
import { eq } from "drizzle-orm";
import { submitTranscription } from "./server/services/google-transcription";

type CallRecord = {
  id: string;
  table: 'leads' | 'call_sessions' | 'test_calls';
  recordingUrl: string | null;
  transcript: string | null;
  callSessionId?: string | null;
  createdAt: string;
  durationSeconds?: number | null;
};

async function backfillAllJan15Transcripts() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;

  console.log("========================================");
  console.log("BACKFILL ALL JAN 15+ TRANSCRIPTS");
  console.log("Leads, call_sessions, and test_calls");
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
  }

  const callsToProcess: CallRecord[] = [];

  // 1. Get leads with recordings but no transcript
  console.log("Fetching leads...");
  const leadsResult = await pool.query(`
    SELECT
      id,
      recording_url AS "recordingUrl",
      transcript,
      call_attempt_id AS "callAttemptId",
      updated_at AS "createdAt",
      call_duration AS "durationSeconds"
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND call_duration > 0
      AND recording_url IS NOT NULL
      AND (transcript IS NULL OR LENGTH(transcript) (`
    SELECT
      id,
      recording_url AS "recordingUrl",
      ai_transcript AS "transcript",
      created_at AS "createdAt"
    FROM call_sessions
    WHERE created_at >= '2026-01-15'
      AND recording_url IS NOT NULL
      AND (ai_transcript IS NULL OR LENGTH(ai_transcript) (`
    SELECT
      ctc.id,
      ctc.recording_url AS "recordingUrl",
      ctc.full_transcript AS "transcript",
      ctc.call_session_id AS "callSessionId",
      ctc.created_at AS "createdAt",
      ctc.duration_seconds AS "durationSeconds",
      cs.ai_transcript AS "sessionTranscript"
    FROM campaign_test_calls ctc
    LEFT JOIN call_sessions cs ON cs.id = ctc.call_session_id
    WHERE ctc.created_at >= '2026-01-15'
      AND (ctc.full_transcript IS NULL OR LENGTH(ctc.full_transcript) = 50))
    ORDER BY ctc.created_at DESC
  `);

  for (const row of testCallsResult.rows) {
    callsToProcess.push({
      id: row.id,
      table: 'test_calls',
      recordingUrl: row.recordingUrl,
      transcript: row.transcript,
      callSessionId: row.callSessionId,
      createdAt: row.createdAt,
      durationSeconds: row.durationSeconds
    });
  }
  console.log(`  Found ${testCallsResult.rows.length} test_calls needing transcription\n`);

  const toProcess = limit ? callsToProcess.slice(0, limit) : callsToProcess;
  console.log(`Total to process: ${toProcess.length}\n`);

  let transcribed = 0;
  let copiedFromSession = 0;
  let failed = 0;
  let updated = 0;

  for (const call of toProcess) {
    if (verbose) {
      console.log(`Processing ${call.table}:${call.id} | ${call.durationSeconds ?? 0}s`);
    }

    let transcript: string | null = null;

    // For test_calls, try to copy from call_session first
    if (call.table === 'test_calls' && call.callSessionId) {
      const sessionResult = await pool.query(`
        SELECT ai_transcript
        FROM call_sessions
        WHERE id = $1
        LIMIT 1
      `, [call.callSessionId]);

      const sessionTranscript = sessionResult.rows[0]?.ai_transcript || null;
      if (sessionTranscript && sessionTranscript.trim().length > 50) {
        transcript = sessionTranscript.trim();
        copiedFromSession += 1;
        if (verbose) {
          console.log("  ✓ Copied from call_session");
        }
      }
    }

    // If no transcript yet and we have a recording URL, transcribe it
    if (!transcript && call.recordingUrl) {
      try {
        transcript = await submitTranscription(call.recordingUrl);
        if (transcript && transcript.trim().length > 10) {
          transcript = transcript.trim();
          transcribed += 1;
          if (verbose) {
            console.log(`  ✓ Transcribed (${transcript.length} chars)`);
          }
        } else {
          failed += 1;
          if (verbose) {
            console.log("  ✗ Transcription empty/failed");
          }
          continue;
        }
      } catch (error) {
        failed += 1;
        if (verbose) {
          console.log(`  ✗ Transcription error: ${error}`);
        }
        continue;
      }
    }

    if (!transcript) {
      failed += 1;
      if (verbose) {
        console.log("  ✗ No transcript source");
      }
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    // Update the appropriate table
    try {
      if (call.table === 'leads') {
        await db
          .update(leads)
          .set({ 
            transcript,
            transcriptionStatus: 'completed',
            updatedAt: new Date()
          })
          .where(eq(leads.id, call.id));
      } else if (call.table === 'call_sessions') {
        await pool.query(`
          UPDATE call_sessions 
          SET ai_transcript = $1, updated_at = NOW() 
          WHERE id = $2
        `, [transcript, call.id]);
      } else if (call.table === 'test_calls') {
        await db
          .update(campaignTestCalls)
          .set({ 
            fullTranscript: transcript,
            updatedAt: new Date()
          })
          .where(eq(campaignTestCalls.id, call.id));
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      if (verbose) {
        console.log(`  ✗ Update failed: ${error}`);
      }
    }
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Copied from call_sessions: ${copiedFromSession}`);
  console.log(`Transcribed from recording_url: ${transcribed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Updated: ${updated}`);

  if (dryRun) {
    console.log("\nTo apply changes, run:");
    console.log("  npx tsx backfill-all-jan15-transcripts.ts --execute --verbose");
  }

  process.exit(0);
}

backfillAllJan15Transcripts().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});