import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnoseCallStartupFailure() {
  console.log("================================================================================");
  console.log("DIAGNOSING CALL STARTUP FAILURES");
  console.log("================================================================================\n");

  // Get the most recent call that never started
  const recentFailedCall = await db.execute(sql`
    SELECT
      ca.id,
      ca.created_at,
      ca.call_started_at,
      ca.telnyx_call_id,
      ca.phone_dialed,
      ca.notes,
      c.id as contact_id,
      c.full_name,
      c.direct_phone_e164,
      c.mobile_phone_e164,
      a.name as account_name,
      camp.id as campaign_id,
      camp.name as campaign_name,
      camp.dial_mode,
      camp.require_account_intelligence,
      va.id as virtual_agent_id,
      va.name as virtual_agent_name
    FROM dialer_call_attempts ca
    LEFT JOIN contacts c ON c.id = ca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = ca.campaign_id
    LEFT JOIN virtual_agents va ON va.id = ca.virtual_agent_id
    WHERE ca.call_started_at IS NULL
      AND ca.telnyx_call_id IS NOT NULL
      AND ca.created_at > NOW() - INTERVAL '6 hours'
    ORDER BY ca.created_at DESC
    LIMIT 1
  `);

  if (recentFailedCall.rows.length === 0) {
    console.log("✅ No recent call startup failures found!\n");
    console.log("All calls that were created have successfully started.\n");
    process.exit(0);
  }

  const call = recentFailedCall.rows[0] as any;

  console.log("❌ FOUND FAILED CALL:\n");
  console.log(`Call Attempt ID: ${call.id}`);
  console.log(`Created: ${new Date(call.created_at).toLocaleString()}`);
  console.log(`Telnyx Call ID: ${call.telnyx_call_id}`);
  console.log(`Phone Dialed: ${call.phone_dialed}`);
  console.log(`\nContact: ${call.full_name} at ${call.account_name}`);
  console.log(`Campaign: ${call.campaign_name}`);
  console.log(`Virtual Agent: ${call.virtual_agent_name || 'N/A'}`);
  console.log(`Intelligence Mode: ${call.require_account_intelligence ? 'Full (with pre-gen)' : 'Basic (no intelligence)'}`);

  if (call.notes) {
    console.log(`\nNotes: ${call.notes}`);
  }

  console.log("\n================================================================================");
  console.log("POSSIBLE CAUSES:\n");

  console.log("1️⃣  TELNYX WEBHOOK NOT REACHING SERVER");
  console.log("   - Telnyx creates the call but webhook doesn't trigger connection");
  console.log("   - Check: Are webhooks configured correctly in Telnyx dashboard?");
  console.log("   - Check: Is webhook URL publicly accessible?");
  console.log("   - Look for: Telnyx webhook delivery failures in their logs\n");

  console.log("2️⃣  OPENAI REALTIME CONNECTION FAILING");
  console.log("   - WebSocket connection to OpenAI Realtime API fails");
  console.log("   - Check: OpenAI API key is valid and has credits");
  console.log("   - Check: Server logs for OpenAI connection errors");
  console.log("   - Look for: 'Failed to connect to OpenAI' or WebSocket errors\n");

  console.log("3️⃣  SYSTEM PROMPT GENERATION FAILING");
  console.log("   - Error occurs before call can start (during prompt building)");
  console.log("   - Check: Are all required fields populated?");
  console.log("   - Look for: 'buildSystemPrompt' errors in server logs");
  console.log("   - Common issue: Missing account/contact data causing crashes\n");

  console.log("4️⃣  TELNYX CALL NEVER CONNECTS TO MEDIA STREAM");
  console.log("   - Call is initiated but media stream never established");
  console.log("   - Check: Telnyx call leg status (should be 'answered')");
  console.log("   - Look for: MediaStream start/connected events in logs\n");

  console.log("5️⃣  INVALID PHONE NUMBER FORMAT");
  console.log("   - Phone number fails validation before connection");
  const phoneToCheck = call.phone_dialed;
  const isValidFormat = phoneToCheck && /^\+\d{10,15}$/.test(phoneToCheck);
  console.log(`   - Phone dialed: ${phoneToCheck}`);
  console.log(`   - Format valid: ${isValidFormat ? '✅ YES' : '❌ NO (must be +E164)'}`);
  if (!isValidFormat) {
    console.log("   - ⚠️  ISSUE FOUND: Invalid phone number format!");
  }
  console.log("");

  console.log("================================================================================");
  console.log("IMMEDIATE ACTIONS:\n");

  console.log("1. CHECK SERVER LOGS for this call attempt:");
  console.log(`   grep "${call.id}" /path/to/server.log`);
  console.log(`   grep "${call.telnyx_call_id}" /path/to/server.log\n`);

  console.log("2. CHECK FOR OPENAI CONNECTION ERRORS:");
  console.log(`   grep "OpenAI" /path/to/server.log | tail -20\n`);

  console.log("3. CHECK FOR TELNYX WEBHOOK ERRORS:");
  console.log(`   grep "TelnyxAiBridge" /path/to/server.log | tail -20\n`);

  console.log("4. VERIFY VIRTUAL AGENT CONFIGURATION:");
  if (call.virtual_agent_id) {
    const agentConfig = await db.execute(sql`
      SELECT
        id,
        name,
        opening_message,
        system_prompt
      FROM virtual_agents
      WHERE id = ${call.virtual_agent_id}
    `);

    if (agentConfig.rows.length > 0) {
      const agent = agentConfig.rows[0] as any;
      console.log(`   Agent Name: ${agent.name}`);
      console.log(`   Has Opening Message: ${agent.opening_message ? '✅ YES' : '❌ NO'}`);
      console.log(`   Has System Prompt: ${agent.system_prompt ? '✅ YES' : '❌ NO'}`);

      if (!agent.opening_message || !agent.system_prompt) {
        console.log(`   ⚠️  Virtual agent configuration incomplete!`);
      }
    } else {
      console.log(`   ❌ Virtual agent not found!`);
    }
  } else {
    console.log(`   ❌ No virtual agent assigned to this call!`);
  }

  console.log("\n5. TEST WITH A MANUAL TEST CALL:");
  console.log(`   Use the campaign test call feature to isolate the issue\n`);

  console.log("================================================================================");
  console.log("DETAILED DIAGNOSIS:\n");

  // Check if there are patterns in failed phone numbers
  const failedByPhone = await db.execute(sql`
    SELECT
      ca.phone_dialed,
      COUNT(*) as failure_count
    FROM dialer_call_attempts ca
    WHERE ca.call_started_at IS NULL
      AND ca.telnyx_call_id IS NOT NULL
      AND ca.created_at > NOW() - INTERVAL '24 hours'
    GROUP BY ca.phone_dialed
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `);

  if (failedByPhone.rows.length > 0) {
    console.log("📊 Phone numbers with multiple failures:\n");
    failedByPhone.rows.forEach((row: any) => {
      console.log(`   ${row.phone_dialed}: ${row.failure_count} failures`);
    });
    console.log("\n   ⚠️  Same numbers failing repeatedly suggests systematic issue\n");
  }

  // Check overall failure rate
  const failureStats = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE call_started_at IS NULL AND telnyx_call_id IS NOT NULL) as never_started,
      COUNT(*) FILTER (WHERE call_started_at IS NOT NULL) as started,
      COUNT(*) as total
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '24 hours'
      AND agent_type = 'ai'
  `);

  if (failureStats.rows.length > 0) {
    const stats = failureStats.rows[0] as any;
    const failureRate = stats.total > 0 ? Math.round((stats.never_started / stats.total) * 100) : 0;

    console.log("📈 24-Hour Failure Statistics:\n");
    console.log(`   Total calls: ${stats.total}`);
    console.log(`   Never started: ${stats.never_started} (${failureRate}%)`);
    console.log(`   Successfully started: ${stats.started} (${100 - failureRate}%)`);

    if (failureRate === 100) {
      console.log("\n   🚨 CRITICAL: 100% failure rate - systematic issue!");
      console.log("      → Check: Is the application server running?");
      console.log("      → Check: Are webhooks reaching the server?");
      console.log("      → Check: Is OpenAI API accessible?");
    } else if (failureRate > 50) {
      console.log("\n   ⚠️  HIGH failure rate - major issue!");
    } else if (failureRate > 10) {
      console.log("\n   ⚠️  Elevated failure rate - investigate common patterns");
    } else {
      console.log("\n   ✅ Low failure rate - isolated incidents");
    }
  }

  console.log("\n================================================================================");

  process.exit(0);
}

diagnoseCallStartupFailure().catch(console.error);