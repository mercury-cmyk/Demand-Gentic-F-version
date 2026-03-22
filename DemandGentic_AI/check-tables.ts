import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkTables() {
  try {
    console.log("=== Number Pool Related Tables ===\n");

    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'number%'
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      console.log("No number_* tables found!");
    } else {
      for (const t of tables.rows) {
        console.log("  - " + (t as any).table_name);
      }
    }

    console.log("\n=== Telnyx Tables ===\n");

    const telnyxTables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'telnyx%'
      ORDER BY table_name
    `);

    for (const t of telnyxTables.rows) {
      console.log("  - " + (t as any).table_name);
    }

  } catch (e: any) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}

checkTables();