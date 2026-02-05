import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('Altering client_portal_orders table...');
  
  try {
    await sql`ALTER TABLE client_portal_orders ALTER COLUMN campaign_id DROP NOT NULL`;
    console.log('✅ campaign_id is now nullable');
  } catch (e: any) {
    if (e.message?.includes('already')) {
      console.log('ℹ️ campaign_id was already nullable');
    } else {
      console.error('Error:', e.message);
    }
  }
  
  try {
    await sql`ALTER TABLE client_portal_orders ADD COLUMN IF NOT EXISTS metadata JSONB`;
    console.log('✅ metadata column added');
  } catch (e: any) {
    console.error('Error adding metadata:', e.message);
  }
  
  console.log('Migration complete!');
  process.exit(0);
}

migrate();
