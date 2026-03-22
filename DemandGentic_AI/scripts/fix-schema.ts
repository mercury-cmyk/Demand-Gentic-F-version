import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function fixSchema() {
  try {
    console.log('Adding missing enabled_channels column...');
    
    // Add enabled_channels column if it doesn't exist
    await db.execute(sql.raw(`
      ALTER TABLE campaigns 
      ADD COLUMN IF NOT EXISTS enabled_channels text[] 
      DEFAULT ARRAY['voice']::text[]
    `));
    
    console.log('✅ enabled_channels column added');

    // Add channel_generation_status column if it doesn't exist
    await db.execute(sql.raw(`
      ALTER TABLE campaigns 
      ADD COLUMN IF NOT EXISTS channel_generation_status jsonb
    `));
    
    console.log('✅ channel_generation_status column added');
    
    console.log('✅ Schema migration complete');
    process.exit(0);
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('✅ Columns already exist');
      process.exit(0);
    }
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixSchema();