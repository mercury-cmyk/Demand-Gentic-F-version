import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function diagnose() {
  console.log('='.repeat(70));
  console.log('DIAGNOSIS: Zero Qualified Leads Being Created');
  console.log('='.repeat(70));
  console.log('');
  
  // Check recent calls with their dispositions
  const recentCalls = await sql`
    SELECT 
      id,
      campaign_id,
      ai_disposition,
      created_at,
      call_ended_at,
      ai_summary
    FROM call_sessions
    ORDER BY created_at DESC
    LIMIT 20
  `;
  
  console.log('📊 LAST 20 CALLS - AI Dispositions:');
  console.log('');
  
  const dispositionCounts: Record = {};
  for (const call of recentCalls) {
    const disp = call.ai_disposition || 'NULL';
    dispositionCounts[disp] = (dispositionCounts[disp] || 0) + 1;
    console.log(`  • Call ${call.id.substring(0, 8)}...`);
    console.log(`    Disposition: ${disp}`);
    console.log(`    Created: ${call.created_at?.toISOString().substring(0, 19)}`);
    console.log('');
  }
  
  console.log('');
  console.log('📈 DISPOSITION BREAKDOWN (Last 20 calls):');
  for (const [disp, count] of Object.entries(dispositionCounts)) {
    console.log(`  ${disp}: ${count}`);
  }
  
  // Check if ANY leads have been created
  const leadCount = await sql`SELECT COUNT(*)::int as total FROM leads LIMIT 1`;
  console.log('');
  console.log('💾 LEADS TABLE:');
  console.log(`  Total leads ever created: ${leadCount[0].total}`);
  
  if (leadCount[0].total > 0) {
    const recentLeads = await sql`
      SELECT 
        id,
        campaign_id,
        call_attempt_id,
        created_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    console.log('  Recent leads:');
    for (const lead of recentLeads) {
      console.log(`    • ${lead.id.substring(0, 8)}... (created: ${lead.created_at?.toISOString().substring(0, 10)})`);
    }
  }
  
  // Check for calls with "qualified" or similar dispositions
  console.log('');
  console.log('🔍 CHECKING FOR QUALIFIED DISPOSITIONS:');
  
  const qualifiedVariants = await sql`
    SELECT DISTINCT ai_disposition FROM call_sessions
    WHERE ai_disposition ILIKE '%qualified%' 
       OR ai_disposition ILIKE '%interested%'
       OR ai_disposition ILIKE '%meeting%'
       OR ai_disposition ILIKE '%callback%'
    LIMIT 20
  `;
  
  if (qualifiedVariants.length > 0) {
    console.log('  Found disposition variants:');
    for (const row of qualifiedVariants) {
      console.log(`    ✓ ${row.ai_disposition}`);
    }
  } else {
    console.log('  ❌ NO "qualified", "interested", "meeting", or "callback" dispositions found');
  }
  
  // Check the actual AI disposition values being recorded
  console.log('');
  console.log('📝 ALL UNIQUE AI DISPOSITIONS IN DATABASE:');
  const allDispositions = await sql`
    SELECT DISTINCT ai_disposition, COUNT(*)::int as count
    FROM call_sessions
    GROUP BY ai_disposition
    ORDER BY count DESC
  `;
  
  for (const row of allDispositions) {
    console.log(`  ${String(row.count).padStart(4)} × ${row.ai_disposition || 'NULL'}`);
  }
  
  // Root cause analysis
  console.log('');
  console.log('='.repeat(70));
  console.log('ROOT CAUSE ANALYSIS:');
  console.log('='.repeat(70));
  console.log('');
  
  const hasQualified = allDispositions.some(d => 
    d.ai_disposition && d.ai_disposition.toLowerCase().includes('qualified')
  );
  
  if (!hasQualified) {
    console.log('❌ PROBLEM FOUND:');
    console.log('   No calls are being classified as "qualified" or any positive outcome!');
    console.log('');
    console.log('🔧 LIKELY CAUSES:');
    console.log('   1. AI agent is too conservative - classifying everything as not_interested');
    console.log('   2. System prompt might not be training AI to recognize good prospects');
    console.log('   3. AI disposition extraction is failing');
    console.log('   4. Calls are ending prematurely (voicemail, no answer) before qualification');
  } else {
    console.log('✓ Qualified calls ARE being recorded');
    console.log('  BUT leads are not being created from them.');
    console.log('');
    console.log('  Issue is in the lead creation logic:');
    console.log('  Line 1031 in telnyx-ai-bridge.ts:');
    console.log('    const shouldCreateLead = disposition === "qualified";');
    console.log('');
    console.log('  This checks the INTERNAL disposition value before canonical mapping.');
  }
  
  process.exit(0);
}

diagnose().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});