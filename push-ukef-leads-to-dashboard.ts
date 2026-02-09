/**
 * Push UK Export Finance qualified leads to Client Dashboard
 * ONLY leads qualified after January 1, 2026
 *
 * This script:
 * 1. Reverts any pre-2026 leads that were incorrectly pushed
 * 2. Publishes approved leads created after Jan 1 2026
 * 3. Marks them as submittedToClient = true
 * 4. Ensures client campaign access exists
 *
 * Usage: npx tsx push-ukef-leads-to-dashboard.ts
 */

import { db } from './server/db';
import { campaigns, leads, clientCampaignAccess, clientAccounts } from './shared/schema';
import { eq, and, sql, like, or, gte, lt } from 'drizzle-orm';

const CUTOFF_DATE = new Date('2026-01-01T00:00:00Z');

async function pushUKEFLeadsToDashboard() {
  console.log('=== PUSH UK EXPORT FINANCE LEADS TO CLIENT DASHBOARD ===');
  console.log(`=== ONLY leads created on or after ${CUTOFF_DATE.toISOString()} ===\n`);

  // Step 1: Find all UK Export Finance campaigns
  const ukefCampaigns = await db.select({
    id: campaigns.id,
    name: campaigns.name,
    status: campaigns.status,
    clientAccountId: campaigns.clientAccountId,
  })
  .from(campaigns)
  .where(
    or(
      like(campaigns.name, '%UK Export Finance%'),
      like(campaigns.name, '%UKEF%'),
      like(campaigns.name, '%uk export%'),
    )
  );

  if (ukefCampaigns.length === 0) {
    console.log('No UK Export Finance campaigns found.');
    process.exit(0);
  }

  console.log(`Found ${ukefCampaigns.length} UK Export Finance campaign(s):\n`);

  for (const campaign of ukefCampaigns) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Campaign: ${campaign.name}`);
    console.log(`ID: ${campaign.id}`);
    console.log(`Status: ${campaign.status}`);
    console.log(`Client Account: ${campaign.clientAccountId || 'NOT SET'}`);
    console.log(`${'='.repeat(60)}`);

    // Step 2: Revert pre-2026 leads that were pushed by the previous script run
    // (those pushed by 'system-script' before the cutoff date)
    const revertedLeads = await db.update(leads)
      .set({
        submittedToClient: false,
        submittedAt: null,
        submissionResponse: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(leads.campaignId, campaign.id),
        eq(leads.submittedToClient, true),
        lt(leads.createdAt, CUTOFF_DATE),
        sql`${leads.deletedAt} IS NULL`,
        // Only revert ones pushed by system-script (not manually pushed ones)
        sql`${leads.submissionResponse}->>'submittedBy' = 'system-script'`
      ))
      .returning({ id: leads.id, contactName: leads.contactName, createdAt: leads.createdAt });

    if (revertedLeads.length > 0) {
      console.log(`\n--- Reverted ${revertedLeads.length} pre-2026 leads (removed from dashboard) ---`);
    }

    // Also revert published status for pre-2026 leads that were auto-published by system-script
    const revertedPublished = await db.update(leads)
      .set({
        qaStatus: 'approved',
        publishedAt: null,
        publishedBy: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(leads.campaignId, campaign.id),
        eq(leads.qaStatus, 'published'),
        eq(leads.publishedBy, 'system-script'),
        lt(leads.createdAt, CUTOFF_DATE),
        sql`${leads.deletedAt} IS NULL`
      ))
      .returning({ id: leads.id });

    if (revertedPublished.length > 0) {
      console.log(`--- Reverted ${revertedPublished.length} pre-2026 leads back to 'approved' status ---`);
    }

    // Step 3: Check current lead counts (2026+ only)
    const [counts] = await db.select({
      total: sql<number>`count(*)::int`,
      new: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'new' THEN 1 END)::int`,
      underReview: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'under_review' THEN 1 END)::int`,
      approved: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'approved' THEN 1 END)::int`,
      published: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'published' THEN 1 END)::int`,
      publishedNotPushed: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'published' AND ${leads.submittedToClient} = false THEN 1 END)::int`,
      alreadyPushed: sql<number>`COUNT(CASE WHEN ${leads.submittedToClient} = true THEN 1 END)::int`,
      rejected: sql<number>`COUNT(CASE WHEN ${leads.qaStatus} = 'rejected' THEN 1 END)::int`,
    })
    .from(leads)
    .where(and(
      eq(leads.campaignId, campaign.id),
      gte(leads.createdAt, CUTOFF_DATE),
      sql`${leads.deletedAt} IS NULL`
    ));

    const [totalCounts] = await db.select({
      total: sql<number>`count(*)::int`,
      pre2026: sql<number>`COUNT(CASE WHEN ${leads.createdAt} < ${CUTOFF_DATE} THEN 1 END)::int`,
      post2026: sql<number>`COUNT(CASE WHEN ${leads.createdAt} >= ${CUTOFF_DATE} THEN 1 END)::int`,
    })
    .from(leads)
    .where(and(
      eq(leads.campaignId, campaign.id),
      sql`${leads.deletedAt} IS NULL`
    ));

    console.log(`\nAll Leads: ${totalCounts.total} (pre-2026: ${totalCounts.pre2026}, 2026+: ${totalCounts.post2026})`);
    console.log(`\n2026+ Lead Status Breakdown:`);
    console.log(`  Total (2026+): ${counts.total}`);
    console.log(`  New: ${counts.new}`);
    console.log(`  Under Review: ${counts.underReview}`);
    console.log(`  Approved (will be auto-published): ${counts.approved}`);
    console.log(`  Published: ${counts.published}`);
    console.log(`  Published but not pushed: ${counts.publishedNotPushed}`);
    console.log(`  Already on client dashboard: ${counts.alreadyPushed}`);
    console.log(`  Rejected: ${counts.rejected}`);

    // Step 4: Auto-publish approved leads (2026+ only)
    const publishedLeads = await db.update(leads)
      .set({
        qaStatus: 'published',
        publishedAt: new Date(),
        publishedBy: 'system-script',
        updatedAt: new Date(),
      })
      .where(and(
        eq(leads.campaignId, campaign.id),
        eq(leads.qaStatus, 'approved'),
        gte(leads.createdAt, CUTOFF_DATE),
        sql`${leads.deletedAt} IS NULL`
      ))
      .returning({ id: leads.id, contactName: leads.contactName });

    console.log(`\n--- Auto-published ${publishedLeads.length} approved 2026+ leads ---`);

    // Step 5: Push all published 2026+ leads to client dashboard
    const pushedLeads = await db.update(leads)
      .set({
        submittedToClient: true,
        submittedAt: new Date(),
        submissionResponse: {
          method: 'client_dashboard_push',
          submittedAt: new Date().toISOString(),
          submittedBy: 'system-script',
          note: 'Bulk push of UK Export Finance 2026+ qualified leads',
        },
        updatedAt: new Date(),
      })
      .where(and(
        eq(leads.campaignId, campaign.id),
        eq(leads.qaStatus, 'published'),
        eq(leads.submittedToClient, false),
        gte(leads.createdAt, CUTOFF_DATE),
        sql`${leads.deletedAt} IS NULL`
      ))
      .returning({
        id: leads.id,
        contactName: leads.contactName,
        contactEmail: leads.contactEmail,
        accountName: leads.accountName,
        aiScore: leads.aiScore,
        createdAt: leads.createdAt,
      });

    console.log(`\n--- Pushed ${pushedLeads.length} leads to client dashboard ---`);
    if (pushedLeads.length > 0) {
      console.log('\nPushed leads:');
      for (const lead of pushedLeads) {
        console.log(`  - ${lead.contactName || 'N/A'} | ${lead.accountName || 'N/A'} | ${lead.contactEmail || 'N/A'} | Score: ${lead.aiScore || 'N/A'} | Created: ${lead.createdAt}`);
      }
    }

    // Step 6: Ensure client campaign access exists
    if (campaign.clientAccountId) {
      const [existingAccess] = await db.select()
        .from(clientCampaignAccess)
        .where(and(
          eq(clientCampaignAccess.clientAccountId, campaign.clientAccountId),
          eq(clientCampaignAccess.regularCampaignId, campaign.id)
        ))
        .limit(1);

      if (!existingAccess) {
        await db.insert(clientCampaignAccess).values({
          clientAccountId: campaign.clientAccountId,
          regularCampaignId: campaign.id,
          grantedBy: 'system-script',
        });
        console.log(`\nAuto-granted client campaign access for client ${campaign.clientAccountId}`);
      } else {
        console.log(`\nClient campaign access already exists`);
      }

      const [client] = await db.select({ name: clientAccounts.name })
        .from(clientAccounts)
        .where(eq(clientAccounts.id, campaign.clientAccountId))
        .limit(1);

      console.log(`Client Account: ${client?.name || campaign.clientAccountId}`);
    } else {
      console.log(`\nWARNING: Campaign has no clientAccountId set.`);
    }

    // Final summary
    const [finalCounts] = await db.select({
      total: sql<number>`count(*)::int`,
      onDashboard: sql<number>`COUNT(CASE WHEN ${leads.submittedToClient} = true THEN 1 END)::int`,
      onDashboard2026: sql<number>`COUNT(CASE WHEN ${leads.submittedToClient} = true AND ${leads.createdAt} >= ${CUTOFF_DATE} THEN 1 END)::int`,
    })
    .from(leads)
    .where(and(
      eq(leads.campaignId, campaign.id),
      sql`${leads.deletedAt} IS NULL`
    ));

    console.log(`\n--- FINAL RESULT ---`);
    console.log(`  Total leads: ${finalCounts.total}`);
    console.log(`  On client dashboard (all): ${finalCounts.onDashboard}`);
    console.log(`  On client dashboard (2026+ only): ${finalCounts.onDashboard2026}`);
  }

  console.log('\n\nDone!');
  process.exit(0);
}

pushUKEFLeadsToDashboard().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
