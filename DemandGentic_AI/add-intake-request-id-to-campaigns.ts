import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './server/db';

async function addColumns() {
  try {
    console.log('Adding missing columns to campaigns table...');
    
    // Add creation_mode column
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creation_mode VARCHAR DEFAULT 'manual'`);
    console.log('✅ creation_mode column added.');
    
    // Add intake_request_id column (in case it was missed)
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS intake_request_id VARCHAR`);
    console.log('✅ intake_request_id column added.');
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

addColumns();