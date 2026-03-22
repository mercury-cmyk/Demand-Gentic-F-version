import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkCurrentStatus() {
  console.log("================================================================================");
  console.log("CURRENT CALL STATUS - " + new Date().toLocaleString());
  console.log("================================================================================\n");

  // Check the most recent call attempts
  const recentCalls = await db.execute(sql`
    SELECT
      ca.id,
      ca.created_at,
      ca.started_at,
      ca.ended_at,
      ca.duration,
      ca.disposition,
      c.full_name as contact_name,
      a.name as account_name,
      camp.name as campaign_name,
      camp.require_account_intelligence
    FROM call_attempts ca
    LEFT JOIN contacts c ON c.id = ca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = ca.campaign_id
    WHERE camp.dial_mode = 'ai_agent'
    ORDER BY ca.created_at DESC
    LIMIT 5
  `);

  console.log("📞 Last 5 AI Campaign Calls:\n");

  if (recentCalls.rows.length === 0) {
    console.log("  No calls found yet.\n");
  } else {
    recentCalls.rows.forEach((call: any, idx: number) => {
      const timeAgo = Math.round((Date.now() - new Date(call.created_at).getTime()) / 1000 / 60);
      const callStatus = call.ended_at ? 'Completed' : (call.started_at ? 'In Progress' : 'Created');
      console.log(`${idx + 1}. ${call.campaign_name}`);
      console.log(`   Time: ${new Date(call.created_at).toLocaleString()} (${timeAgo} min ago)`);
      console.log(`   Contact: ${call.contact_name} at ${call.account_name}`);
      console.log(`   Intelligence Mode: ${call.require_account_intelligence ? 'Full' : 'Basic'}`);
      console.log(`   Status: ${callStatus}, Disposition: ${call.disposition || 'N/A'}, Duration: ${call.duration || 0}s`);
      console.log("");
    });
  }

  // Check active queue items
  const queueStatus = await db.execute(sql`
    SELECT
      camp.name as campaign_name,
      COUNT(*) FILTER (WHERE cq.status = 'queued' AND cq.next_attempt_at  NOW()) as scheduled_future,
      MIN(cq.next_attempt_at) FILTER (WHERE cq.status = 'queued' AND cq.next_attempt_at > NOW()) as next_call_time
    FROM campaign_queue cq
    JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE camp.dial_mode = 'ai_agent'
      AND camp.status = 'active'
      AND cq.status = 'queued'
    GROUP BY camp.name
  `);

  console.log("================================================================================");
  console.log("QUEUE STATUS (Active Campaigns Only)\n");

  if (queueStatus.rows.length === 0) {
    console.log("  ⚠️  No queued contacts in active campaigns\n");
  } else {
    queueStatus.rows.forEach((queue: any) => {
      console.log(`📊 ${queue.campaign_name}:`);
      console.log(`   Ready to call NOW: ${queue.ready_now}`);
      console.log(`   Scheduled for later: ${queue.scheduled_future}`);
      if (queue.next_call_time) {
        console.log(`   Next scheduled call: ${new Date(queue.next_call_time).toLocaleString()}`);
      }
      console.log("");
    });
  }

  // Check if orchestrator is processing
  const recentActivity = await db.execute(sql`
    SELECT
      MAX(updated_at) as last_queue_update,
      MAX(created_at) as last_call_attempt
    FROM (
      SELECT updated_at, NULL as created_at FROM campaign_queue WHERE updated_at > NOW() - INTERVAL '10 minutes'
      UNION ALL
      SELECT NULL as updated_at, created_at FROM call_attempts WHERE created_at > NOW() - INTERVAL '10 minutes'
    ) combined
  `);

  console.log("================================================================================");
  console.log("ORCHESTRATOR STATUS\n");

  const activity = recentActivity.rows[0] as any;
  if (activity.last_queue_update) {
    const minutesAgo = Math.round((Date.now() - new Date(activity.last_queue_update).getTime()) / 1000 / 60);
    console.log(`✅ Queue last updated: ${minutesAgo} minute(s) ago`);
  } else {
    console.log(`⚠️  No queue updates in the last 10 minutes`);
  }

  if (activity.last_call_attempt) {
    const minutesAgo = Math.round((Date.now() - new Date(activity.last_call_attempt).getTime()) / 1000 / 60);
    console.log(`✅ Last call attempt: ${minutesAgo} minute(s) ago`);
  } else {
    console.log(`⚠️  No call attempts in the last 10 minutes`);
  }

  console.log("\n================================================================================");

  process.exit(0);
}

checkCurrentStatus().catch(console.error);