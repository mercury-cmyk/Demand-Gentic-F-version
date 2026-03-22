import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkVoices() {
  console.log('\n' + '='.repeat(80));
  console.log('AVAILABLE VOICES IN SYSTEM');
  console.log('='.repeat(80) + '\n');
  
  const result = await db.execute(sql`
    SELECT id, name, provider FROM voices ORDER BY provider, name LIMIT 50
  `) as any;
  
  if (result.rows.length === 0) {
    console.log('❌ No voices found in database!');
  } else {
    for (const voice of result.rows) {
      console.log(`🎙️  ${voice.name} (${voice.id}) - ${voice.provider}`);
    }
  }
  
  console.log('\n');
  process.exit(0);
}

checkVoices().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});