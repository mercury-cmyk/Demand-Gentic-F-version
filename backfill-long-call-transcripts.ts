import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";
import { eq } from "drizzle-orm";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";
import { submitTranscription } from "./server/services/assemblyai-transcription";

const TRANSCRIPT_MARKER = "[Call Transcript]";
const INTEREST_REGEX = /(interested|schedule|book|meeting|demo|follow[- ]?up|send (me|us)|next step|calendar)/i;

async function transcribeWithWhisper(recordingUrl: string): Promise<string | null> {
  try {
    console.log("[Google STT] Transcribing long call recording...");
    
    // Use Google Cloud Speech-to-Text service
    const transcript = await submitTranscription(recordingUrl);
    
    if (!transcript) {
      console.error("[Google STT] Transcription returned empty result");
      return null;
    }
    
    return transcript;
  } catch (error) {
    console.error("[Google STT] Error during transcription:", error);
    return null;
  }
}

async function backfillLongCallTranscripts() {
  console.log("========================================");
  console.log("BACKFILL LONG CALL TRANSCRIPTS (>90s)");
  console.log("========================================\n");

  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--execute") ? false : true;
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;
  if (DRY_RUN) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute flag to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
  }

  const attempts = await db.execute(sql`
    SELECT
      dca.id,
      dca.telnyx_call_id,
      dca.recording_url,
      dca.notes,
      dca.call_duration_seconds,
      dca.created_at,
      dca.disposition,
      dca.connected,
      c.first_name,
      c.last_name,
      c.email
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.call_duration_seconds > 90
    ORDER BY dca.call_duration_seconds DESC
  `);

  const rows = limit ? attempts.rows.slice(0, limit) : attempts.rows;
  console.log(`Total calls > 90s: ${attempts.rows.length}`);
  console.log(`Processing: ${rows.length}\n`);

  let recordingsFetched = 0;
  let transcriptsWritten = 0;
  let transcriptCandidates = 0;
  let noRecording = 0;
  const candidateSamples: Array<{ id: string; name: string; duration: number; disposition: string | null }> = [];

  for (const row of rows) {
    const r = row as any;
    const attemptId = r.id as string;
    const name = `${r.first_name || "Unknown"} ${r.last_name || ""}`.trim();
    const duration = r.call_duration_seconds || 0;
    const existingNotes = r.notes || "";
    const hasTranscript = typeof existingNotes === "string" && existingNotes.includes(TRANSCRIPT_MARKER);

    if (hasTranscript) {
      continue;
    }

    if (!r.telnyx_call_id) {
      continue;
    }

    if (verbose) {
      console.log(`\n${name} | ${duration}s | attempt=${attemptId}`);
    }

    if (DRY_RUN) {
      if (verbose) {
        console.log("  DRY RUN: would fetch recording + transcribe");
      }
      continue;
    }

    try {
      const recordingUrl = r.recording_url || (await fetchTelnyxRecording(r.telnyx_call_id));
      if (!recordingUrl) {
        noRecording += 1;
        if (verbose) {
          console.log("  No recording found");
        }
        continue;
      }

      recordingsFetched += 1;

      await db.update(dialerCallAttempts)
        .set({ recordingUrl, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, attemptId));

      const transcript = await transcribeWithWhisper(recordingUrl);
      if (!transcript) {
        console.log("  Transcription failed");
        continue;
      }

      const transcriptBlock = `${TRANSCRIPT_MARKER}\n${transcript.trim()}`;
      const nextNotes = existingNotes
        ? `${existingNotes}\n\n${transcriptBlock}`
        : transcriptBlock;

      await db.update(dialerCallAttempts)
        .set({ notes: nextNotes, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, attemptId));

      transcriptsWritten += 1;

      if (INTEREST_REGEX.test(transcript)) {
        transcriptCandidates += 1;
        if (candidateSamples.length < 20) {
          candidateSamples.push({
            id: attemptId,
            name,
            duration,
            disposition: r.disposition || null,
          });
        }
      }

      if (verbose) {
        console.log("  Transcript saved");
      }
    } catch (error: any) {
      console.log(`[Backfill] Error for attempt ${attemptId}: ${error.message || error}`);
    }
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Recordings fetched: ${recordingsFetched}`);
  console.log(`Transcripts written: ${transcriptsWritten}`);
  console.log(`Interest-signal candidates: ${transcriptCandidates}`);
  console.log(`No recordings found: ${noRecording}`);

  if (candidateSamples.length > 0) {
    console.log("\nSample candidates:");
    for (const c of candidateSamples) {
      console.log(`  ${c.name} | ${c.duration}s | disp=${c.disposition || "NULL"} | attempt=${c.id}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nTo apply these changes, run:");
    console.log("  npx tsx backfill-long-call-transcripts.ts --execute --limit 50 --verbose");
  }

  process.exit(0);
}

backfillLongCallTranscripts().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
