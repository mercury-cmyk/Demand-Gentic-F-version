import { pool, db } from "./server/db";
import { leads } from "./shared/schema";
import { eq } from "drizzle-orm";
import { searchRecordingsByDialedNumber } from "./server/services/telnyx-recordings";
import { submitTranscription } from "./server/services/assemblyai-transcription";

async function searchByPhoneAndTranscribe() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");

  console.log("========================================");
  console.log("SEARCH RECORDINGS BY PHONE NUMBER");
  console.log("Then transcribe found recordings");
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
  }

  // Get calls needing transcription with phone numbers
  console.log("Fetching calls with phone numbers...");
  const result = await pool.query<any>(`
    SELECT 
      id,
      dialed_number AS "dialedNumber",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      call_duration AS "duration",
      recording_url AS "recordingUrl",
      transcript
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND call_duration > 0
      AND dialed_number IS NOT NULL
      AND (transcript IS NULL OR LENGTH(transcript) < 50)
    ORDER BY updated_at DESC
  `);

  console.log(`Found ${result.rows.length} calls with phone numbers\n`);

  let recordingsFound = 0;
  let transcribed = 0;
  let noRecording = 0;
  let failed = 0;

  for (const call of result.rows) {
    if (verbose) {
      console.log(`\nProcessing ${call.id}`);
      console.log(`  Phone: ${call.dialedNumber}`);
      console.log(`  Duration: ${call.duration}s`);
      console.log(`  Call time: ${call.updatedAt}`);
    }

    try {
      // Search for recordings by phone number and time window
      // Use a 5-minute window around the call time
      const callTime = new Date(call.updatedAt);
      const startTime = new Date(callTime.getTime() - 5 * 60 * 1000); // 5 min before
      const endTime = new Date(callTime.getTime() + 10 * 60 * 1000); // 10 min after

      if (verbose) {
        console.log(`  Searching Telnyx for recordings...`);
      }

      const recordings = await searchRecordingsByDialedNumber(
        call.dialedNumber,
        startTime,
        endTime
      );

      if (recordings.length === 0) {
        if (verbose) {
          console.log(`  ✗ No recordings found`);
        }
        noRecording++;
        continue;
      }

      // Use the first (most recent) recording
      const recording = recordings[0];
      const recordingUrl = recording.download_urls?.mp3 || recording.download_urls?.wav;

      if (!recordingUrl) {
        if (verbose) {
          console.log(`  ✗ Recording found but no download URL`);
        }
        noRecording++;
        continue;
      }

      recordingsFound++;
      
      if (verbose) {
        console.log(`  ✓ Recording found: ${recording.id}`);
        console.log(`  Duration: ${recording.duration_millis / 1000}s`);
      }

      // Update recording URL if different
      if (!dryRun && recordingUrl !== call.recordingUrl) {
        await db
          .update(leads)
          .set({ recordingUrl })
          .where(eq(leads.id, call.id));
        
        if (verbose) {
          console.log(`  ✓ Recording URL updated`);
        }
      }

      // Now transcribe
      if (verbose) {
        console.log(`  Transcribing...`);
      }

      const transcript = await submitTranscription(recordingUrl);

      if (transcript && transcript.trim().length > 10) {
        if (!dryRun) {
          await db
            .update(leads)
            .set({
              transcript: transcript.trim(),
              transcriptionStatus: 'completed',
              updatedAt: new Date()
            })
            .where(eq(leads.id, call.id));
        }

        transcribed++;

        if (verbose) {
          console.log(`  ✓ Transcribed (${transcript.trim().length} chars)`);
        }
      } else {
        if (verbose) {
          console.log(`  ✗ Transcription empty`);
        }
        failed++;
      }

    } catch (error: any) {
      if (verbose) {
        console.log(`  ✗ Error: ${error.message}`);
      }
      failed++;
    }
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Recordings found: ${recordingsFound}`);
  console.log(`Successfully transcribed: ${transcribed}`);
  console.log(`No recording available: ${noRecording}`);
  console.log(`Failed: ${failed}`);

  if (dryRun) {
    console.log("\nTo apply changes, run:");
    console.log("  npx tsx search-by-phone-and-transcribe.ts --execute --verbose");
  }

  process.exit(0);
}

searchByPhoneAndTranscribe().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
