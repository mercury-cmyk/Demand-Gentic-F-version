import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function addEnumValues() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  
  // Remove surrounding quotes if present
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');
  
  const sql = neon(databaseUrl);
  
  const newValues = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Orion', 'Vega', 'Pegasus', 'Ursa', 'Dipper', 'Capella', 'Orbit', 'Lyra', 'Eclipse'];
  
  console.log('Adding Gemini voice enum values to database...');
  
  for (const value of newValues) {
    try {
      // Must use unsafe query for ALTER TYPE - values are hardcoded constants, not user input
      await sql.query(`ALTER TYPE ai_voice ADD VALUE IF NOT EXISTS '${value}'`);
      console.log('✅ Added:', value);
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log('⏭️  Already exists:', value);
      } else {
        console.log('❌ Error adding', value, ':', e.message);
      }
    }
  }
  console.log('\n✅ Done adding voice enum values!');
  process.exit(0);
}

addEnumValues();