import { pool, db } from "./server/db";
import { eq } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";
import { submitTranscription } from "./server/services/google-transcription";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";

const TRANSCRIPT_MARKER = "[Call Transcript]";

type ShortCall = {
  id: string;
  telnyxCallId: string | null;
  recordingUrl: string | null;
  notes: string | null;
  disposition: string | null;
  callDurationSeconds: number | null;
  createdAt: string;
};

async function transcribeShortCalls() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;

  console.log("========================================");
  console.log("TRANSCRIBE SHORT CALLS (0-30s duration)");
  console.log("Sources: recording_url or Telnyx download URL");
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN MODE – no database writes");
  } else {
    console.log("EXECUTE MODE – transcripts WILL be saved");
  }
  if (limit) {
    console.log(`Limit: ${limit} calls`);
  }
  console.log();

  const limitClause = limit ? `LIMIT ${limit}` : "";
  const result = await pool.query<ShortCall>(`
    SELECT
      id,
      telnyx_call_id AS "telnyxCallId",
      recording_url AS "recordingUrl",
      notes,
      disposition,
      call_duration_seconds AS "callDurationSeconds",
      created_at AS "createdAt"
    FROM dialer_call_attempts
    WHERE created_at >= '2026-01-15'
      AND call_duration_seconds >= 0
      AND call_duration_seconds <= 30
      AND (notes IS NULL OR notes NOT ILIKE '%${TRANSCRIPT_MARKER}%')
    ORDER BY created_at DESC
    ${limitClause}
  `);

  const candidates = limit ? result.rows.slice(0, limit) : result.rows;
  console.log(`Short calls found: ${candidates.length}\n`);

  let processed = 0;
  let recordingFound = 0;
  let telnyxFetched = 0;
  let transcribed = 0;
  let noRecording = 0;
  let updateSkipped = 0;

  for (const call of candidates) {
    processed++;
    const duration = call.callDurationSeconds ?? 0;
    if (verbose) {
      console.log(`[${processed}/${candidates.length}] ${call.id} | ${duration}s | disp=${call.disposition || "n/a"} | created=${call.createdAt}`);
    }

    let recording = call.recordingUrl;
    let usedTelnyx = false;

    if (!recording && call.telnyxCallId) {
      telnyxFetched++;
      if (verbose) {
        console.log("  Looking up Telnyx recording...");
      }
      recording = await fetchTelnyxRecording(call.telnyxCallId);
      if (recording) {
        if (verbose) {
          console.log("  Telnyx recording URL found");
        }
        usedTelnyx = true;
      }
    }

    if (!recording) {
      noRecording++;
      if (verbose) {
        console.log("  Skipping – no recording available");
      }
      continue;
    }

    recordingFound++;

    let transcript: string | null = null;
    if (dryRun) {
      if (verbose) {
        console.log("  Dry run – would transcribe");
      }
      updateSkipped++;
      continue;
    }

    transcript = await submitTranscription(recording);
    if (!transcript) {
      if (verbose) {
        console.log("  Transcription returned no text");
      }
      continue;
    }

    transcribed++;
    const block = `${TRANSCRIPT_MARKER}\nDuration: ${duration}s | Disposition: ${call.disposition || "unknown"}\nSource: ${usedTelnyx ? "Telnyx recording_url" : "Existing recording_url"}\n${transcript.trim()}`;
    const nextNotes = call.notes ? `${call.notes}\n\n${block}` : block;

    const updatePayload: { notes: string; recordingUrl?: string; updatedAt: Date } = {
      notes: nextNotes,
      updatedAt: new Date(),
    };

    if (usedTelnyx && !call.recordingUrl) {
      updatePayload.recordingUrl = recording;
    }

    await db
      .update(dialerCallAttempts)
      .set(updatePayload)
      .where(eq(dialerCallAttempts.id, call.id));
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Processed candidates: ${processed}`);
  console.log(`Recordings found: ${recordingFound}`);
  console.log(`Telnyx fetches attempted: ${telnyxFetched}`);
  console.log(`Transcriptions saved: ${transcribed}`);
  console.log(`Calls lacking recordings: ${noRecording}`);
  if (dryRun) {
    console.log(`Dry run skipped writes: ${updateSkipped}`);
  }

  if (dryRun) {
    console.log("\nRe-run with --execute to write transcripts.");
  }

  process.exit(0);
}

transcribeShortCalls().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
