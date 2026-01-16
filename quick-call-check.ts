import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function quickCheck() {
  console.log("Checking recent AI campaign calls...\n");

  const calls = await db.execute(sql`
    SELECT
      ca.id,
      ca.created_at,
      ca.disposition,
      ca.duration,
      ca.recording_url,
      c.full_name,
      a.name as account_name,
      camp.name as campaign_name,
      camp.require_account_intelligence
    FROM call_attempts ca
    LEFT JOIN contacts c ON c.id = ca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = ca.campaign_id
    WHERE ca.created_at > NOW() - INTERVAL '3 hours'
      AND camp.dial_mode = 'ai_agent'
    ORDER BY ca.created_at DESC
    LIMIT 20
  `);

  if (calls.rows.length === 0) {
    console.log("❌ No AI campaign calls found in the last 3 hours\n");
    console.log("This could mean:");
    console.log("  1. No campaigns are currently running");
    console.log("  2. Campaigns are paused");
    console.log("  3. There are no contacts in the queue");
    console.log("\nCheck active campaigns:");

    const activeCampaigns = await db.execute(sql`
      SELECT name, status, require_account_intelligence
      FROM campaigns
      WHERE dial_mode = 'ai_agent'
        AND status = 'active'
    `);

    if (activeCampaigns.rows.length > 0) {
      console.log("\nActive AI campaigns:");
      activeCampaigns.rows.forEach((c: any) => {
        console.log(`  - ${c.name} (intelligence: ${c.require_account_intelligence ? 'enabled' : 'disabled'})`);
      });
    } else {
      console.log("\n⚠️  No active AI campaigns found");
    }
  } else {
    console.log(`Found ${calls.rows.length} recent AI calls:\n`);
    console.log("=".repeat(100));

    calls.rows.forEach((call: any, index: number) => {
      const time = new Date(call.created_at).toLocaleTimeString();
      const intelligenceMode = call.require_account_intelligence ? '✅ Full' : '⚡ Basic';
      const duration = call.duration || 0;
      const hasRecording = !!call.recording_url;

      console.log(`\n${index + 1}. ${time} | ${call.campaign_name}`);
      console.log(`   Contact: ${call.full_name || 'Unknown'} at ${call.account_name || 'Unknown'}`);
      console.log(`   Intelligence Mode: ${intelligenceMode}`);
      console.log(`   Disposition: ${call.disposition || 'N/A'}`);
      console.log(`   Duration: ${duration}s`);
      console.log(`   Recording: ${hasRecording ? '✅ Yes' : '❌ No'}`);

      // Analyze call quality
      if (duration === 0 || duration < 5) {
        console.log(`   🚨 ALERT: Very short/no duration - possible silent call or connection issue`);
      } else if (duration > 10) {
        console.log(`   ✅ Good: Call lasted ${duration}s`);
      }
    });

    console.log("\n" + "=".repeat(100));

    // Summary statistics
    const avgDuration = calls.rows.reduce((sum: number, call: any) => sum + (call.duration || 0), 0) / calls.rows.length;
    const shortCalls = calls.rows.filter((call: any) => (call.duration || 0) < 5).length;
    const withRecording = calls.rows.filter((call: any) => call.recording_url).length;

    console.log("\n📊 Summary:");
    console.log(`   Total Calls: ${calls.rows.length}`);
    console.log(`   Average Duration: ${Math.round(avgDuration)}s`);
    console.log(`   Short Calls (<5s): ${shortCalls} ${shortCalls > calls.rows.length / 2 ? '🚨' : ''}`);
    console.log(`   With Recording: ${withRecording}`);

    if (shortCalls > calls.rows.length / 2) {
      console.log("\n🚨 WARNING: More than half of calls are very short!");
      console.log("   This suggests:");
      console.log("   1. Application server may not have latest code (needs restart)");
      console.log("   2. Intelligence generation causing delays (disable it)");
      console.log("   3. Connection issues with voice provider");
    }
  }

  process.exit(0);
}

quickCheck().catch(console.error);
