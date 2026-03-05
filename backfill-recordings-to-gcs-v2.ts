/**
 * Backfill Recordings to GCS
 * 
 * Downloads recordings from Telnyx S3 URLs and stores them in our GCS bucket
 * for permanent storage and faster access.
 * 
 * Usage:
 *   npx tsx backfill-recordings-to-gcs-v2.ts [--dry-run] [--limit=100] [--batch-size=10]
 */

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import { storeCallSessionRecording } from './server/services/recording-storage.js';

interface BackfillStats {
  total: number;
  alreadyStored: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

async function backfillRecordingsToGCS(options: {
  dryRun: boolean;
  limit: number;
  batchSize: number;
  startDate?: string;
}) {
  console.log('========================================');
  console.log('BACKFILL RECORDINGS TO GCS');
  console.log('========================================\n');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Batch Size: ${options.batchSize}`);
  if (options.startDate) {
    console.log(`Start Date: ${options.startDate}`);
  }
  console.log();

  const stats: BackfillStats = {
    total: 0,
    alreadyStored: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  // Count total recordings needing backfill
  const countQuery = `
   SELECT COUNT(*) as count
    FROM call_sessions
    WHERE recording_url IS NOT NULL
      AND recording_url != ''
      ${options.startDate ? `AND created_at >= '${options.startDate}'::timestamp` : ''}
      AND (recording_s3_key IS NULL OR recording_s3_key = '')
      AND (recording_status IS NULL OR recording_status != 'stored')
  `;

  const countResult = await db.execute(sql.raw(countQuery)) as any;
  stats.total = Number(countResult.rows?.[0]?.count) || 0;

  console.log(`\u{1F4CA} Found ${stats.total} call_sessions with Telnyx URLs but no GCS storage\n`);

  if (stats.total === 0) {
    console.log('\u2705 No recordings need backfilling!');
    return stats;
  }

  if (options.dryRun) {
    console.log('\u{1F6D1} DRY RUN - no changes will be made\n');
    
    // Show sample of recordings that would be backfilled
    const sampleQuery = `
      SELECT 
        id,
        recording_url,
        created_at
      FROM call_sessions
      WHERE recording_url IS NOT NULL
        AND recording_url != ''
        ${options.startDate ? `AND created_at >= '${options.startDate}'::timestamp` : ''}
        AND (recording_s3_key IS NULL OR recording_s3_key = '')
        AND (recording_status IS NULL OR recording_status != 'stored')
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    const sampleResult = await db.execute(sql.raw(sampleQuery)) as any;
    console.log('Sample recordings to backfill:');
    sampleResult.rows?.forEach((row: any, idx: number) => {
      console.log(`\n${idx + 1}. Call Session: ${row.id}`);
      console.log(`   URL: ${(row.recording_url || '').substring(0, 80)}...`);
      console.log(`   Date: ${new Date(row.created_at).toISOString()}`);
    });
    
    return stats;
  }

  // Process in batches
  let offset = 0;
  const limit = Math.min(options.limit, stats.total);

  console.log(`\u{1F680} Starting backfill of ${limit} recordings...\n`);

  while (offset < limit) {
    const batchLimit = Math.min(options.batchSize, limit - offset);
    
    const batchQuery = `
      SELECT 
        id,
        recording_url,
        campaign_id,
        created_at
      FROM call_sessions
      WHERE recording_url IS NOT NULL
        AND recording_url != ''
        ${options.startDate ? `AND created_at >= '${options.startDate}'::timestamp` : ''}
        AND (recording_s3_key IS NULL OR recording_s3_key = '')
        AND (recording_status IS NULL OR recording_status != 'stored')
      ORDER BY created_at DESC
      LIMIT ${batchLimit}
      OFFSET ${offset}
    `;

    const batchResult = await db.execute(sql.raw(batchQuery)) as any;
    const recordings = batchResult.rows || [];

    if (recordings.length === 0) {
      break;
    }

    console.log(`\n\u{1F4E6} Batch ${Math.floor(offset / options.batchSize) + 1}: Processing ${recordings.length} recordings...`);

    for (const recording of recordings) {
      stats.attempted++;
      
      const sessionId = recording.id;
      const recordingUrl = recording.recording_url;
      const campaignId = recording.campaign_id;

      try {
        console.log(`  \u{1F504} [${stats.attempted}/${limit}] ${sessionId.substring(0, 8)}... downloading from Telnyx...`);
        
        const result = await storeCallSessionRecording(sessionId, recordingUrl);
        
        if (result) {
          stats.succeeded++;
          console.log(`  \u2705 Stored in GCS: ${result}`);
        } else {
          stats.failed++;
          console.log(`  \u274c Failed - no S3 key returned`);
        }
      } catch (error: any) {
        stats.failed++;
        const errMsg = error.message || String(error);
        
        if (errMsg.includes('403') || errMsg.includes('Forbidden')) {
          console.log(`  \u26a0\ufe0f  Telnyx URL expired (403) - will need phone lookup regeneration`);
          stats.skipped++;
        } else if (errMsg.includes('404')) {
          console.log(`  \u26a0\ufe0f  Recording not found (404)`);
          stats.skipped++;
        } else {
          console.log(`  \u274c Error: ${errMsg.substring(0, 100)}`);
        }
      }

      // Rate limiting: small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    offset += recordings.length;

    console.log(`\n\u{1F4CA} Progress: ${offset}/${limit} (${Math.round(offset / limit * 100)}%)`);
    console.log(`   \u2705 Succeeded: ${stats.succeeded}`);
    console.log(`   \u274c Failed: ${stats.failed}`);
    console.log(`   \u26a0\ufe0f  Skipped (expired URLs): ${stats.skipped}`);

    // Pause between batches to avoid overwhelming the database
    if (offset < limit) {
      console.log(`\n\u23f8\ufe0f  Pausing 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n========================================');
  console.log('BACKFILL COMPLETE');
  console.log('========================================');
  console.log(`Total recordings: ${stats.total}`);
  console.log(`Attempted: ${stats.attempted}`);
  console.log(`Succeeded: ${stats.succeeded}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Skipped (expired URLs): ${stats.skipped}`);
  console.log();

  const successRate = stats.attempted > 0 ? ((stats.succeeded / stats.attempted) * 100).toFixed(1) : '0';
  console.log(`Success rate: ${successRate}%`);

  if (stats.skipped > 0) {
    console.log(`\n\u26a0\ufe0f  ${stats.skipped} recordings have expired Telnyx URLs`);
    console.log('   These need regeneration via Telnyx phone lookup API');
    console.log('   Run: npm run regenerate:missing-transcripts');
  }

  return stats;
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const startDateArg = args.find(arg => arg.startsWith('--start-date='));

const limit = limitArg ? parseInt(limitArg.split('=')[1] || '1000', 10) : 1000;
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1] || '10', 10) : 10;
const startDate = startDateArg ? startDateArg.split('=')[1] : undefined;

backfillRecordingsToGCS({
  dryRun,
  limit,
  batchSize,
  startDate,
}).then(() => {
  console.log('\n\u{1F389} Done!');
  process.exit(0);
}).catch((err) => {
  console.error('\n\u274c Fatal error:', err);
  process.exit(1);
});
