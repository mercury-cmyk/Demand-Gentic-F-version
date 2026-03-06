import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function addVoiceTrainerRole() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  // Remove surrounding quotes if present
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '');

  const sql = neon(databaseUrl);

  console.log('Adding voice_trainer to user_role enum...');

  try {
    // Value is a hardcoded constant, not user input
    await sql.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'voice_trainer'`);
    console.log('✅ Added voice_trainer role to user_role enum');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('⏭️  voice_trainer already exists in user_role enum');
    } else {
      console.log('❌ Error:', e.message);
      process.exit(1);
    }
  }

  console.log('\n✅ Done! voice_trainer role is now available.');
  process.exit(0);
}

addVoiceTrainerRole();
