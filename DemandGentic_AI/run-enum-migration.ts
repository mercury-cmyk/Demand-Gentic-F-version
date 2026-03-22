import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  try {
    await sql`ALTER TYPE activity_event_type ADD VALUE IF NOT EXISTS 'disposition_needs_review'`;
    console.log('✅ Added disposition_needs_review to activity_event_type enum');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️ Enum value already exists');
    } else {
      console.error('Error:', e.message);
    }
  }
  process.exit(0);
}
migrate();