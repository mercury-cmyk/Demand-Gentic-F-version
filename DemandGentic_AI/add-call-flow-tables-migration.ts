/**
 * Migration: Add Custom Call Flow Tables
 * 
 * Creates the custom_call_flows and custom_call_flow_mappings tables
 * that are required for the call flow management feature.
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Starting call flow tables migration...');

  try {
    // Create custom_call_flows table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS custom_call_flows (
        id VARCHAR PRIMARY KEY,
        name TEXT NOT NULL,
        objective TEXT NOT NULL,
        success_criteria TEXT NOT NULL,
        max_total_turns INTEGER NOT NULL DEFAULT 20,
        steps JSONB DEFAULT '[]'::jsonb,
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Created custom_call_flows table');

    // Create indexes for custom_call_flows
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS custom_call_flows_name_idx ON custom_call_flows(name)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS custom_call_flows_active_idx ON custom_call_flows(is_active)
    `);
    console.log('✅ Created indexes on custom_call_flows');

    // Create custom_call_flow_mappings table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS custom_call_flow_mappings (
        campaign_type TEXT PRIMARY KEY,
        call_flow_id TEXT NOT NULL,
        updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Created custom_call_flow_mappings table');

    // Create index for custom_call_flow_mappings
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS custom_call_flow_mappings_flow_idx ON custom_call_flow_mappings(call_flow_id)
    `);
    console.log('✅ Created index on custom_call_flow_mappings');

    console.log('\\n✅ Migration completed successfully!');
    console.log('The call flow management feature now has its database tables.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
migrate()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration error:', error);
    process.exit(1);
  });