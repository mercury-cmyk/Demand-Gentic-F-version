import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Show table columns to adapt to schema
  const columns = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'dialer_call_attempts'
    ORDER BY ordinal_position
  `);
  console.log('Columns for dialer_call_attempts:', columns.rows.map((r: any) => r.column_name));

  // Fetch last 5 attempts using available columns
  const result = await db.execute(sql`
    SELECT dca.id, dca.campaign_id, c.name AS campaign_name, dca.disposition, dca.call_started_at, dca.call_ended_at, dca.created_at
    FROM dialer_call_attempts dca
    LEFT JOIN campaigns c ON dca.campaign_id = c.id
    ORDER BY dca.created_at DESC
    LIMIT 5
  `);
  console.table(result.rows);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
