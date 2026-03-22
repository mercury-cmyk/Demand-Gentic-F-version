import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function monitor() {
  console.log('='.repeat(80));
  console.log('LIVE MONITORING: Call Quality & Lead Creation');
  console.log('='.repeat(80));
  console.log('Press Ctrl+C to stop\n');

  const campaignId = 'ff475cfd-2af3-4821-8d91-c62535cde2b1'; // Waterfall campaign
  
  // Get baseline
  const baseline = await sql`
    SELECT 
      COUNT(*)::int as total_calls,
      COUNT(CASE WHEN ai_disposition = 'qualified_lead' THEN 1 END)::int as qualified,
      COUNT(CASE WHEN ai_disposition = 'not_interested' THEN 1 END)::int as not_interested,
      COUNT(CASE WHEN ai_disposition = 'callback_requested' THEN 1 END)::int as callbacks,
      MAX(started_at) as last_call_time
    FROM call_sessions
    WHERE campaign_id = ${campaignId}
  `;

  console.log('📊 BASELINE (before changes):');
  console.log(`   Total calls: ${baseline[0].total_calls}`);
  console.log(`   Qualified leads: ${baseline[0].qualified}`);
  console.log(`   Not interested: ${baseline[0].not_interested}`);
  console.log(`   Callbacks: ${baseline[0].callbacks}`);
  console.log(`   Last call: ${baseline[0].last_call_time?.toISOString() || 'N/A'}`);
  console.log('');

  // Monitor for new calls
  let lastCheckTime = new Date();
  let checkCount = 0;
  const maxChecks = 60; // Run for ~5 minutes (60 checks * 5 seconds)

  const interval = setInterval(async () => {
    checkCount++;
    
    if (checkCount > maxChecks) {
      console.log('\n⏱️  Monitoring period complete (5 minutes)');
      clearInterval(interval);
      process.exit(0);
    }

    try {
      // Get new calls since last check
      const newCalls = await sql`
        SELECT 
          id,
          started_at,
          duration_sec,
          ai_disposition,
          ai_transcript
        FROM call_sessions
        WHERE campaign_id = ${campaignId}
          AND started_at > ${lastCheckTime}
        ORDER BY started_at DESC
      `;

      if (newCalls.length > 0) {
        console.log(`\n🔔 ${newCalls.length} NEW CALL(S) DETECTED:`);
        for (const call of newCalls) {
          console.log(`\n   📞 Call ${call.id.substring(0, 8)}...`);
          console.log(`      Time: ${call.started_at.toISOString().substring(11, 19)}`);
          console.log(`      Duration: ${call.duration_sec}s`);
          console.log(`      Disposition: ${call.ai_disposition}`);
          
          // Analyze transcript for interest signals
          const transcript = (call.ai_transcript || '').toLowerCase();
          const signals = [];
          
          if (/\?|how|what|tell me|interested/i.test(transcript)) signals.push('questions');
          if (/yes|sure|okay|sounds good/i.test(transcript)) signals.push('positive');
          if (/problem|challenge|issue|need/i.test(transcript)) signals.push('pain-points');
          if (/send|email|demo|meeting|call back/i.test(transcript)) signals.push('request');
          
          if (signals.length > 0) {
            console.log(`      Interest signals: ${signals.join(', ')}`);
          }
          
          // Check if lead was created
          const lead = await sql`
            SELECT id FROM leads 
            WHERE custom_fields->>'aiCallId' = ${call.id}
            LIMIT 1
          `;
          
          if (lead.length > 0) {
            console.log(`      ✅ LEAD CREATED: ${lead[0].id.substring(0, 8)}...`);
          } else if (call.ai_disposition === 'qualified_lead') {
            console.log(`      ⚠️  DISPOSITION=qualified_lead but NO LEAD CREATED!`);
          }
        }
        
        lastCheckTime = new Date();
      } else {
        process.stdout.write('.');
      }
    } catch (err) {
      console.error('Error during monitoring:', err);
    }
  }, 5000); // Check every 5 seconds

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n📋 FINAL SUMMARY:');
    
    const final = await sql`
      SELECT 
        COUNT(*)::int as total_calls,
        COUNT(CASE WHEN ai_disposition = 'qualified_lead' THEN 1 END)::int as qualified,
        COUNT(CASE WHEN ai_disposition = 'not_interested' THEN 1 END)::int as not_interested,
        COUNT(CASE WHEN ai_disposition = 'callback_requested' THEN 1 END)::int as callbacks
      FROM call_sessions
      WHERE campaign_id = ${campaignId}
    `;
    
    const newQualified = final[0].qualified - baseline[0].qualified;
    const newTotal = final[0].total_calls - baseline[0].total_calls;
    
    console.log(`   New calls during monitoring: ${newTotal}`);
    console.log(`   New qualified leads: ${newQualified}`);
    console.log(`   Qualification rate: ${newTotal > 0 ? ((newQualified / newTotal) * 100).toFixed(1) : 0}%`);
    
    clearInterval(interval);
    process.exit(0);
  });
}

monitor().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});