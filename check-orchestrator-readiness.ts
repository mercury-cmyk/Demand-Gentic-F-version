import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkOrchestratorReadiness() {
  console.log("================================================================================");
  console.log("ORCHESTRATOR READINESS CHECK");
  console.log("================================================================================\n");

  // Get the ready contacts details
  const readyContacts = await db.execute(sql`
    SELECT
      cq.id,
      cq.next_attempt_at,
      c.full_name as contact_name,
      a.name as account_name,
      camp.name as campaign_name,
      camp.status as campaign_status,
      camp.require_account_intelligence
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    JOIN accounts a ON a.id = c.account_id
    JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE camp.dial_mode = 'ai_agent'
      AND camp.status = 'active'
      AND cq.status = 'queued'
      AND cq.next_attempt_at <= NOW()
    ORDER BY cq.next_attempt_at ASC
    LIMIT 10
  `);

  console.log(`📋 Ready Contacts (${readyContacts.rows.length} shown):\n`);

  if (readyContacts.rows.length === 0) {
    console.log("  ⚠️  No contacts ready to call right now\n");
  } else {
    readyContacts.rows.forEach((contact: any, idx: number) => {
      const scheduledDate = new Date(contact.next_attempt_at);
      const hoursAgo = Math.round((Date.now() - scheduledDate.getTime()) / 1000 / 60 / 60);

      console.log(`${idx + 1}. ${contact.contact_name} at ${contact.account_name}`);
      console.log(`   Campaign: ${contact.campaign_name}`);
      console.log(`   Intelligence: ${contact.require_account_intelligence ? 'Required' : 'Not Required'}`);
      console.log(`   Scheduled: ${scheduledDate.toLocaleString()} (${hoursAgo}h ago)`);
      console.log("");
    });
  }

  // Check if there are business hour restrictions
  const campaignConfig = await db.execute(sql`
    SELECT
      name,
      status,
      business_hours_config,
      timezone
    FROM campaigns
    WHERE name = 'Agentic DemandGen for Pivotal B2B_Waterfall'
  `);

  console.log("================================================================================");
  console.log("CAMPAIGN CONFIGURATION\n");

  if (campaignConfig.rows.length > 0) {
    const campaign = campaignConfig.rows[0] as any;
    console.log(`Campaign: ${campaign.name}`);
    console.log(`Status: ${campaign.status}`);
    console.log(`Timezone: ${campaign.timezone || 'Not set'}`);

    if (campaign.business_hours_config) {
      console.log(`\nBusiness Hours Config:`);
      console.log(JSON.stringify(campaign.business_hours_config, null, 2));
    } else {
      console.log(`\nBusiness Hours: Not configured`);
    }
  }

  console.log("\n================================================================================");
  console.log("CURRENT TIME INFORMATION\n");

  const timeInfo = await db.execute(sql`
    SELECT
      NOW() as server_time,
      NOW() AT TIME ZONE 'America/New_York' as eastern_time,
      NOW() AT TIME ZONE 'America/Chicago' as central_time,
      NOW() AT TIME ZONE 'America/Los_Angeles' as pacific_time
  `);

  const times = timeInfo.rows[0] as any;
  console.log(`Server Time (UTC): ${new Date(times.server_time).toLocaleString()}`);
  console.log(`Eastern Time: ${new Date(times.eastern_time).toLocaleString()}`);
  console.log(`Central Time: ${new Date(times.central_time).toLocaleString()}`);
  console.log(`Pacific Time: ${new Date(times.pacific_time).toLocaleString()}`);

  console.log("\n================================================================================");
  console.log("DIAGNOSIS\n");

  if (readyContacts.rows.length > 0) {
    console.log("✅ There are contacts ready to call");
    console.log("⚠️  But orchestrator hasn't processed them in 5+ hours\n");
    console.log("Possible causes:");
    console.log("  1. Campaign orchestrator service is not running");
    console.log("  2. Application server needs restart to load new code");
    console.log("  3. Business hours filter may be blocking calls");
    console.log("  4. Check server/production logs for orchestrator errors\n");
    console.log("Next steps:");
    console.log("  - Restart the application server");
    console.log("  - Check production server logs for '[Campaign-Orchestrator]' messages");
    console.log("  - Verify orchestrator cron job is running");
  } else {
    console.log("⚠️  No contacts are ready to call at this moment");
    console.log("   This could be due to business hours filtering or scheduling");
  }

  console.log("\n================================================================================");

  process.exit(0);
}

checkOrchestratorReadiness().catch(console.error);
