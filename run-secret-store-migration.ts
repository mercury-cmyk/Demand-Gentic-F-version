/**
 * Migration: apply secret_store table + enum
 * Run with: npx tsx run-secret-store-migration.ts
 */

import pg from 'pg';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting migration: secret_store table + enum');
    
    const sql = fs.readFileSync('migrations/20260130_add_secret_store.sql', 'utf8');
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ Migration applied: secret_store table + enum created');
    
    // Verify
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'secret_store'`
    );
    console.log('Table exists:', rows.length > 0);
    
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '42710' || error.message?.includes('already exists')) {
      console.log('✅ Enum/table already exists, migration skipped');
    } else {
      console.error('❌ Migration failed', error);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
