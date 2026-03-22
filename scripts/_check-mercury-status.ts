/**
 * Quick diagnostic: check Mercury SMTP providers + outbox status
 */
import { config } from "dotenv";
config({ path: ".env" });

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  console.log("=== SMTP PROVIDERS ===");
  const providers = await db.execute(
    sql`SELECT id, name, email_address, is_active, is_default, auth_type, created_at FROM smtp_providers ORDER BY created_at DESC LIMIT 5`
  );
  for (const row of providers.rows) {
    console.log(JSON.stringify(row));
  }
  if (providers.rows.length === 0) {
    console.log("  (none found)");
  }

  console.log("\n=== OUTBOX STATUS COUNTS ===");
  const outboxStats = await db.execute(
    sql`SELECT status, COUNT(*)::int as cnt FROM mercury_email_outbox GROUP BY status ORDER BY cnt DESC`
  );
  for (const row of outboxStats.rows) {
    console.log(`  ${(row as any).status}: ${(row as any).cnt}`);
  }
  if (outboxStats.rows.length === 0) {
    console.log("  (outbox is empty)");
  }

  console.log("\n=== RECENT OUTBOX ENTRIES (last 10) ===");
  const recent = await db.execute(
    sql`SELECT id, template_key, recipient_email, from_email, status, error_message, retry_count, created_at, sent_at
        FROM mercury_email_outbox ORDER BY created_at DESC LIMIT 10`
  );
  for (const row of recent.rows) {
    const r = row as any;
    console.log(
      `  [${r.status}] ${r.template_key} → ${r.recipient_email} | from=${r.from_email} | retries=${r.retry_count} | created=${r.created_at} | sent=${r.sent_at || "never"}`
    );
    if (r.error_message) {
      console.log(`    ERROR: ${r.error_message}`);
    }
  }
  if (recent.rows.length === 0) {
    console.log("  (no entries)");
  }

  console.log("\n=== NOTIFICATION RULES ===");
  const rules = await db.execute(
    sql`SELECT id, event_type, template_key, recipient_resolver, is_enabled FROM mercury_notification_rules ORDER BY event_type`
  );
  for (const row of rules.rows) {
    const r = row as any;
    console.log(`  [${r.is_enabled ? "ON" : "OFF"}] ${r.event_type} → ${r.template_key} (resolver: ${r.recipient_resolver})`);
  }
  if (rules.rows.length === 0) {
    console.log("  (no rules configured)");
  }

  await pool.end();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
