/**
 * Migration: Add external_event_id to client_projects
 * Run: npx tsx run-event-project-migration.ts
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('[Migration] Starting: add external_event_id to client_projects');

  // 1. Add 'rejected' to client_project_status enum
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'rejected'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'client_project_status')
        ) THEN
          ALTER TYPE client_project_status ADD VALUE 'rejected';
        END IF;
      END$$
    `);
    console.log('[Migration] Added "rejected" to client_project_status enum');
  } catch (e: any) {
    console.log('[Migration] Enum step skipped:', e.message);
  }

  // 2. Add external_event_id column
  try {
    await db.execute(sql`
      ALTER TABLE client_projects
      ADD COLUMN IF NOT EXISTS external_event_id VARCHAR
      REFERENCES external_events(id) ON DELETE SET NULL
    `);
    console.log('[Migration] Added external_event_id column');
  } catch (e: any) {
    console.log('[Migration] Column step skipped:', e.message);
  }

  // 3. Create index
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS client_projects_event_idx
      ON client_projects(external_event_id)
    `);
    console.log('[Migration] Created index on external_event_id');
  } catch (e: any) {
    console.log('[Migration] Index step skipped:', e.message);
  }

  console.log('[Migration] Done.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('[Migration] Fatal error:', err);
  process.exit(1);
});