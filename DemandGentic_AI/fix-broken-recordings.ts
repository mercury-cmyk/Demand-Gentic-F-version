/**
 * Fix Broken Recordings Script
 *
 * Identifies recordings marked as 'stored' but missing recordingS3Key,
 * and attempts to re-fetch and store them from Telnyx.
 *
 * Run with: npx tsx fix-broken-recordings.ts
 */

import { db } from './server/db';
import { callSessions, leads } from './shared/schema';
import { eq, and, isNull, isNotNull, or } from 'drizzle-orm';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

interface BrokenRecording {
  id: string;
  telnyxCallId: string | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  source: 'call_sessions' | 'leads';
}

async function findBrokenRecordings(): Promise {
  console.log('\n📊 Finding broken recordings...\n');

  const broken: BrokenRecording[] = [];

  // Find call_sessions with status 'stored' but no S3 key
  const brokenSessions = await db
    .select({
      id: callSessions.id,
      telnyxCallId: callSessions.telnyxCallId,
      recordingUrl: callSessions.recordingUrl,
      recordingStatus: callSessions.recordingStatus,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.recordingStatus, 'stored'),
        isNull(callSessions.recordingS3Key),
        or(
          isNotNull(callSessions.recordingUrl),
          isNotNull(callSessions.telnyxCallId)
        )
      )
    );

  for (const session of brokenSessions) {
    broken.push({
      id: session.id,
      telnyxCallId: session.telnyxCallId,
      recordingUrl: session.recordingUrl,
      recordingStatus: session.recordingStatus,
      source: 'call_sessions',
    });
  }

  console.log(`Found ${brokenSessions.length} broken call_sessions`);

  // Find leads with status 'stored' but no S3 key
  const brokenLeads = await db
    .select({
      id: leads.id,
      telnyxCallId: leads.telnyxCallId,
      recordingUrl: leads.recordingUrl,
      recordingStatus: leads.recordingStatus,
    })
    .from(leads)
    .where(
      and(
        eq(leads.recordingStatus, 'stored'),
        isNull(leads.recordingS3Key),
        or(
          isNotNull(leads.recordingUrl),
          isNotNull(leads.telnyxCallId)
        )
      )
    );

  for (const lead of brokenLeads) {
    broken.push({
      id: lead.id,
      telnyxCallId: lead.telnyxCallId,
      recordingUrl: lead.recordingUrl,
      recordingStatus: lead.recordingStatus,
      source: 'leads',
    });
  }

  console.log(`Found ${brokenLeads.length} broken leads`);
  console.log(`\nTotal broken recordings: ${broken.length}\n`);

  return broken;
}

async function fetchFreshTelnyxUrl(telnyxCallId: string): Promise {
  if (!TELNYX_API_KEY) {
    console.warn('  ⚠️ TELNYX_API_KEY not configured');
    return null;
  }

  try {
    // Get recordings for this call
    const response = await fetch(
      `https://api.telnyx.com/v2/recordings?filter[call_control_id]=${telnyxCallId}`,
      {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.warn(`  ⚠️ Telnyx API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const recording = data.data[0];
      return recording.download_urls?.mp3 || recording.download_urls?.wav || null;
    }

    return null;
  } catch (err: any) {
    console.warn(`  ⚠️ Error fetching from Telnyx: ${err.message}`);
    return null;
  }
}

async function fixRecording(recording: BrokenRecording): Promise {
  console.log(`\n🔧 Fixing ${recording.source} ${recording.id}...`);

  let freshUrl: string | null = null;

  // Try to get fresh URL from Telnyx
  if (recording.telnyxCallId) {
    console.log(`  Trying Telnyx call_control_id: ${recording.telnyxCallId.substring(0, 20)}...`);
    freshUrl = await fetchFreshTelnyxUrl(recording.telnyxCallId);

    if (freshUrl) {
      console.log(`  ✅ Got fresh Telnyx URL`);
    } else {
      console.log(`  ❌ Telnyx call_control_id expired or not found`);
    }
  }

  // If no fresh URL, try the cached URL (might still work if recent)
  if (!freshUrl && recording.recordingUrl) {
    console.log(`  Trying cached URL...`);
    try {
      const testResponse = await fetch(recording.recordingUrl, { method: 'HEAD' });
      if (testResponse.ok) {
        freshUrl = recording.recordingUrl;
        console.log(`  ✅ Cached URL still valid`);
      } else {
        console.log(`  ❌ Cached URL expired (${testResponse.status})`);
      }
    } catch (err) {
      console.log(`  ❌ Cached URL not accessible`);
    }
  }

  if (!freshUrl) {
    // Mark as failed since we can't get the recording
    console.log(`  📝 Marking as 'failed' - no accessible recording URL`);

    if (recording.source === 'call_sessions') {
      await db.update(callSessions)
        .set({ recordingStatus: 'failed' })
        .where(eq(callSessions.id, recording.id));
    } else {
      await db.update(leads)
        .set({ recordingStatus: 'failed' })
        .where(eq(leads.id, recording.id));
    }

    return false;
  }

  // Try to store in GCS
  console.log(`  Attempting GCS storage...`);

  try {
    if (recording.source === 'call_sessions') {
      const { storeCallSessionRecording } = await import('./server/services/recording-storage');
      const s3Key = await storeCallSessionRecording(recording.id, freshUrl);

      if (s3Key) {
        console.log(`  ✅ Stored in GCS: ${s3Key}`);
        return true;
      } else {
        console.log(`  ❌ GCS storage failed`);
        return false;
      }
    } else {
      const { storeRecordingFromWebhook } = await import('./server/services/recording-storage');
      const s3Key = await storeRecordingFromWebhook(recording.id, freshUrl);

      if (s3Key) {
        console.log(`  ✅ Stored in GCS: ${s3Key}`);
        return true;
      } else {
        console.log(`  ❌ GCS storage failed`);
        return false;
      }
    }
  } catch (err: any) {
    console.error(`  ❌ Error storing in GCS: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       Fix Broken Recordings Script');
  console.log('═══════════════════════════════════════════════════════════');

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
  }

  console.log(`Processing up to ${limit} recordings\n`);

  try {
    const brokenRecordings = await findBrokenRecordings();

    if (brokenRecordings.length === 0) {
      console.log('✅ No broken recordings found!');
      process.exit(0);
    }

    const toProcess = brokenRecordings.slice(0, limit);
    console.log(`\nProcessing ${toProcess.length} of ${brokenRecordings.length} broken recordings...`);

    let fixed = 0;
    let failed = 0;

    if (!dryRun) {
      for (const recording of toProcess) {
        const success = await fixRecording(recording);
        if (success) {
          fixed++;
        } else {
          failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                         Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total broken:     ${brokenRecordings.length}`);
    console.log(`Processed:        ${toProcess.length}`);
    if (!dryRun) {
      console.log(`Fixed:            ${fixed}`);
      console.log(`Failed to fix:    ${failed}`);
    }
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();