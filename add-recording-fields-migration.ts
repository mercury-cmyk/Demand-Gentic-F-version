/**
 * Migration: Add recording fields to call_sessions table
 * Run with: npx tsx add-recording-fields-migration.ts
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting migration: Add recording fields to call_sessions...\n');

    await client.query('BEGIN');

    // 1. Create recording_status enum if not exists
    console.log('1. Creating recording_status_enum...');
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE recording_status_enum AS ENUM ('pending', 'recording', 'uploading', 'stored', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN 
          RAISE NOTICE 'recording_status_enum already exists';
      END $$;
    `);

    // 2. Add recording_s3_key column
    console.log('2. Adding recording_s3_key column...');
    const hasS3Key = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'call_sessions' AND column_name = 'recording_s3_key'
    `);
    if (hasS3Key.rows.length === 0) {
      await client.query(`ALTER TABLE call_sessions ADD COLUMN recording_s3_key TEXT`);
      console.log('   ✅ Added recording_s3_key');
    } else {
      console.log('   ⏭️  recording_s3_key already exists');
    }

    // 3. Add recording_duration_sec column
    console.log('3. Adding recording_duration_sec column...');
    const hasDuration = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'call_sessions' AND column_name = 'recording_duration_sec'
    `);
    if (hasDuration.rows.length === 0) {
      await client.query(`ALTER TABLE call_sessions ADD COLUMN recording_duration_sec INTEGER`);
      console.log('   ✅ Added recording_duration_sec');
    } else {
      console.log('   ⏭️  recording_duration_sec already exists');
    }

    // 4. Add recording_status column
    console.log('4. Adding recording_status column...');
    const hasStatus = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'call_sessions' AND column_name = 'recording_status'
    `);
    if (hasStatus.rows.length === 0) {
      await client.query(`ALTER TABLE call_sessions ADD COLUMN recording_status recording_status_enum DEFAULT 'pending'`);
      console.log('   ✅ Added recording_status');
    } else {
      console.log('   ⏭️  recording_status already exists');
    }

    // 5. Add recording_format column
    console.log('5. Adding recording_format column...');
    const hasFormat = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'call_sessions' AND column_name = 'recording_format'
    `);
    if (hasFormat.rows.length === 0) {
      await client.query(`ALTER TABLE call_sessions ADD COLUMN recording_format TEXT DEFAULT 'mp3'`);
      console.log('   ✅ Added recording_format');
    } else {
      console.log('   ⏭️  recording_format already exists');
    }

    // 6. Add recording_file_size_bytes column
    console.log('6. Adding recording_file_size_bytes column...');
    const hasFileSize = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'call_sessions' AND column_name = 'recording_file_size_bytes'
    `);
    if (hasFileSize.rows.length === 0) {
      await client.query(`ALTER TABLE call_sessions ADD COLUMN recording_file_size_bytes INTEGER`);
      console.log('   ✅ Added recording_file_size_bytes');
    } else {
      console.log('   ⏭️  recording_file_size_bytes already exists');
    }

    // 7. Create index on recording_status
    console.log('7. Creating recording_status index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS call_sessions_recording_status_idx 
      ON call_sessions(recording_status) 
      WHERE recording_status IS NOT NULL
    `);
    console.log('   ✅ Index created');

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    
    // Verify columns
    const columns = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'call_sessions' 
      AND column_name LIKE 'recording%'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Recording columns in call_sessions:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}${col.column_default ? ` (default: ${col.column_default})` : ''}`);
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
