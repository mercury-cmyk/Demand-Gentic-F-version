import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './shared/schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

console.log('Testing database connection and campaigns query...');
console.log(`Database: ${databaseUrl.substring(0, 80)}...`);

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema });

async function test() {
  try {
    console.log('\n1. Testing basic connection...');
    const result = await db.execute('SELECT 1 as test_value');
    console.log('✓ Connection works:', result);

    console.log('\n2. Checking campaigns table...');
    const campaigns = await db.select().from(schema.campaigns);
    console.log(`✓ Found ${campaigns.length} campaigns`);
    
    if (campaigns.length > 0) {
      console.log('Sample campaign:', campaigns[0]);
    }

    console.log('\n3. Checking table structure...');
    const tableInfo = await db.execute(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns'
      LIMIT 5
    `);
    console.log('Campaigns table columns (sample):', tableInfo);

  } catch (error) {
    console.error('\n✗ ERROR:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  } finally {
    await pool.end();
  }
}

test();