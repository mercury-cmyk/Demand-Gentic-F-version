import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './server/db';

async function addColumn() {
  try {
    console.log('Adding intake_request_id column to campaigns table...');
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS intake_request_id VARCHAR`);
    console.log('✅ Column added successfully.');
  } catch (error: any) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

addColumn();
