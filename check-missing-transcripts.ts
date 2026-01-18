import { pool } from './server/db';

async function checkMissingTranscripts() {
  console.log('\n🔍 Checking for Calls Missing Transcripts\n');
  console.log('='.repeat(80));

  // Get all test calls after Jan 15 with their transcript status
  const calls = await pool.query(`
    SELECT
      id,
      disposition,
      duration_seconds,
      status,
      call_summary,
      full_transcript,
      test_contact_name,
      test_company_name,
      created_at
    FROM campaign_test_calls
    WHERE created_at >= '2026-01-15'
    ORDER BY created_at DESC
  `);

  let withTranscript = 0;
  let withoutTranscript = 0;
  const missingTranscripts: any[] = [];

  for (const call of calls.rows) {
    const hasTranscript = call.full_transcript && call.full_transcript.trim().length > 50;
    const hasSummary = call.call_summary && call.call_summary.trim().length > 20;

    if (hasTranscript) {
      withTranscript++;
    } else {
      withoutTranscript++;
      missingTranscripts.push({
        id: call.id,
        contact: call.test_contact_name,
        company: call.test_company_name,
        duration: call.duration_seconds,
        disposition: call.disposition,
        status: call.status,
        hasSummary,
        summary: call.call_summary,
        date: call.created_at
      });
    }
  }

  console.log(`\n📊 Transcript Status Summary:\n`);
  console.log(`   Total calls (since Jan 15): ${calls.rows.length}`);
  console.log(`   With transcript: ${withTranscript}`);
  console.log(`   Missing transcript: ${withoutTranscript}`);

  if (missingTranscripts.length > 0) {
    console.log('\n' + '─'.repeat(80));
    console.log('\n📝 CALLS MISSING TRANSCRIPTS:\n');

    for (const call of missingTranscripts) {
      console.log(`─`.repeat(80));
      console.log(`📞 Call ID: ${call.id}`);
      console.log(`   Contact: ${call.contact} @ ${call.company}`);
      console.log(`   Date: ${call.date}`);
      console.log(`   Duration: ${call.duration}s`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Disposition: ${call.disposition}`);
      console.log(`   Has Summary: ${call.hasSummary ? 'Yes' : 'No'}`);

      if (call.hasSummary && call.summary) {
        console.log(`   Summary Preview: ${call.summary.substring(0, 200)}...`);
      }
      console.log('');
    }
  }

  // Check call_sessions table for transcripts
  console.log('\n' + '='.repeat(80));
  console.log('\n🔍 CHECKING CALL_SESSIONS FOR TRANSCRIPT DATA:\n');

  for (const call of missingTranscripts) {
    // Extract test call ID pattern to find matching session
    const testCallId = call.id;

    const sessionResult = await pool.query(`
      SELECT
        id,
        ai_transcript,
        ai_analysis,
        ai_disposition
      FROM call_sessions
      WHERE id LIKE $1
        OR telnyx_call_id LIKE $1
      LIMIT 1
    `, [`%${testCallId}%`]);

    if (sessionResult.rows.length > 0) {
      const session = sessionResult.rows[0];
      console.log(`📞 Found session for ${testCallId}:`);

      if (session.ai_transcript) {
        console.log(`   ✅ Has ai_transcript in call_sessions (${session.ai_transcript.length} chars)`);
        console.log(`   💡 Can copy transcript to campaign_test_calls`);
      }
      if (session.ai_analysis) {
        console.log(`   ✅ Has ai_analysis in call_sessions`);
      }
      if (session.ai_disposition) {
        console.log(`   ✅ Has ai_disposition: ${session.ai_disposition}`);
      }
    } else {
      console.log(`📞 ${testCallId}: No matching session found in call_sessions`);
    }
  }

  console.log('\n✅ Check complete!\n');
  process.exit(0);
}

checkMissingTranscripts().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
