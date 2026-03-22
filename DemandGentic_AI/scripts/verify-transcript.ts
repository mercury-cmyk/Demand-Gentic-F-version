import "dotenv/config";
import { pool } from "../server/db";

async function main() {
  const r = await pool.query(
    "SELECT transcript, structured_transcript FROM leads WHERE id = 'b2edf32f-2bd9-4c1b-af09-fd164375089b'"
  );

  if (r.rows.length === 0) {
    console.log("Not found");
    return;
  }

  console.log("=== PLAIN TRANSCRIPT (Agent/Prospect labeled) ===\n");
  console.log(r.rows[0].transcript);

  const s = typeof r.rows[0].structured_transcript === "string"
    ? JSON.parse(r.rows[0].structured_transcript)
    : r.rows[0].structured_transcript;

  console.log("\n=== STRUCTURED DATA ===");
  console.log("Provider:", s.provider);
  console.log("Agent lines:", s.agentLines?.length);
  console.log("Prospect lines:", s.prospectLines?.length);
  console.log("Total utterances:", s.utterances?.length);

  // Also show second lead
  const r2 = await pool.query(
    "SELECT transcript, structured_transcript FROM leads WHERE id = '29e0f5d7-92a1-4e59-b8c4-841684f9a486'"
  );

  if (r2.rows.length > 0) {
    console.log("\n\n=== LEAD 2 TRANSCRIPT ===\n");
    console.log(r2.rows[0].transcript);
  }

  await pool.end();
  process.exit(0);
}

main();