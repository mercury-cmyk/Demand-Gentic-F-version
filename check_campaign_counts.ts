
import { db } from './server/db';
import { campaigns, campaignQueue, contacts, accounts } from './shared/schema';
import { eq, and, sql, count, inArray } from 'drizzle-orm';

async function check() {
  const names = ['Campaign - ORD-202602-15BWXD', 'Harver Appoitnment Gen'];

  for (const name of names) {
    const camp = await db.select().from(campaigns).where(eq(campaigns.name, name)).limit(1);
    if (!camp.length) {
      console.log(`\nCampaign not found: ${name}`);
      continue;
    }
    const campId = camp[0].id;
    const dialMode = camp[0].dialMode || 'manual';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Campaign: ${name} (ID: ${campId})`);
    console.log(`Status: ${camp[0].status} | Dial Mode: ${dialMode}`);
    console.log(`${'='.repeat(60)}`);

    // Count audience size from audienceRefs lists
    if (camp[0].audienceRefs) {
      const audienceRefs = camp[0].audienceRefs as any;
      const listIds = audienceRefs.lists || audienceRefs.selectedLists || [];
      if (Array.isArray(listIds) && listIds.length > 0) {
        let totalAudience = 0;
        for (const listId of listIds) {
          const listResult = await db.execute(sql`
            SELECT name, COALESCE(array_length(record_ids, 1), 0) as record_count
            FROM lists WHERE id = ${listId}
          `);
          if ((listResult.rows as any[]).length > 0) {
            const list = (listResult.rows as any[])[0];
            totalAudience += list.record_count;
            console.log(`\nAudience List "${list.name}": ${list.record_count} records`);
          }
        }
        console.log(`Total Audience Size: ${totalAudience}`);
      }
    }

    // Queue status breakdown
    const queueStatusBreakdown = await db.execute(sql`
      SELECT status, COUNT(*)::int as count
      FROM campaign_queue
      WHERE campaign_id = ${campId}
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log(`\n--- Queue Status Breakdown ---`);
    let totalInQueue = 0;
    for (const row of queueStatusBreakdown.rows as any[]) {
      console.log(`  ${row.status}: ${row.count}`);
      totalInQueue += row.count;
    }
    console.log(`  TOTAL: ${totalInQueue}`);

    // Removed reason breakdown
    const removedReasonBreakdown = await db.execute(sql`
      SELECT
        COALESCE(removed_reason, 'no_reason_set') as reason,
        COUNT(*)::int as count
      FROM campaign_queue
      WHERE campaign_id = ${campId} AND status = 'removed'
      GROUP BY removed_reason
      ORDER BY count DESC
    `);

    if ((removedReasonBreakdown.rows as any[]).length > 0) {
      console.log(`\n--- Removed Reasons ---`);
      for (const row of removedReasonBreakdown.rows as any[]) {
        console.log(`  ${row.reason}: ${row.count}`);
      }
    }

    // Check how many queued items are waiting for retry (next_attempt_at in future)
    const waitingRetry = await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM campaign_queue
      WHERE campaign_id = ${campId}
        AND status = 'queued'
        AND next_attempt_at IS NOT NULL
        AND next_attempt_at > NOW()
    `);
    const retryCount = (waitingRetry.rows as any[])[0]?.count || 0;
    if (retryCount > 0) {
      console.log(`\n--- Queued but Waiting for Retry: ${retryCount} ---`);
    }

    // Check contacts already called today
    const calledToday = await db.execute(sql`
      SELECT COUNT(DISTINCT cs.contact_id)::int as count
      FROM call_sessions cs
      WHERE cs.campaign_id = ${campId}
        AND cs.created_at >= CURRENT_DATE
        AND cs.agent_type = 'ai'
    `);
    console.log(`\nContacts Already Called Today (AI): ${(calledToday.rows as any[])[0]?.count || 0}`);

    // Contact data quality for queued contacts
    const sampleContacts = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(CASE WHEN c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL THEN 1 END)::int as with_phone,
        COUNT(CASE WHEN c.account_id IS NOT NULL THEN 1 END)::int as with_account,
        COUNT(CASE WHEN c.country IS NOT NULL AND c.country != '' THEN 1 END)::int as with_country
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campId}
    `);

    if ((sampleContacts.rows as any[]).length > 0) {
      const s = (sampleContacts.rows as any[])[0];
      console.log(`\n--- Contact Data Quality (in queue table) ---`);
      console.log(`  Total: ${s.total}`);
      console.log(`  With Phone (direct or mobile E164): ${s.with_phone}`);
      console.log(`  With Account: ${s.with_account}`);
      console.log(`  With Country: ${s.with_country}`);
    }

    // Country distribution for queued items
    const countryDist = await db.execute(sql`
      SELECT
        COALESCE(UPPER(c.country), 'NULL/EMPTY') as country,
        COUNT(*)::int as count
      FROM campaign_queue cq
      LEFT JOIN contacts c ON c.id = cq.contact_id
      WHERE cq.campaign_id = ${campId} AND cq.status = 'queued'
      GROUP BY UPPER(c.country)
      ORDER BY count DESC
      LIMIT 10
    `);

    if ((countryDist.rows as any[]).length > 0) {
      console.log(`\n--- Country Distribution (queued contacts) ---`);
      for (const row of countryDist.rows as any[]) {
        console.log(`  ${row.country}: ${row.count}`);
      }
    }
  }
}

check().catch(console.error).then(() => process.exit(0));
