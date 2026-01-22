import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function verify() {
  const campaignId = 'ff475cfd-2af3-4821-8d91-c62535cde2b1';
  console.log('='.repeat(60));
  console.log('VERIFICATION: Fixed Disposition Counts');
  console.log('='.repeat(60));
  console.log('Campaign ID:', campaignId);
  console.log('');
  
  // Check dialer_call_attempts with call_started_at filter
  const fixedDialer = await sql`
    SELECT 
      COUNT(CASE WHEN call_started_at IS NOT NULL AND disposition = 'not_interested' THEN 1 END)::int as not_interested,
      COUNT(CASE WHEN call_started_at IS NOT NULL THEN 1 END)::int as calls_made
    FROM dialer_call_attempts 
    WHERE campaign_id = ${campaignId}
  `;
  
  console.log('dialer_call_attempts (WITH call_started_at filter):');
  console.log('  Calls Made:', fixedDialer[0].calls_made);
  console.log('  Not Interested:', fixedDialer[0].not_interested);
  
  // Old (broken) counts
  const oldDialer = await sql`
    SELECT 
      COUNT(CASE WHEN disposition = 'not_interested' THEN 1 END)::int as not_interested
    FROM dialer_call_attempts 
    WHERE campaign_id = ${campaignId}
  `;
  console.log('');
  console.log('dialer_call_attempts (OLD - no filter):');
  console.log('  Not Interested:', oldDialer[0].not_interested);
  console.log('  ⚠️  This was the bug - counting pre-populated entries');
  
  // AI calls
  const aiCalls = await sql`
    SELECT 
      COUNT(*)::int as calls_made,
      COUNT(CASE WHEN ai_disposition = 'not_interested' THEN 1 END)::int as not_interested,
      COUNT(CASE WHEN ai_disposition = 'no_answer' THEN 1 END)::int as no_answer,
      COUNT(CASE WHEN ai_disposition = 'voicemail' THEN 1 END)::int as voicemail,
      COUNT(CASE WHEN ai_disposition = 'qualified_lead' THEN 1 END)::int as qualified
    FROM call_sessions WHERE campaign_id = ${campaignId}
  `;
  console.log('');
  console.log('call_sessions (AI Agent Calls):');
  console.log('  Total Calls:', aiCalls[0].calls_made);
  console.log('  Not Interested:', aiCalls[0].not_interested);
  console.log('  No Answer:', aiCalls[0].no_answer);
  console.log('  Voicemail:', aiCalls[0].voicemail);
  console.log('  Qualified:', aiCalls[0].qualified);
  
  console.log('');
  console.log('='.repeat(60));
  console.log('NEW DASHBOARD VALUES (After Fix)');
  console.log('='.repeat(60));
  console.log('Calls Made:', aiCalls[0].calls_made);
  console.log('Not Interested:', aiCalls[0].not_interested + fixedDialer[0].not_interested);
  console.log('No Answer:', aiCalls[0].no_answer);
  console.log('Voicemail:', aiCalls[0].voicemail);
  console.log('Leads Qualified:', aiCalls[0].qualified);
  
  console.log('');
  console.log('✅ Fix applied: Only counting dispositions where call_started_at IS NOT NULL');
  
  process.exit(0);
}

verify().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
