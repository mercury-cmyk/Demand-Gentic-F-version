import { pool } from './server/db';

async function investigateUKEFCampaign() {
  const campaignId = '70434f6e-3ab6-49e4-acf7-350b81f60ea2';
  
  console.log('=== INVESTIGATING UK EXPORT FINANCE Q4 2025 CAMPAIGN ===\n');
  
  // 1. Campaign details
  const campaign = await pool.query(`
    SELECT id, name, status, dial_mode, created_at, updated_at,
           type, brand_id, voice_provider
    FROM campaigns WHERE id = $1
  `, [campaignId]);
  
  console.log('📋 CAMPAIGN DETAILS:');
  console.log('─'.repeat(60));
  const c = campaign.rows[0];
  console.log(`  Name: ${c?.name}`);
  console.log(`  Status: ${c?.status}`);
  console.log(`  Dial Mode: ${c?.dial_mode}`);
  console.log(`  Type: ${c?.type}`);
  console.log(`  Voice Provider: ${c?.voice_provider}`);
  console.log(`  Created: ${c?.created_at}`);
  
  // 2. Check dialer_call_attempts data
  console.log('\n\n📞 DIALER_CALL_ATTEMPTS ANALYSIS:');
  console.log('─'.repeat(60));
  
  const attempts = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(recording_url) as with_recording,
      COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_actual_recording,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM dialer_call_attempts
    WHERE campaign_id = $1
  `, [campaignId]);
  
  console.log(`  Total Attempts: ${attempts.rows[0]?.total}`);
  console.log(`  With Recording URL: ${attempts.rows[0]?.with_actual_recording}`);
  console.log(`  Earliest: ${attempts.rows[0]?.earliest}`);
  console.log(`  Latest: ${attempts.rows[0]?.latest}`);
  
  // 3. Check disposition breakdown
  const dispositions = await pool.query(`
    SELECT disposition, COUNT(*) as count
    FROM dialer_call_attempts
    WHERE campaign_id = $1
    GROUP BY disposition
    ORDER BY count DESC
  `, [campaignId]);
  
  console.log('\n  Disposition Breakdown:');
  dispositions.rows.forEach((r: any) => console.log(`    ${r.disposition || 'NULL'}: ${r.count}`));
  
  // 4. Check sample call attempts with qualified_lead
  console.log('\n\n🔍 SAMPLE QUALIFIED_LEAD ATTEMPTS:');
  console.log('─'.repeat(60));
  
  const sampleAttempts = await pool.query(`
    SELECT 
      id, contact_id, disposition, recording_url,
      created_at, updated_at, telnyx_call_id
    FROM dialer_call_attempts
    WHERE campaign_id = $1
      AND disposition = 'qualified_lead'
    ORDER BY created_at DESC
    LIMIT 10
  `, [campaignId]);
  
  for (const a of sampleAttempts.rows) {
    console.log(`  Attempt ID: ${a.id}`);
    console.log(`    Contact ID: ${a.contact_id}`);
    console.log(`    Recording: ${a.recording_url || 'NONE'}`);
    console.log(`    Telnyx Call ID: ${a.telnyx_call_id || 'NONE'}`);
    console.log(`    Created: ${a.created_at}`);
    console.log('');
  }
  
  // 5. Check if there are ANY call_sessions for this org or related
  console.log('\n\n📊 CALL_SESSIONS CHECK:');
  console.log('─'.repeat(60));
  
  const sessions = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT campaign_id) as unique_campaigns
    FROM call_sessions
    WHERE campaign_id = $1
  `, [campaignId]);
  
  console.log(`  Call Sessions for this campaign: ${sessions.rows[0]?.total}`);
  
  // Check if there are sessions with similar timeframe
  const sessionsByTime = await pool.query(`
    SELECT 
      campaign_id,
      c.name as campaign_name,
      COUNT(*) as count
    FROM call_sessions cs
    LEFT JOIN campaigns c ON cs.campaign_id = c.id
    WHERE cs.created_at >= (SELECT MIN(created_at) FROM dialer_call_attempts WHERE campaign_id = $1)
      AND cs.created_at  console.log(`    ${r.campaign_name || r.campaign_id}: ${r.count}`));
  
  // 6. Check how leads were created for this campaign
  console.log('\n\n🎯 LEADS CREATION ANALYSIS:');
  console.log('─'.repeat(60));
  
  const leadsAnalysis = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(call_attempt_id) as linked_to_attempt,
      COUNT(recording_url) as with_recording,
      COUNT(transcript) as with_transcript,
      COUNT(telnyx_call_id) as with_telnyx_id,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM leads
    WHERE campaign_id = $1
      AND deleted_at IS NULL
  `, [campaignId]);
  
  const la = leadsAnalysis.rows[0];
  console.log(`  Total Leads: ${la?.total}`);
  console.log(`  Linked to Attempt: ${la?.linked_to_attempt}`);
  console.log(`  With Recording: ${la?.with_recording}`);
  console.log(`  With Transcript: ${la?.with_transcript}`);
  console.log(`  With Telnyx ID: ${la?.with_telnyx_id}`);
  console.log(`  Created From: ${la?.earliest}`);
  console.log(`  Created Until: ${la?.latest}`);
  
  // 7. Check the actual column values in dialer_call_attempts
  console.log('\n\n🔬 CHECKING DIALER_CALL_ATTEMPTS COLUMNS:');
  console.log('─'.repeat(60));
  
  const columns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'dialer_call_attempts'
    ORDER BY ordinal_position
  `);
  console.log('  Columns: ' + columns.rows.map((r: any) => r.column_name).join(', '));
  
  // 8. Check a few full records
  console.log('\n\n📝 FULL RECORD SAMPLES:');
  console.log('─'.repeat(60));
  
  const fullRecords = await pool.query(`
    SELECT *
    FROM dialer_call_attempts
    WHERE campaign_id = $1
      AND disposition = 'qualified_lead'
    ORDER BY created_at DESC
    LIMIT 3
  `, [campaignId]);
  
  for (const r of fullRecords.rows) {
    console.log('\n  Record:');
    Object.entries(r).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        const val = typeof v === 'object' ? JSON.stringify(v) : v;
        console.log(`    ${k}: ${val}`);
      }
    });
  }
  
  // 9. Compare with a working campaign (Proton UK)
  console.log('\n\n⚖️ COMPARISON WITH PROTON UK (working campaign):');
  console.log('─'.repeat(60));
  
  const protonId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  
  const protonAttempts = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_recording,
      COUNT(telnyx_call_id) as with_telnyx_id
    FROM dialer_call_attempts
    WHERE campaign_id = $1
  `, [protonId]);
  
  const protonSessions = await pool.query(`
    SELECT COUNT(*) as total FROM call_sessions WHERE campaign_id = $1
  `, [protonId]);
  
  console.log('  Proton UK:');
  console.log(`    Call Attempts: ${protonAttempts.rows[0]?.total}`);
  console.log(`    With Recording: ${protonAttempts.rows[0]?.with_recording}`);
  console.log(`    With Telnyx ID: ${protonAttempts.rows[0]?.with_telnyx_id}`);
  console.log(`    Call Sessions: ${protonSessions.rows[0]?.total}`);
  
  console.log('\n  UK Export Finance:');
  console.log(`    Call Attempts: ${attempts.rows[0]?.total}`);
  console.log(`    With Recording: ${attempts.rows[0]?.with_actual_recording}`);
  console.log(`    Call Sessions: 0`);
  
  // 10. Check if this was a manual/imported campaign
  console.log('\n\n❓ CAMPAIGN SOURCE INVESTIGATION:');
  console.log('─'.repeat(60));
  
  // Check campaign settings
  const campaignFull = await pool.query(`
    SELECT * FROM campaigns WHERE id = $1
  `, [campaignId]);
  
  const cf = campaignFull.rows[0];
  console.log(`  Dial Mode: ${cf?.dial_mode}`);
  console.log(`  Type: ${cf?.type}`);
  console.log(`  Voice Provider: ${cf?.voice_provider}`);
  console.log(`  Has audience_refs: ${cf?.audience_refs ? 'YES' : 'NO'}`);
  
  // Summary
  console.log('\n\n📋 INVESTIGATION SUMMARY:');
  console.log('═'.repeat(60));
  console.log(`
The UK Export Finance Q4 2025 campaign has:
  - ${attempts.rows[0]?.total} call attempts with ${attempts.rows[0]?.with_actual_recording} recordings
  - 0 call_sessions (no AI call tracking)
  - ${la?.total} leads created, ${la?.with_recording} with recordings

LIKELY CAUSE: This campaign appears to have been run in a different mode
(manual dialing, human calls, or external system) rather than through the 
AI calling system. The "qualified_lead" dispositions were set without 
corresponding AI call session data.

The leads exist but CANNOT be verified as AI calls because there are:
  - No call recordings
  - No transcripts  
  - No call_session entries
`);

  process.exit(0);
}

investigateUKEFCampaign().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});