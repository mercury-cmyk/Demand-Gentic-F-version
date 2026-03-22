import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function analyze() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE ANALYSIS: Zero Qualified Leads');
  console.log('='.repeat(80));
  console.log('');

  // PART 1: Get Waterfall campaign details
  console.log('📋 PART 1: WATERFALL CAMPAIGN CONFIGURATION');
  console.log('-'.repeat(80));
  
  const campaigns = await sql`
    SELECT 
      id,
      name,
      campaign_objective,
      product_service_info,
      success_criteria,
      qualification_criteria,
      campaign_context_brief,
      created_at
    FROM campaigns 
    WHERE name ILIKE '%Waterfall%'
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  
  if (!campaigns.length) {
    console.log('❌ No Waterfall campaign found');
    process.exit(1);
  }

  const campaign = campaigns[0];
  console.log(`Campaign: ${campaign.name}`);
  console.log(`ID: ${campaign.id}`);
  console.log(`Created: ${campaign.created_at?.toISOString().substring(0, 10)}`);
  console.log('');
  
  console.log('Configuration:');
  console.log(`  Objective: ${campaign.campaign_objective || '❌ NOT SET'}`);
  console.log(`  Product Info: ${campaign.product_service_info ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`  Success Criteria: ${campaign.success_criteria ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`  Qualification Criteria: ${campaign.qualification_criteria ? '✅ SET' : '❌ NOT SET'}`);
  console.log('');

  if (campaign.campaign_objective) {
    console.log(`📌 Objective: ${campaign.campaign_objective}`);
    console.log('');
  }
  if (campaign.qualification_criteria) {
    console.log(`📌 Qualification Criteria:`);
    console.log(campaign.qualification_criteria);
    console.log('');
  }

  // PART 2: Recent call transcripts
  console.log('');
  console.log('📞 PART 2: RECENT CALL TRANSCRIPTS (Last 5)');
  console.log('-'.repeat(80));
  
  const recentCalls = await sql`
    SELECT 
      id,
      started_at,
      duration_sec,
      ai_disposition,
      ai_transcript,
      ai_analysis,
      contact_id
    FROM call_sessions
    WHERE campaign_id = ${campaign.id}
    ORDER BY started_at DESC
    LIMIT 5
  `;
  
  if (!recentCalls.length) {
    console.log('❌ No calls found for this campaign');
    process.exit(1);
  }

  for (let i = 0; i  value)
      .map(([key]) => key);
    
    if (signals.length > 0) {
      console.log(`   ⚠️  INTEREST SIGNALS DETECTED: ${signals.join(', ')}`);
    }
  }

  // PART 3: Disposition breakdown
  console.log('');
  console.log('');
  console.log('📊 PART 3: DISPOSITION BREAKDOWN (All time for this campaign)');
  console.log('-'.repeat(80));
  
  const dispositionBreakdown = await sql`
    SELECT 
      ai_disposition,
      COUNT(*)::int as count,
      ROUND(AVG(duration_sec)::numeric, 1) as avg_duration,
      COUNT(CASE WHEN duration_sec >= 30 THEN 1 END)::int as calls_30s_plus
    FROM call_sessions
    WHERE campaign_id = ${campaign.id}
    GROUP BY ai_disposition
    ORDER BY count DESC
  `;

  let totalCalls = 0;
  for (const row of dispositionBreakdown) {
    console.log(`${String(row.count).padStart(4)} × ${String(row.ai_disposition || 'NULL').padEnd(20)} (avg: ${row.avg_duration}s, 30s+: ${row.calls_30s_plus})`);
    totalCalls += row.count;
  }
  
  console.log(`${String(totalCalls).padStart(4)} × TOTAL`);

  // PART 4: Analysis
  console.log('');
  console.log('');
  console.log('🔍 ANALYSIS & RECOMMENDATIONS');
  console.log('-'.repeat(80));
  
  const qualifiedCount = dispositionBreakdown.find(d => d.ai_disposition === 'qualified_lead')?.count || 0;
  const qualifiedPercent: number = totalCalls > 0 ? Number(((qualifiedCount / totalCalls) * 100).toFixed(1)) : 0;
  
  console.log(`Qualified Leads Created: ${qualifiedCount} out of ${totalCalls} (${qualifiedPercent}%)`);
  console.log('');
  
  if (qualifiedCount === 0) {
    console.log('❌ CRITICAL ISSUE: ZERO qualified leads being created');
    console.log('');
    console.log('Likely causes:');
    console.log('  1. AI qualification criteria too strict (requiring identity confirmation + 30s + interest signals)');
    console.log('  2. Campaign context not properly set (AI doesn\'t know what success looks like)');
    console.log('  3. AI is defaulting to "not_interested" to be safe');
    console.log('  4. Prospects ARE showing interest but AI isn\'t detecting it');
    console.log('');
    console.log('📋 RECOMMENDATION: Relax qualification criteria');
    console.log('   - Remove strict identity confirmation requirement');
    console.log('   - Reduce minimum duration from 30s to 15s');
    console.log('   - Broaden interest signal detection');
    console.log('   - Accept "callback_requested" as qualified');
  } else if (qualifiedPercent  {
  console.error('Error:', e);
  process.exit(1);
});