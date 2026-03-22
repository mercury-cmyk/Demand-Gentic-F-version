import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkRecentCallErrors() {
  console.log("================================================================================");
  console.log("RECENT AI CALL ERRORS - " + new Date().toLocaleString());
  console.log("================================================================================\n");

  // Check recent call attempts
  const recentCalls = await db.execute(sql`
    SELECT
      ca.id,
      ca.created_at,
      ca.call_started_at,
      ca.call_ended_at,
      ca.call_duration_seconds,
      ca.disposition,
      ca.notes,
      ca.telnyx_call_id,
      c.full_name as contact_name,
      c.direct_phone_e164,
      c.mobile_phone_e164,
      a.name as account_name,
      camp.name as campaign_name
    FROM dialer_call_attempts ca
    LEFT JOIN contacts c ON c.id = ca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = ca.campaign_id
    WHERE ca.created_at > NOW() - INTERVAL '2 hours'
      AND camp.dial_mode = 'ai_agent'
    ORDER BY ca.created_at DESC
    LIMIT 20
  `);

  console.log(`📞 Recent AI Call Attempts (${recentCalls.rows.length} found):\n`);

  if (recentCalls.rows.length === 0) {
    console.log("  No recent call attempts found in the last 2 hours.");
    console.log("  This could mean:");
    console.log("    1. No contacts are ready to call");
    console.log("    2. Campaign is paused");
    console.log("    3. Orchestrator is not running\n");
  } else {
    recentCalls.rows.forEach((call: any, idx: number) => {
      const createdTime = new Date(call.created_at);
      const minutesAgo = Math.round((Date.now() - createdTime.getTime()) / 1000 / 60);
      const hasError = call.notes && (
        call.notes.toLowerCase().includes('error') ||
        call.notes.toLowerCase().includes('failed') ||
        call.notes.toLowerCase().includes('sorry')
      );

      console.log(`${idx + 1}. ${call.contact_name || 'Unknown'} at ${call.account_name || 'Unknown'}`);
      console.log(`   Campaign: ${call.campaign_name}`);
      console.log(`   Time: ${createdTime.toLocaleString()} (${minutesAgo} min ago)`);
      console.log(`   Phone: ${call.direct_phone_e164 || call.mobile_phone_e164 || 'N/A'}`);
      console.log(`   Disposition: ${call.disposition || 'N/A'}`);

      if (call.call_started_at) {
        console.log(`   Started: ${new Date(call.call_started_at).toLocaleString()}`);
      } else {
        console.log(`   Started: ❌ Call never started`);
      }

      if (call.call_ended_at) {
        console.log(`   Ended: ${new Date(call.call_ended_at).toLocaleString()}`);
        console.log(`   Duration: ${call.call_duration_seconds || 0}s`);
      } else if (call.call_started_at) {
        console.log(`   ⚠️  Call started but not ended yet`);
      }

      if (call.telnyx_call_id) {
        console.log(`   Telnyx Call ID: ${call.telnyx_call_id}`);
      }

      if (call.notes) {
        if (hasError) {
          console.log(`   ❌ NOTES (ERROR DETECTED): ${call.notes}`);
        } else {
          console.log(`   Notes: ${call.notes}`);
        }
      }

      console.log("");
    });

    // Summary of issues
    const errorCalls = recentCalls.rows.filter((call: any) =>
      call.notes && (
        call.notes.toLowerCase().includes('error') ||
        call.notes.toLowerCase().includes('failed') ||
        call.notes.toLowerCase().includes('sorry')
      )
    );

    const noStartCalls = recentCalls.rows.filter((call: any) => !call.call_started_at);

    console.log("================================================================================");
    console.log("SUMMARY\n");
    console.log(`Total calls: ${recentCalls.rows.length}`);
    console.log(`Calls with errors in notes: ${errorCalls.length}`);
    console.log(`Calls that never started: ${noStartCalls.length}`);

    if (errorCalls.length > 0) {
      console.log("\n⚠️  ERROR PATTERNS DETECTED:");
      errorCalls.forEach((call: any) => {
        console.log(`   - ${call.contact_name}: ${call.notes?.substring(0, 100)}`);
      });

      console.log("\n💡 COMMON CAUSES:");
      console.log("   1. System prompt generation error (missing data, timeout)");
      console.log("   2. OpenAI API connection failure");
      console.log("   3. Telnyx webhook/connection issue");
      console.log("   4. Missing required fields in campaign/agent config");
      console.log("   5. Invalid phone number format");
      console.log("\n📋 RECOMMENDED ACTIONS:");
      console.log("   1. Check application server logs for detailed error messages");
      console.log("   2. Verify OpenAI API key is valid and has credits");
      console.log("   3. Test with a manual test call (not campaign call)");
      console.log("   4. Check that virtual agent configuration is complete");
    }

    if (noStartCalls.length > 0) {
      console.log("\n⚠️  CALLS THAT NEVER STARTED:");
      console.log("   These calls were created but never connected");
      console.log("   Check server logs for initialization errors");
    }
  }

  console.log("\n================================================================================");

  process.exit(0);
}

checkRecentCallErrors().catch(console.error);