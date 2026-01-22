import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function check() {
  const campaignId = 'ff475cfd-2af3-4821-8d91-c62535cde2b1';
  console.log('='.repeat(60));
  console.log('NOT INTERESTED SOURCES ANALYSIS');
  console.log('='.repeat(60));
  console.log('Campaign ID:', campaignId);
  console.log('');
  
  // 1. call_sessions (AI calls)
  const aiCalls = await sql`
    SELECT COUNT(*)::int as count FROM call_sessions 
    WHERE campaign_id = ${campaignId} AND ai_disposition = 'not_interested'
  `;
  console.log('call_sessions.ai_disposition=not_interested:', aiCalls[0].count);
  
  // 2. calls table (legacy)
  const legacyCalls = await sql`
    SELECT COUNT(*)::int as count FROM calls 
    WHERE campaign_id = ${campaignId} AND disposition = 'not_interested'
  `;
  console.log('calls.disposition=not_interested:', legacyCalls[0].count);
  
  // 3. dialer_call_attempts
  const dialerCalls = await sql`
    SELECT COUNT(*)::int as count FROM dialer_call_attempts 
    WHERE campaign_id = ${campaignId} AND disposition = 'not_interested'
  `;
  console.log('dialer_call_attempts.disposition=not_interested:', dialerCalls[0].count);
  
  console.log('');
  const total = aiCalls[0].count + legacyCalls[0].count + dialerCalls[0].count;
  console.log('TOTAL (summed):', total);
  
  // Check totals
  console.log('');
  console.log('=== TABLE TOTALS ===');
  
  const dialerTotal = await sql`
    SELECT COUNT(*)::int as count FROM dialer_call_attempts 
    WHERE campaign_id = ${campaignId}
  `;
  console.log('Total dialer_call_attempts:', dialerTotal[0].count);
  
  const callsTotal = await sql`
    SELECT COUNT(*)::int as count FROM calls 
    WHERE campaign_id = ${campaignId}
  `;
  console.log('Total calls:', callsTotal[0].count);
  
  const sessionsTotal = await sql`
    SELECT COUNT(*)::int as count FROM call_sessions 
    WHERE campaign_id = ${campaignId}
  `;
  console.log('Total call_sessions:', sessionsTotal[0].count);
  
  // Dialer attempts disposition breakdown
  const dialerDisps = await sql`
    SELECT COALESCE(disposition, 'NULL') as disp, COUNT(*)::int as count 
    FROM dialer_call_attempts 
    WHERE campaign_id = ${campaignId}
    GROUP BY disposition ORDER BY count DESC
  `;
  console.log('');
  console.log('=== DIALER_CALL_ATTEMPTS Dispositions ===');
  for (const r of dialerDisps) {
    console.log(`  ${r.disp}: ${r.count}`);
  }
  
  // Calls table disposition breakdown
  const callsDisps = await sql`
    SELECT COALESCE(disposition, 'NULL') as disp, COUNT(*)::int as count 
    FROM calls 
    WHERE campaign_id = ${campaignId}
    GROUP BY disposition ORDER BY count DESC
  `;
  console.log('');
  console.log('=== CALLS Table Dispositions ===');
  for (const r of callsDisps) {
    console.log(`  ${r.disp}: ${r.count}`);
  }
  
  // Check if dashboard formula is doubling counts
  console.log('');
  console.log('='.repeat(60));
  console.log('ANALYSIS');
  console.log('='.repeat(60));
  console.log(`Dashboard shows "Not Interested: 1,200"`);
  console.log(`Actual not_interested counts:`);
  console.log(`  - call_sessions: ${aiCalls[0].count}`);
  console.log(`  - calls: ${legacyCalls[0].count}`);
  console.log(`  - dialer_call_attempts: ${dialerCalls[0].count}`);
  console.log(`  - SUM: ${total}`);
  
  if (total !== 1200) {
    console.log('');
    console.log(`⚠️  Mismatch: Database shows ${total}, dashboard shows 1,200`);
    console.log('   Possible issues:');
    console.log('   1. Dashboard caching stale data');
    console.log('   2. Dashboard query includes other campaigns');
    console.log('   3. Frontend display bug');
  }
  
  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
