import "dotenv/config";
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

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

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

async function searchRecordingsByPhone(phone: string, start: Date, end: Date): Promise<TelnyxRecording[]> {
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

function pickBestRecording(recordings: TelnyxRecording[], targetSeconds: number): TelnyxRecording | null {
  const completed = recordings.filter((rec) => rec.status === "completed");
  if (!completed.length) return null;

  let best: TelnyxRecording | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const rec of completed) {
    const recSeconds = Math.round((rec.duration_millis || 0) / 1000);
    const delta = Math.abs(recSeconds - targetSeconds);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = rec;
    }
  }

  return best;
}

async function transcribeWithWhisper(recordingUrl: string, model: string): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const audioResponse = await fetch(recordingUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download recording: ${audioResponse.statusText}`);
  }

  const audioBlob = await audioResponse.blob();
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.mp3");
  formData.append("model", model);
  formData.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transcription failed: ${errorText}`);
  }

  const data = await response.json();
  return data.text || null;
}

async function run() {
  const limit = Number(getArg("--limit") || "0");
  const concurrency = Number(getArg("--concurrency") || "3");
  const windowMins = Number(getArg("--window-mins") || "360");
  const model = getArg("--model") || "whisper-1";

  if (!TELNYX_API_KEY) throw new Error("TELNYX_API_KEY not configured");
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

  console.log("========================================");
  console.log("BULK TRANSCRIBE JAN 15 (>=60s)");
  console.log("========================================\n");
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Window minutes: ${windowMins}`);
  console.log(`Model: ${model}\n`);

  const attempts = await db.execute(sql`
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
  `);

  const rows = limit > 0 ? attempts.rows.slice(0, limit) : attempts.rows;
  console.log(`Remaining to transcribe: ${rows.length}\n`);

  let index = 0;
  let processed = 0;
  let transcriptsWritten = 0;
  let noRecording = 0;
  let errors = 0;

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= rows.length) return;
      const r = rows[i] as any;
      const attemptId = r.id as string;
      const dialed = r.phone_dialed ? normalizePhone(String(r.phone_dialed)) : "";
      const duration = r.call_duration_seconds || 0;
      const createdAt = r.created_at ? new Date(r.created_at) : null;
      const notes = String(r.notes || "");

      try {
        if (!dialed || !createdAt) {
          processed += 1;
          continue;
        }

        const start = new Date(createdAt);
        start.setMinutes(start.getMinutes() - windowMins);
        const end = new Date(createdAt);
        end.setMinutes(end.getMinutes() + windowMins);

        const recordings = await searchRecordingsByPhone(dialed, start, end);
        const best = pickBestRecording(recordings, duration);
        if (!best) {
          noRecording += 1;
          processed += 1;
          continue;
        }

        const recordingUrl = best.download_urls?.mp3 || best.download_urls?.wav || null;
        if (!recordingUrl) {
          noRecording += 1;
          processed += 1;
          continue;
        }

        await db.update(dialerCallAttempts)
          .set({ recordingUrl: recordingUrl, updatedAt: new Date() })
          .where(eq(dialerCallAttempts.id, attemptId));

        const transcript = await transcribeWithWhisper(recordingUrl, model);
        if (transcript) {
          const transcriptBlock = `${TRANSCRIPT_MARKER}\n${transcript.trim()}`;
          const nextNotes = notes ? `${notes}\n\n${transcriptBlock}` : transcriptBlock;
          await db.update(dialerCallAttempts)
            .set({ notes: nextNotes, updatedAt: new Date() })
            .where(eq(dialerCallAttempts.id, attemptId));
          transcriptsWritten += 1;
        }
      } catch (err: any) {
        errors += 1;
        console.log(`[Bulk] Error for attempt ${attemptId}: ${err.message || err}`);
      } finally {
        processed += 1;
        if (processed % 25 === 0) {
          console.log(`Progress: ${processed}/${rows.length} | transcripts=${transcriptsWritten} | errors=${errors}`);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Processed: ${processed}`);
  console.log(`Transcripts written: ${transcriptsWritten}`);
  console.log(`No recording match: ${noRecording}`);
  console.log(`Errors: ${errors}`);
}

run().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
