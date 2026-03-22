/**
 * Migration: Create telnyx_numbers table for number pool
 */
import { config } from 'dotenv';
config({ path: '.env' });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function createTable() {
  let databaseUrl = process.env.DATABASE_URL || '';
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  console.log('Creating telnyx_numbers table...');
  
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS telnyx_numbers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_number_e164 TEXT NOT NULL UNIQUE,
      telnyx_id TEXT,
      telnyx_number_id TEXT,
      telnyx_connection_id TEXT,
      telnyx_messaging_profile_id TEXT,
      display_name TEXT,
      cnam TEXT,
      country_code VARCHAR(2) NOT NULL DEFAULT 'US',
      region TEXT,
      city TEXT,
      area_code VARCHAR(10),
      timezone TEXT,
      status VARCHAR NOT NULL DEFAULT 'active',
      status_reason TEXT,
      status_changed_at TIMESTAMP,
      tags TEXT[] DEFAULT '{}',
      max_calls_per_hour INTEGER DEFAULT 20,
      max_calls_per_day INTEGER DEFAULT 100,
      max_concurrent_calls INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_synced_at TIMESTAMP
    )
  `);
  
  console.log('✅ Table created!');
  await pool.end();
  process.exit(0);
}

createTable();