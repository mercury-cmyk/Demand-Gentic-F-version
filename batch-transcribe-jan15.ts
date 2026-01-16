import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";
import { eq } from "drizzle-orm";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";

// =============================================================================
// BATCH TRANSCRIPTION FOR JANUARY 15, 2026 CALLS
// =============================================================================
// This script transcribes all calls from Jan 15 that are >60 seconds
// Uses ONLY Google Cloud Speech-to-Text API (no external dependencies)
// =============================================================================

const TRANSCRIPT_MARKER = "[Call Transcript]";

// Batch processing settings
const CONCURRENT_LIMIT = 5; // Process 5 transcriptions at a time
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

// Date filter
const TARGET_DATE = "2026-01-15";
const MIN_DURATION_SECONDS = 60;

// =============================================================================
// TRANSCRIPTION WITH GOOGLE CLOUD SPEECH-TO-TEXT (UNIFIED ONLY)
// =============================================================================

/**
 * Transcribe using Google Cloud Speech-to-Text API
 * - Synchronous for <60s audio, async for longer
 * - Telephony-optimized model (8kHz phone audio)
 * - Superior accuracy for phone call audio  
 * - Cost: $0.002 per 15 seconds (~$0.48/hour)
 * - Supports MP3, WAV, FLAC, OGG
 */
async function transcribeWithGoogleCloud(recordingUrl: string): Promise<string | null> {
  try {
    console.log(`[Google Cloud STT] Starting transcription...`);
    
    // Use the unified Google Cloud Speech-to-Text service
    const { submitTranscription } = await import('./server/services/assemblyai-transcription');
    const transcript = await submitTranscription(recordingUrl);
    
    if (!transcript) {
      console.error(`[Google Cloud STT] Transcription failed`);
      return null;
    }
    
    return transcript;
  } catch (error: any) {
    console.error("[Google Cloud STT] Error:", error.message);
    return null;
  }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface CallToTranscribe {
  id: string;
  name: string;
  recordingUrl: string;
  duration: number;
  notes: string | null;
}

// =============================================================================
// CALL PROCESSING
// =============================================================================

/**
 * Process a single call: fetch recording, transcribe, save to database
 */
async function processCall(
  call: CallToTranscribe,
  dryRun: boolean,
  verbose: boolean
): Promise<{ success: boolean; error?: string }> {
  const { id, name, recordingUrl, notes: existingNotes } = call;

  if (verbose) console.log(`    Processing ${name} (${id})...`);

  // Download and transcribe
  const transcript = await transcribeWithGoogleCloud(recordingUrl);

  if (!transcript) {
    return { success: false, error: "Transcription failed" };
  }

  if (dryRun) {
    if (verbose) console.log(`    ✅ [DRY RUN] Would transcribe (${transcript.length} chars)`);
    return { success: true };
  }

  // Save transcript to database
  try {
    const transcriptBlock = `${TRANSCRIPT_MARKER}\n${transcript.trim()}`;
    const nextNotes = existingNotes ? `${existingNotes}\n\n${transcriptBlock}` : transcriptBlock;

    await db
      .update(dialerCallAttempts)
      .set({ notes: nextNotes, updatedAt: new Date() })
      .where(eq(dialerCallAttempts.id, id));

    if (verbose) console.log(`    ✅ Transcript saved (${transcript.length} chars)`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: `Database update error: ${error.message}` };
  }
}

/**
 * Process calls in batches with concurrency limit
 */
async function processBatch(
  calls: CallToTranscribe[],
  dryRun: boolean,
  verbose: boolean
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const results = { successful: 0, failed: 0, errors: [] as string[] };
  const total = calls.length;

  console.log(`\nProcessing ${total} calls with ${CONCURRENT_LIMIT} concurrent workers...\n`);

  // Process in batches
  for (let i = 0; i < calls.length; i += CONCURRENT_LIMIT) {
    const batch = calls.slice(i, i + CONCURRENT_LIMIT);
    const batchNum = Math.floor(i / CONCURRENT_LIMIT) + 1;
    const totalBatches = Math.ceil(calls.length / CONCURRENT_LIMIT);

    console.log(`Batch ${batchNum}/${totalBatches} (calls ${i + 1}-${Math.min(i + CONCURRENT_LIMIT, total)})`);

    const promises = batch.map((call) => processCall(call, dryRun, verbose));
    const batchResults = await Promise.all(promises);

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const call = batch[j];
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        const errorMsg = `${call.name} (${call.id}): ${result.error}`;
        results.errors.push(errorMsg);
        if (!verbose) {
          console.log(`  ❌ ${errorMsg}`);
        }
      }
    }

    // Progress update
    const processed = Math.min(i + CONCURRENT_LIMIT, total);
    console.log(`  Progress: ${processed}/${total} (${((processed / total) * 100).toFixed(1)}%)\n`);
  }

  return results;
}

// =============================================================================
// MAIN SCRIPT
// =============================================================================

async function batchTranscribeJan15() {
  console.log("========================================");
  console.log("BATCH TRANSCRIBE JANUARY 15, 2026 CALLS");
  console.log("Google Cloud Speech-to-Text (GCS only)");
  console.log("========================================\n");

  // Parse arguments
  const args = process.argv.slice(2);
  const DRY_RUN = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;

  console.log(`Date: ${TARGET_DATE}`);
  console.log(`Min Duration: ${MIN_DURATION_SECONDS}s`);
  console.log(`Transcription: Google Cloud Speech-to-Text`);
  console.log(`Concurrent Workers: ${CONCURRENT_LIMIT}`);
  if (limit) console.log(`Limit: ${limit} calls`);
  console.log();

  if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE - No changes will be made");
    console.log("Run with --execute flag to apply changes\n");
  } else {
    console.log("⚡ EXECUTE MODE - Changes WILL be applied\n");
  }

  // Fetch calls from database
  console.log("Fetching calls from database...");
  const result = await db.execute(sql`
    SELECT 
      dca.id,
      c."displayName" as name,
      dca."recordingUrl",
      EXTRACT(EPOCH FROM (dca."callEndTime" - dca."callStartTime"))::int as duration,
      dca.notes
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca."leadId" = c.id
    WHERE DATE(dca."callStartTime") = ${TARGET_DATE}
      AND dca."recordingUrl" IS NOT NULL
      AND dca."recordingUrl" != ''
      AND EXTRACT(EPOCH FROM (dca."callEndTime" - dca."callStartTime"))::int > ${MIN_DURATION_SECONDS}
    ORDER BY dca."callStartTime" DESC
    ${limit ? sql`LIMIT ${limit}` : sql``}
  `);

  const calls: CallToTranscribe[] = result.rows.map((row: any) => ({
    id: row.id,
    name: row.name || "Unknown",
    recordingUrl: row.recordingUrl,
    duration: row.duration,
    notes: row.notes,
  }));

  if (calls.length === 0) {
    console.log("No calls found matching criteria.\n");
    return;
  }

  console.log(`Found ${calls.length} calls to process.\n`);

  // Show sample
  console.log("Sample calls:");
  calls.slice(0, 3).forEach((call) => {
    console.log(`  - ${call.name} (${call.id}): ${call.duration}s`);
  });
  if (calls.length > 3) {
    console.log(`  ... and ${calls.length - 3} more`);
  }
  console.log();

  // Process all calls
  const batchResults = await processBatch(calls, DRY_RUN, verbose);

  // Report results
  console.log("\n========================================");
  console.log("RESULTS");
  console.log("========================================");
  console.log(`Successful: ${batchResults.successful}`);
  console.log(`Failed: ${batchResults.failed}`);
  console.log(`Total: ${calls.length}`);

  if (batchResults.errors.length > 0) {
    console.log("\nErrors:");
    batchResults.errors.forEach((error) => console.log(`  - ${error}`));
  }

  console.log();
  if (DRY_RUN) {
    console.log("🔍 This was a DRY RUN. Use --execute to apply changes.");
  } else {
    console.log("✅ Batch transcription complete!");
  }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

batchTranscribeJan15().catch(async (error) => {
  console.error("Fatal error:", error);
  await db.$client.end();
  process.exit(1);
});

// Usage:
// npx tsx batch-transcribe-jan15.ts [--execute] [--limit N] [--verbose]
//
// Examples:
// - Dry run, show first 50 calls:
//   npx tsx batch-transcribe-jan15.ts --limit 50 --verbose
//
// - Execute, process all calls with limited output:
//   npx tsx batch-transcribe-jan15.ts --execute
//
// - Execute, verbose mode, process 100 calls:
//   npx tsx batch-transcribe-jan15.ts --execute --limit 100 --verbose
