/**
 * Migration script to add email_connect and email_inbox feature flags
 * to the client_feature_flag PostgreSQL enum type.
 * 
 * Run: npx tsx scripts/run-email-access-migration.ts
 */
import '../server/env';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('[Migration] Starting email access feature flags migration...');

  const flags = ['email_connect', 'email_inbox'] as const;

  for (const flag of flags) {
    try {
      console.log(`[Migration] Adding enum value '${flag}'...`);
      await db.execute(sql.raw(`ALTER TYPE client_feature_flag ADD VALUE IF NOT EXISTS '${flag}'`));
      console.log(`[Migration] ✅ '${flag}' added successfully`);
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log(`[Migration] ℹ️ '${flag}' already exists, skipping`);
      } else {
        console.error(`[Migration] ❌ Failed to add '${flag}':`, e.message);
        throw e;
      }
    }
  }

  console.log('[Migration] ✅ Email access feature flags migration complete');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('[Migration] ❌ Migration failed:', err);
  process.exit(1);
});