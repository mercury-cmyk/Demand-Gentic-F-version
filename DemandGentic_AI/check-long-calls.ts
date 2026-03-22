import { db } from "./server/db";
import { sql } from "drizzle-orm";

const INTEREST_REGEX = /(interested|schedule|book|meeting|demo|follow[- ]?up|send (me|us)|next step)/i;

async function checkLongCalls() {
  console.log("========================================");
  console.log("CALLS OVER 90 SECONDS");
  console.log("========================================\n");

  const calls = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.campaign_id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.recording_url,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.call_duration_seconds > 90
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Total calls > 90s: ${calls.rows.length}\n`);

  const dispositionCounts = new Map();
  let withNotes = 0;
  let withRecording = 0;
  let interestSignals = 0;

  for (const row of calls.rows) {
    const r = row as any;
    const disp = r.disposition || "NULL";
    dispositionCounts.set(disp, (dispositionCounts.get(disp) || 0) + 1);

    if (r.notes && String(r.notes).trim()) {
      withNotes += 1;
      if (INTEREST_REGEX.test(String(r.notes))) {
        interestSignals += 1;
      }
    }

    if (r.recording_url) {
      withRecording += 1;
    }
  }

  console.log("Disposition breakdown (>90s):");
  for (const [disp, count] of [...dispositionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${disp}: ${count}`);
  }

  console.log("\nSignal coverage:");
  console.log(`  Notes present: ${withNotes}`);
  console.log(`  Recordings present: ${withRecording}`);
  console.log(`  Interest signals in notes: ${interestSignals}`);

  console.log("\nTop 20 longest calls (>90s):");
  console.log("----------------------------------------");
  for (const row of calls.rows.slice(0, 20)) {
    const r = row as any;
    const name = `${r.first_name || "Unknown"} ${r.last_name || ""}`.trim();
    const date = r.created_at ? new Date(r.created_at).toISOString() : "N/A";
    const minutes = Math.floor((r.call_duration_seconds || 0) / 60);
    const seconds = (r.call_duration_seconds || 0) % 60;
    const notePreview = r.notes ? String(r.notes).replace(/\s+/g, " ").slice(0, 120) : "NO NOTES";
    console.log(
      `${minutes}m ${seconds}s | ${name} | disp=${r.disposition || "NULL"} | connected=${r.connected} | ${date}`
    );
    console.log(`  Company: ${r.company_name || "N/A"} | Email: ${r.email || "N/A"}`);
    console.log(`  Notes: ${notePreview}`);
  }

  process.exit(0);
}

checkLongCalls().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});