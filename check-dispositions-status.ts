import { pool } from './server/db';

async function checkDispositions() {
  console.log('📊 Checking Call Disposition Status...\n');

  // Get recent call attempts with dispositions
  const recentCalls = await pool.query(`
    SELECT 
      ca.id,
      ca.telnyx_call_id,
      ca.created_at,
      ca.ended_at,
      ca.disposition,
      ca.duration,
      c.full_name as contact_name,
      c.direct_phone as contact_phone,
      camp.name as campaign_name
    FROM call_attempts ca
    LEFT JOIN contacts c ON ca.contact_id = c.id
    LEFT JOIN campaigns camp ON ca.campaign_id = camp.id
    WHERE ca.created_at > NOW() - INTERVAL '2 hours'
    ORDER BY ca.created_at DESC
    LIMIT 50
  `);

  console.log(`\n✅ Found ${recentCalls.rows.length} call attempts in last 2 hours\n`);

  // Group by disposition
  const dispositionCounts: Record<string, number> = {};
  
  for (const call of recentCalls.rows) {
    const disp = call.disposition || 'null';
    dispositionCounts[disp] = (dispositionCounts[disp] || 0) + 1;
  }

  console.log('📋 Disposition Breakdown:');
  console.log('─────────────────────────────────────');
  Object.entries(dispositionCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([disp, count]) => {
      const percentage = ((count / recentCalls.rows.length) * 100).toFixed(1);
      console.log(`  ${disp.padEnd(20)} : ${count.toString().padStart(3)} (${percentage}%)`);
    });

  // Show recent calls with details
  console.log('\n📞 Recent Calls (Last 10):');
  console.log('─────────────────────────────────────────────────────────────────────────');
  
  for (const call of recentCalls.rows.slice(0, 10)) {
    const duration = call.duration ? `${call.duration}s` : 'N/A';
    const disposition = call.disposition || 'NOT SET';
    const contactInfo = call.contact_name || call.contact_phone || 'Unknown';
    const time = new Date(call.created_at).toLocaleTimeString();
    
    console.log(`\n[${time}] ${contactInfo}`);
    console.log(`  Campaign: ${call.campaign_name || 'N/A'}`);
    console.log(`  Disposition: ${disposition}`);
    console.log(`  Duration: ${duration}`);
  }

  // Check for calls without dispositions
  const noDisposition = recentCalls.rows.filter(r => !r.disposition);
  const withDisposition = recentCalls.rows.filter(r => r.disposition);
  
  console.log('\n\n📈 Summary:');
  console.log('─────────────────────────────────────');
  console.log(`  Total Calls: ${recentCalls.rows.length}`);
  console.log(`  With Disposition: ${withDisposition.length} (${((withDisposition.length / recentCalls.rows.length) * 100).toFixed(1)}%)`);
  console.log(`  Without Disposition: ${noDisposition.length} (${((noDisposition.length / recentCalls.rows.length) * 100).toFixed(1)}%)`);
  
  // Check for ended calls without disposition
  const endedNoDisposition = recentCalls.rows.filter(r => r.ended_at && !r.disposition);
  if (endedNoDisposition.length > 0) {
    console.log(`  ⚠️  Ended calls WITHOUT disposition: ${endedNoDisposition.length}`);
  }

  // Check recent transcription analysis for disposition updates
  const transcriptionDispositions = await pool.query(`
    SELECT 
      ca.telnyx_call_id,
      ca.disposition,
      t.status as transcription_status,
      cia.analysis_status,
      cia.call_outcome,
      cia.sentiment
    FROM call_attempts ca
    LEFT JOIN call_transcriptions t ON ca.id = t.call_attempt_id
    LEFT JOIN call_intelligence_analysis cia ON ca.id = cia.call_attempt_id
    WHERE ca.created_at > NOW() - INTERVAL '2 hours'
      AND (t.id IS NOT NULL OR cia.id IS NOT NULL)
    ORDER BY ca.created_at DESC
    LIMIT 20
  `);

  if (transcriptionDispositions.rows.length > 0) {
    console.log('\n\n🤖 AI Analysis & Disposition Correlation:');
    console.log('─────────────────────────────────────────────────────────────────────────');
    
    for (const row of transcriptionDispositions.rows.slice(0, 10)) {
      console.log(`\nCall: ${row.telnyx_call_id || 'N/A'}`);
      console.log(`  Disposition: ${row.disposition || 'NOT SET'}`);
      console.log(`  AI Outcome: ${row.call_outcome || 'N/A'}`);
      console.log(`  Sentiment: ${row.sentiment || 'N/A'}`);
      console.log(`  Transcription: ${row.transcription_status || 'N/A'}`);
      console.log(`  Analysis: ${row.analysis_status || 'N/A'}`);
    }
  }

  console.log('\n✅ Disposition check complete\n');
  process.exit(0);
}

checkDispositions().catch(err => {
  console.error('❌ Error checking dispositions:', err);
  process.exit(1);
});
