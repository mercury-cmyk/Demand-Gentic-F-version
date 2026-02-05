import { pool, db } from "./server/db";
import { sql } from "drizzle-orm";
import { campaignTestCalls } from "./shared/schema";
import { eq } from "drizzle-orm";
import { submitTranscription } from "./server/services/google-transcription";

type MissingCall = {
  id: string;
  callSessionId: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  status: string;
  fullTranscript: string | null;
  createdAt: string;
};

async function backfillTestCallTranscripts() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;

  console.log("========================================");
  console.log("BACKFILL TEST CALL TRANSCRIPTS");
  console.log("campaign_test_calls (since 2026-01-15)");
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
  }

  const result = await pool.query<MissingCall>(`
    SELECT
      id,
      call_session_id AS "callSessionId",
      recording_url AS "recordingUrl",
      duration_seconds AS "durationSeconds",
      status,
      full_transcript AS "fullTranscript",
      created_at AS "createdAt"
    FROM campaign_test_calls
    WHERE created_at >= '2026-01-15'
      AND (full_transcript IS NULL OR length(full_transcript) < 50)
    ORDER BY created_at DESC
  `);

  const missing = limit ? result.rows.slice(0, limit) : result.rows;
  console.log(`Missing transcripts: ${missing.length}\n`);

  let copiedFromSession = 0;
  let transcribedFromRecording = 0;
  let noSource = 0;
  let updated = 0;

  for (const call of missing) {
    if (verbose) {
      console.log(`Processing ${call.id} | status=${call.status} | duration=${call.durationSeconds ?? 0}s`);
    }

    let transcript: string | null = null;

    if (call.callSessionId) {
      const sessionResult = await pool.query<{ ai_transcript: string | null }>(`
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
          console.log("  Using ai_transcript from call_sessions");
        }
      }
    }

    if (!transcript && call.recordingUrl) {
      transcript = await submitTranscription(call.recordingUrl);
      if (transcript) {
        transcript = transcript.trim();
        transcribedFromRecording += 1;
        if (verbose) {
          console.log(`  Transcribed recording (${transcript.length} chars)`);
        }
      }
    }

    if (!transcript) {
      noSource += 1;
      if (verbose) {
        console.log("  No transcript source available");
      }
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    await db
      .update(campaignTestCalls)
      .set({ fullTranscript: transcript, updatedAt: new Date() })
      .where(eq(campaignTestCalls.id, call.id));

    updated += 1;
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Copied from call_sessions: ${copiedFromSession}`);
  console.log(`Transcribed from recording_url: ${transcribedFromRecording}`);
  console.log(`No source available: ${noSource}`);
  console.log(`Updated: ${updated}`);

  if (dryRun) {
    console.log("\nTo apply changes, run:");
    console.log("  npx tsx backfill-test-call-transcripts.ts --execute --verbose");
  }

  process.exit(0);
}

backfillTestCallTranscripts().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
