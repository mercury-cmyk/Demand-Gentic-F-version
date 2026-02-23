import pg from "pg";

const { Pool } = pg;

type Requirement = {
  required: string[];
  recommended: string[];
};

const TABLE_REQUIREMENTS: Record<string, Requirement> = {
  campaign_queue: {
    required: ["id", "campaign_id", "contact_id", "status", "priority", "next_attempt_at", "created_at"],
    recommended: ["ai_priority_score", "ai_scored_at", "ai_score_breakdown"],
  },
  contacts: {
    required: ["id", "first_name", "last_name"],
    recommended: [
      "country",
      "state",
      "timezone",
      "mobile_phone",
      "mobile_phone_e164",
      "direct_phone",
      "direct_phone_e164",
      "dialing_phone_e164",
      "phone_verified_at",
      "job_title",
      "seniority_level",
    ],
  },
  accounts: {
    required: ["id", "name"],
    recommended: ["industry_standardized", "industry_raw", "industry_ai_suggested"],
  },
  agent_queue: {
    required: ["id", "campaign_id", "queue_state", "priority", "created_at"],
    recommended: ["ai_priority_score", "ai_scored_at", "ai_score_breakdown"],
  },
};

function findMissing(expected: string[], actual: Set<string>): string[] {
  return expected.filter((col) => !actual.has(col));
}

async function getTableColumns(pool: Pool, tableName: string): Promise<Set<string>> {
  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  );
  return new Set(result.rows.map((r) => String(r.column_name)));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  let hasRequiredFailures = false;

  try {
    console.log("Queue Intelligence Readiness Check");
    console.log("================================");

    for (const [table, req] of Object.entries(TABLE_REQUIREMENTS)) {
      const columns = await getTableColumns(pool, table);
      const missingRequired = findMissing(req.required, columns);
      const missingRecommended = findMissing(req.recommended, columns);

      console.log(`\n[${table}]`);
      if (missingRequired.length === 0) {
        console.log("  Required: OK");
      } else {
        hasRequiredFailures = true;
        console.log(`  Required: MISSING (${missingRequired.join(", ")})`);
      }

      if (missingRecommended.length === 0) {
        console.log("  Recommended: OK");
      } else {
        console.log(`  Recommended: MISSING (${missingRecommended.join(", ")})`);
      }
    }

    console.log("\nMigration hints:");
    console.log("  npx tsx scripts/run-sql-file.ts migrations/20260211_add_queue_intelligence_columns.sql");
    console.log("  npx tsx scripts/run-sql-file.ts migrations/20260212_unified_queue_intelligence.sql");
    console.log("  npx tsx scripts/run-sql-file.ts migrations/20260220_add_dialing_phone_e164.sql");

    if (hasRequiredFailures) {
      console.log("\nResult: FAIL (missing required columns)");
      process.exit(2);
    } else {
      console.log("\nResult: PASS (required columns present)");
      process.exit(0);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Readiness check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
