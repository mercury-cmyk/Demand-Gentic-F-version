import { db } from "./server/db";
import { sql, eq, and, gte, isNull, like, or, desc } from "drizzle-orm";
import { dialerCallAttempts } from "./shared/schema";
import { fetchTelnyxRecording } from "./server/services/telnyx-recordings";
import { transcribeRecording } from "./server/services/telnyx-transcription";
import * as fs from 'fs';

// Helper to format transcript
function formatTranscript(segments: any[], fallbackText: string): string {
    if (!segments || segments.length === 0) return fallbackText;
    
    return segments
      .map((segment) => {
        const speakerLabel = segment.speaker === "agent" ? "Agent:" : segment.speaker === "prospect" ? "Contact:" : "Unknown:";
        return `${speakerLabel} ${segment.text}`;
      })
      .join("\n");
}

async function retranscribeMissing() {
  console.log("==================================================");
  console.log("STARTING RETRANSCRIPTION SCRIPT");
  console.log("==================================================");
  console.log("Searching for 'not_interested' calls with missing transcripts (last 48h)...");

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  // Find candidates
  const candidates = await db
    .select()
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.disposition, "not_interested"),
        gte(dialerCallAttempts.callStartedAt, twoDaysAgo),
        or(
            isNull(dialerCallAttempts.fullTranscript),
            eq(dialerCallAttempts.fullTranscript, ""),
            like(dialerCallAttempts.fullTranscript, "%Transcription failed%"),
            like(dialerCallAttempts.fullTranscript, "%No transcription available%")
        )
      )
    )
    .orderBy(desc(dialerCallAttempts.callStartedAt));

  console.log(`Found ${candidates.length} calls needing re-transcription.`);

  let successCount = 0;
  let failCount = 0;

  for (const call of candidates) {
    console.log(`\nProcessing Call ID: ${call.id}`);
    console.log(`- Telnyx Call ID: ${call.telnyxCallId || "MISSING"}`);
    console.log(`- Recording ID: ${call.telnyxRecordingId || "MISSING"}`);

    if (!call.telnyxCallId && !call.telnyxRecordingId) {
        console.log("  ⚠️ No Telnyx IDs available. Skipping.");
        failCount++;
        continue;
    }

    try {
        // 1. Get a fresh recording URL
        let recordingUrl: string | null = null;
        
        // Try fetching by telnyxCallId (which maps to call_control_id usually)
        if (call.telnyxCallId) {
            console.log("  Fetching fresh recording URL via Telnyx Call ID...");
            recordingUrl = await fetchTelnyxRecording(call.telnyxCallId);
        }

        // If that failed, maybe we can use recording ID? 
        // fetchTelnyxRecording implementation tries control_id, then leg_id, then session_id. 
        // It doesn't seem to take recording_id directly, but let's see.
        
        if (!recordingUrl) {
            console.log("  ❌ Could not retrieve fresh recording URL from Telnyx.");
            
            // Fallback: Check if the existing URL in DB is valid/public? 
            // Most likely not if we are here.
            failCount++;
            continue;
        }

        console.log(`  ✅ Got fresh URL: ${recordingUrl.substring(0, 50)}...`);

        // 2. Transcribe
        console.log("  Transcribing...");
        const result = await transcribeRecording(recordingUrl);

        if (result.success && result.text) {
             console.log(`  ✅ Transcription successful! (${result.wordCount} words)`);
             
             const formattedTranscript = formatTranscript(result.segments, result.text);

             // 3. Update DB
             await db
                .update(dialerCallAttempts)
                .set({
                    fullTranscript: formattedTranscript,
                    recordingUrl: recordingUrl, // Update the URL too since we have a fresh one
                    updatedAt: new Date()
                })
                .where(eq(dialerCallAttempts.id, call.id));
            
            successCount++;
        } else {
            console.error(`  ❌ Transcription failed: ${result.error || "Empty result"}`);
            failCount++;
        }

    } catch (err: any) {
        console.error(`  ❌ Error processing call: ${err.message}`);
        failCount++;
    }
  }

  console.log(`\nSummary:`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

retranscribeMissing().catch(console.error);