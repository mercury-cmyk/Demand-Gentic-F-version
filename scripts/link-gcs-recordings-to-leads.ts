/**
 * Link existing GCS recordings to leads
 * Matches recordings by Telnyx call ID
 */

import { db } from '../server/db';
import { sql, eq } from 'drizzle-orm';
import { leads } from '../shared/schema';
import { Storage } from '@google-cloud/storage';
import { getPresignedDownloadUrl } from '../server/lib/s3';

const GCS_BUCKET = process.env.GCS_BUCKET || 'demandgentic-prod-storage-2026';
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET);

async function linkRecordings() {
  console.log('\n========================================');
  console.log('  LINK GCS RECORDINGS TO LEADS');
  console.log('========================================\n');

  // Get all recordings from GCS
  const [files] = await bucket.getFiles({ prefix: 'recordings/' });
  console.log(`Found ${files.length} recordings in GCS\n`);

  // Get leads with telnyx_call_id
  const leadsWithTelnyx = await db.execute(sql`
    SELECT
      l.id as lead_id,
      l.contact_name,
      l.recording_s3_key,
      dca.telnyx_call_id
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.recording_s3_key IS NULL
      AND dca.telnyx_call_id IS NOT NULL
  `);

  const leadsData = leadsWithTelnyx.rows as Array<{
    lead_id: string;
    contact_name: string;
    recording_s3_key: string | null;
    telnyx_call_id: string;
  }>;

  console.log(`Found ${leadsData.length} leads without GCS recordings\n`);

  let linked = 0;

  for (const lead of leadsData) {
    // Search for matching recording in GCS by Telnyx call ID
    const matchingFile = files.find(f => f.name.includes(lead.telnyx_call_id));

    if (matchingFile) {
      console.log(`✅ Found match for ${lead.contact_name}`);
      console.log(`   Lead ID: ${lead.lead_id}`);
      console.log(`   GCS Key: ${matchingFile.name}`);

      // Update lead with GCS key
      await db.update(leads)
        .set({
          recordingS3Key: matchingFile.name,
          updatedAt: new Date()
        })
        .where(eq(leads.id, lead.lead_id));

      // Also generate a fresh presigned URL
      try {
        const freshUrl = await getPresignedDownloadUrl(matchingFile.name, 7 * 24 * 60 * 60);
        await db.update(leads)
          .set({
            recordingUrl: freshUrl,
            updatedAt: new Date()
          })
          .where(eq(leads.id, lead.lead_id));
        console.log(`   ✅ Updated with fresh URL`);
      } catch (e) {
        console.log(`   ⚠️ Could not generate presigned URL`);
      }

      linked++;
      console.log('');
    }
  }

  console.log('========================================');
  console.log('  RESULTS');
  console.log('========================================');
  console.log(`  Linked: ${linked} / ${leadsData.length}`);

  if (linked < leadsData.length) {
    console.log(`\n  ${leadsData.length - linked} leads have no GCS recording backup.`);
    console.log('  These recordings have expired and cannot be recovered.');
  }

  process.exit(0);
}

linkRecordings().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
