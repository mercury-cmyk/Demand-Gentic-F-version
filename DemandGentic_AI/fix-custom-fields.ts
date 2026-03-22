import { config } from "dotenv";
config({ path: ".env" });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import { sql } from "drizzle-orm";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function fixSchema() {
  const tables = [
    'accounts',
    'contacts',
    'leads',
    'verification_contacts',
    'client_crm_accounts',
    'client_crm_contacts' 
  ];

  console.log("Starting schema fix for custom_fields...");

  for (const table of tables) {
    try {
      console.log(`Checking ${table}...`);
      // Use raw SQL to add column safely
      await db.execute(sql.raw(`
        ALTER TABLE "${table}" 
        ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
      `));
      console.log(`✅ ${table} checked/fixed.`);
    } catch (e: any) {
      console.log(`⚠️ Error checking ${table}: ${e.message}`);
    }
  }
  
  console.log("Schema fix complete.");
  process.exit(0);
}

fixSchema();