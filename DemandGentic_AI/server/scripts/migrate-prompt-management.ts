/**
 * Targeted migration for Prompt Management System enhancements.
 *
 * Adds new enums, columns to prompt_registry, and the prompt_dependency_map table.
 * Safe to run multiple times (uses IF NOT EXISTS).
 *
 * Run with: npx tsx server/scripts/migrate-prompt-management.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('=== Prompt Management System Migration ===\n');

  // Step 1: Create new enums
  console.log('Step 1: Creating enums...');
  const enums = [
    `DO $$ BEGIN
      CREATE TYPE prompt_department AS ENUM ('sales', 'marketing', 'operations', 'ai_engineering', 'crm', 'compliance', 'intelligence', 'content');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE prompt_function AS ENUM ('email_drafting', 'call_script', 'lead_scoring', 'enrichment', 'campaign_personalization', 'classification', 'summarization', 'reasoning', 'routing', 'research', 'content_generation', 'quality_analysis', 'disposition', 'mapping', 'simulation', 'image_generation');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE prompt_purpose AS ENUM ('generation', 'classification', 'summarization', 'reasoning', 'scoring', 'routing', 'extraction', 'analysis', 'enrichment', 'personalization', 'compliance_check', 'orchestration');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE prompt_status AS ENUM ('draft', 'live', 'archived', 'deprecated');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE prompt_dependency_entity_type AS ENUM ('service', 'route', 'script', 'agent');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE prompt_dependency_direction AS ENUM ('produces', 'consumes');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ];

  for (const enumSql of enums) {
    await db.execute(sql.raw(enumSql));
  }
  console.log('  Enums created.\n');

  // Step 2: Add new columns to prompt_registry
  console.log('Step 2: Adding columns to prompt_registry...');
  const columns = [
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS department prompt_department`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS prompt_function prompt_function`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS purpose prompt_purpose`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS ai_model text`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS status prompt_status NOT NULL DEFAULT 'live'`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS owner_id varchar REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS owner_department text`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS invocation_point jsonb`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS input_dependencies jsonb`,
    `ALTER TABLE prompt_registry ADD COLUMN IF NOT EXISTS output_destination jsonb`,
  ];

  for (const colSql of columns) {
    try {
      await db.execute(sql.raw(colSql));
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        // Column already exists, skip
      } else {
        console.error(`  Warning: ${e.message}`);
      }
    }
  }
  console.log('  Columns added.\n');

  // Step 3: Add indexes
  console.log('Step 3: Adding indexes...');
  const indexes = [
    `CREATE INDEX IF NOT EXISTS prompt_registry_department_idx ON prompt_registry (department)`,
    `CREATE INDEX IF NOT EXISTS prompt_registry_function_idx ON prompt_registry (prompt_function)`,
    `CREATE INDEX IF NOT EXISTS prompt_registry_purpose_idx ON prompt_registry (purpose)`,
    `CREATE INDEX IF NOT EXISTS prompt_registry_status_idx ON prompt_registry (status)`,
    `CREATE INDEX IF NOT EXISTS prompt_registry_owner_idx ON prompt_registry (owner_id)`,
    `CREATE INDEX IF NOT EXISTS prompt_registry_model_idx ON prompt_registry (ai_model)`,
  ];

  for (const idxSql of indexes) {
    try {
      await db.execute(sql.raw(idxSql));
    } catch (e: any) {
      console.error(`  Warning: ${e.message}`);
    }
  }
  console.log('  Indexes added.\n');

  // Step 4: Create prompt_dependency_map table
  console.log('Step 4: Creating prompt_dependency_map table...');
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS prompt_dependency_map (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_id varchar NOT NULL REFERENCES prompt_registry(id) ON DELETE CASCADE,
      entity_type prompt_dependency_entity_type NOT NULL,
      entity_name text NOT NULL,
      endpoint_path text,
      http_method text,
      service_function text,
      direction prompt_dependency_direction NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `));

  // Add indexes for dependency map
  const depIndexes = [
    `CREATE INDEX IF NOT EXISTS prompt_dep_map_prompt_id_idx ON prompt_dependency_map (prompt_id)`,
    `CREATE INDEX IF NOT EXISTS prompt_dep_map_entity_idx ON prompt_dependency_map (entity_name)`,
    `CREATE INDEX IF NOT EXISTS prompt_dep_map_endpoint_idx ON prompt_dependency_map (endpoint_path)`,
    `CREATE INDEX IF NOT EXISTS prompt_dep_map_direction_idx ON prompt_dependency_map (direction)`,
  ];

  for (const idxSql of depIndexes) {
    try {
      await db.execute(sql.raw(idxSql));
    } catch (e: any) {
      console.error(`  Warning: ${e.message}`);
    }
  }
  console.log('  Table and indexes created.\n');

  console.log('=== Migration Complete ===');
}

migrate()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });