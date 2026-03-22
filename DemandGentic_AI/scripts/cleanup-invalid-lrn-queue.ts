import { db } from "../server/db";
import { sql } from "drizzle-orm";

function getArg(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function cleanupInvalidLrnQueue() {
  const execute = process.argv.includes("--execute");
  const campaignId = getArg("--campaign-id=");

  console.log("================================================================================");
  console.log("INVALID LRN QUEUE ANALYZER / CLEANUP");
  console.log("================================================================================\n");

  if (!execute) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
    console.log("   Run with --execute to apply cleanup actions\n");
  } else {
    console.log("⚠️  EXECUTE MODE - Changes WILL be applied\n");
  }

  if (campaignId) {
    console.log(`🎯 Scope: campaign_id=${campaignId}\n`);
  }

  const scopedCampaignFilter = campaignId
    ? sql`AND cq.campaign_id = ${campaignId}`
    : sql``;

  const perCampaign = await db.execute(sql`
    SELECT
      cq.campaign_id,
      c.name AS campaign_name,
      COUNT(*)::int AS count,
      MIN(cq.updated_at) AS first_seen,
      MAX(cq.updated_at) AS last_seen
    FROM campaign_queue cq
    LEFT JOIN campaigns c ON c.id = cq.campaign_id
    WHERE cq.status = 'removed'
      AND cq.removed_reason = 'invalid_lrn'
      ${scopedCampaignFilter}
    GROUP BY cq.campaign_id, c.name
    ORDER BY count DESC
  `);

  const totalInvalidLrn = (perCampaign.rows as any[]).reduce((sum, row) => sum + Number((row as any).count || 0), 0);
  console.log(`📊 Removed queue items with reason=invalid_lrn: ${totalInvalidLrn}`);

  if ((perCampaign.rows as any[]).length > 0) {
    console.log("\nTop campaigns impacted:");
    for (const row of (perCampaign.rows as any[]).slice(0, 20)) {
      console.log(`  - ${(row as any).campaign_id} | ${(row as any).campaign_name || "(unnamed)"} | ${(row as any).count}`);
    }
  }

  const pendingCountResult = await db.execute(sql`
    WITH invalid_contacts AS (
      SELECT DISTINCT cq.contact_id
      FROM campaign_queue cq
      WHERE cq.status = 'removed'
        AND cq.removed_reason = 'invalid_lrn'
        ${campaignId ? sql`AND cq.campaign_id = ${campaignId}` : sql``}
    )
    SELECT COUNT(*)::int AS count
    FROM campaign_queue q
    INNER JOIN invalid_contacts ic ON ic.contact_id = q.contact_id
    WHERE q.status IN ('queued', 'in_progress')
      ${campaignId ? sql`AND q.campaign_id = ${campaignId}` : sql``}
  `);

  const pendingCount = Number((pendingCountResult.rows[0] as any)?.count || 0);
  console.log(`\n🧹 Queue items currently queued/in_progress for contacts with prior invalid_lrn: ${pendingCount}`);

  let removedNow = 0;
  if (execute && pendingCount > 0) {
    const removeResult = await db.execute(sql`
      WITH invalid_contacts AS (
        SELECT DISTINCT cq.contact_id
        FROM campaign_queue cq
        WHERE cq.status = 'removed'
          AND cq.removed_reason = 'invalid_lrn'
          ${campaignId ? sql`AND cq.campaign_id = ${campaignId}` : sql``}
      )
      UPDATE campaign_queue q
      SET status = 'removed',
          removed_reason = 'invalid_lrn',
          updated_at = NOW()
      FROM invalid_contacts ic
      WHERE q.contact_id = ic.contact_id
        AND q.status IN ('queued', 'in_progress')
        ${campaignId ? sql`AND q.campaign_id = ${campaignId}` : sql``}
      RETURNING q.id
    `);

    removedNow = removeResult.rows.length;
    console.log(`✅ Removed additional queued/in_progress rows: ${removedNow}`);
  }

  const missingDispositionResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM dialer_call_attempts dca
    INNER JOIN campaign_queue cq ON cq.id = dca.queue_item_id
    WHERE cq.removed_reason = 'invalid_lrn'
      AND dca.disposition IS NULL
      ${campaignId ? sql`AND cq.campaign_id = ${campaignId}` : sql``}
  `);

  const missingDispositionCount = Number((missingDispositionResult.rows[0] as any)?.count || 0);
  console.log(`\n📞 Dialer attempts missing disposition for invalid_lrn rows: ${missingDispositionCount}`);

  let backfilledDisposition = 0;
  if (execute && missingDispositionCount > 0) {
    const backfillResult = await db.execute(sql`
      UPDATE dialer_call_attempts dca
      SET disposition = 'invalid_data',
          updated_at = NOW()
      FROM campaign_queue cq
      WHERE cq.id = dca.queue_item_id
        AND cq.removed_reason = 'invalid_lrn'
        AND dca.disposition IS NULL
        ${campaignId ? sql`AND cq.campaign_id = ${campaignId}` : sql``}
      RETURNING dca.id
    `);

    backfilledDisposition = backfillResult.rows.length;
    console.log(`✅ Backfilled dialer dispositions to invalid_data: ${backfilledDisposition}`);
  }

  console.log("\n================================================================================");
  console.log("SUMMARY");
  console.log("================================================================================");
  console.log(`Total removed invalid_lrn rows: ${totalInvalidLrn}`);
  console.log(`Queued/in_progress candidates: ${pendingCount}`);
  console.log(`Removed this run: ${removedNow}`);
  console.log(`Dialer dispositions missing: ${missingDispositionCount}`);
  console.log(`Dialer dispositions backfilled: ${backfilledDisposition}`);

  if (!execute) {
    console.log("\n💡 To execute cleanup:");
    console.log("   npm run queue:invalid-lrn -- --execute");
    console.log("   npm run queue:invalid-lrn -- --execute --campaign-id=");
  }
}

cleanupInvalidLrnQueue()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ invalid_lrn cleanup failed:", error);
    process.exit(1);
  });