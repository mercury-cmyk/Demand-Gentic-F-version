import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('Running PM review migration...');
  
  try {
    // Add pending_pm_review to qa_status enum
    console.log('Adding pending_pm_review to qa_status enum...');
    await db.execute(sql`ALTER TYPE qa_status ADD VALUE IF NOT EXISTS 'pending_pm_review'`);
    console.log('✓ Enum updated');
    
    // Add PM tracking columns
    console.log('Adding PM tracking columns...');
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_approved_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_approved_by VARCHAR REFERENCES users(id)`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_rejected_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_rejected_by VARCHAR REFERENCES users(id)`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pm_rejection_reason TEXT`);
    console.log('✓ Columns added');
    
    // Create index for PM review filtering
    console.log('Creating index for PM review filtering...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS leads_pm_review_idx ON leads(qa_status) WHERE qa_status IN ('approved', 'pending_pm_review')`);
    console.log('✓ Index created');
    
    console.log('\n✅ PM review migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
