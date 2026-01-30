/**
 * Migration: add invite link + domain controls to client_accounts
 * Run with: npx tsx add-client-invite-links-migration.ts
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function columnExists(table: string, column: string) {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1 AND column_name = $2
  `,
    [table, column],
  );
  return rows.length > 0;
}

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting migration: client invite links + domain guardrails');
    await client.query('BEGIN');

    // Add invite_slug
    if (!(await columnExists('client_accounts', 'invite_slug'))) {
      console.log('• Adding invite_slug column');
      await client.query(
        `
        ALTER TABLE client_accounts
        ADD COLUMN invite_slug TEXT UNIQUE
        DEFAULT concat('join_', encode(gen_random_bytes(6), 'hex'))
      `,
      );
    } else {
      console.log('✓ invite_slug already exists');
    }

    // Add invite_domains
    if (!(await columnExists('client_accounts', 'invite_domains'))) {
      console.log('• Adding invite_domains column');
      await client.query(
        `
        ALTER TABLE client_accounts
        ADD COLUMN invite_domains TEXT[] DEFAULT ARRAY[]::text[]
      `,
      );
    } else {
      console.log('✓ invite_domains already exists');
    }

    // Add invite_enabled
    if (!(await columnExists('client_accounts', 'invite_enabled'))) {
      console.log('• Adding invite_enabled column');
      await client.query(
        `
        ALTER TABLE client_accounts
        ADD COLUMN invite_enabled BOOLEAN NOT NULL DEFAULT TRUE
      `,
      );
    } else {
      console.log('✓ invite_enabled already exists');
    }

    // Backfill empty invite_slug values
    console.log('• Backfilling invite_slug for existing records');
    await client.query(
      `
      UPDATE client_accounts
      SET invite_slug = concat('join_', encode(gen_random_bytes(6), 'hex'))
      WHERE invite_slug IS NULL OR invite_slug = ''
    `,
    );

    // Ensure unique index exists
    console.log('• Ensuring unique index on invite_slug');
    await client.query(
      `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE indexname = 'client_accounts_invite_slug_idx'
        ) THEN
          CREATE UNIQUE INDEX client_accounts_invite_slug_idx
          ON client_accounts(invite_slug);
        END IF;
      END
      $$;
    `,
    );

    await client.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

runMigration();

