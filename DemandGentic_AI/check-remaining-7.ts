import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// 7 leads still missing recordings
const REMAINING_IDS = [
  '6c20d648-cec3-4001-81eb-a6578194cbc0', // Tim White 
  '8cbc2df6-c300-4808-8ef8-71783563b21a', // Scott Johnson
  '77fd3f9f-a5b8-405e-ae96-79e92abdf07d', // Mike Glynn
  'c743c654-b808-49fe-a355-2eb3d8082915', // Ryan Carter
  '9b56d6c7-832f-45da-ab28-672ed144d62e', // Kim Chang
  'b599b3ef-6020-4d01-8e4b-3ee19d237bb9', // Ian Slater
  '687ab225-cec2-4688-b650-c58b6e755bfd', // Daniella Morris
];

async function main() {
  console.log('=== Investigating 7 remaining leads without recordings ===\n');

  const result = await db.execute(sql`
    SELECT l.id, l.contact_name, l.ai_score, l.recording_url, l.recording_s3_key,
           l.telnyx_call_id as lead_telnyx_id, l.call_attempt_id,
           l.transcript, l.transcription_status, l.recording_status,
           dca.telnyx_call_id as dca_telnyx_id, dca.recording_url as dca_url,
           dca.call_duration_seconds, dca.agent_type, dca.disposition,
           dca.full_transcript as dca_transcript, dca.ai_transcript,
           dca.call_session_id as dca_session_id
    FROM leads l
    LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.id IN (${sql.join(REMAINING_IDS.map(id => sql`${id}`), sql`, `)})
    ORDER BY l.ai_score DESC NULLS LAST
  `);

  for (const r of result.rows as any[]) {
    console.log(`--- ${r.contact_name} (score: ${r.ai_score}) ---`);
    console.log(`  lead.recording_url: ${r.recording_url || 'NULL'}`);
    console.log(`  lead.recording_s3_key: ${r.recording_s3_key || 'NULL'}`);
    console.log(`  lead.telnyx_call_id: ${r.lead_telnyx_id || 'NULL'}`);
    console.log(`  lead.transcript: ${r.transcript ? r.transcript.substring(0, 60) + '...' : 'NULL'}`);
    console.log(`  lead.transcription_status: ${r.transcription_status || 'NULL'}`);
    console.log(`  lead.recording_status: ${r.recording_status || 'NULL'}`);
    console.log(`  dca.telnyx_call_id: ${r.dca_telnyx_id || 'NULL'}`);
    console.log(`  dca.recording_url: ${r.dca_url || 'NULL'}`);
    console.log(`  dca.call_duration: ${r.call_duration_seconds || 'NULL'}s`);
    console.log(`  dca.agent_type: ${r.agent_type || 'NULL'}`);
    console.log(`  dca.disposition: ${r.disposition || 'NULL'}`);
    console.log(`  dca.session_id: ${r.dca_session_id || 'NULL'}`);
    console.log(`  dca.full_transcript: ${r.dca_transcript ? r.dca_transcript.substring(0, 60) + '...' : 'NULL'}`);
    console.log(`  dca.ai_transcript: ${r.ai_transcript ? r.ai_transcript.substring(0, 60) + '...' : 'NULL'}`);
    
    // Check if there's a call_session with recording
    if (r.dca_session_id) {
      const csResult = await db.execute(sql`
        SELECT recording_url, recording_s3_key, telnyx_call_id, telnyx_recording_id
        FROM call_sessions WHERE id = ${r.dca_session_id}
      `);
      if (csResult.rows.length > 0) {
        const cs = csResult.rows[0] as any;
        console.log(`  call_session.recording_url: ${cs.recording_url || 'NULL'}`);
        console.log(`  call_session.recording_s3_key: ${cs.recording_s3_key || 'NULL'}`);
        console.log(`  call_session.telnyx_call_id: ${cs.telnyx_call_id || 'NULL'}`);
        console.log(`  call_session.telnyx_recording_id: ${cs.telnyx_recording_id || 'NULL'}`);
      }
    }
    console.log('');
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });