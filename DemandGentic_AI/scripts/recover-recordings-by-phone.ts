/**
 * Recover Lead Recordings by Phone Number Lookup
 * Searches Telnyx API for recordings using the dialed phone number
 */

import { db } from '../server/db';
import { sql, eq } from 'drizzle-orm';
import { leads } from '../shared/schema';
import { downloadAndStoreRecording } from '../server/services/recording-storage';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

const DRY_RUN = process.argv.includes('--dry-run');
const DOWNLOAD_TO_GCS = process.argv.includes('--download');

interface TelnyxRecording {
  id: string;
  call_control_id: string;
  call_leg_id: string;
  call_session_id: string;
  channels: string;
  created_at: string;
  download_urls: {
    mp3?: string;
    wav?: string;
  };
  duration_millis: number;
  recording_started_at: string;
  recording_ended_at: string;
  status: 'completed' | 'processing' | 'partial';
}

async function searchRecordingsByPhone(
  phoneNumber: string,
  startTime: Date,
  endTime: Date
): Promise {
  const params = new URLSearchParams();
  params.append('filter[to]', phoneNumber);
  params.append('filter[created_at][gte]', startTime.toISOString());
  params.append('filter[created_at][lte]', endTime.toISOString());
  params.append('page[size]', '50');

  console.log(`  Searching: ${phoneNumber} from ${startTime.toISOString()} to ${endTime.toISOString()}`);

  const response = await fetch(`${TELNYX_API_BASE}/recordings?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`  API Error (${response.status}): ${errorText.substring(0, 100)}`);
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

async function recoverRecordings() {
  console.log('\n========================================');
  console.log('  RECOVER RECORDINGS BY PHONE NUMBER');
  console.log(DRY_RUN ? '  (DRY RUN - no changes will be made)' : '');
  console.log(DOWNLOAD_TO_GCS ? '  (Will download to GCS)' : '');
  console.log('========================================\n');

  if (!TELNYX_API_KEY) {
    console.error('ERROR: TELNYX_API_KEY not configured');
    process.exit(1);
  }

  // Get leads that need recordings
  const leadsToRecover = await db.execute(sql`
    SELECT
      l.id as lead_id,
      l.contact_name,
      l.dialed_number,
      l.recording_url,
      l.recording_s3_key,
      l.call_duration,
      l.created_at as lead_created_at,
      dca.call_ended_at,
      dca.phone_dialed
    FROM leads l
    JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
    WHERE l.recording_s3_key IS NULL
    ORDER BY l.created_at DESC
    LIMIT 20
  `);

  const rows = leadsToRecover.rows as Array;

  console.log(`Found ${rows.length} leads that need recording recovery\n`);

  if (rows.length === 0) {
    console.log('No leads need recording recovery.');
    return;
  }

  let recovered = 0;
  let downloaded = 0;
  let notFound = 0;

  for (const row of rows) {
    const phoneNumber = row.dialed_number || row.phone_dialed;
    console.log(`Processing: ${row.contact_name}`);
    console.log(`  Lead ID: ${row.lead_id}`);
    console.log(`  Phone: ${phoneNumber}`);
    console.log(`  Duration: ${row.call_duration}s`);

    if (!phoneNumber) {
      console.log(`  ⚠️ No phone number available\n`);
      notFound++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would search Telnyx for recordings\n`);
      continue;
    }

    // Search for recordings within a window around the call time
    const callTime = row.call_ended_at || row.lead_created_at;
    const startTime = new Date(callTime);
    startTime.setHours(startTime.getHours() - 2); // 2 hours before
    const endTime = new Date(callTime);
    endTime.setHours(endTime.getHours() + 2); // 2 hours after

    try {
      const recordings = await searchRecordingsByPhone(phoneNumber, startTime, endTime);

      if (recordings.length > 0) {
        // Find best match by duration
        const recording = recordings.find(r => {
          const durationSec = r.duration_millis / 1000;
          const diff = Math.abs(durationSec - (row.call_duration || 0));
          return diff  setTimeout(r, 500));
  }

  console.log('========================================');
  console.log('  RESULTS');
  console.log('========================================');
  console.log(`  Recovered: ${recovered}`);
  if (DOWNLOAD_TO_GCS) {
    console.log(`  Downloaded to GCS: ${downloaded}`);
  }
  console.log(`  Not Found: ${notFound}`);

  if (DRY_RUN) {
    console.log('\n  To actually recover recordings, run without --dry-run');
    console.log('  To also download to GCS, add --download flag');
  }
}

recoverRecordings()
  .then(() => {
    console.log('\nRecovery complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });