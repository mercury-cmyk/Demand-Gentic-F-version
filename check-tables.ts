import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function check() {
  // Check for tables with 'summary' or 'transcript' or 'conversation'
  const tables = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND (table_name LIKE '%summary%' OR table_name LIKE '%transcript%' OR table_name LIKE '%conversation%' OR table_name LIKE '%ai_call%')
    ORDER BY table_name
  `);
  console.log('=== RELATED TABLES ===');
  for (const t of tables.rows as any[]) {
    console.log('  ' + t.table_name);
  }

  // Check ai_conversations table if it exists
  const aiConv = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ai_conversations'
    ORDER BY ordinal_position
  `);
  if (aiConv.rows.length > 0) {
    console.log('\n=== AI_CONVERSATIONS COLUMNS ===');
    for (const c of aiConv.rows as any[]) {
      console.log('  ' + c.column_name + ': ' + c.data_type);
    }
  }

  // Check call_summaries table
  const callSum = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'call_summaries'
    ORDER BY ordinal_position
  `);
  if (callSum.rows.length > 0) {
    console.log('\n=== CALL_SUMMARIES COLUMNS ===');
    for (const c of callSum.rows as any[]) {
      console.log('  ' + c.column_name + ': ' + c.data_type);
    }
  }

  process.exit(0);
}
check().catch(console.error);
