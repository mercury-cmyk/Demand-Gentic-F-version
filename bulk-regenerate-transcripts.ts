/**
 * Bulk regenerate transcripts for missing transcriptions using Telnyx phone lookup
 * This will search Telnyx for fresh recordings and regenerate transcripts
 */

import "./server/env.ts";
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';

neonConfig.webSocketConstructor = ws;

// Types for API responses
interface RegenerateResult {
  success: boolean;
  data?: {
    queued: number;
    succeeded: number;
    failed: number;
    errors: string[];
  };
  error?: string;
}

async function bulkRegenerateMissingTranscripts() {
  const databaseUrl = process.env.DATABASE_URL;
  let baseUrl = process.env.PUBLIC_WEBHOOK_HOST || 'http://localhost:8080';
  const adminToken = process.env.ADMIN_API_TOKEN;

  // Ensure baseUrl has a proper protocol
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found in environment");
    process.exit(1);
  }

  console.log(`\n🚀 Starting bulk transcription regeneration`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   API Endpoint: ${baseUrl}/api/call-intelligence/transcription-gaps/regenerate`);
  console.log(`   Using strategy: telnyx_phone_lookup\n`);

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // Get all missing transcription call IDs
    console.log(`📥 Fetching all missing transcriptions...`);

    const callSessionsResult = await db.execute(sql`
      SELECT id
      FROM call_sessions
      WHERE started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(duration_sec, 0) > 30
        AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
      ORDER BY started_at DESC
    `);

    const dialerResult = await db.execute(sql`
      SELECT id
      FROM dialer_call_attempts
      WHERE call_started_at >= NOW() - INTERVAL '10 days'
        AND COALESCE(call_duration_seconds, 0) > 30
        AND (full_transcript IS NULL OR length(full_transcript) < 20)
        AND (ai_transcript IS NULL OR length(ai_transcript) < 20)
      ORDER BY call_started_at DESC
    `);

    const allCallIds = [
      ...(callSessionsResult.rows as any[]).map(r => r.id),
      ...(dialerResult.rows as any[]).map(r => r.id),
    ];

    console.log(`✅ Found ${allCallIds.length} calls with missing transcriptions`);
    console.log(`   - call_sessions: ${(callSessionsResult.rows as any[]).length}`);
    console.log(`   - dialer_call_attempts: ${(dialerResult.rows as any[]).length}\n`);

    // Batch process in groups of 50
    const batchSize = 50;
    const totalBatches = Math.ceil(allCallIds.length / batchSize);
    let totalQueued = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    console.log(`📦 Processing in ${totalBatches} batches of ${batchSize}...\n`);

    for (let i = 0; i < allCallIds.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = allCallIds.slice(i, i + batchSize);

      console.log(`\n[${batchNumber}/${totalBatches}] Processing ${batch.length} calls...`);
      console.log(`   IDs: ${batch.slice(0, 3).join(', ')}${batch.length > 3 ? '...' : ''}`);

      try {
        const url = `${baseUrl}/api/call-intelligence/transcription-gaps/regenerate`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(adminToken && { 'Authorization': `Bearer ${adminToken}` }),
          },
          body: JSON.stringify({
            callIds: batch,
            strategy: 'telnyx_phone_lookup',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = (await response.json()) as RegenerateResult;

        if (result.success && result.data) {
          totalQueued += result.data.queued;
          totalSucceeded += result.data.succeeded;
          totalFailed += result.data.failed;

          console.log(`   ✅ Queued: ${result.data.queued}, Succeeded: ${result.data.succeeded}, Failed: ${result.data.failed}`);

          if (result.data.errors && result.data.errors.length > 0) {
            allErrors.push(...result.data.errors);
            console.log(`   ⚠️  Errors: ${result.data.errors.length}`);
            result.data.errors.slice(0, 3).forEach(err => console.log(`      - ${err}`));
            if (result.data.errors.length > 3) {
              console.log(`      ... and ${result.data.errors.length - 3} more`);
            }
          }
        } else {
          throw new Error(result.error || 'Unknown error');
        }

        // Small delay between batches to avoid overwhelming the system
        if (batchNumber < totalBatches) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        console.error(`   ❌ Batch failed: ${err.message || err}`);
        totalFailed += batch.length;
      }
    }

    // Summary report
    console.log(`\n\n${'='.repeat(60)}`);
    console.log(`📊 REGENERATION COMPLETE`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Calls Processed: ${allCallIds.length}`);
    console.log(`Total Queued:         ${totalQueued}`);
    console.log(`Total Succeeded:      ${totalSucceeded}`);
    console.log(`Total Failed:         ${totalFailed}`);
    console.log(`Success Rate:         ${((totalSucceeded / totalQueued) * 100).toFixed(2)}%`);

    if (allErrors.length > 0) {
      console.log(`\n⚠️  Top errors encountered:`);
      const uniqueErrors = [...new Set(allErrors)];
      uniqueErrors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
      if (uniqueErrors.length > 10) {
        console.log(`   ... and ${uniqueErrors.length - 10} more unique errors`);
      }
    }

    console.log(`\n✨ Regeneration job submitted successfully!`);
    console.log(`   Transcription processing is now in progress in the background.`);

  } catch (error) {
    console.error("\n❌ Error during bulk regeneration:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

bulkRegenerateMissingTranscripts();
