/**
 * Queue missing transcriptions for regeneration
 * Creates job records that the transcription worker will pick up
 */

import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function queueMissingTranscriptions() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  console.log(`\n🚀 Queuing ${4270} missing transcriptions for regeneration...\n`);

  try {
    // Create transcription jobs table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcription_jobs (
        id SERIAL PRIMARY KEY,
        call_id VARCHAR(255) NOT NULL,
        source TEXT NOT NULL,
        strategy TEXT NOT NULL DEFAULT 'telnyx_phone_lookup',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        error TEXT,
        UNIQUE(call_id, source)
      );
      CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status 
        ON transcription_jobs(status, created_at);
    `);

    // Insert missing transcriptions from call_sessions
    const cs = await pool.query(`
      INSERT INTO transcription_jobs (call_id, source, strategy)
      SELECT 
        cs.id,
        'call_sessions',
        'telnyx_phone_lookup'
      FROM call_sessions cs
      WHERE cs.started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(cs.duration_sec, 0) > 30
        AND (cs.ai_transcript IS NULL OR length(cs.ai_transcript) < 20)
      ON CONFLICT DO NOTHING
    `);

    // Insert missing transcriptions from dialer_call_attempts
    const da = await pool.query(`
      INSERT INTO transcription_jobs (call_id, source, strategy)
      SELECT 
        dca.id,
        'dialer_call_attempts',
        'telnyx_phone_lookup'
      FROM dialer_call_attempts dca
      WHERE dca.call_started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(dca.call_duration_seconds, 0) > 30
        AND (dca.full_transcript IS NULL OR length(dca.full_transcript) < 20)
        AND (dca.ai_transcript IS NULL OR length(dca.ai_transcript) < 20)
      ON CONFLICT DO NOTHING
    `);

    // Get total queued
    const result = (await pool.query(
      `SELECT COUNT(*) as pending FROM transcription_jobs WHERE status = 'pending'`
    )).rows[0] as any;

    console.log(`✅ Queued ${result.pending} missing calls for transcription`);
    console.log(`   - Source: Telnyx phone number lookup`);
    console.log(`   - Strategy: Fresh recording discovery\n`);
    
    console.log(`Status: Regeneration jobs queued and ready for processing`);
    console.log(`Monitor progress: SELECT COUNT(*) WHERE status = 'completed' FROM transcription_jobs\n`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

queueMissingTranscriptions();
