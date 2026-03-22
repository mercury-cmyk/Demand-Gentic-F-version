import { db, pool } from '../server/db';
import { leads, campaigns, callAttempts, dialerCallAttempts, callSessions } from '../shared/schema';
import { eq, and, inArray, sql, like } from 'drizzle-orm';

async function main() {
  // 1. Find UKEF campaign
  const ukefCampaigns = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(like(campaigns.name, '%UKEF%'));

  console.log('=== UKEF Campaigns ===');
  for (const c of ukefCampaigns) {
    console.log(`  ${c.id} | ${c.name} | ${c.status}`);
  }

  if (!ukefCampaigns.length) {
    console.log('No UKEF campaigns found');
    await pool.end();
    return;
  }

  const campaignIds = ukefCampaigns.map(c => c.id);

  // 2. Lead QA status breakdown
  const qaBreakdown = await db
    .select({
      qaStatus: leads.qaStatus,
      count: sql`COUNT(*)::int`,
    })
    .from(leads)
    .where(inArray(leads.campaignId, campaignIds))
    .groupBy(leads.qaStatus);

  console.log('\n=== Lead QA Status Breakdown ===');
  let totalLeads = 0;
  for (const row of qaBreakdown.sort((a, b) => b.count - a.count)) {
    console.log(`  ${row.qaStatus || '(null)'}: ${row.count}`);
    totalLeads += row.count;
  }
  console.log(`  TOTAL: ${totalLeads}`);

  // 3. What the dashboard counts as "Qualified"
  const [qualified] = await db
    .select({ count: sql`COUNT(*)::int` })
    .from(leads)
    .where(and(
      inArray(leads.campaignId, campaignIds),
      inArray(leads.qaStatus, ['approved', 'pending_pm_review', 'published'])
    ));
  console.log(`\n=== Dashboard "Qualified" count: ${qualified?.count || 0} ===`);
  console.log(`  (leads with qaStatus IN approved, pending_pm_review, published)`);

  // 4. AI qualification status breakdown
  const aiQualBreakdown = await db
    .select({
      aiQualStatus: leads.aiQualificationStatus,
      count: sql`COUNT(*)::int`,
    })
    .from(leads)
    .where(inArray(leads.campaignId, campaignIds))
    .groupBy(leads.aiQualificationStatus);

  console.log('\n=== AI Qualification Status Breakdown ===');
  for (const row of aiQualBreakdown.sort((a, b) => b.count - a.count)) {
    console.log(`  ${row.aiQualStatus || '(null)'}: ${row.count}`);
  }

  // 5. Check recent leads (last 7 days) vs older
  const [recentLeads] = await db
    .select({ count: sql`COUNT(*)::int` })
    .from(leads)
    .where(and(
      inArray(leads.campaignId, campaignIds),
      sql`${leads.createdAt} > NOW() - INTERVAL '7 days'`
    ));

  const [recentQualified] = await db
    .select({ count: sql`COUNT(*)::int` })
    .from(leads)
    .where(and(
      inArray(leads.campaignId, campaignIds),
      inArray(leads.qaStatus, ['approved', 'pending_pm_review', 'published']),
      sql`${leads.createdAt} > NOW() - INTERVAL '7 days'`
    ));

  console.log(`\n=== Last 7 days ===`);
  console.log(`  Total leads created: ${recentLeads?.count || 0}`);
  console.log(`  Qualified (approved/pending_pm_review/published): ${recentQualified?.count || 0}`);

  // 6. Check disposition sources — how are leads being created?
  const [fromDisposition] = await db
    .select({ count: sql`COUNT(*)::int` })
    .from(leads)
    .where(and(
      inArray(leads.campaignId, campaignIds),
      sql`${leads.createdAt} > NOW() - INTERVAL '7 days'`,
      sql`${leads.qaStatus} = 'new' OR ${leads.qaStatus} IS NULL`
    ));

  console.log(`  New/null status (not yet reviewed): ${fromDisposition?.count || 0}`);

  // 7. Check callAttempts dispositions vs leads
  const [humanQualified] = await db
    .select({ count: sql`COUNT(*)::int` })
    .from(callAttempts)
    .where(and(
      inArray(callAttempts.campaignId, campaignIds),
      eq(callAttempts.disposition, 'qualified')
    ));

  const aiQualifiedResult = await db.execute(sql`
    SELECT COUNT(*)::int as count
    FROM dialer_call_attempts
    WHERE campaign_id = ANY(${campaignIds})
    AND disposition = 'qualified_lead'
  `);
  const aiQualified = (aiQualifiedResult.rows[0] as any)?.count || 0;

  console.log(`\n=== Call Disposition "qualified" counts ===`);
  console.log(`  Human callAttempts (disposition='qualified'): ${humanQualified?.count || 0}`);
  console.log(`  AI dialerCallAttempts (disposition='qualified_lead'): ${aiQualified}`);
  console.log(`  Sum: ${(humanQualified?.count || 0) + aiQualified}`);
  console.log(`  vs Dashboard "Qualified" from leads table: ${qualified?.count || 0}`);

  if ((humanQualified?.count || 0) + aiQualified > (qualified?.count || 0)) {
    console.log(`\n  ⚠️  GAP DETECTED: ${(humanQualified?.count || 0) + aiQualified - (qualified?.count || 0)} qualified calls have no matching approved lead!`);
    console.log(`  This means leads are being created but NOT getting qaStatus='approved'.`);
    console.log(`  Check: disposition-engine.ts processDisposition() → does it set qaStatus?`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });