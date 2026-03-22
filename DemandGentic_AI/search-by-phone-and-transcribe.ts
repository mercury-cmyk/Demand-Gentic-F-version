import { pool, db } from "./server/db";
import { leads } from "./shared/schema";
import { eq } from "drizzle-orm";
import { searchRecordingsByDialedNumber } from "./server/services/telnyx-recordings";
import { submitTranscription } from "./server/services/google-transcription";

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
  const result = await pool.query(`
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
      AND (transcript IS NULL OR LENGTH(transcript)  10) {
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