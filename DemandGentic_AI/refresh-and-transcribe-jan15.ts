import { pool, db } from "./server/db";
import { leads } from "./shared/schema";
import { eq } from "drizzle-orm";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";
import { submitTranscription } from "./server/services/google-transcription";

async function refreshAndTranscribeJan15() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  const verbose = args.includes("--verbose");

  console.log("========================================");
  console.log("REFRESH & TRANSCRIBE JAN 15+ CALLS");
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made");
    console.log("Run with --execute to apply changes\n");
  } else {
    console.log("EXECUTE MODE - Changes WILL be applied\n");
  }

  // Get all calls with telnyx_call_id that need transcription
  console.log("Fetching calls needing transcription...");
  const result = await pool.query(`
    SELECT 
      id,
      telnyx_call_id AS "telnyxCallId",
      recording_url AS "recordingUrl",
      transcript,
      call_duration AS "duration",
      updated_at AS "updatedAt"
    FROM leads
    WHERE updated_at >= '2026-01-15'
      AND call_duration > 0
      AND telnyx_call_id IS NOT NULL
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
          
          transcribed += 1;
          
          if (verbose) {
            console.log(`  ✓ Transcribed (${transcript.trim().length} chars)`);
          }
        } else {
          if (verbose) {
            console.log(`  ✗ Transcription empty`);
          }
          failed += 1;
        }
      } catch (error: any) {
        if (verbose) {
          console.log(`  ✗ Transcription failed: ${error.message}`);
        }
        failed += 1;
      }
    }
  }

  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Recording URLs refreshed: ${urlsRefreshed}`);
  console.log(`Successfully transcribed: ${transcribed}`);
  console.log(`Skipped (no recording): ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (dryRun) {
    console.log("\nTo apply changes, run:");
    console.log("  npx tsx refresh-and-transcribe-jan15.ts --execute --verbose");
  }

  process.exit(0);
}

refreshAndTranscribeJan15().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});