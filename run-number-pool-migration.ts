import { db } from './server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

async function runMigration() {
  console.log('Running number pool management migration...\n');

  try {
    const migrationSql = fs.readFileSync('./migrations/0099_add_number_pool_management.sql', 'utf-8');

    // Split by semicolons and run statements one by one (skip empty)
    const statements = migrationSql
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)  // Split by ; but not inside quotes
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length < 10) continue;

      // Log what we're doing (first 100 chars)
      const preview = stmt.substring(0, 100).replace(/\n/g, ' ');
      console.log(`[${i+1}/${statements.length}] ${preview}...`);

      try {
        await db.execute(sql.raw(stmt));
      } catch (e: any) {
        // Ignore "already exists" errors
        if (e.message.includes('already exists') || e.message.includes('duplicate')) {
          console.log(`  (already exists, skipping)`);
        } else {
          console.error(`  ERROR: ${e.message}`);
        }
      }
    }

    console.log('\nMigration completed!\n');

    // Verify tables
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'telnyx_numbers',
        'number_assignments',
        'number_reputation',
        'number_metrics_daily',
        'number_metrics_window',
        'number_cooldowns',
        'prospect_call_suppression',
        'number_routing_decisions',
        'number_pool_alerts'
      )
      ORDER BY table_name
    `);

    console.log('Number pool tables in database:');
    for (const t of tables.rows) {
      console.log(`  - ${(t as any).table_name}`);
    }

  } catch (e: any) {
    console.error('Migration failed:', e.message);
  }
  process.exit(0);
}

runMigration();
