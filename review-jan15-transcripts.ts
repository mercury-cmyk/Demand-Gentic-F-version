import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { writeFileSync } from "fs";

const TRANSCRIPT_MARKER = "[Call Transcript]";

const VOICEMAIL = /(voicemail|leave (me )?a message|at the tone|after the beep|not available|sorry i missed your call|please leave|record your message)/i;
const IVR = /(press (one|1|two|2|three|3|four|4|five|5)|menu options|for sales|for support|please listen|dial extension)/i;
const POSITIVE = /(interested|sounds good|sounds interesting|tell me more|schedule|book|meeting|demo|follow[- ]?up|send (me|us)|next step|calendar)/i;
const NEGATIVE = /(not interested|no thanks|remove me|do not call|don't call|stop calling|unsubscribe)/i;

function extractTranscript(notes: string): string | null {
  const idx = notes.indexOf(TRANSCRIPT_MARKER);
  if (idx < 0) return null;
  return notes.slice(idx + TRANSCRIPT_MARKER.length).trim();
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function classifyTranscript(text: string): "voicemail" | "ivr" | "human" {
  if (VOICEMAIL.test(text)) return "voicemail";
  if (IVR.test(text)) return "ivr";
  return "human";
}

async function reviewJan15Transcripts() {
  console.log("========================================");
  console.log("JAN 15 TRANSCRIPT REVIEW EXPORT");
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

  const output: string[] = [];
  output.push([
    "attempt_id",
    "duration_seconds",
    "disposition",
    "contact_name",
    "email",
    "company",
    "created_at",
    "category",
    "has_interest_signal",
    "has_negative_signal",
    "transcript_len",
    "transcript_snippet",
    "transcript_full"
  ].join(","));

  let total = 0;
  let voicemail = 0;
  let ivr = 0;
  let human = 0;
  let positive = 0;

  for (const row of rows.rows) {
    const r = row as any;
    const transcript = extractTranscript(String(r.notes || ""));
    if (!transcript) continue;

    total += 1;
    const normalized = normalizeText(transcript);
    const category = classifyTranscript(normalized);
    const hasPositive = POSITIVE.test(normalized) && !NEGATIVE.test(normalized) && category === "human";
    const hasNegative = NEGATIVE.test(normalized);

    if (category === "voicemail") voicemail += 1;
    else if (category === "ivr") ivr += 1;
    else human += 1;

    if (hasPositive) positive += 1;

    const snippet = normalized.slice(0, 200).replace(/"/g, '""');
    const full = normalized.replace(/"/g, '""');
    const name = `${r.first_name || "Unknown"} ${r.last_name || ""}`.trim().replace(/"/g, '""');
    const company = (r.company_name || "N/A").replace(/"/g, '""');
    const email = (r.email || "N/A").replace(/"/g, '""');
    const createdAt = r.created_at ? new Date(r.created_at).toISOString() : "N/A";

    output.push([
      `"${r.id}"`,
      r.call_duration_seconds || 0,
      `"${r.disposition || "NULL"}"`,
      `"${name}"`,
      `"${email}"`,
      `"${company}"`,
      `"${createdAt}"`,
      `"${category}"`,
      hasPositive ? "true" : "false",
      hasNegative ? "true" : "false",
      normalized.length,
      `"${snippet}"`,
      `"${full}"`
    ].join(","));
  }

  const outPath = "jan15-transcript-review.csv";
  writeFileSync(outPath, output.join("\n"), "utf8");

  console.log(`Transcripts analyzed: ${total}`);
  console.log(`Category counts: voicemail=${voicemail}, ivr=${ivr}, human=${human}`);
  console.log(`Human interest signals: ${positive}`);
  console.log(`Exported: ${outPath}`);
}

reviewJan15Transcripts().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
