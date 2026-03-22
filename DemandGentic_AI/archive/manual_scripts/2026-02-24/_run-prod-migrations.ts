import pg from "pg";

async function main() {
  const dbUrl = process.env.PROD_DB_URL;
  if (!dbUrl) {
    console.error("PROD_DB_URL not set");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });

  const client = await pool.connect();
  console.log("Connected to production database.\n");

  try {
    // Migration 1: campaign_queue columns
    console.log("--- Migration 1: campaign_queue AI columns ---");
    await client.query(`
      ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_priority_score INTEGER;
      ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ;
      ALTER TABLE campaign_queue ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB;
    `);
    console.log("OK\n");

    // Migration 2: agent_queue columns + index
    console.log("--- Migration 2: agent_queue AI columns + index ---");
    await client.query(`
      ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS ai_priority_score INTEGER;
      ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMP;
      ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS agent_queue_intelligence_pull_idx
        ON agent_queue (campaign_id, queue_state, ai_priority_score DESC NULLS LAST, priority DESC, created_at ASC)
        WHERE queue_state = 'queued';
    `);
    console.log("OK\n");

    // Migration 3: campaigns timezone_priority_config
    console.log("--- Migration 3: campaigns timezone_priority_config ---");
    await client.query(`
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone_priority_config jsonb;
    `);
    console.log("OK\n");

    // VERIFY all columns exist
    console.log("========================================");
    console.log("VERIFICATION - Checking columns exist:");
    console.log("========================================\n");

    const checks = [
      { table: "campaign_queue", columns: ["ai_priority_score", "ai_scored_at", "ai_score_breakdown"] },
      { table: "agent_queue", columns: ["ai_priority_score", "ai_scored_at", "ai_score_breakdown"] },
      { table: "campaigns", columns: ["timezone_priority_config"] },
    ];

    let allGood = true;
    for (const check of checks) {
      const result = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = ANY($2)
        ORDER BY column_name;
      `, [check.table, check.columns]);

      const found = result.rows.map((r: any) => r.column_name);
      const missing = check.columns.filter(c => !found.includes(c));

      if (missing.length === 0) {
        console.log(`✅ ${check.table}: All columns present`);
        for (const row of result.rows) {
          console.log(`   - ${row.column_name} (${row.data_type})`);
        }
      } else {
        console.log(`❌ ${check.table}: MISSING columns: ${missing.join(", ")}`);
        allGood = false;
      }
    }

    // Check index
    const idxResult = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE indexname = 'agent_queue_intelligence_pull_idx';
    `);
    if (idxResult.rows.length > 0) {
      console.log(`✅ Index agent_queue_intelligence_pull_idx exists`);
    } else {
      console.log(`❌ Index agent_queue_intelligence_pull_idx MISSING`);
      allGood = false;
    }

    console.log("\n" + (allGood ? "ALL MIGRATIONS VERIFIED ✅" : "SOME MIGRATIONS FAILED ❌"));

  } catch (err: any) {
    console.error("MIGRATION ERROR:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();