/**
 * Migration: Add Unified Agent Architecture Tables
 * 
 * Creates tables for persisting the unified agent intelligence framework:
 * 1. unified_agents — Master record for each canonical agent type (ONE per type)
 * 2. unified_agent_prompt_sections — Versioned prompt sections
 * 3. unified_agent_prompt_changes — Full change history for each section
 * 4. unified_agent_capabilities — Agent capabilities with performance scores
 * 5. unified_agent_capability_mappings — Capability-to-prompt-section mapping
 * 6. unified_agent_recommendations — Learning pipeline recommendations
 * 7. unified_agent_versions — Version snapshots for rollback
 * 8. unified_agent_learning_data — Raw learning pipeline data points
 * 
 * Run: npx tsx add-unified-agent-architecture-migration.ts
 */

import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function addUnifiedAgentArchitecture() {
  console.log("========================================");
  console.log("[Migration] Unified Agent Architecture");
  console.log("========================================\n");

  try {
    // 1. Enum for unified agent types
    console.log("[1/9] Creating unified_agent_type enum...");
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE unified_agent_type AS ENUM (
          'voice', 'email', 'strategy', 'compliance', 'data', 'research', 'content', 'pipeline'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("  ✅ unified_agent_type enum created");

    // 2. Master unified agents table
    console.log("[2/9] Creating unified_agents table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agents (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_type unified_agent_type NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        channel VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'active',
        current_version VARCHAR NOT NULL DEFAULT '1.0.0',
        current_hash VARCHAR,
        configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
        performance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deployed_by VARCHAR NOT NULL DEFAULT 'system',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  ✅ unified_agents table created");

    // 3. Prompt sections table
    console.log("[3/9] Creating unified_agent_prompt_sections table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_prompt_sections (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES unified_agents(id) ON DELETE CASCADE,
        section_id VARCHAR NOT NULL,
        name TEXT NOT NULL,
        section_number INTEGER NOT NULL,
        category VARCHAR NOT NULL,
        content TEXT NOT NULL,
        is_required BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        version_hash VARCHAR,
        last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_updated_by VARCHAR NOT NULL DEFAULT 'system',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, section_id)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_prompt_sections_agent
        ON unified_agent_prompt_sections(agent_id);
      CREATE INDEX IF NOT EXISTS idx_unified_prompt_sections_category
        ON unified_agent_prompt_sections(category);
    `);
    console.log("  ✅ unified_agent_prompt_sections table created");

    // 4. Prompt change history
    console.log("[4/9] Creating unified_agent_prompt_changes table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_prompt_changes (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        section_pk VARCHAR NOT NULL REFERENCES unified_agent_prompt_sections(id) ON DELETE CASCADE,
        version_hash VARCHAR NOT NULL,
        previous_content TEXT,
        new_content TEXT NOT NULL,
        changed_by VARCHAR NOT NULL,
        change_reason TEXT,
        source VARCHAR NOT NULL DEFAULT 'manual',
        recommendation_id VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_prompt_changes_section
        ON unified_agent_prompt_changes(section_pk);
    `);
    console.log("  ✅ unified_agent_prompt_changes table created");

    // 5. Capabilities table
    console.log("[5/9] Creating unified_agent_capabilities table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_capabilities (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES unified_agents(id) ON DELETE CASCADE,
        capability_id VARCHAR NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category VARCHAR NOT NULL,
        performance_score REAL NOT NULL DEFAULT 0,
        trend VARCHAR NOT NULL DEFAULT 'stable',
        learning_input_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
        last_optimized TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, capability_id)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_capabilities_agent
        ON unified_agent_capabilities(agent_id);
    `);
    console.log("  ✅ unified_agent_capabilities table created");

    // 6. Capability-to-prompt section mappings
    console.log("[6/9] Creating unified_agent_capability_mappings table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_capability_mappings (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES unified_agents(id) ON DELETE CASCADE,
        capability_id VARCHAR NOT NULL,
        prompt_section_id VARCHAR NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        requires_approval BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, capability_id, prompt_section_id)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_cap_mappings_agent
        ON unified_agent_capability_mappings(agent_id);
    `);
    console.log("  ✅ unified_agent_capability_mappings table created");

    // 7. Recommendations table
    console.log("[7/9] Creating unified_agent_recommendations table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_recommendations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES unified_agents(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        category VARCHAR NOT NULL,
        priority_score INTEGER NOT NULL DEFAULT 50,
        status VARCHAR NOT NULL DEFAULT 'pending',
        capability_id VARCHAR,
        target_prompt_section_id VARCHAR,
        evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
        proposed_change JSONB NOT NULL DEFAULT '{}'::jsonb,
        impact JSONB NOT NULL DEFAULT '{}'::jsonb,
        reviewed_at TIMESTAMPTZ,
        reviewed_by VARCHAR,
        review_notes TEXT,
        applied_version VARCHAR,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_recs_agent
        ON unified_agent_recommendations(agent_id);
      CREATE INDEX IF NOT EXISTS idx_unified_recs_status
        ON unified_agent_recommendations(status);
      CREATE INDEX IF NOT EXISTS idx_unified_recs_agent_status
        ON unified_agent_recommendations(agent_id, status);
    `);
    console.log("  ✅ unified_agent_recommendations table created");

    // 8. Version snapshots for rollback
    console.log("[8/9] Creating unified_agent_versions table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_versions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES unified_agents(id) ON DELETE CASCADE,
        version VARCHAR NOT NULL,
        hash VARCHAR NOT NULL,
        prompt_sections_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        configuration_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        changelog TEXT,
        deployed_by VARCHAR NOT NULL DEFAULT 'system',
        rollback_available BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, version)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_versions_agent
        ON unified_agent_versions(agent_id);
    `);
    console.log("  ✅ unified_agent_versions table created");

    // 9. Learning pipeline data
    console.log("[9/9] Creating unified_agent_learning_data table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS unified_agent_learning_data (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR NOT NULL REFERENCES unified_agents(id) ON DELETE CASCADE,
        source_type VARCHAR NOT NULL,
        metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
        insights JSONB NOT NULL DEFAULT '[]'::jsonb,
        sample_size INTEGER NOT NULL DEFAULT 0,
        time_range_start TIMESTAMPTZ,
        time_range_end TIMESTAMPTZ,
        analysis_id VARCHAR,
        findings JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_unified_learning_agent
        ON unified_agent_learning_data(agent_id);
      CREATE INDEX IF NOT EXISTS idx_unified_learning_source
        ON unified_agent_learning_data(source_type);
    `);
    console.log("  ✅ unified_agent_learning_data table created");

    // Add update trigger to unified_agents
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION ua_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS ua_updated_at ON unified_agents;
      CREATE TRIGGER ua_updated_at
        BEFORE UPDATE ON unified_agents
        FOR EACH ROW
        EXECUTE FUNCTION ua_set_timestamp();
    `);

    console.log("\n========================================");
    console.log("✅ Unified Agent Architecture migration complete");
    console.log("Tables created:");
    console.log("  - unified_agents (master record, ONE per type)");
    console.log("  - unified_agent_prompt_sections (versioned prompt sections)");
    console.log("  - unified_agent_prompt_changes (full change history)");
    console.log("  - unified_agent_capabilities (performance-tracked capabilities)");
    console.log("  - unified_agent_capability_mappings (capability → prompt section)");
    console.log("  - unified_agent_recommendations (learning pipeline recommendations)");
    console.log("  - unified_agent_versions (version snapshots for rollback)");
    console.log("  - unified_agent_learning_data (raw learning data)");
    console.log("========================================");

  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  }
}

addUnifiedAgentArchitecture()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
