/**
 * Fix Failed Recording Script
 *
 * Attempts to recover a recording that failed to store in GCS by:
 * 1. Finding the call session by phone numbers
 * 2. Fetching a fresh recording URL from Telnyx using telnyxCallId
 * 3. Downloading and storing to GCS
 * 4. Triggering transcription
 *
 * Usage: npx tsx scripts/fix-failed-recording.ts  [fromNumber]
 * Example: npx tsx scripts/fix-failed-recording.ts +17749222894 +15593366940
 */

import { db } from '../server/db';
import { callSessions } from '../shared/schema';
import { eq, and, desc, like, or } from 'drizzle-orm';
import { storeCallSessionRecording } from '../server/services/recording-storage';
import { fetchTelnyxRecording, searchRecordingsByDialedNumber } from '../server/services/telnyx-recordings';

async function fixFailedRecording(toNumber: string, fromNumber?: string) {
  console.log('\n=== FIX FAILED RECORDING ===\n');
  console.log('Looking for recording with:');
  console.log('  To Number:', toNumber);
  if (fromNumber) console.log('  From Number:', fromNumber);

  // Find the call session
  const conditions = [
    like(callSessions.toNumberE164, `%${toNumber.replace(/[^\d]/g, '').slice(-10)}%`)
  ];

  if (fromNumber) {
    conditions.push(like(callSessions.fromNumber, `%${fromNumber.replace(/[^\d]/g, '').slice(-10)}%`));
  }

  const sessions = await db.select({
    id: callSessions.id,
    toNumber: callSessions.toNumberE164,
    fromNumber: callSessions.fromNumber,
    startedAt: callSessions.startedAt,
    durationSec: callSessions.durationSec,
    telnyxCallId: callSessions.telnyxCallId,
    recordingUrl: callSessions.recordingUrl,
    recordingS3Key: callSessions.recordingS3Key,
    recordingStatus: callSessions.recordingStatus,
    aiTranscript: callSessions.aiTranscript,
    campaignId: callSessions.campaignId,
  })
  .from(callSessions)
  .where(and(...conditions))
  .orderBy(desc(callSessions.startedAt))
  .limit(5);

  if (sessions.length === 0) {
    console.log('\n❌ No matching call sessions found!');
    console.log('Try with a different phone number format or check the database directly.');
    process.exit(1);
  }

  console.log(`\nFound ${sessions.length} matching session(s):\n`);

  for (const session of sessions) {
    console.log('-------------------------------------------');
    console.log('ID:', session.id);
    console.log('To:', session.toNumber);
    console.log('From:', session.fromNumber);
    console.log('Started:', session.startedAt);
    console.log('Duration:', session.durationSec, 'seconds');
    console.log('Telnyx Call ID:', session.telnyxCallId || 'MISSING');
    console.log('Recording Status:', session.recordingStatus || 'null');
    console.log('Recording URL:', session.recordingUrl ? 'HAS URL (likely expired)' : 'MISSING');
    console.log('S3 Key:', session.recordingS3Key || 'MISSING');
    console.log('Has Transcript:', session.aiTranscript ? 'YES' : 'NO');
  }

  // Work on the most recent failed session
  const targetSession = sessions.find(s => s.recordingStatus === 'failed') || sessions[0];

  console.log('\n\n=== ATTEMPTING RECOVERY FOR SESSION', targetSession.id, '===\n');

  // Strategy 1: Use telnyxCallId to fetch fresh URL
  if (targetSession.telnyxCallId) {
    console.log('Strategy 1: Fetching fresh URL using telnyxCallId...');
    console.log('  Call ID:', targetSession.telnyxCallId);

    try {
      const freshUrl = await fetchTelnyxRecording(targetSession.telnyxCallId);

      if (freshUrl) {
        console.log('✅ Got fresh URL from Telnyx!');
        console.log('  URL:', freshUrl.substring(0, 80) + '...');

        console.log('\nDownloading and storing to GCS...');
        const s3Key = await storeCallSessionRecording(
          targetSession.id,
          freshUrl,
          targetSession.durationSec || undefined
        );

        if (s3Key) {
          console.log('✅ SUCCESS! Recording stored at:', s3Key);
          console.log('\nThe recording should now be playable in the UI.');

          // Trigger transcription
          console.log('\nTriggering transcription...');
          try {
            const { submitTranscription } = await import('../server/services/google-transcription');
            const transcript = await submitTranscription(freshUrl);
            if (transcript) {
              await db.update(callSessions)
                .set({ aiTranscript: transcript })
                .where(eq(callSessions.id, targetSession.id));
              console.log('✅ Transcription completed!');
              console.log('Preview:', transcript.substring(0, 200) + '...');
            }
          } catch (transcriptionError) {
            console.log('⚠️ Transcription failed (recording is still saved):', transcriptionError);
          }

          process.exit(0);
        } else {
          console.log('❌ Failed to store recording to GCS');
        }
      } else {
        console.log('❌ No recording found via telnyxCallId');
        console.log('   The call_control_id may have expired (Telnyx retains recordings ~30 days)');
      }
    } catch (error) {
      console.log('❌ Error fetching from Telnyx:', error);
    }
  } else {
    console.log('Strategy 1: SKIPPED - No telnyxCallId stored');
  }

  // Strategy 2: Search by phone number and time
  console.log('\nStrategy 2: Searching Telnyx by phone number...');

  if (targetSession.toNumber && targetSession.startedAt) {
    try {
      const searchStart = new Date(targetSession.startedAt);
      searchStart.setMinutes(searchStart.getMinutes() - 30);
      const searchEnd = new Date(targetSession.startedAt);
      searchEnd.setMinutes(searchEnd.getMinutes() + 30);

      console.log('  Phone:', targetSession.toNumber);
      console.log('  Time range:', searchStart.toISOString(), 'to', searchEnd.toISOString());

      const recordings = await searchRecordingsByDialedNumber(
        targetSession.toNumber,
        searchStart,
        searchEnd
      );

      if (recordings.length > 0) {
        console.log(`✅ Found ${recordings.length} recording(s) in Telnyx!`);

        const recording = recordings.find(r => r.status === 'completed') || recordings[0];
        console.log('  Recording ID:', recording.id);
        console.log('  Status:', recording.status);
        console.log('  Duration:', Math.floor(recording.duration_millis / 1000), 'seconds');

        const downloadUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;

        if (downloadUrl) {
          console.log('  Download URL:', downloadUrl.substring(0, 80) + '...');

          // Update telnyxCallId if missing
          if (!targetSession.telnyxCallId) {
            await db.update(callSessions)
              .set({ telnyxCallId: recording.call_control_id })
              .where(eq(callSessions.id, targetSession.id));
            console.log('  Updated telnyxCallId:', recording.call_control_id);
          }

          console.log('\nDownloading and storing to GCS...');
          const s3Key = await storeCallSessionRecording(
            targetSession.id,
            downloadUrl,
            Math.floor(recording.duration_millis / 1000)
          );

          if (s3Key) {
            console.log('✅ SUCCESS! Recording stored at:', s3Key);
            console.log('\nThe recording should now be playable in the UI.');

            // Trigger transcription
            console.log('\nTriggering transcription...');
            try {
              const { submitTranscription } = await import('../server/services/google-transcription');
              const transcript = await submitTranscription(downloadUrl);
              if (transcript) {
                await db.update(callSessions)
                  .set({ aiTranscript: transcript })
                  .where(eq(callSessions.id, targetSession.id));
                console.log('✅ Transcription completed!');
                console.log('Preview:', transcript.substring(0, 200) + '...');
              }
            } catch (transcriptionError) {
              console.log('⚠️ Transcription failed (recording is still saved):', transcriptionError);
            }

            process.exit(0);
          }
        }
      } else {
        console.log('❌ No recordings found in Telnyx for this phone/time range');
      }
    } catch (error) {
      console.log('❌ Error searching Telnyx:', error);
    }
  }

  console.log('\n\n=== RECOVERY FAILED ===');
  console.log('The recording could not be recovered. Possible reasons:');
  console.log('  1. Recording was deleted from Telnyx (retained ~30 days)');
  console.log('  2. The call ended before recording started');
  console.log('  3. Recording was never enabled for this call');
  console.log('  4. Telnyx API key is invalid or has insufficient permissions');
  console.log('\nIf this is a recent call, try again in a few minutes - Telnyx may still be processing.');

  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length  [fromNumber]');
  console.log('Example: npx tsx scripts/fix-failed-recording.ts +17749222894 +15593366940');
  process.exit(1);
}

const [toNumber, fromNumber] = args;

fixFailedRecording(toNumber, fromNumber).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});