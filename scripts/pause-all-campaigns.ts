import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const updated = await pool.query(
      "UPDATE campaigns SET status = 'paused' WHERE status != 'paused'"
    );

    console.log(`updated_rows=${updated.rowCount ?? 0}`);

    const counts = await pool.query(
      "SELECT status, COUNT(*)::int AS count FROM campaigns GROUP BY status ORDER BY status"
    );

    console.table(counts.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to pause all campaigns:', error);
  process.exit(1);
});
