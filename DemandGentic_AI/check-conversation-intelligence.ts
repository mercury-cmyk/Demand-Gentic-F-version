import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkConversationIntelligence() {
  console.log("================================================================================");
  console.log("CONVERSATION INTELLIGENCE STATUS CHECK");
  console.log("================================================================================\n");

  // Check recent call sessions
  const recentSessions = await db.execute(sql`
    SELECT
      cs.id,
      cs.created_at,
      cs.duration_sec,
      cs.ai_disposition,
      cs.agent_type,
      LENGTH(cs.ai_transcript) as transcript_length,
      cs.ai_analysis->>'summary' as summary,
      cs.ai_analysis->>'sentiment' as sentiment,
      c.full_name as contact_name,
      a.name as account_name,
      camp.name as campaign_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    WHERE cs.agent_type = 'ai'
    ORDER BY cs.created_at DESC
    LIMIT 10
  `);

  console.log(`📊 Recent AI Call Sessions (${recentSessions.rows.length} shown):\n`);

  if (recentSessions.rows.length === 0) {
    console.log("  ⚠️  No call sessions found yet");
    console.log("  This is expected if no calls have been made since deployment\n");
  } else {
    recentSessions.rows.forEach((session: any, idx: number) => {
      const date = new Date(session.created_at);
      const hasTranscript = session.transcript_length > 0;
      const hasSummary = session.summary != null;

      console.log(`${idx + 1}. ${session.contact_name || 'Unknown'} at ${session.account_name || 'Unknown'}`);
      console.log(`   Campaign: ${session.campaign_name || 'N/A'}`);
      console.log(`   Time: ${date.toLocaleString()}`);
      console.log(`   Duration: ${session.duration_sec || 0}s`);
      console.log(`   Disposition: ${session.ai_disposition || 'N/A'}`);
      console.log(`   Transcript: ${hasTranscript ? `✅ ${session.transcript_length} chars` : '❌ None'}`);
      console.log(`   Summary: ${hasSummary ? `✅ ${session.summary?.substring(0, 60)}...` : '❌ None'}`);
      console.log(`   Sentiment: ${session.sentiment || 'N/A'}`);
      console.log("");
    });
  }

  // Check call producer tracking records
  console.log("================================================================================");
  console.log("CALL PRODUCER TRACKING (Quality Scores)\n");

  const producerTracking = await db.execute(sql`
    SELECT
      cpt.id,
      cpt.created_at,
      cpt.quality_score,
      cpt.producer_type,
      cpt.handoff_stage,
      c.full_name as contact_name,
      camp.name as campaign_name,
      cs.duration_sec
    FROM call_producer_tracking cpt
    LEFT JOIN call_sessions cs ON cs.id = cpt.call_session_id
    LEFT JOIN contacts c ON c.id = cpt.contact_id
    LEFT JOIN campaigns camp ON camp.id = cpt.campaign_id
    WHERE cpt.producer_type = 'ai'
    ORDER BY cpt.created_at DESC
    LIMIT 10
  `);

  console.log(`📈 Recent Producer Tracking Records (${producerTracking.rows.length} shown):\n`);

  if (producerTracking.rows.length === 0) {
    console.log("  ⚠️  No producer tracking records found yet");
    console.log("  This is expected if no calls have been made since deployment\n");
  } else {
    producerTracking.rows.forEach((record: any, idx: number) => {
      const date = new Date(record.created_at);
      const score = record.quality_score ? parseFloat(record.quality_score) : null;

      console.log(`${idx + 1}. ${record.contact_name || 'Unknown'} - ${record.campaign_name || 'N/A'}`);
      console.log(`   Time: ${date.toLocaleString()}`);
      console.log(`   Quality Score: ${score !== null ? `${score}/100` : 'N/A'}`);
      console.log(`   Duration: ${record.duration_sec || 0}s`);
      console.log(`   Stage: ${record.handoff_stage || 'N/A'}`);
      console.log("");
    });

    // Calculate average quality score
    const scores = producerTracking.rows
      .map((r: any) => r.quality_score ? parseFloat(r.quality_score) : null)
      .filter((s: number | null) => s !== null);

    if (scores.length > 0) {
      const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      console.log(`📊 Average Quality Score: ${avgScore.toFixed(1)}/100\n`);
    }
  }

  // Check call attempts with session links
  console.log("================================================================================");
  console.log("CALL ATTEMPTS WITH SESSION LINKS\n");

  const callAttempts = await db.execute(sql`
    SELECT
      ca.id,
      ca.created_at,
      ca.disposition,
      ca.call_duration_seconds,
      ca.call_session_id,
      c.full_name as contact_name,
      camp.name as campaign_name
    FROM dialer_call_attempts ca
    LEFT JOIN contacts c ON c.id = ca.contact_id
    LEFT JOIN campaigns camp ON camp.id = ca.campaign_id
    WHERE ca.agent_type = 'ai'
      AND ca.created_at > NOW() - INTERVAL '1 day'
    ORDER BY ca.created_at DESC
    LIMIT 10
  `);

  console.log(`📞 Recent AI Call Attempts (${callAttempts.rows.length} shown):\n`);

  let withSession = 0;
  let withoutSession = 0;

  callAttempts.rows.forEach((attempt: any, idx: number) => {
    const hasSession = attempt.call_session_id != null;
    if (hasSession) withSession++;
    else withoutSession++;

    console.log(`${idx + 1}. ${attempt.contact_name || 'Unknown'} - ${attempt.campaign_name || 'N/A'}`);
    console.log(`   Disposition: ${attempt.disposition || 'N/A'}`);
    console.log(`   Duration: ${attempt.call_duration_seconds || 0}s`);
    console.log(`   Session Link: ${hasSession ? `✅ ${attempt.call_session_id}` : '❌ None'}`);
    console.log("");
  });

  if (callAttempts.rows.length > 0) {
    console.log(`📊 Session Link Status:`);
    console.log(`   With session link: ${withSession} (${Math.round(withSession / callAttempts.rows.length * 100)}%)`);
    console.log(`   Without session link: ${withoutSession} (${Math.round(withoutSession / callAttempts.rows.length * 100)}%)\n`);
  }

  // Overall summary
  console.log("================================================================================");
  console.log("SUMMARY\n");

  if (recentSessions.rows.length === 0 && producerTracking.rows.length === 0) {
    console.log("⚠️  No conversation intelligence data found yet");
    console.log("   This is expected if:");
    console.log("   1. No AI calls have been made since the deployment");
    console.log("   2. The application hasn't been restarted with the new code");
    console.log("");
    console.log("💡 Next Steps:");
    console.log("   1. Deploy the updated code");
    console.log("   2. Restart the application");
    console.log("   3. Wait for AI calls to be made");
    console.log("   4. Re-run this script to verify data collection");
  } else {
    console.log("✅ Conversation intelligence is working!");
    console.log(`   - ${recentSessions.rows.length} call sessions captured`);
    console.log(`   - ${producerTracking.rows.length} quality tracking records created`);
    console.log(`   - ${withSession} call attempts linked to sessions`);
    console.log("");

    const withTranscripts = recentSessions.rows.filter((s: any) => s.transcript_length > 0).length;
    const transcriptRate = recentSessions.rows.length > 0
      ? Math.round(withTranscripts / recentSessions.rows.length * 100)
      : 0;

    console.log(`📊 Data Quality:`);
    console.log(`   - Transcript capture rate: ${transcriptRate}%`);
    console.log(`   - Quality scores: ${producerTracking.rows.filter((r: any) => r.quality_score).length} calls scored`);

    if (transcriptRate < 100) {
      console.log("");
      console.log("⚠️  Some calls missing transcripts - this could be due to:");
      console.log("   1. Very short calls (hung up immediately)");
      console.log("   2. PII logging restrictions");
      console.log("   3. Calls that failed before conversation started");
    }
  }

  console.log("\n================================================================================");

  process.exit(0);
}

checkConversationIntelligence().catch(console.error);