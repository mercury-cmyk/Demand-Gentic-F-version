import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function investigateLongCalls() {
  console.log('========================================');
  console.log('INVESTIGATING CALLS > 90 SECONDS');
  console.log('Since January 15, 2026');
  console.log('========================================\n');

  // Find all calls with duration > 90 seconds since Jan 15
  const longCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.campaign_id,
      dca.call_session_id,
      dca.queue_item_id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.connected,
      dca.voicemail_detected,
      dca.recording_url,
      dca.telnyx_call_id,
      dca.notes,
      dca.created_at,
      dca.call_started_at,
      dca.call_ended_at,
      c.first_name,
      c.last_name,
      c.email,
      c.direct_phone_e164,
      a.name as company_name,
      camp.name as campaign_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.call_duration_seconds > 90
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${longCalls.rows.length} calls > 90 seconds since Jan 15\n`);

  if (longCalls.rows.length === 0) {
    console.log('No calls > 90 seconds found.');

    // Check what durations we DO have
    const durationStats = await db.execute(sql`
      SELECT
        CASE
          WHEN call_duration_seconds IS NULL THEN 'NULL'
          WHEN call_duration_seconds = 0 THEN '0s'
          WHEN call_duration_seconds BETWEEN 1 AND 30 THEN '1-30s'
          WHEN call_duration_seconds BETWEEN 31 AND 60 THEN '31-60s'
          WHEN call_duration_seconds BETWEEN 61 AND 90 THEN '61-90s'
          WHEN call_duration_seconds > 90 THEN '>90s'
        END as duration_bucket,
        COUNT(*) as count
      FROM dialer_call_attempts
      WHERE created_at >= '2026-01-15'
      GROUP BY 1
      ORDER BY count DESC
    `);

    console.log('\nCall Duration Distribution (since Jan 15):');
    console.log('------------------------------------------');
    for (const row of durationStats.rows) {
      const r = row as any;
      console.log(`  ${r.duration_bucket}: ${r.count}`);
    }
  } else {
    console.log('CALLS > 90 SECONDS - DETAILED ANALYSIS:');
    console.log('========================================\n');

    for (let i = 0; i < longCalls.rows.length; i++) {
      const r = longCalls.rows[i] as any;
      console.log(`\n--- CALL ${i + 1} ---`);
      console.log(`ID: ${r.id}`);
      console.log(`Contact: ${r.first_name || ''} ${r.last_name || ''}`);
      console.log(`Email: ${r.email || 'N/A'}`);
      console.log(`Company: ${r.company_name || 'N/A'}`);
      console.log(`Phone: ${r.direct_phone_e164 || 'N/A'}`);
      console.log(`Campaign: ${r.campaign_name || 'N/A'}`);
      console.log(`Duration: ${r.call_duration_seconds}s (${(r.call_duration_seconds / 60).toFixed(1)} min)`);
      console.log(`Disposition: ${r.disposition || 'NULL'}`);
      console.log(`Connected: ${r.connected}`);
      console.log(`Voicemail: ${r.voicemail_detected}`);
      console.log(`Has Recording URL: ${r.recording_url ? 'YES' : 'NO'}`);
      console.log(`Has Call Session: ${r.call_session_id ? 'YES' : 'NO'}`);
      console.log(`Telnyx Call ID: ${r.telnyx_call_id || 'N/A'}`);
      console.log(`Created: ${r.created_at}`);
      console.log(`Notes: ${r.notes ? r.notes.substring(0, 200) + '...' : 'N/A'}`);
    }
  }

  // Check for calls with ANY duration > 30s
  console.log('\n\n========================================');
  console.log('CALLS > 30 SECONDS (potential conversations)');
  console.log('========================================\n');

  const mediumCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.disposition,
      dca.call_duration_seconds,
      dca.connected,
      dca.recording_url IS NOT NULL as has_recording,
      dca.call_session_id IS NOT NULL as has_session,
      dca.created_at,
      c.first_name,
      c.last_name,
      camp.name as campaign_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.call_duration_seconds > 30
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 50
  `);

  console.log(`Found ${mediumCalls.rows.length} calls > 30 seconds:\n`);
  for (const row of mediumCalls.rows) {
    const r = row as any;
    const date = new Date(r.created_at).toISOString().split('T')[0];
    console.log(`  ${date} | ${r.call_duration_seconds}s | ${r.disposition || 'NULL'} | ${r.first_name || 'Unknown'} ${r.last_name || ''} | recording=${r.has_recording} | session=${r.has_session}`);
  }

  // Check call sessions since Jan 15
  console.log('\n\n========================================');
  console.log('CALL SESSIONS SINCE JAN 15');
  console.log('========================================\n');

  const sessions = await db.execute(sql`
    SELECT
      cs.id,
      cs.ai_disposition,
      cs.ai_transcript,
      cs.duration_sec,
      cs.created_at,
      c.first_name,
      c.last_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    WHERE cs.created_at >= '2026-01-15'
    ORDER BY cs.created_at DESC
    LIMIT 20
  `);

  console.log(`Found ${sessions.rows.length} call sessions since Jan 15\n`);
  for (const row of sessions.rows) {
    const r = row as any;
    const hasTranscript = r.ai_transcript && r.ai_transcript.length > 10;
    console.log(`  ${r.created_at} | ${r.ai_disposition || 'NULL'} | ${r.first_name || ''} ${r.last_name || ''} | duration=${r.duration_sec || 0}s | transcript=${hasTranscript ? 'YES' : 'NO'}`);
  }

  // Check leads table
  console.log('\n\n========================================');
  console.log('LEADS SINCE JAN 15');
  console.log('========================================\n');

  const leads = await db.execute(sql`
    SELECT
      l.id,
      l.qa_status,
      l.transcript,
      l.transcription_status,
      l.call_duration,
      l.created_at,
      c.first_name,
      c.last_name
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.created_at >= '2026-01-15'
    ORDER BY l.created_at DESC
    LIMIT 20
  `);

  console.log(`Found ${leads.rows.length} leads since Jan 15\n`);
  for (const row of leads.rows) {
    const r = row as any;
    const hasTranscript = r.transcript && r.transcript.length > 10;
    console.log(`  ${r.created_at} | qa=${r.qa_status || 'NULL'} | transcription=${r.transcription_status || 'NULL'} | ${r.first_name || ''} ${r.last_name || ''} | duration=${r.call_duration || 0}s | transcript=${hasTranscript ? 'YES' : 'NO'}`);
  }

  // Summary by date
  console.log('\n\n========================================');
  console.log('DAILY SUMMARY SINCE JAN 15');
  console.log('========================================\n');

  const dailySummary = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as total_attempts,
      COUNT(*) FILTER (WHERE call_duration_seconds > 30) as calls_30s_plus,
      COUNT(*) FILTER (WHERE call_duration_seconds > 90) as calls_90s_plus,
      COUNT(*) FILTER (WHERE disposition IS NOT NULL) as with_disposition,
      COUNT(*) FILTER (WHERE disposition = 'qualified_lead') as qualified,
      COUNT(*) FILTER (WHERE disposition = 'not_interested') as not_interested,
      AVG(call_duration_seconds) FILTER (WHERE call_duration_seconds > 0) as avg_duration
    FROM dialer_call_attempts
    WHERE created_at >= '2026-01-15'
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
  `);

  console.log('Date       | Total | >30s | >90s | w/Disp | Qualified | NotInt | AvgDur');
  console.log('-----------+-------+------+------+--------+-----------+--------+-------');
  for (const row of dailySummary.rows) {
    const r = row as any;
    console.log(`${r.date} | ${String(r.total_attempts).padStart(5)} | ${String(r.calls_30s_plus || 0).padStart(4)} | ${String(r.calls_90s_plus || 0).padStart(4)} | ${String(r.with_disposition || 0).padStart(6)} | ${String(r.qualified || 0).padStart(9)} | ${String(r.not_interested || 0).padStart(6)} | ${r.avg_duration ? Math.round(r.avg_duration) + 's' : 'N/A'}`);
  }

  process.exit(0);
}

investigateLongCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
