/**
 * Migration: Add Telephony Providers Tables
 * 
 * Creates the telephony_providers and telephony_provider_health_history tables
 * for the new provider abstraction layer.
 * 
 * Run with: npx tsx add-telephony-providers-migration.ts
 */

import { pool } from './server/db';

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting telephony providers migration...');
    
    await client.query('BEGIN');
    
    // Create enums
    console.log('Creating enums...');
    
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE telephony_provider_type AS ENUM (
          'telnyx',
          'sip_trunk',
          'twilio',
          'bandwidth',
          'custom'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE sip_transport AS ENUM (
          'udp',
          'tcp',
          'tls',
          'wss'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    // Create telephony_providers table
    console.log('Creating telephony_providers table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS telephony_providers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        type telephony_provider_type NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT false,
        priority INTEGER NOT NULL DEFAULT 100,
        
        -- API Authentication
        api_key TEXT,
        api_secret TEXT,
        
        -- SIP Connection
        sip_domain TEXT,
        sip_username TEXT,
        sip_password TEXT,
        sip_proxy TEXT,
        sip_port INTEGER DEFAULT 5060,
        sip_transport sip_transport DEFAULT 'udp',
        
        -- Provider Connection IDs
        connection_id TEXT,
        outbound_profile_id TEXT,
        
        -- Routing Configuration
        outbound_numbers JSONB,
        allowed_destinations JSONB,
        blocked_destinations JSONB,
        
        -- Rate Limiting
        max_cps INTEGER DEFAULT 10,
        max_concurrent INTEGER DEFAULT 100,
        
        -- Failover Configuration
        failover_provider_id VARCHAR,
        health_check_interval INTEGER DEFAULT 60,
        
        -- Cost Tracking
        cost_per_minute REAL,
        cost_per_call REAL,
        currency VARCHAR(3) DEFAULT 'USD',
        
        -- Metadata
        provider_metadata JSONB,
        created_by_id VARCHAR REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Create indexes for telephony_providers
    console.log('Creating indexes for telephony_providers...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS telephony_providers_enabled_idx 
      ON telephony_providers(enabled);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS telephony_providers_type_idx 
      ON telephony_providers(type);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS telephony_providers_priority_idx 
      ON telephony_providers(priority);
    `);
    
    // Create telephony_provider_health_history table
    console.log('Creating telephony_provider_health_history table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS telephony_provider_health_history (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR NOT NULL REFERENCES telephony_providers(id) ON DELETE CASCADE,
        healthy BOOLEAN NOT NULL,
        latency_ms INTEGER,
        error_count INTEGER DEFAULT 0,
        last_error TEXT,
        active_call_count INTEGER DEFAULT 0,
        checked_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Create indexes for health history
    console.log('Creating indexes for telephony_provider_health_history...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS telephony_provider_health_provider_idx 
      ON telephony_provider_health_history(provider_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS telephony_provider_health_checked_at_idx 
      ON telephony_provider_health_history(checked_at);
    `);
    
    // Insert default Telnyx provider (disabled by default - existing flow continues to work)
    console.log('Inserting default Telnyx provider...');
    
    await client.query(`
      INSERT INTO telephony_providers (
        id, name, type, enabled, priority, connection_id, 
        max_cps, max_concurrent, currency, provider_metadata
      ) VALUES (
        'default-telnyx',
        'Telnyx (Default)',
        'telnyx',
        false,  -- Disabled: existing Telnyx workflow remains unchanged
        1,      -- Highest priority when enabled
        NULL,   -- Will use TELNYX_APP_ID from env
        10,
        100,
        'USD',
        '{"note": "Default Telnyx provider. Enable only after testing the new provider abstraction layer."}'::jsonb
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('New tables created:');
    console.log('  - telephony_providers');
    console.log('  - telephony_provider_health_history');
    console.log('');
    console.log('New enums created:');
    console.log('  - telephony_provider_type');
    console.log('  - sip_transport');
    console.log('');
    console.log('NOTE: The new telephony provider system is ISOLATED from the');
    console.log('existing Telnyx workflow. Enable providers only after testing.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
