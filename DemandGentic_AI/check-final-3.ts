import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('=== Investigating 3 remaining leads ===\n');
  
  // Ryan Carter - 1819s call, no recording anywhere
  // Kim Chang - 3166s call, no recording anywhere  
  // Ian Slater - score 0, no call attempt at all
  
  const names = ['Ryan Carter', 'Kim Chang', 'Ian Slater'];
  
  for (const name of names) {
    console.log(`\n--- ${name} ---`);
    const rows = await sql`
      SELECT l.id, l.contact_name, l.ai_score, l.qa_status,
             l.recording_url, l.recording_s3_key, l.telnyx_call_id,
             l.transcript, l.call_attempt_id,
             l.created_at, l.campaign_id,
             dca.telnyx_call_id as dca_telnyx_call_id,
             dca.recording_url as dca_recording_url,
             dca.call_duration_seconds as dca_duration,
             dca.agent_type as dca_agent_type,
             dca.disposition as dca_disposition,
             dca.call_session_id as dca_session_id,
             dca.full_transcript as dca_full_transcript,
             cs.recording_url as cs_recording_url,
             cs.recording_s3_key as cs_recording_s3_key
      FROM leads l
      LEFT JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
      LEFT JOIN call_sessions cs ON dca.call_session_id = cs.id
      WHERE l.contact_name = ${name}
        AND l.recording_s3_key IS NULL
      ORDER BY l.created_at DESC LIMIT 1
    `;
    
    if (rows.length === 0) {
      console.log('  Not found or already has recording');
      continue;
    }
    
    const r = rows[0];
    console.log(`  Lead ID: ${r.id}`);
    console.log(`  Score: ${r.ai_score}`);
    console.log(`  QA Status: ${r.qa_status}`);
    console.log(`  Lead Disposition: N/A`);
    console.log(`  DCA Disposition: ${r.dca_disposition}`);
    console.log(`  Duration: ${r.dca_duration}s`);
    console.log(`  Agent Type: ${r.dca_agent_type}`);
    console.log(`  Has transcript: ${r.transcript ? 'YES (' + r.transcript.length + ' chars)' : 'NO'}`);
    console.log(`  Created: ${r.created_at}`);
    
    // Check if there are other call_sessions for same contact
    if (r.dca_session_id) {
      const sessions = await sql`
        SELECT cs.id, cs.recording_url, cs.recording_s3_key, cs.telnyx_call_id
        FROM call_sessions cs
        WHERE cs.id = ${r.dca_session_id}
      `;
      console.log(`  Session data: ${JSON.stringify(sessions[0] || 'NONE')}`);
    }
    
    // For Kim Chang - check if the call's disposition should even be qualified
    if (r.dca_disposition === 'no_answer') {
      console.log(`  NOTE: DCA disposition is 'no_answer' - this may not be a qualified call`);
    }
  }
}

main().catch(console.error);