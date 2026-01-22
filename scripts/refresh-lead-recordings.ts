/**
 * Refresh Lead Recordings
 * Fetches fresh recording URLs from Telnyx API and optionally downloads to S3
 */

import { db } from '../server/db';
import { sql, eq } from 'drizzle-orm';
import { leads } from '../shared/schema';
import { fetchTelnyxRecording } from '../server/services/telnyx-recordings';
import { downloadAndStoreRecording } from '../server/services/recording-storage';

const DRY_RUN = process.argv.includes('--dry-run');
const DOWNLOAD_TO_S3 = process.argv.includes('--download');

async function refreshRecordings() {
  console.log('\n========================================');
  console.log('  REFRESH LEAD RECORDINGS');
  console.log(DRY_RUN ? '  (DRY RUN - no changes will be made)' : '');
  console.log(DOWNLOAD_TO_S3 ? '  (Will download to S3)' : '  (URL refresh only)');
  console.log('========================================\n');

  // Get leads with call attempts that have telnyx_call_id
  const leadsToRefresh = await db.execute(sql`
    SELECT
      l.id as lead_id,
      l.contact_name,
      l.recording_url,
      l.recording_s3_key,
      dca.telnyx_call_id
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.recording_s3_key IS NULL
      AND dca.telnyx_call_id IS NOT NULL
    ORDER BY l.created_at DESC
    LIMIT 20
  `);

  const rows = leadsToRefresh.rows as Array<{
    lead_id: string;
    contact_name: string;
    recording_url: string | null;
    recording_s3_key: string | null;
    telnyx_call_id: string;
  }>;

  console.log(`Found ${rows.length} leads that need recording refresh\n`);

  if (rows.length === 0) {
    console.log('No leads need recording refresh.');
    return;
  }

  let refreshed = 0;
  let downloaded = 0;
  let failed = 0;

  for (const row of rows) {
    console.log(`Processing: ${row.contact_name}`);
    console.log(`  Lead ID: ${row.lead_id}`);
    console.log(`  Telnyx Call ID: ${row.telnyx_call_id}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would fetch recording from Telnyx\n`);
      refreshed++;
      continue;
    }

    try {
      // Fetch fresh recording URL from Telnyx
      const freshUrl = await fetchTelnyxRecording(row.telnyx_call_id);

      if (freshUrl) {
        console.log(`  ✅ Got fresh recording URL`);

        // Update the lead with fresh URL
        await db.update(leads)
          .set({
            recordingUrl: freshUrl,
            updatedAt: new Date()
          })
          .where(eq(leads.id, row.lead_id));

        refreshed++;

        // Optionally download to S3
        if (DOWNLOAD_TO_S3) {
          console.log(`  📥 Downloading to S3...`);
          const s3Key = await downloadAndStoreRecording(freshUrl, row.lead_id);

          if (s3Key) {
            await db.update(leads)
              .set({
                recordingS3Key: s3Key,
                updatedAt: new Date()
              })
              .where(eq(leads.id, row.lead_id));
            console.log(`  ✅ Stored in S3: ${s3Key}`);
            downloaded++;
          } else {
            console.log(`  ⚠️ Failed to download to S3`);
          }
        }
      } else {
        console.log(`  ⚠️ No recording found in Telnyx API`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
      failed++;
    }

    console.log('');
  }

  console.log('========================================');
  console.log('  RESULTS');
  console.log('========================================');
  console.log(`  Refreshed: ${refreshed}`);
  if (DOWNLOAD_TO_S3) {
    console.log(`  Downloaded to S3: ${downloaded}`);
  }
  console.log(`  Failed: ${failed}`);

  if (DRY_RUN) {
    console.log('\n  To actually refresh recordings, run without --dry-run');
    console.log('  To also download to S3, add --download flag');
  }
}

refreshRecordings()
  .then(() => {
    console.log('\nRefresh complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
