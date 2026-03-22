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
  const result = await pool.query(`
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
      AND call_duration_seconds  {
  console.error("Error:", error);
  process.exit(1);
});