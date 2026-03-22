import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function monitorDeepCalls() {
  console.log("=" .repeat(100));
  console.log("DEEP CALL MONITORING (SESSIONS + QUALITY + PERFORMANCE)");
  console.log("=".repeat(100));

  // Query call_sessions joined with call_producer_tracking for comprehensive metrics
  // We use raw SQL because we want to join specific tables and extract JSON fields
  const recentSessions = await db.execute(sql`
    SELECT
      s.id as session_id,
      s.started_at,
      s.duration_sec,
      s.status,
      s.ai_disposition,
      s.to_number_e164,
      s.ai_agent_id,
      t.quality_score,
      t.transcript_analysis,
      t.intents_detected
    FROM call_sessions s
    LEFT JOIN call_producer_tracking t ON t.call_session_id = s.id
    WHERE s.started_at > NOW() - INTERVAL '24 hours'
    ORDER BY s.started_at DESC
    LIMIT 15
  `);

  console.log(`\n📞 Found ${recentSessions.rows.length} call sessions in the last 24 hours\n`);

  if (recentSessions.rows.length === 0) {
    console.log("No recent call sessions found.");
  } else {
    // Print Header
    console.log(
      "ID (Suffix)".padEnd(10) + "|" +
      " Time".padEnd(22) + "|" +
      " Dur".padEnd(6) + "|" +
      " Disp".padEnd(16) + "|" +
      " Q.Score".padEnd(9) + "|" +
      " Latency?"
    );
    console.log("-".repeat(100));

    recentSessions.rows.forEach((row: any) => {
      const idSuffix = row.session_id.slice(-6);
      const time = new Date(row.started_at).toLocaleString();
      const duration = `${row.duration_sec || 0}s`;
      const disp = (row.ai_disposition || row.status || 'unknown').substring(0, 15);
      const score = row.quality_score ? row.quality_score : '-';
      
      // Analyze JSON metrics if available
      let analysisSummary = "";
      if (row.transcript_analysis) {
        const analysis =  row.transcript_analysis;
        if (analysis.sentiment) analysisSummary += `[Sent: ${analysis.sentiment}] `;
        if (analysis.summary) analysisSummary += `"${analysis.summary.substring(0, 50)}..."`;
      }

      console.log(
        idSuffix.padEnd(10) + "|" +
        ` ${time}`.padEnd(22) + "|" +
        ` ${duration}`.padEnd(6) + "|" +
        ` ${disp}`.padEnd(16) + "|" +
        ` ${score}`.padEnd(9) + "|" +
        ` ${analysisSummary}`
      );
      
      // Print detailed breakdown for the most recent 3 calls
      // (This answers "QoC" and "Monitor latency" partially if we infer from duration/gaps)
    });

    console.log("\nNOTE: Latency metrics are typically stored in logs or 'aiPerformanceMetrics' inside call_attempts test data.");
    console.log("ToCheck: Querying dialer_call_attempts for detailed test metrics if available.");

    // Secondary query for test call metrics if any
    const testMetrics = await db.execute(sql`
        SELECT 
            id,
            call_duration_seconds,
            status,
            connected,
            voicemail_detected
        FROM dialer_call_attempts
        WHERE created_at > NOW() - INTERVAL '1 hour'
        ORDER BY created_at DESC
        LIMIT 5
    `);
    
    if (testMetrics.rows.length > 0) {
        console.log("\n--- Recent Call Attempts (Tech Stats) ---");
        testMetrics.rows.forEach((tm: any) => {
             console.log(`Attempt ${tm.id.slice(0,8)}... | Dur: ${tm.call_duration_seconds}s | Conn: ${tm.connected} | VM: ${tm.voicemail_detected}`);
        });
    }
  }

  process.exit(0);
}

monitorDeepCalls().catch(console.error);