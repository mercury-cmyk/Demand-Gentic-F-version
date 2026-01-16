import "dotenv/config";
import { db } from "./server/db";
import { sql, eq } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";

const VOICEMAIL = /(voicemail|leave (me )?a message|at the tone|after the beep|not available|sorry i missed your call|please leave|record your message)/i;

async function backfillVoicemailDispositions() {
  console.log("========================================");
  console.log("BACKFILL VOICEMAIL DISPOSITIONS");
  console.log("========================================\n");

  const DRY_RUN = process.argv.includes("--execute") ? false : true;
  if (DRY_RUN) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute flag to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
  }

  const rows = await db.execute(sql`
    SELECT
      id,
      disposition,
      notes
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND notes LIKE '%[Call Transcript]%'
      AND disposition IS DISTINCT FROM 'voicemail'
  `);

  let matches = 0;
  let updated = 0;

  for (const row of rows.rows) {
    const r = row as any;
    const notes = String(r.notes || "");
    if (!VOICEMAIL.test(notes)) continue;
    matches += 1;

    if (!DRY_RUN) {
      await db.update(dialerCallAttempts)
        .set({
          disposition: "voicemail",
          updatedAt: new Date(),
        })
        .where(eq(dialerCallAttempts.id, r.id));
      updated += 1;
    }
  }

  console.log(`Voicemail-like transcripts found: ${matches}`);
  if (!DRY_RUN) {
    console.log(`Updated dispositions: ${updated}`);
  }

  if (DRY_RUN) {
    console.log("\nTo apply these changes, run:");
    console.log("  npx tsx backfill-voicemail-dispositions.ts --execute");
  }
}

backfillVoicemailDispositions().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
