/**
 * Migration: Add telnyx_recording_id columns
 *
 * Adds stable Telnyx recording IDs to call_sessions, leads, and dialer_call_attempts.
 * These IDs allow on-demand URL generation instead of storing expiring Telnyx URLs.
 *
 * Safe, additive migration — nullable columns with no breaking changes.
 *
 * Usage: npx tsx add-telnyx-recording-id-migration.ts
 */

import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('Starting telnyx_recording_id migration...');

    // call_sessions
    await pool.query(`
      ALTER TABLE call_sessions
        ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT,
        ADD COLUMN IF NOT EXISTS recording_provider TEXT DEFAULT 'telnyx';
    `);
    console.log('✅ call_sessions: added telnyx_recording_id + recording_provider');

    // leads
    await pool.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT,
        ADD COLUMN IF NOT EXISTS recording_provider TEXT DEFAULT 'telnyx';
    `);
    console.log('✅ leads: added telnyx_recording_id + recording_provider');

    // dialer_call_attempts
    await pool.query(`
      ALTER TABLE dialer_call_attempts
        ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT;
    `);
    console.log('✅ dialer_call_attempts: added telnyx_recording_id');

    // Add index for efficient lookup by recording ID
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_telnyx_recording_id
        ON call_sessions (telnyx_recording_id) WHERE telnyx_recording_id IS NOT NULL;
    `);
    console.log('✅ Created index on call_sessions.telnyx_recording_id');

    console.log('\n🎉 Migration complete. No data modified, columns are nullable.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
