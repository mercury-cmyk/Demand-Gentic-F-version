/**
 * Run the FK constraint migration
 * This fixes the leads.call_attempt_id FK to reference dialer_call_attempts
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('\n========================================');
  console.log('  RUNNING FK CONSTRAINT MIGRATION');
  console.log('========================================\n');

  try {
    // Step 1: Check current FK constraint
    console.log('1. Checking current FK constraint...\n');
    const currentFk = await db.execute(sql`
      SELECT
        tc.constraint_name,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'leads'
        AND tc.constraint_name LIKE '%call_attempt%'
    `);

    if (currentFk.rows.length > 0) {
      console.log('Current FK constraints:');
      for (const row of currentFk.rows) {
        const r = row as { constraint_name: string; foreign_table_name: string };
        console.log(`  - ${r.constraint_name} -> ${r.foreign_table_name}`);
      }
    }

    // Step 2: Drop old FK constraint
    console.log('\n2. Dropping old FK constraint...\n');
    await db.execute(sql`
      ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_call_attempt_id_call_attempts_id_fk
    `);
    console.log('   Dropped leads_call_attempt_id_call_attempts_id_fk (if existed)');

    // Step 3: Create new FK constraint
    console.log('\n3. Creating new FK constraint to dialer_call_attempts...\n');
    await db.execute(sql`
      ALTER TABLE leads
      ADD CONSTRAINT leads_call_attempt_id_dialer_call_attempts_id_fk
      FOREIGN KEY (call_attempt_id)
      REFERENCES dialer_call_attempts(id)
      ON DELETE SET NULL
    `);
    console.log('   Created leads_call_attempt_id_dialer_call_attempts_id_fk');

    // Step 4: Create index (if not exists)
    console.log('\n4. Creating index...\n');
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS leads_call_attempt_id_idx ON leads(call_attempt_id)
    `);
    console.log('   Created leads_call_attempt_id_idx (if not existed)');

    // Step 5: Verify new constraint
    console.log('\n5. Verifying new FK constraint...\n');
    const newFk = await db.execute(sql`
      SELECT
        tc.constraint_name,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'leads'
        AND tc.constraint_name LIKE '%call_attempt%'
    `);

    if (newFk.rows.length > 0) {
      console.log('New FK constraints:');
      for (const row of newFk.rows) {
        const r = row as { constraint_name: string; foreign_table_name: string };
        console.log(`  - ${r.constraint_name} -> ${r.foreign_table_name}`);

        if (r.foreign_table_name === 'dialer_call_attempts') {
          console.log('\n   ✅ FK now correctly references dialer_call_attempts!');
        }
      }
    }

    console.log('\n========================================');
    console.log('  MIGRATION COMPLETE');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();