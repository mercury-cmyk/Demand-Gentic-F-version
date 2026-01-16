import { db } from "./server/db";
import { sql } from "drizzle-orm";

const result = await db.execute(sql`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND (tablename LIKE '%account%' OR tablename LIKE '%intelligence%' OR tablename LIKE '%brief%')
  ORDER BY tablename
`);

console.log('\n📋 Account/Intelligence Related Tables:');
result.rows.forEach((r: any) => {
  console.log(`   - ${r.tablename}`);
});

process.exit(0);
