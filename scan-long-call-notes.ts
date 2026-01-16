import { db } from "./server/db";
import { sql } from "drizzle-orm";

const INTEREST_REGEX = /(interested|schedule|book|meeting|demo|follow[- ]?up|send (me|us)|next step|calendar)/i;

function summarizeNote(note: string): string {
  return note.replace(/\s+/g, " ").trim().slice(0, 200);
}

async function scanLongCallNotes() {
  console.log("========================================");
  console.log("SCAN NOTES FOR >90s CALLS");
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
    WHERE dca.call_duration_seconds > 90
      AND dca.notes IS NOT NULL
      AND dca.notes != ''
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Calls >90s with notes: ${rows.rows.length}`);

  const matches: Array<{
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    duration: number;
    disposition: string | null;
    createdAt: string | null;
    preview: string;
  }> = [];

  for (const row of rows.rows) {
    const r = row as any;
    const note = String(r.notes || "");
    if (INTEREST_REGEX.test(note)) {
      matches.push({
        id: r.id,
        name: `${r.first_name || "Unknown"} ${r.last_name || ""}`.trim(),
        company: r.company_name || null,
        email: r.email || null,
        duration: r.call_duration_seconds || 0,
        disposition: r.disposition || null,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        preview: summarizeNote(note),
      });
    }
  }

  console.log(`Interest-signal matches in notes: ${matches.length}\n`);

  for (const m of matches) {
    console.log("--------------------------------------------------");
    console.log(`${m.name} | ${m.duration}s | disp=${m.disposition || "NULL"}`);
    console.log(`Company: ${m.company || "N/A"} | Email: ${m.email || "N/A"}`);
    console.log(`Created: ${m.createdAt || "N/A"}`);
    console.log(`Note: ${m.preview}`);
    console.log(`Attempt ID: ${m.id}`);
  }

  process.exit(0);
}

scanLongCallNotes().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
