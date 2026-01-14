#!/usr/bin/env node
/**
 * Quick fix script to add missing max_call_duration_seconds column to campaigns table
 */

import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

async function fixMissingColumn() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('🔄 Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected');

    console.log('🔄 Adding max_call_duration_seconds column to campaigns...');
    await pool.query(`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS max_call_duration_seconds INTEGER DEFAULT 240
    `);
    console.log('✅ Column added successfully');

    // Verify
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'max_call_duration_seconds'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified: max_call_duration_seconds column exists');
    } else {
      console.log('❌ Column verification failed');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixMissingColumn();
