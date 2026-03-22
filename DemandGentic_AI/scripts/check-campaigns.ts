import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Check call_sessions table directly
  const callSessions = await sql`
    SELECT 
      id, 
      campaign_id,
      contact_id,
      ai_transcript,
      ai_disposition,
      duration_sec,
      created_at
    FROM call_sessions 
    ORDER BY created_at DESC 
    LIMIT 10
  `;
  
  console.log('=== Call Sessions (raw from DB) ===');
  console.log(`Found ${callSessions.length} sessions`);
  
  callSessions.forEach((s: any) => {
    console.log(`\n${s.id}`);
    console.log(`  Campaign: ${s.campaign_id}`);
    console.log(`  Contact: ${s.contact_id}`);
    console.log(`  Disposition: ${s.ai_disposition}`);
    console.log(`  Duration: ${s.duration_sec}s`);
    console.log(`  Has Transcript: ${!!s.ai_transcript}`);
    console.log(`  Created: ${s.created_at}`);
  });
  
  // Check campaign_test_calls table
  const testCalls = await sql`
    SELECT 
      id, 
      campaign_id,
      test_contact_name,
      full_transcript,
      disposition,
      status,
      created_at
    FROM campaign_test_calls 
    ORDER BY created_at DESC 
    LIMIT 10
  `;
  
  console.log('\n\n=== Test Calls (raw from DB) ===');
  console.log(`Found ${testCalls.length} test calls`);
  
  testCalls.forEach((t: any) => {
    console.log(`\n${t.id}`);
    console.log(`  Campaign: ${t.campaign_id}`);
    console.log(`  Contact: ${t.test_contact_name}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Disposition: ${t.disposition}`);
    console.log(`  Has Transcript: ${!!t.full_transcript}`);
    console.log(`  Created: ${t.created_at}`);
  });
}

main().catch(console.error);