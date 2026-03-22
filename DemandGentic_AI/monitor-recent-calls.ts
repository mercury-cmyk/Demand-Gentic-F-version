import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function monitorRecentCalls() {
  console.log("=" .repeat(80));
  console.log("MONITORING RECENT AI CAMPAIGN CALLS");
  console.log("=".repeat(80));

  // Get recent call attempts from the last hour
  const recentCalls = await db.execute(sql`
    SELECT
      ca.id,
      ca.created_at,
      ca.status,
      ca.call_duration,
      ca.disposition,
      c.full_name as contact_name,
      a.name as account_name,
      camp.name as campaign_name,
      camp.require_account_intelligence,
      ca.transcript,
      ca.recording_url
    FROM call_attempts ca
    LEFT JOIN contacts c ON c.id = ca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = ca.campaign_id
    WHERE ca.created_at > NOW() - INTERVAL '1 hour'
      AND camp.dial_mode = 'ai_agent'
    ORDER BY ca.created_at DESC
    LIMIT 20
  `);

  console.log(`\n📞 Found ${recentCalls.rows.length} AI agent calls in the last hour\n`);

  if (recentCalls.rows.length === 0) {
    console.log("No recent AI agent calls found.");
    console.log("\nTip: Try checking calls from the last 24 hours:");
    console.log("  Modify the query to use: NOW() - INTERVAL '24 hours'");
  } else {
    recentCalls.rows.forEach((call: any, index: number) => {
      console.log(`${index + 1}. Call ID: ${call.id}`);
      console.log(`   Time: ${new Date(call.created_at).toLocaleString()}`);
      console.log(`   Campaign: ${call.campaign_name}`);
      console.log(`   Intelligence: ${call.require_account_intelligence ? '✅ Full' : '⚡ Basic'}`);
      console.log(`   Contact: ${call.contact_name || 'Unknown'}`);
      console.log(`   Account: ${call.account_name || 'Unknown'}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Duration: ${call.call_duration || 0} seconds`);
      console.log(`   Disposition: ${call.disposition || 'N/A'}`);

      // Check for silent call indicators
      const hasDuration = call.call_duration && call.call_duration > 5;
      const hasTranscript = call.transcript && call.transcript.length > 50;
      const hasRecording = !!call.recording_url;

      if (call.status === 'completed') {
        if (!hasDuration && !hasTranscript) {
          console.log(`   ⚠️  WARNING: Possibly silent call (no duration/transcript)`);
        } else if (hasDuration && hasTranscript) {
          console.log(`   ✅ Call appears successful (${call.call_duration}s with transcript)`);
        }
      }

      console.log("");
    });
  }

  // Get active campaign statistics
  console.log("=".repeat(80));
  console.log("ACTIVE CAMPAIGN STATUS");
  console.log("=".repeat(80));

  const campaignStats = await db.execute(sql`
    SELECT
      c.name,
      c.status,
      c.require_account_intelligence,
      COUNT(ca.id) FILTER (WHERE ca.created_at > NOW() - INTERVAL '1 hour') as calls_last_hour,
      COUNT(ca.id) FILTER (WHERE ca.created_at > NOW() - INTERVAL '24 hours') as calls_last_24h,
      COUNT(ca.id) FILTER (WHERE ca.status = 'completed' AND ca.created_at > NOW() - INTERVAL '24 hours') as completed_24h,
      AVG(ca.call_duration) FILTER (WHERE ca.created_at > NOW() - INTERVAL '24 hours') as avg_duration
    FROM campaigns c
    LEFT JOIN call_attempts ca ON ca.campaign_id = c.id
    WHERE c.dial_mode = 'ai_agent'
      AND c.status = 'active'
    GROUP BY c.id, c.name, c.status, c.require_account_intelligence
    ORDER BY calls_last_hour DESC
  `);

  console.log("");
  if (campaignStats.rows.length === 0) {
    console.log("No active AI agent campaigns found.");
  } else {
    campaignStats.rows.forEach((camp: any) => {
      console.log(`📊 ${camp.name}`);
      console.log(`   Intelligence: ${camp.require_account_intelligence ? '✅ Full' : '⚡ Basic'}`);
      console.log(`   Calls (last hour): ${camp.calls_last_hour}`);
      console.log(`   Calls (last 24h): ${camp.calls_last_24h}`);
      console.log(`   Completed (24h): ${camp.completed_24h}`);
      console.log(`   Avg Duration: ${camp.avg_duration ? Math.round(camp.avg_duration) : 0}s`);
      console.log("");
    });
  }

  // Check for recent errors in campaign queue
  console.log("=".repeat(80));
  console.log("RECENT CAMPAIGN QUEUE ERRORS");
  console.log("=".repeat(80));

  const queueErrors = await db.execute(sql`
    SELECT
      cq.id,
      cq.status,
      cq.error_message,
      cq.last_attempt_at,
      c.full_name as contact_name,
      camp.name as campaign_name
    FROM campaign_queue cq
    LEFT JOIN contacts c ON c.id = cq.contact_id
    LEFT JOIN campaigns camp ON camp.id = cq.campaign_id
    WHERE camp.dial_mode = 'ai_agent'
      AND cq.status = 'failed'
      AND cq.last_attempt_at > NOW() - INTERVAL '1 hour'
    ORDER BY cq.last_attempt_at DESC
    LIMIT 10
  `);

  console.log("");
  if (queueErrors.rows.length === 0) {
    console.log("✅ No recent errors in campaign queue");
  } else {
    console.log(`⚠️  Found ${queueErrors.rows.length} failed queue items:\n`);
    queueErrors.rows.forEach((error: any, index: number) => {
      console.log(`${index + 1}. Campaign: ${error.campaign_name}`);
      console.log(`   Contact: ${error.contact_name}`);
      console.log(`   Time: ${new Date(error.last_attempt_at).toLocaleString()}`);
      console.log(`   Error: ${error.error_message || 'Unknown error'}`);
      console.log("");
    });
  }

  console.log("=".repeat(80));
  console.log("MONITORING COMPLETE");
  console.log("=".repeat(80));
  console.log("\nTips:");
  console.log("  - Check if calls have duration > 5s and transcript");
  console.log("  - Silent calls typically have no transcript or very short duration");
  console.log("  - Basic intelligence mode should work immediately");
  console.log("  - Full intelligence mode needs pre-generated data to avoid delays");
  console.log("\nTo fix silent calls:");
  console.log("  1. Restart application server to load new code");
  console.log("  2. Or set require_account_intelligence = false for immediate results");

  process.exit(0);
}

monitorRecentCalls().catch((error) => {
  console.error("Error monitoring calls:", error);
  process.exit(1);
});