import { db, pool } from './server/db';

async function investigateLeadsDiscrepancy() {
  console.log('=== INVESTIGATING LEADS DISCREPANCY: Proton & UK Export Finance Q4 2025 ===\n');
  
  // 1. Find the campaigns
  const campaignsResult = await pool.query(`
    SELECT id, name, status, created_at,
           (SELECT COUNT(*) FROM campaign_queue WHERE campaign_id = campaigns.id) as queue_count
    FROM campaigns 
    WHERE LOWER(name) LIKE '%proton%' 
       OR LOWER(name) LIKE '%uk export%' 
       OR LOWER(name) LIKE '%export finance%'
    ORDER BY created_at DESC
  `);
  
  console.log('📋 CAMPAIGNS FOUND:');
  console.log('─'.repeat(80));
  for (const c of campaignsResult.rows) {
    console.log(`  ${c.name}`);
    console.log(`    ID: ${c.id}`);
    console.log(`    Status: ${c.status}`);
    console.log(`    Queue Count: ${c.queue_count}`);
    console.log('');
  }
  
  const campaignIds = campaignsResult.rows.map((c: any) => c.id);
  
  if (campaignIds.length === 0) {
    console.log('No matching campaigns found. Trying broader search...');
    const allCampaigns = await pool.query(`
      SELECT id, name, status FROM campaigns ORDER BY created_at DESC LIMIT 20
    `);
    console.log('Recent campaigns:');
    allCampaigns.rows.forEach((c: any) => console.log(`  - ${c.name} (${c.status})`));
    process.exit(0);
  }
  
  // 2. Check qualified leads count per campaign (what campaigns list shows)
  console.log('\n📊 QUALIFIED LEADS PER CAMPAIGN (Campaign Report View):');
  console.log('─'.repeat(80));
  
  for (const campaignId of campaignIds) {
    const campaignName = campaignsResult.rows.find((c: any) => c.id === campaignId)?.name;
    
    // Count by ai_disposition in call_sessions
    const qualifiedResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE ai_disposition = 'qualified_lead') as qualified_count,
        COUNT(*) FILTER (WHERE ai_disposition::text LIKE '%qualified%') as any_qualified,
        COUNT(*) as total_calls
      FROM call_sessions
      WHERE campaign_id = $1
    `, [campaignId]);
    
    // Count by disposition in dialer_call_attempts
    const dialerResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE disposition = 'qualified_lead') as qualified_count,
        COUNT(*) FILTER (WHERE disposition::text LIKE '%qualified%') as any_qualified,
        COUNT(*) as total_calls
      FROM dialer_call_attempts
      WHERE campaign_id = $1
    `, [campaignId]);
    
    console.log(`\n  Campaign: ${campaignName}`);
    console.log(`    call_sessions: qualified=${qualifiedResult.rows[0]?.qualified_count || 0}, any_qualified=${qualifiedResult.rows[0]?.any_qualified || 0}, total=${qualifiedResult.rows[0]?.total_calls || 0}`);
    console.log(`    dialer_call_attempts: qualified=${dialerResult.rows[0]?.qualified_count || 0}, any_qualified=${dialerResult.rows[0]?.any_qualified || 0}, total=${dialerResult.rows[0]?.total_calls || 0}`);
  }
  
  // 3. Check actual leads in leads table
  console.log('\n\n🎯 LEADS IN LEADS TABLE (QA/Leads View):');
  console.log('─'.repeat(80));
  
  for (const campaignId of campaignIds) {
    const campaignName = campaignsResult.rows.find((c: any) => c.id === campaignId)?.name;
    
    const leadsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN recording_url IS NOT NULL AND recording_url != '' THEN 1 END) as with_recordings,
        COUNT(CASE WHEN call_attempt_id IS NOT NULL THEN 1 END) as linked_to_attempt
      FROM leads
      WHERE campaign_id = $1
        AND deleted_at IS NULL
    `, [campaignId]);
    
    console.log(`\n  Campaign: ${campaignName}`);
    console.log(`    Total Leads: ${leadsResult.rows[0]?.total_leads || 0}`);
    console.log(`    With Recordings: ${leadsResult.rows[0]?.with_recordings || 0}`);
    console.log(`    Linked to Attempt: ${leadsResult.rows[0]?.linked_to_attempt || 0}`);
  }
  
  // 4. Find qualified calls WITHOUT leads (the gap)
  console.log('\n\n⚠️ QUALIFIED CALLS WITHOUT LEADS (THE DISCREPANCY):');
  console.log('─'.repeat(80));
  
  for (const campaignId of campaignIds) {
    const campaignName = campaignsResult.rows.find((c: any) => c.id === campaignId)?.name;
    
    // Calls marked qualified in dialer_call_attempts but no lead exists
    const gapResult = await pool.query(`
      SELECT dca.id, dca.disposition, dca.recording_url, dca.created_at,
             c.first_name, c.last_name, c.email
      FROM dialer_call_attempts dca
      LEFT JOIN contacts c ON dca.contact_id = c.id
      WHERE dca.campaign_id = $1
        AND dca.disposition = 'qualified_lead'
        AND NOT EXISTS (
          SELECT 1 FROM leads l 
          WHERE l.call_attempt_id = dca.id
        )
      ORDER BY dca.created_at DESC
      LIMIT 20
    `, [campaignId]);
    
    const totalGap = await pool.query(`
      SELECT COUNT(*) as count
      FROM dialer_call_attempts dca
      WHERE dca.campaign_id = $1
        AND dca.disposition = 'qualified_lead'
        AND NOT EXISTS (
          SELECT 1 FROM leads l 
          WHERE l.call_attempt_id = dca.id
        )
    `, [campaignId]);
    
    console.log(`\n  Campaign: ${campaignName}`);
    console.log(`    Missing Leads Count: ${totalGap.rows[0]?.count || 0}`);
    
    if (gapResult.rows.length > 0) {
      console.log('    Sample missing (first 5):');
      gapResult.rows.slice(0, 5).forEach((r: any) => {
        console.log(`      - ${r.first_name || 'Unknown'} ${r.last_name || ''} | ${r.created_at}`);
      });
    }
  }
  
  // 5. Check disposition breakdown
  console.log('\n\n📈 DISPOSITION BREAKDOWN (call_sessions):');
  console.log('─'.repeat(80));
  
  for (const campaignId of campaignIds) {
    const campaignName = campaignsResult.rows.find((c: any) => c.id === campaignId)?.name;
    
    const dispositionResult = await pool.query(`
      SELECT ai_disposition, COUNT(*) as count
      FROM call_sessions
      WHERE campaign_id = $1
      GROUP BY ai_disposition
      ORDER BY count DESC
    `, [campaignId]);
    
    console.log(`\n  Campaign: ${campaignName}`);
    dispositionResult.rows.forEach((r: any) => {
      console.log(`    ${r.ai_disposition || 'NULL'}: ${r.count}`);
    });
  }
  
  // 6. Check if there's a leads count by checking what UI queries might use
  console.log('\n\n🔍 CHECKING HOW CAMPAIGN REPORT COUNTS QUALIFIED:');
  console.log('─'.repeat(80));
  
  // Sometimes campaign reports count from queue or call attempts differently
  for (const campaignId of campaignIds) {
    const campaignName = campaignsResult.rows.find((c: any) => c.id === campaignId)?.name;
    
    // Check queue with status
    const queueResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM campaign_queue
      WHERE campaign_id = $1
      GROUP BY status
      ORDER BY count DESC
    `, [campaignId]);
    
    console.log(`\n  Campaign: ${campaignName}`);
    console.log('  Queue status breakdown:');
    queueResult.rows.forEach((r: any) => {
      console.log(`    ${r.status || 'NULL'}: ${r.count}`);
    });
    
    // Check dialer_call_attempts disposition breakdown
    const dialerDispositions = await pool.query(`
      SELECT disposition, COUNT(*) as count
      FROM dialer_call_attempts
      WHERE campaign_id = $1
      GROUP BY disposition
      ORDER BY count DESC
    `, [campaignId]);
    
    console.log('  Dialer call attempts dispositions:');
    dialerDispositions.rows.forEach((r: any) => {
      console.log(`    ${r.disposition || 'NULL'}: ${r.count}`);
    });
    
    // Check leads by qa_status
    const leadsStatus = await pool.query(`
      SELECT qa_status, COUNT(*) as count
      FROM leads
      WHERE campaign_id = $1
        AND deleted_at IS NULL
      GROUP BY qa_status
      ORDER BY count DESC
    `, [campaignId]);
    
    console.log('  Leads by QA status:');
    leadsStatus.rows.forEach((r: any) => {
      console.log(`    ${r.qa_status || 'NULL'}: ${r.count}`);
    });
  }
  
  // 7. Summary
  console.log('\n\n📋 SUMMARY:');
  console.log('═'.repeat(80));
  
  for (const campaignId of campaignIds) {
    const campaignName = campaignsResult.rows.find((c: any) => c.id === campaignId)?.name;
    
    const [dcaQualified, leadsCount, gapCount] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM dialer_call_attempts WHERE campaign_id = $1 AND disposition = 'qualified_lead'`, [campaignId]),
      pool.query(`SELECT COUNT(*) as count FROM leads WHERE campaign_id = $1`, [campaignId]),
      pool.query(`
        SELECT COUNT(*) as count FROM dialer_call_attempts dca
        WHERE dca.campaign_id = $1 AND dca.disposition = 'qualified_lead'
        AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.call_attempt_id = dca.id)
      `, [campaignId])
    ]);
    
    console.log(`\n  ${campaignName}:`);
    console.log(`    Qualified in dialer_call_attempts: ${dcaQualified.rows[0]?.count || 0}`);
    console.log(`    Leads in leads table:              ${leadsCount.rows[0]?.count || 0}`);
    console.log(`    GAP (missing leads):               ${gapCount.rows[0]?.count || 0}`);
  }
  
  console.log('\n');
  process.exit(0);
}

investigateLeadsDiscrepancy().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
