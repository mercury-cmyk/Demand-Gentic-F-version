/**
 * Create prompt_registry and prompt_versions tables
 * Run with: npx tsx scripts/create-prompt-tables.ts
 */

import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function createPromptTables() {
  console.log('[CreatePromptTables] Starting...');
  
  try {
    // Create enums first (if they don't exist)
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE prompt_type AS ENUM ('foundational', 'system', 'specialized', 'template');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('[CreatePromptTables] ✅ prompt_type enum ready');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE prompt_scope AS ENUM ('global', 'organization', 'campaign', 'agent_type');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('[CreatePromptTables] ✅ prompt_scope enum ready');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE prompt_category AS ENUM ('voice', 'email', 'intelligence', 'compliance', 'system');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('[CreatePromptTables] ✅ prompt_category enum ready');

    // Create prompt_registry table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS prompt_registry (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        prompt_key VARCHAR(100) NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        prompt_type prompt_type NOT NULL DEFAULT 'system',
        prompt_scope prompt_scope NOT NULL DEFAULT 'agent_type',
        agent_type TEXT,
        category prompt_category,
        content TEXT NOT NULL,
        default_content TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_locked BOOLEAN NOT NULL DEFAULT false,
        priority INTEGER NOT NULL DEFAULT 50,
        tags JSONB DEFAULT '[]'::jsonb,
        source_file TEXT,
        source_line INTEGER,
        source_export TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    console.log('[CreatePromptTables] ✅ prompt_registry table created');

    // Create indexes for prompt_registry
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS prompt_registry_key_idx ON prompt_registry(prompt_key);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS prompt_registry_category_idx ON prompt_registry(category);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS prompt_registry_agent_type_idx ON prompt_registry(agent_type);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS prompt_registry_active_idx ON prompt_registry(is_active);
    `);
    console.log('[CreatePromptTables] ✅ prompt_registry indexes created');

    // Create prompt_versions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        prompt_id VARCHAR NOT NULL REFERENCES prompt_registry(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        previous_content TEXT,
        change_description TEXT,
        changed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        added_lines INTEGER DEFAULT 0,
        removed_lines INTEGER DEFAULT 0,
        modified_lines INTEGER DEFAULT 0
      );
    `);
    console.log('[CreatePromptTables] ✅ prompt_versions table created');

    // Create indexes for prompt_versions
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS prompt_versions_prompt_id_idx ON prompt_versions(prompt_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS prompt_versions_version_idx ON prompt_versions(prompt_id, version);
    `);
    console.log('[CreatePromptTables] ✅ prompt_versions indexes created');

    console.log('[CreatePromptTables] ✅ All tables and indexes created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[CreatePromptTables] ❌ Error:', error);
    process.exit(1);
  }
}

createPromptTables();
