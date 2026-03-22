/**
 * Run migration to add transcript columns to dialer_call_attempts
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('Adding transcript columns to dialer_call_attempts...');

  try {
    await db.execute(sql`
      ALTER TABLE dialer_call_attempts
      ADD COLUMN IF NOT EXISTS full_transcript TEXT,
      ADD COLUMN IF NOT EXISTS ai_transcript TEXT
    `);

    console.log('✓ Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

runMigration();