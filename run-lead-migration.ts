
import { db } from './server/db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';

async function runMigration() {
  try {
    console.log('Running lead contact fields migration...');
    
    const migrationSQL = readFileSync('./server/migrations/add-lead-contact-fields.sql', 'utf-8');
    
    await db.execute(sql.raw(migrationSQL));
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
