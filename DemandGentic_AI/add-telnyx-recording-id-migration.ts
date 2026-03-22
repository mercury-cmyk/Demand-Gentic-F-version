/**
 * Migration: Add telnyx_recording_id + recording_provider columns
 *
 * Adds stable Telnyx recording identifiers to call_sessions, leads,
 * and dialer_call_attempts for on-demand URL generation.
 *
 * Safe: uses IF NOT EXISTS — can be run multiple times.
 *
 * Usage:
 *   npx tsx add-telnyx-recording-id-migration.ts
 */

import { Pool } from '@neondatabase/serverless';

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Starting telnyx_recording_id migration...');

    // ── call_sessions ──────────────────────────────────────────────
    await pool.query(`
      ALTER TABLE call_sessions
        ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT,
        ADD COLUMN IF NOT EXISTS recording_provider TEXT DEFAULT 'telnyx';
    `);
    console.log('✅ call_sessions: columns added');

    // ── leads ──────────────────────────────────────────────────────
    await pool.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT,
        ADD COLUMN IF NOT EXISTS recording_provider TEXT DEFAULT 'telnyx';
    `);
    console.log('✅ leads: columns added');

    // ── dialer_call_attempts ───────────────────────────────────────
    await pool.query(`
      ALTER TABLE dialer_call_attempts
        ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT;
    `);
    console.log('✅ dialer_call_attempts: column added');

    // ── Index for fast lookups ────────────────────────────────────
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_call_sessions_telnyx_recording_id
        ON call_sessions (telnyx_recording_id)
        WHERE telnyx_recording_id IS NOT NULL;
    `);
    console.log('✅ Index created on call_sessions.telnyx_recording_id');

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();