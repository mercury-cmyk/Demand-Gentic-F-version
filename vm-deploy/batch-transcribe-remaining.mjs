import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Find remaining NULL disposition calls with recordings that need transcription
const remaining = await pool.query(`
  SELECT cs.id as session_id, cs.recording_url, cs.recording_s3_key, cs.duration_sec,
    cs.campaign_id, cs.contact_id
  FROM call_sessions cs
  WHERE cs.ai_disposition IS NULL
    AND cs.duration_sec >= 20
    AND cs.recording_url IS NOT NULL
  ORDER BY cs.created_at DESC
`);

console.log("Found", remaining.rows.length, "calls needing transcription");
console.log("This will take a while... processing in batches of 5");

let transcribed = 0;
let analyzed = 0;
let failed = 0;
let skipped = 0;

const BATCH_SIZE = 5;
const total = remaining.rows.length;

for (let i = 0; i < total; i += BATCH_SIZE) {
  const batch = remaining.rows.slice(i, i + BATCH_SIZE);

  const results = await Promise.allSettled(
    batch.map(async (row) => {
      const recordingUrl = row.recording_url;
      if (!recordingUrl) return { transcribed: false, skipped: true };

      // Download and transcribe
      try {
        const mediaResponse = await fetch(recordingUrl);
        if (!mediaResponse.ok) return { transcribed: false, skipped: true };

        const arrayBuffer = await mediaResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length < 1000) return { transcribed: false, skipped: true };

        // Use Telnyx STT via OpenAI-compatible API
        const telnyxApiKey = process.env.TELNYX_API_KEY;
        if (!telnyxApiKey) return { transcribed: false, skipped: true };

        const formData = new FormData();
        const contentType = mediaResponse.headers.get("content-type") || "audio/mp3";
        const ext = contentType.includes("wav") ? "wav" : "mp3";
        const file = new File([buffer], `recording.${ext}`, { type: contentType });
        formData.append("file", file);
        formData.append("model", "distil-whisper/distil-large-v2");

        const sttResponse = await fetch("https://api.telnyx.com/v2/ai/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${telnyxApiKey}` },
          body: formData,
        });

        if (!sttResponse.ok) {
          const err = await sttResponse.text();
          console.warn("STT error for", row.session_id, ":", sttResponse.status, err.substring(0, 100));
          return { transcribed: false, skipped: false };
        }

        const sttResult = await sttResponse.json();
        const text = sttResult.text || "";

        if (!text.trim() || text.length < 20) return { transcribed: false, skipped: true };

        // Save transcript
        await pool.query(`UPDATE call_sessions SET ai_transcript = $1 WHERE id = $2`, [text, row.session_id]);

        // Determine disposition from transcript
        const t = text.toLowerCase();
        let d = "needs_review";
        if (t.includes("voicemail") || t.includes("leave a message") || t.includes("not available") || t.includes("after the tone") || t.includes("after the beep")) d = "voicemail";
        else if (t.includes("do not call") || t.includes("stop calling")) d = "do_not_call";
        else if (t.includes("not interested") || t.includes("no thanks") || t.includes("no thank you")) d = "not_interested";
        else if (t.includes("call back") || t.includes("callback") || t.includes("call me back")) d = "callback_requested";
        else if (t.includes("interested") || t.includes("tell me more") || t.includes("schedule") || t.includes("appointment")) d = "qualified_lead";
        else if (t.includes("wrong number") || t.includes("wrong person")) d = "invalid_data";
        else if (t.length < 100) d = "no_answer";

        await pool.query(`UPDATE call_sessions SET ai_disposition = $1 WHERE id = $2`, [d, row.session_id]);

        return { transcribed: true, disposition: d };
      } catch (err) {
        console.warn("Error for", row.session_id, ":", err.message);
        return { transcribed: false, skipped: false };
      }
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.transcribed) { transcribed++; analyzed++; }
      else if (r.value.skipped) skipped++;
      else failed++;
    } else {
      failed++;
    }
  }

  const processed = transcribed + failed + skipped;
  if (processed % 50 === 0 || i + BATCH_SIZE >= total) {
    console.log(`Progress: ${processed}/${total} | transcribed: ${transcribed} | failed: ${failed} | skipped: ${skipped}`);
  }
}

console.log("\n=== Batch transcription complete ===");
console.log(`Transcribed: ${transcribed}, Failed: ${failed}, Skipped: ${skipped}`);

// Final distribution
const finalDist = await pool.query(`
  SELECT ai_disposition, COUNT(*) as cnt
  FROM call_sessions
  GROUP BY ai_disposition
  ORDER BY cnt DESC
`);
console.log("\n=== Final disposition distribution ===");
for (const r of finalDist.rows) {
  console.log("  " + String(r.ai_disposition || "NULL").padEnd(25) + " | " + r.cnt);
}

await pool.end();
