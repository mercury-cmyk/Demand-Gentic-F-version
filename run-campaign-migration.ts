
import { pool } from './server/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    console.log('[MIGRATION] Adding campaign target fields...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'server/migrations/add-campaign-target-fields.sql'),
      'utf8'
    );
    
    await pool.query(migrationSQL);
    
    console.log('[MIGRATION] ✅ Successfully added campaign target fields');
    process.exit(0);
  } catch (error) {
    console.error('[MIGRATION] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
