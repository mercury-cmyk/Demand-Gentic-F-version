import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

const TRANSCRIPT_MARKER = "[Call Transcript]";

const POSITIVE = /(interested|sounds good|sounds interesting|tell me more|schedule|book|meeting|demo|follow[- ]?up|send (me|us)|next step|calendar)/i;
const STRONG_POSITIVE = /(schedule|book|meeting|demo|calendar|follow[- ]?up|next step)/i;
const NEGATIVE = /(not interested|no thanks|remove me|do not call|don't call|stop calling|unsubscribe)/i;
const CALLBACK = /(call me back|call back|later|tomorrow|next week)/i;
const VOICEMAIL = /(voicemail|leave (me )?a message|at the tone|after the beep|not available|sorry i missed your call|please leave|record your message)/i;

function extractTranscript(notes: string): string | null {
  const idx = notes.indexOf(TRANSCRIPT_MARKER);
  if (idx < 0) return null;
  return notes.slice(idx + TRANSCRIPT_MARKER.length).trim();
}

async function analyzeJan15Transcripts() {
  console.log("========================================");
  console.log("JAN 15 TRANSCRIPT ANALYSIS");
  console.log("========================================\n");

  const rows = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.notes LIKE '%[Call Transcript]%'
    ORDER BY dca.call_duration_seconds DESC
  `);

  let total = 0;
  let positives = 0;
  let strong = 0;
  const candidates: Array<{
    id: string;
    name: string;
    email: string | null;
    company: string | null;
    duration: number;
    disposition: string | null;
    createdAt: string | null;
    snippet: string;
    reason: string;
  }> = [];

  for (const row of rows.rows) {
    const r = row as any;
    const transcript = extractTranscript(String(r.notes || ""));
    if (!transcript) continue;

    total += 1;
    const hasPositive = POSITIVE.test(transcript);
    const hasStrong = STRONG_POSITIVE.test(transcript);
    const hasNegative = NEGATIVE.test(transcript);
    const hasCallback = CALLBACK.test(transcript);
    const isVoicemail = VOICEMAIL.test(transcript);

    if (hasPositive && !hasNegative && !isVoicemail) {
      positives += 1;
      const reason = hasStrong
        ? "strong intent (meeting/demo/follow-up)"
        : hasCallback
          ? "callback signal"
          : "general interest signal";

      if (hasStrong) strong += 1;

      candidates.push({
        id: r.id,
        name: `${r.first_name || "Unknown"} ${r.last_name || ""}`.trim(),
        email: r.email || null,
        company: r.company_name || null,
        duration: r.call_duration_seconds || 0,
        disposition: r.disposition || null,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        snippet: transcript.replace(/\s+/g, " ").slice(0, 240),
        reason,
      });
    }
  }

  console.log(`Transcripts analyzed: ${total}`);
  console.log(`Positive signal: ${positives}`);
  console.log(`Strong qualification signal: ${strong}\n`);

  if (candidates.length === 0) {
    console.log("No qualification candidates found.");
    process.exit(0);
  }

  console.log("Qualification candidates:");
  for (const c of candidates) {
    console.log("--------------------------------------------------");
    console.log(`${c.name} | ${c.duration}s | disp=${c.disposition || "NULL"}`);
    console.log(`Company: ${c.company || "N/A"} | Email: ${c.email || "N/A"}`);
    console.log(`Created: ${c.createdAt || "N/A"}`);
    console.log(`Reason: ${c.reason}`);
    console.log(`Snippet: ${c.snippet}`);
    console.log(`Attempt ID: ${c.id}`);
  }
}

analyzeJan15Transcripts().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
