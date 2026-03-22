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
  // Check which pipelines failed emails belong to
  const results = await db.execute(sql`
    SELECT o.id, o.template_key, o.recipient_email, o.status, o.from_email,
           o.metadata->>'pipelineActionId' as action_id,
           a.pipeline_id,
           p.client_account_id,
           p.name as pipeline_name
    FROM mercury_email_outbox o
    LEFT JOIN unified_pipeline_actions a ON a.id = (o.metadata->>'pipelineActionId')
    LEFT JOIN unified_pipelines p ON p.id = a.pipeline_id
    WHERE o.template_key LIKE 'pipeline%'
    ORDER BY o.created_at DESC
    LIMIT 20
  `);

  console.log("=== PIPELINE EMAILS IN OUTBOX ===");
  for (const r of results.rows as any[]) {
    console.log(
      `[${r.status}] ${r.recipient_email} | pipeline=${r.pipeline_name || "n/a"} | clientAcct=${r.client_account_id || "NONE (super org)"} | from=${r.from_email}`
    );
  }

  // Also check the older pipeline followup emails from background jobs
  const bgResults = await db.execute(sql`
    SELECT o.id, o.template_key, o.recipient_email, o.status, o.from_email,
           o.metadata
    FROM mercury_email_outbox o
    WHERE o.template_key LIKE 'pipeline_followup%'
    ORDER BY o.created_at DESC
    LIMIT 20
  `);

  console.log("\n=== PIPELINE FOLLOWUP EMAILS ===");
  for (const r of bgResults.rows as any[]) {
    const meta = r.metadata as any;
    console.log(
      `[${r.status}] ${r.recipient_email} | from=${r.from_email} | meta=${JSON.stringify(meta)}`
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
