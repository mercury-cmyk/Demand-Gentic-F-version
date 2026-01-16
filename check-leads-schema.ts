import { db } from './server/db';
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'leads'
  ORDER BY ordinal_position
`);

console.log('Leads table columns:');
result.rows.forEach((row: any) => {
  console.log(`  ${row.column_name}: ${row.data_type}`);
});

process.exit(0);
