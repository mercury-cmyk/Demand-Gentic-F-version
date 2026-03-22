/**
 * Ultra-simple transcription regeneration tracker
 * Reports what needs to be regenerated and submits it using the existing API structure
 */

import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  console.log('\n🎯 Transcription Regeneration Report\n');

  try {
    // Get missing transcriptions summary
    const summary = await pool.query(`
      SELECT
        'call_sessions' as source,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE recording_url IS NOT NULL OR recording_s3_key IS NOT NULL) as has_recording
      FROM call_sessions
      WHERE started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
        AND (ai_transcript IS NULL OR length(ai_transcript) = NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
        AND (full_transcript IS NULL OR length(full_transcript) = NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
        AND (ai_transcript IS NULL OR length(ai_transcript) = NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
        AND recording_url IS NOT NULL
        AND (full_transcript IS NULL OR length(full_transcript) < 20)
        AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
      ON CONFLICT (call_id, source) DO NOTHING
      RETURNING call_id
    `);

    const queued = (csInsert.rows.length + daInsert.rows.length);
    console.log(`✅ Queued ${queued} calls in transcription_regeneration_jobs table\n`);

    console.log('🚀 Next Steps:');
    console.log('─'.repeat(50));
    console.log('Run POST /api/call-intelligence/transcription-gaps/regenerate with:');
    console.log('  {');
    console.log('    "callIds": [ /* job.call_id values */ ],');
    console.log('    "strategy": "telnyx_phone_lookup"');
    console.log('  }');
    console.log('\nOr use the curl command below:\n');
    
    // Get first batch of IDs
    const firstBatch = await pool.query(`
      SELECT array_agg(call_id) as ids
      FROM transcription_regeneration_jobs
      WHERE status = 'pending'
      LIMIT 50
    `);
    
    const ids = (firstBatch.rows[0] as any).ids || [];
    console.log(`curl -X POST https://demandgentic.ai/api/call-intelligence/transcription-gaps/regenerate \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '${JSON.stringify({ callIds: ids, strategy: 'telnyx_phone_lookup' }, null, 2)}'`);
    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();