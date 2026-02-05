import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";
import { eq } from "drizzle-orm";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";

// =============================================================================
// BATCH TRANSCRIPTION FOR JANUARY 15, 2026 CALLS
// =============================================================================
// This script transcribes all calls from Jan 15 that are >60 seconds
// Uses Google Cloud Speech-to-Text for all transcription
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
// TRANSCRIPTION WITH GOOGLE CLOUD SPEECH-TO-TEXT
// =============================================================================

/**
 * Transcribe using Google Cloud Speech-to-Text API
 * - Synchronous for <60s audio, async for longer
 * - Telephony-optimized model (8kHz phone audio)
 * - Superior accuracy for phone call audio  
 * - Cost: $0.002 per 15 seconds (~$0.48/hour)
 */
async function transcribeWithGoogleCloud(recordingUrl: string): Promise<string | null> {
  try {
    console.log(`[Google Cloud STT] Starting transcription...`);
    
    // Dynamic import to get transcription service
    const { submitTranscription } = await import('./server/services/google-transcription');
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
// BATCH PROCESSING
// =============================================================================

interface CallToTranscribe {
  id: string;
  telnyxCallId: string | null;
  recordingUrl: string | null;
  duration: number;
  name: string;
  existingNotes: string | null;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process a single call with retries
 */
async function processCall(
  call: CallToTranscribe,
  provider: TranscriptionProvider,
  dryRun: boolean,
  verbose: boolean
): Promise<{ success: boolean; error?: string }> {
  const { id, telnyxCallId, recordingUrl: existingRecordingUrl, duration, name, existingNotes } = call;

  if (verbose) {
    console.log(`\n  Processing: ${name} | ${duration}s | attempt=${id}`);
  }

  if (dryRun) {
    if (verbose) {
      console.log(`    DRY RUN: would transcribe using ${provider}`);
    }
    return { success: true };
  }

  let recordingUrl = existingRecordingUrl;

  // Fetch recording URL if not available
  if (!recordingUrl && telnyxCallId) {
    try {
      if (verbose) console.log(`    Fetching recording from Telnyx...`);
      recordingUrl = await fetchTelnyxRecording(telnyxCallId);
      if (!recordingUrl) {
        return { success: false, error: "No recording found in Telnyx" };
      }

      // Update recording URL in database
      await db
        .update(dialerCallAttempts)
        .set({ recordingUrl, updatedAt: new Date() })
        .where(eq(dialerCallAttempts.id, id));

      if (verbose) console.log(`    Recording URL saved`);
    } catch (error: any) {
      return { success: false, error: `Telnyx fetch error: ${error.message}` };
    }
  }

  if (!recordingUrl) {
    return { success: false, error: "No recording URL available" };
  }

  // Transcribe with retries
  let transcript: string | null = null;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      if (verbose && attempt > 0) {
        console.log(`    Retry attempt ${attempt + 1}/${RETRY_ATTEMPTS}`);
      }

      transcript = await transcribe(recordingUrl, provider);
      if (transcript) break;

      if (attempt < RETRY_ATTEMPTS - 1) {
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    } catch (error: any) {
      if (attempt === RETRY_ATTEMPTS - 1) {
        return { success: false, error: `Transcription error: ${error.message}` };
      }
    }
  }

  if (!transcript) {
    return { success: false, error: "Transcription failed after retries" };
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
  provider: TranscriptionProvider,
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

    const promises = batch.map((call) => processCall(call, provider, dryRun, verbose));
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
  console.log("========================================\n");

  // Parse arguments
  const args = process.argv.slice(2);
  const DRY_RUN = !args.includes("--execute");
  const verbose = args.includes("--verbose");
  const limitArgIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitArgIndex >= 0 ? Number(args[limitArgIndex + 1]) : null;
  const providerArg = args.find((arg) => arg.startsWith("--provider="));
  const selectedProvider = (providerArg?.split("=")[1] as TranscriptionProvider) || PROVIDER;

  console.log(`Date: ${TARGET_DATE}`);
  console.log(`Min Duration: ${MIN_DURATION_SECONDS}s`);
  console.log(`Provider: ${selectedProvider.toUpperCase()}`);
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
      dca.telnyx_call_id,
      dca.recording_url,
      dca.notes,
      dca.call_duration_seconds,
      c.first_name,
      c.last_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds >= 60
      AND (dca.notes IS NULL OR dca.notes NOT LIKE '%[Call Transcript]%')
    ORDER BY dca.call_duration_seconds DESC
  `);

  const allCalls = result.rows.map((row: any) => ({
    id: row.id,
    telnyxCallId: row.telnyx_call_id,
    recordingUrl: row.recording_url,
    duration: row.call_duration_seconds || 0,
    name: `${row.first_name || "Unknown"} ${row.last_name || ""}`.trim(),
    existingNotes: row.notes,
  }));

  const calls = limit ? allCalls.slice(0, limit) : allCalls;

  console.log(`Found ${allCalls.length} calls to transcribe`);
  if (limit) console.log(`Processing first ${calls.length} calls`);
  console.log();

  // Calculate estimated cost
  const totalMinutes = calls.reduce((sum, c) => sum + c.duration / 60, 0);
  const costPerMinute = selectedProvider === "whisper" ? 0.006 : 0.0025;
  const estimatedCost = totalMinutes * costPerMinute;

  console.log("📊 Cost Estimate:");
  console.log(`  Total Duration: ${totalMinutes.toFixed(2)} minutes`);
  console.log(`  Provider Rate: $${costPerMinute}/min`);
  console.log(`  Estimated Cost: $${estimatedCost.toFixed(2)}`);
  console.log();

  // Show sample calls
  console.log("Sample calls to transcribe:");
  calls.slice(0, 5).forEach((call) => {
    console.log(`  • ${call.name} | ${call.duration}s | ${call.recordingUrl ? "has recording" : "needs fetch"}`);
  });
  if (calls.length > 5) {
    console.log(`  ... and ${calls.length - 5} more`);
  }
  console.log();

  // Process calls
  const startTime = Date.now();
  const results = await processBatch(calls, selectedProvider, DRY_RUN, verbose);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print summary
  console.log("\n========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Total Calls: ${calls.length}`);
  console.log(`Successful: ${results.successful}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Provider: ${selectedProvider.toUpperCase()}`);
  if (!DRY_RUN) {
    console.log(`Estimated Cost: $${estimatedCost.toFixed(2)}`);
  }

  if (results.errors.length > 0 && results.errors.length <= 20) {
    console.log("\nErrors:");
    results.errors.forEach((error) => console.log(`  • ${error}`));
  } else if (results.errors.length > 20) {
    console.log(`\n${results.errors.length} errors occurred (showing first 20):`);
    results.errors.slice(0, 20).forEach((error) => console.log(`  • ${error}`));
  }

  if (DRY_RUN) {
    console.log("\n📋 To execute transcription, run:");
    console.log(`  npx tsx batch-transcribe-jan15.ts --execute`);
    console.log("\nOptions:");
    console.log(`  --provider=whisper      Use OpenAI Whisper ($0.006/min)`);
    console.log(`  --provider=assemblyai   Use AssemblyAI ($0.0025/min) [default]`);
    console.log(`  --limit N               Process only first N calls`);
    console.log(`  --verbose               Show detailed progress`);
  }

  process.exit(0);
}

// Run the script
batchTranscribeJan15().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});