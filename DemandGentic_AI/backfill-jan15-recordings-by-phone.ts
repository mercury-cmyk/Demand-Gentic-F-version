import { db } from "./server/db";
import { sql, eq } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const OPENAI_API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const TRANSCRIPT_MARKER = "[Call Transcript]";

type TelnyxRecording = {
  id: string;
  created_at: string;
  duration_millis: number;
  status: string;
  to?: string;
  from?: string;
  download_urls?: { mp3?: string; wav?: string };
};

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function toE164Candidates(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  if (normalized.startsWith("+")) return [normalized];
  if (normalized.length === 10) return [`+1${normalized}`, normalized];
  if (normalized.length === 11 && normalized.startsWith("1")) return [`+${normalized}`, normalized];
  return [normalized];
}

async function searchRecordingsByPhone(phone: string, start: Date, end: Date): Promise {
  if (!TELNYX_API_KEY) {
    throw new Error("TELNYX_API_KEY not configured");
  }

  const candidates = toE164Candidates(phone);
  for (const candidate of candidates) {
    const params = new URLSearchParams();
    params.append("filter[to]", candidate);
    params.append("filter[created_at][gte]", start.toISOString());
    params.append("filter[created_at][lte]", end.toISOString());
    params.append("page[size]", "50");

    const response = await fetch(`https://api.telnyx.com/v2/recordings?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telnyx API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const results = (data.data || []) as TelnyxRecording[];
    if (results.length) return results;
  }

  return [];
}

async function transcribeWithWhisper(recordingUrl: string): Promise {
  try {
    console.log(`[Google STT] Transcribing: ${recordingUrl.substring(0, 80)}...`);
    
    // Dynamic import to get transcription service
    const { submitTranscription } = await import('./server/services/google-transcription');
    const transcript = await submitTranscription(recordingUrl);
    
    if (!transcript) {
      console.error('[Google STT] Transcription failed or returned empty');
      return null;
    }
    
    return transcript;
  } catch (error) {
    console.error('[Google STT] Error during transcription:', error);
    return null;
  }
}

function pickBestRecording(recordings: TelnyxRecording[], targetSeconds: number): TelnyxRecording | null {
  const completed = recordings.filter((rec) => rec.status === "completed");
  if (!completed.length) return null;

  let best: TelnyxRecording | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const rec of completed) {
    const recSeconds = Math.round((rec.duration_millis || 0) / 1000);
    const delta = Math.abs(recSeconds - targetSeconds);
    if (delta  arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;
  const windowArgIndex = args.findIndex((arg) => arg === "--window-mins");
  const windowMins = windowArgIndex >= 0 ? Number(args[windowArgIndex + 1]) : 360;
  const recordingsOnly = args.includes("--recordings-only");
  const skipTranscription = recordingsOnly || args.includes("--skip-transcription");
  const transcribeOnly = args.includes("--transcribe-only");
  const refreshUrls = args.includes("--refresh-urls");

  if (DRY_RUN) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute flag to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
    if (recordingsOnly) {
      console.log("Recording-only mode (transcription skipped)\n");
    }
    if (transcribeOnly) {
      console.log(`Transcribe-only mode (${refreshUrls ? "refreshing" : "using"} recording_url)\n`);
    }
  }

  const attempts = transcribeOnly
    ? await db.execute(sql`
        SELECT
          id,
          phone_dialed,
          call_duration_seconds,
          created_at,
          notes,
          recording_url
        FROM dialer_call_attempts
        WHERE created_at::date = '2026-01-15'
          AND call_duration_seconds >= 60
          AND recording_url IS NOT NULL
          AND (notes IS NULL OR notes NOT LIKE '%[Call Transcript]%')
        ORDER BY call_duration_seconds DESC
      `)
    : await db.execute(sql`
        SELECT
          id,
          phone_dialed,
          call_duration_seconds,
          created_at,
          notes,
          recording_url
        FROM dialer_call_attempts
        WHERE created_at::date = '2026-01-15'
          AND call_duration_seconds >= 60
          AND recording_url IS NULL
        ORDER BY call_duration_seconds DESC
      `);

  const rows = limit ? attempts.rows.slice(0, limit) : attempts.rows;
  console.log(`Total Jan 15 calls >= 60s: ${attempts.rows.length}`);
  console.log(`Processing: ${rows.length}\n`);

  let recordingsFound = 0;
  let transcriptsWritten = 0;
  let alreadyHasTranscript = 0;
  let noRecording = 0;
  let transcriptionErrors = 0;

  for (const row of rows) {
    const r = row as any;
    const attemptId = r.id as string;
    const dialed = r.phone_dialed ? normalizePhone(String(r.phone_dialed)) : "";
    const duration = r.call_duration_seconds || 0;
    const createdAt = r.created_at ? new Date(r.created_at) : null;
    const notes = String(r.notes || "");

    if (!dialed || !createdAt) {
      continue;
    }

    if (notes.includes(TRANSCRIPT_MARKER)) {
      alreadyHasTranscript += 1;
      continue;
    }

    const start = new Date(createdAt);
    start.setMinutes(start.getMinutes() - windowMins);
    const end = new Date(createdAt);
    end.setMinutes(end.getMinutes() + windowMins);

    try {
      let recordingUrl: string | null = r.recording_url || null;

      if (!transcribeOnly || refreshUrls) {
        const recordings = await searchRecordingsByPhone(dialed, start, end);
        const best = pickBestRecording(recordings, duration);
        if (!best) {
          noRecording += 1;
          continue;
        }

        recordingUrl = best.download_urls?.mp3 || best.download_urls?.wav || null;
        if (!recordingUrl) {
          noRecording += 1;
          continue;
        }

        recordingsFound += 1;

        if (!DRY_RUN) {
          await db.update(dialerCallAttempts)
            .set({ recordingUrl: recordingUrl, updatedAt: new Date() })
            .where(eq(dialerCallAttempts.id, attemptId));
        }
      }

      if (!skipTranscription) {
        if (!recordingUrl) {
          noRecording += 1;
          continue;
        }

        const transcript = await transcribeWithWhisper(recordingUrl);
        if (!transcript) {
          transcriptionErrors += 1;
          continue;
        }

        const transcriptBlock = `${TRANSCRIPT_MARKER}\n${transcript.trim()}`;
        const nextNotes = notes ? `${notes}\n\n${transcriptBlock}` : transcriptBlock;

        await db.update(dialerCallAttempts)
          .set({ notes: nextNotes, updatedAt: new Date() })
          .where(eq(dialerCallAttempts.id, attemptId));

        transcriptsWritten += 1;
      }
    } catch (error: any) {
      console.log(`[Backfill] Error for attempt ${attemptId}: ${error.message || error}`);
      transcriptionErrors += 1;
    }
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Recordings found: ${recordingsFound}`);
  console.log(`Transcripts written: ${transcriptsWritten}`);
  console.log(`Already had transcript marker: ${alreadyHasTranscript}`);
  console.log(`No recording match: ${noRecording}`);
  console.log(`Transcription errors: ${transcriptionErrors}`);

  if (DRY_RUN) {
    console.log("\nTo apply these changes, run:");
    console.log("  npx tsx backfill-jan15-recordings-by-phone.ts --execute --limit 20 --window-mins 360");
    console.log("  npx tsx backfill-jan15-recordings-by-phone.ts --execute --limit 20 --window-mins 360 --recordings-only");
    console.log("  npx tsx backfill-jan15-recordings-by-phone.ts --execute --limit 20 --transcribe-only");
  }

  process.exit(0);
}

backfillJan15Recordings().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});