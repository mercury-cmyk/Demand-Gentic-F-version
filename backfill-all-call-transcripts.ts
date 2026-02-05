import { pool, db } from "./server/db";
import { submitTranscription } from "./server/services/google-transcription";
import { dialerCallAttempts } from "./shared/schema";
import { eq } from "drizzle-orm";

const TRANSCRIPT_MARKER = "[Call Transcript]";

type DialerCall = {
  id: string;
  disposition: string | null;
  callDuration: number | null;
  notes: string | null;
  recordingUrl: string | null;
  callSessionId: string | null;
  telnyxCallId: string | null;
  sessionRecordingUrl: string | null;
  aiTranscript: string | null;
  createdAt: string;
};

async function backfillAllCallTranscripts() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;

  console.log("========================================");
  console.log("BACKFILL ALL CALL TRANSCRIPTS (> 2026-01-15)");
  console.log("Includes dialer_call_attempts (production) and call_sessions data");
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Transcripts WILL be saved to notes\n");
  }

  console.log(`Date filter: created_at >= 2026-01-15`);
  if (limit) {
    console.log(`Limit: ${limit} calls`);
  }
  console.log();

  const limitClause = limit ? `LIMIT ${limit}` : "";
  const result = await pool.query<DialerCall>(`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds AS "callDuration",
      dca.notes,
      dca.recording_url AS "recordingUrl",
      dca.call_session_id AS "callSessionId",
      dca.telnyx_call_id AS "telnyxCallId",
      dca.created_at AS "createdAt",
      cs.recording_url AS "sessionRecordingUrl",
      cs.ai_transcript AS "aiTranscript"
    FROM dialer_call_attempts dca
    LEFT JOIN call_sessions cs ON cs.id = dca.call_session_id
    WHERE dca.created_at >= '2026-01-15'
      AND (dca.notes IS NULL OR dca.notes NOT ILIKE '%${TRANSCRIPT_MARKER}%')
      AND (cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 50)
    ORDER BY dca.created_at DESC
    ${limitClause}
  `);

  const rows = limit ? result.rows.slice(0, limit) : result.rows;
  console.log(`Candidate calls without transcripts: ${rows.length}\n`);

  let copiedFromSession = 0;
  let transcribedFromUrl = 0;
  let noSource = 0;
  let updated = 0;
  let recordingCandidates = 0;

  for (const call of rows) {
    if (verbose) {
      console.log(`Processing ${call.id} | disp=${call.disposition || "NULL"} | ${call.callDuration ?? 0}s | created=${call.createdAt}`);
    }

    let transcript: string | null = null;
    let transcriptSourceAvailable = false;

    if (call.aiTranscript && call.aiTranscript.trim().length > 50) {
      transcript = call.aiTranscript.trim();
      copiedFromSession += 1;
      transcriptSourceAvailable = true;
      if (verbose) {
        console.log("  Using ai_transcript from call_sessions");
      }
    }

    if (!transcript) {
      const recordingSource = call.recordingUrl || call.sessionRecordingUrl;
      if (recordingSource) {
        recordingCandidates += 1;
        transcriptSourceAvailable = true;
        if (verbose) {
          console.log(`  Fetching recording at ${recordingSource}`);
        }

        if (!dryRun) {
          transcript = await submitTranscription(recordingSource);
          if (transcript) {
            transcript = transcript.trim();
            transcribedFromUrl += 1;
            if (verbose) {
              console.log(`  Transcribed ${transcript.length} chars`);
            }
          } else if (verbose) {
            console.log("  Transcription returned no text");
          }
        } else if (verbose) {
          console.log("  Dry run - would transcribe recording_url");
        }
      }
    }

    if (!transcript) {
      if (!transcriptSourceAvailable) {
        noSource += 1;
      }
      if (verbose) {
        console.log("  No transcript source found");
      }
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    const transcriptBlock = `${TRANSCRIPT_MARKER}\n${transcript}`;
    const nextNotes = call.notes ? `${call.notes}\n\n${transcriptBlock}` : transcriptBlock;

    await db
      .update(dialerCallAttempts)
      .set({ notes: nextNotes, updatedAt: new Date() })
      .where(eq(dialerCallAttempts.id, call.id));

    updated += 1;
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`ai_transcript copied: ${copiedFromSession}`);
  console.log(`Transcribed from recording_url: ${transcribedFromUrl}`);
  console.log(`Calls with recording available: ${recordingCandidates}`);
  console.log(`No source: ${noSource}`);
  console.log(`Updated dialer_call_attempts rows: ${updated}`);

  if (dryRun) {
    console.log("\nDry run complete. Re-run with --execute to persist transcripts.");
  }

  process.exit(0);
}

backfillAllCallTranscripts().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
