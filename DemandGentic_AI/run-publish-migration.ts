// Run migration to add publish fields to leads table
import { pool } from './server/db';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const migrationPath = path.join(__dirname, 'migrations/20260131_add_lead_publish_fields.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  const client = await pool.connect();
  try {
    console.log('Running migration: add_lead_publish_fields');
    await client.query(sql);
    console.log('Migration completed successfully');
  } catch (error: any) {
    console.error('Migration failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();