/**
 * Migration: Add caller phone number fields to campaigns table
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function runMigration() {
  // Get DATABASE_URL and strip any quotes
  let databaseUrl = process.env.DATABASE_URL || '';
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  console.log('Adding caller_phone_number_id and caller_phone_number columns to campaigns table...');
  
  try {
    // Add caller_phone_number_id column
    await db.execute(sql`
      ALTER TABLE campaigns 
      ADD COLUMN IF NOT EXISTS caller_phone_number_id VARCHAR
    `);
    console.log('✅ Added caller_phone_number_id column');
    
    // Add caller_phone_number column
    await db.execute(sql`
      ALTER TABLE campaigns 
      ADD COLUMN IF NOT EXISTS caller_phone_number TEXT
    `);
    console.log('✅ Added caller_phone_number column');
    
    // Create index
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS campaigns_caller_phone_number_id_idx 
      ON campaigns(caller_phone_number_id)
    `);
    console.log('✅ Created index on caller_phone_number_id');
    
    console.log('\n✅ Migration complete!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();