import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const CAMPAIGN_ID = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';
const CAMPAIGN_NAME = 'RingCentral_AppointmentGen';

async function main() {
  console.log('=== RingCentral_AppointmentGen - Queue Diagnostics ===\n');

  const campaignResult = await db.execute(sql`
    SELECT id, name, status, dial_mode, account_cap_enabled, account_cap_value, account_cap_mode, audience_refs, client_account_id
    FROM campaigns
    WHERE id = ${CAMPAIGN_ID} OR name = ${CAMPAIGN_NAME}
    ORDER BY (id = ${CAMPAIGN_ID}) DESC
    LIMIT 1
  `);

  const campaign = campaignResult.rows[0] as any | undefined;
  if (!campaign) {
    console.log(`Campaign not found (id: ${CAMPAIGN_ID}, name: ${CAMPAIGN_NAME})`);
    process.exit(1);
  }

  console.log('Campaign Settings:');
  console.log(`  id: ${campaign.id}`);
  console.log(`  name: ${campaign.name}`);
  console.log(`  status: ${campaign.status}`);
  console.log(`  dialMode: ${campaign.dial_mode}`);
  console.log(`  accountCapEnabled: ${campaign.account_cap_enabled}`);
  console.log(`  accountCapMode: ${campaign.account_cap_mode}`);
  console.log(`  accountCapValue: ${campaign.account_cap_value}`);
  console.log(`  clientAccountId: ${campaign.client_account_id}`);

  const queueStats = await db.execute(sql`
    SELECT status, COUNT(*)::int as count
    FROM campaign_queue
    WHERE campaign_id = ${campaign.id}
    GROUP BY status
    ORDER BY status
  `);

  console.log('\nCampaign Queue (campaign_queue):');
  let queueTotal = 0;
  for (const row of queueStats.rows) {
    console.log(`  ${row.status}: ${row.count}`);
    queueTotal += Number(row.count);
  }
  console.log(`  TOTAL: ${queueTotal}`);

  const accountStats = await db.execute(sql`
    SELECT COUNT(DISTINCT account_id)::int as accounts_in_queue
    FROM campaign_queue
    WHERE campaign_id = ${campaign.id}
  `);
  console.log(`  Accounts in queue: ${accountStats.rows[0]?.accounts_in_queue ?? 0}`);

  const audienceSnapshots = await db.execute(sql`
    SELECT id, contact_count, account_count, created_at
    FROM campaign_audience_snapshots
    WHERE campaign_id = ${campaign.id}
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('\nAudience Snapshots:');
  if (audienceSnapshots.rows.length === 0) {
    console.log('  (none found)');
  } else {
    for (const row of audienceSnapshots.rows) {
      console.log(`  Snapshot ${row.id}: ${row.contact_count} contacts, ${row.account_count} accounts (${row.created_at})`);
    }
  }

  const audienceRefs = campaign.audience_refs as any | null;
  const listIds: string[] = Array.isArray(audienceRefs?.lists)
    ? audienceRefs.lists
    : Array.isArray(audienceRefs?.selectedLists)
      ? audienceRefs.selectedLists
      : [];

  if (listIds.length > 0) {
    console.log(`\nAudience Lists (${listIds.length}):`, listIds.join(', '));

    const listCounts = await db.execute(sql`
      WITH list_contacts AS (
        SELECT l.id as list_id, unnest(l.record_ids) as contact_id
        FROM lists l
        WHERE l.id = ANY(${listIds})
      )
      SELECT list_id, COUNT(*)::int as contacts
      FROM list_contacts
      GROUP BY list_id
      ORDER BY contacts DESC
    `);

    let listTotal = 0;
    for (const row of listCounts.rows) {
      console.log(`  List ${row.list_id}: ${row.contacts}`);
      listTotal += Number(row.contacts);
    }
    console.log(`  LIST TOTAL: ${listTotal}`);

    const eligibility = await db.execute(sql`
      WITH list_contacts AS (
        SELECT unnest(l.record_ids) as contact_id
        FROM lists l
        WHERE l.id = ANY(${listIds})
      )
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE c.account_id IS NOT NULL)::int as with_account,
        COUNT(*) FILTER (
          WHERE c.account_id IS NOT NULL
          AND (c.direct_phone_e164 IS NOT NULL OR c.mobile_phone_e164 IS NOT NULL OR a.main_phone_e164 IS NOT NULL)
        )::int as with_callable_phone
      FROM list_contacts lc
      JOIN contacts c ON c.id = lc.contact_id
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE c.deleted_at IS NULL
    `);

    const eligibilityRow = eligibility.rows[0] as any;
    console.log('\nList Contact Eligibility:');
    console.log(`  total contacts: ${eligibilityRow?.total ?? 0}`);
    console.log(`  with account: ${eligibilityRow?.with_account ?? 0}`);
    console.log(`  with callable phone: ${eligibilityRow?.with_callable_phone ?? 0}`);

    const notEnqueuedFromLists = await db.execute(sql`
      WITH list_contacts AS (
        SELECT unnest(l.record_ids) as contact_id
        FROM lists l
        WHERE l.id = ANY(${listIds})
      )
      SELECT COUNT(*)::int as count
      FROM list_contacts lc
      WHERE NOT EXISTS (
        SELECT 1 FROM campaign_queue cq
        WHERE cq.campaign_id = ${campaign.id}
          AND cq.contact_id = lc.contact_id
      )
    `);
    console.log(`  list contacts NOT enqueued: ${notEnqueuedFromLists.rows[0]?.count ?? 0}`);
  } else {
    console.log('\nAudience Lists: (none found in audience_refs)');
  }

  const accountContacts = await db.execute(sql`
    SELECT COUNT(DISTINCT c.id)::int as total_contacts, COUNT(DISTINCT a.id)::int as total_accounts
    FROM accounts a
    JOIN contacts c ON c.account_id = a.id
    WHERE a.id IN (
      SELECT DISTINCT account_id FROM campaign_queue WHERE campaign_id = ${campaign.id}
    )
    AND c.deleted_at IS NULL
  `);

  console.log('\nContacts in accounts that are in the queue:');
  console.log(`  Total contacts: ${accountContacts.rows[0]?.total_contacts ?? 0}`);
  console.log(`  Total accounts: ${accountContacts.rows[0]?.total_accounts ?? 0}`);

  const notEnqueued = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM contacts c
    WHERE c.account_id IN (
      SELECT DISTINCT account_id FROM campaign_queue WHERE campaign_id = ${campaign.id}
    )
    AND c.deleted_at IS NULL
    AND c.id NOT IN (
      SELECT contact_id FROM campaign_queue WHERE campaign_id = ${campaign.id}
    )
  `);
  console.log(`  Contacts in same accounts but NOT in queue: ${notEnqueued.rows[0]?.count ?? 0}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
