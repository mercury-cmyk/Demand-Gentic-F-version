/**
 * Backfill Recordings to GCS
 *
 * Attempts to download recordings to GCS for leads that don't have them stored.
 * Works best for recent calls where Telnyx URLs haven't expired yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-recordings-to-gcs.ts [--dry-run] [--hours=24]
 */

import { db } from '../server/db';
import { leads, dialerCallAttempts } from '../shared/schema';
import { eq, sql, isNull, and, gte } from 'drizzle-orm';
import { downloadAndStoreRecording, isRecordingStorageEnabled } from '../server/services/recording-storage';
import axios from 'axios';

const DRY_RUN = process.argv.includes('--dry-run');
const hoursArg = process.argv.find(arg => arg.startsWith('--hours='));
const HOURS_BACK = hoursArg ? parseInt(hoursArg.split('=')[1]) : 24;

async function fetchFreshTelnyxUrl(telnyxCallId: string): Promise<string | null> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey || !telnyxCallId) return null;

  try {
    const response = await axios.get(
      `https://api.telnyx.com/v2/recordings?filter[call_control_id]=${telnyxCallId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    );

    if (response.data?.data?.length > 0) {
      const recording = response.data.data[0];
      return recording.download_urls?.mp3 || recording.download_urls?.wav || null;
    }
  } catch (error: any) {
    if (error.response?.status !== 422) {
      console.log(`    Telnyx API error: ${error.message}`);
    }
  }
  return null;
}

async function backfillRecordings() {
  console.log('\n========================================');
  console.log('  BACKFILL RECORDINGS TO GCS');
  console.log(DRY_RUN ? '  (DRY RUN - no changes will be made)' : '');
  console.log(`  Looking back ${HOURS_BACK} hours`);
  console.log('========================================\n');

  if (!isRecordingStorageEnabled()) {
    console.log('ERROR: GCS storage is not configured.');
    console.log('Please set GCS_BUCKET and ensure GCS credentials are available.');
    process.exit(1);
  }

  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - HOURS_BACK);

  // Find leads with recording_url but no recording_s3_key
  const leadsToProcess = await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      recordingUrl: leads.recordingUrl,
      recordingS3Key: leads.recordingS3Key,
      callAttemptId: leads.callAttemptId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.recordingS3Key),
        gte(leads.createdAt, cutoffDate)
      )
    )
    .orderBy(sql`${leads.createdAt} DESC`)
    .limit(100);

  console.log(`Found ${leadsToProcess.length} leads without GCS recordings (last ${HOURS_BACK} hours)\n`);

  if (leadsToProcess.length === 0) {
    console.log('No leads need backfilling.');
    return;
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const lead of leadsToProcess) {
    console.log(`Processing: ${lead.contactName || 'Unknown'}`);
    console.log(`  Lead ID: ${lead.id}`);
    console.log(`  Created: ${lead.createdAt}`);

    // Get telnyx_call_id from the call attempt
    let telnyxCallId: string | null = null;
    if (lead.callAttemptId) {
      const [attempt] = await db
        .select({ telnyxCallId: dialerCallAttempts.telnyxCallId })
        .from(dialerCallAttempts)
        .where(eq(dialerCallAttempts.id, lead.callAttemptId))
        .limit(1);
      telnyxCallId = attempt?.telnyxCallId || null;
    }

    // Try different strategies to get recording
    let recordingUrl = lead.recordingUrl;
    let urlSource = 'existing';

    // Strategy 1: Try existing URL first (might still be valid for recent calls)
    if (recordingUrl) {
      console.log(`  Strategy 1: Trying existing URL...`);
      try {
        const testResponse = await fetch(recordingUrl, { method: 'HEAD' });
        if (!testResponse.ok) {
          console.log(`    Existing URL expired (${testResponse.status})`);
          recordingUrl = null;
        } else {
          console.log(`    Existing URL still valid!`);
        }
      } catch (error) {
        console.log(`    Existing URL failed: ${error}`);
        recordingUrl = null;
      }
    }

    // Strategy 2: Fetch fresh URL from Telnyx API
    if (!recordingUrl && telnyxCallId) {
      console.log(`  Strategy 2: Fetching fresh URL from Telnyx (call_id: ${telnyxCallId})...`);
      const freshUrl = await fetchFreshTelnyxUrl(telnyxCallId);
      if (freshUrl) {
        recordingUrl = freshUrl;
        urlSource = 'telnyx_api';
        console.log(`    Got fresh URL from Telnyx!`);
      } else {
        console.log(`    No recording found in Telnyx API (may be expired)`);
      }
    }

    if (!recordingUrl) {
      console.log(`  SKIP: No valid recording URL available\n`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would download from ${urlSource}\n`);
      success++;
      continue;
    }

    // Download and store in GCS
    console.log(`  Downloading to GCS (source: ${urlSource})...`);
    try {
      const s3Key = await downloadAndStoreRecording(recordingUrl, lead.id);

      if (s3Key) {
        await db.update(leads)
          .set({
            recordingS3Key: s3Key,
            recordingUrl: recordingUrl, // Update with fresh URL if we got one
            updatedAt: new Date()
          })
          .where(eq(leads.id, lead.id));
        console.log(`  ✅ Stored: ${s3Key}\n`);
        success++;
      } else {
        console.log(`  ❌ Download failed\n`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}\n`);
      failed++;
    }
  }

  console.log('========================================');
  console.log('  RESULTS');
  console.log('========================================');
  console.log(`  Success: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped (no URL): ${skipped}`);

  if (DRY_RUN) {
    console.log('\n  To actually process, run without --dry-run');
  }
}

backfillRecordings()
  .then(() => {
    console.log('\nBackfill complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
