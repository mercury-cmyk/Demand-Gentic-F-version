import { pool } from '../server/db';

const CONTACT_ID = '96d8f09c-a1d2-41d2-a147-68072035ba03';
const PHONE = '4168393060';

async function main() {
  // 1. Check dialer_call_attempts
  // Get column names for dialer_call_attempts first
  const dcaCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='dialer_call_attempts' AND column_name LIKE '%transcript%'`);
  console.log('DCA transcript columns:', dcaCols.rows.map((r:any) => r.column_name).join(', '));

  const dca = await pool.query(`
    SELECT * FROM dialer_call_attempts 
    WHERE contact_id = $1 
    ORDER BY created_at DESC LIMIT 10
  `, [CONTACT_ID]);
  console.log('=== Dialer Call Attempts:', dca.rows.length, '===');
  for (const r of dca.rows) {
    console.log(`  [${r.created_at}] duration=${r.duration||r.duration_sec}s, telnyx=${r.telnyx_call_id}`);
    if (r.ai_transcript) console.log('  AI_TRANSCRIPT:', r.ai_transcript.substring(0, 800));
    if (r.full_transcript) console.log('  FULL_TRANSCRIPT:', r.full_transcript.substring(0, 800));
  }

  // 2. Check call_sessions by telnyx IDs from DCA
  const telnyxIds = dca.rows.filter((r: any) => r.telnyx_call_id).map((r: any) => r.telnyx_call_id);
  if (telnyxIds.length > 0) {
    const cs = await pool.query(`SELECT * FROM call_sessions WHERE telnyx_call_id = ANY($1)`, [telnyxIds]);
    console.log('\n=== Call Sessions (by telnyx_call_id):', cs.rows.length, '===');
    for (const r of cs.rows) {
      console.log(`  [${r.created_at}] disposition=${r.ai_disposition}, duration=${r.duration_sec}s`);
      if (r.ai_transcript) console.log('  TRANSCRIPT:', r.ai_transcript.substring(0, 800));
    }
  }

  // 3. Check leads
  const leads = await pool.query(`
    SELECT * FROM leads 
    WHERE contact_id = $1 
    ORDER BY created_at DESC LIMIT 10
  `, [CONTACT_ID]);
  console.log('\n=== Leads:', leads.rows.length, '===');
  for (const r of leads.rows) {
    console.log(`  [${r.created_at}] name=${r.contact_name}, duration=${r.call_duration}s, status=${r.transcription_status}, telnyx=${r.telnyx_call_id}`);
    if (r.transcript) console.log('  TRANSCRIPT:', r.transcript.substring(0, 600));
    if (r.structured_transcript) console.log('  STRUCTURED:', JSON.stringify(r.structured_transcript).substring(0, 400));
  }

  // 4. Done — telnyx matching already done above
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });