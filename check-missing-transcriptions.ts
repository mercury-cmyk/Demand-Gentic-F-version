/**
 * Check for calls over 30 seconds in last 10 days with missing transcriptions
 */

import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function checkMissingTranscriptions() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found in environment");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    console.log("\n📊 Checking for missing transcriptions...\n");
    
    // Check call_sessions table
    console.log("Checking call_sessions table:");
    const callSessionsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN ai_transcript IS NOT NULL AND length(ai_transcript) >= 20 THEN 1 ELSE 0 END) as with_transcript,
        SUM(CASE WHEN ai_transcript IS NULL OR length(ai_transcript) < 20 THEN 1 ELSE 0 END) as missing_transcript
      FROM call_sessions
      WHERE started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
    `);
    
    const csSession = callSessionsResult.rows[0] as any;
    console.log(`  Total calls (>30s in 10 days): ${csSession.total_calls}`);
    console.log(`  With transcription: ${csSession.with_transcript}`);
    console.log(`  Missing transcription: ${csSession.missing_transcript}`);
    
    // Check dialer_call_attempts table
    console.log("\nChecking dialer_call_attempts table:");
    const dialerResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN (full_transcript IS NOT NULL AND length(full_transcript) >= 20) 
                  OR (ai_transcript IS NOT NULL AND length(ai_transcript) >= 20) THEN 1 ELSE 0 END) as with_transcript,
        SUM(CASE WHEN (full_transcript IS NULL OR length(full_transcript) < 20) 
                  AND (ai_transcript IS NULL OR length(ai_transcript) < 20) THEN 1 ELSE 0 END) as missing_transcript
      FROM dialer_call_attempts
      WHERE call_started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
    `);
    
    const dialerSession = dialerResult.rows[0] as any;
    console.log(`  Total calls (>30s in 10 days): ${dialerSession.total_calls}`);
    console.log(`  With transcription: ${dialerSession.with_transcript}`);
    console.log(`  Missing transcription: ${dialerSession.missing_transcript}`);
    
    // Combined total
    const totalMissing = 
      (parseInt(csSession.missing_transcript) || 0) + 
      (parseInt(dialerSession.missing_transcript) || 0);
    const totalCalls = 
      (parseInt(csSession.total_calls) || 0) + 
      (parseInt(dialerSession.total_calls) || 0);
    
    console.log("\n📈 Summary:");
    console.log(`  Total calls (>30s in last 10 days): ${totalCalls}`);
    console.log(`  Missing transcriptions: ${totalMissing}`);
    console.log(`  Percentage missing: ${((totalMissing / totalCalls) * 100).toFixed(2)}%`);
    
    // Sample of missing transcription calls
    console.log("\nSample of calls missing transcriptions:");
    const sampleResult = await db.execute(sql`
      SELECT 
        'call_sessions' as source,
        id,
        to_number_e164 as phone,
        duration_sec,
        started_at,
        'missing' as transcript_status
      FROM call_sessions
      WHERE started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
        AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
      ORDER BY started_at DESC
      LIMIT 5
    `);
    
    console.log("\nSample data:");
    (sampleResult.rows as any[]).forEach(row => {
      console.log(`  [${row.source}] ${row.phone} - ${row.duration_sec}s - ${new Date(row.started_at).toLocaleString()} - ${row.transcript_status}`);
    });
    
    const sampleResult2 = await db.execute(sql`
      SELECT 
        'dialer_call_attempts' as source,
        id,
        phone_dialed as phone,
        call_duration_seconds as duration_sec,
        call_started_at as started_at,
        'missing' as transcript_status
      FROM dialer_call_attempts
      WHERE call_started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
        AND (full_transcript IS NULL OR length(full_transcript) < 20)
        AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
      ORDER BY call_started_at DESC
      LIMIT 5
    `);
    
    (sampleResult2.rows as any[]).forEach(row => {
      console.log(`  [${row.source}] ${row.phone} - ${row.duration_sec}s - ${new Date(row.started_at).toLocaleString()} - ${row.transcript_status}`);
    });
    
  } catch (error) {
    console.error("❌ Error querying database:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkMissingTranscriptions();
