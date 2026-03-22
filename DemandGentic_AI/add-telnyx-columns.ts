/**
 * Migration: Add all missing columns to telnyx_numbers table
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function addMissingColumns() {
  let databaseUrl = process.env.DATABASE_URL || '';
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('Adding missing columns to telnyx_numbers table...');
  
  const columns = [
    'ALTER TABLE telnyx_numbers ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMP',
    'ALTER TABLE telnyx_numbers ADD COLUMN IF NOT EXISTS last_answered_at TIMESTAMP', 
    'ALTER TABLE telnyx_numbers ADD COLUMN IF NOT EXISTS calls_today INTEGER DEFAULT 0',
    'ALTER TABLE telnyx_numbers ADD COLUMN IF NOT EXISTS calls_this_hour INTEGER DEFAULT 0',
    'ALTER TABLE telnyx_numbers ADD COLUMN IF NOT EXISTS monthly_cost_cents INTEGER',
    'ALTER TABLE telnyx_numbers ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMP DEFAULT NOW()',
  ];
  
  for (const column of columns) {
    try {
      await db.execute(sql.raw(column));
      console.log('✅ ' + column.split('ADD COLUMN IF NOT EXISTS ')[1].split(' ')[0]);
    } catch (e) {
      console.log('⏭️  Skipped: ' + column);
    }
  }
  
  console.log('\n✅ Migration complete!');
  await pool.end();
  process.exit(0);
}

addMissingColumns();