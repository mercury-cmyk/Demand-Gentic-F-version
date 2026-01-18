import { pool, db } from "./server/db";
import { leads } from "./shared/schema";
import { eq } from "drizzle-orm";
import { submitTranscription } from "./server/services/assemblyai-transcription";

async function retranscribeGrayCall() {
  console.log("========================================");
  console.log("RE-TRANSCRIBE GRAY'S CALL");
  console.log("========================================\n");

  const result = await pool.query(`
    SELECT 
      id,
      recording_url,
      transcript,
      LENGTH(transcript) as current_length
    FROM leads
    WHERE id = '2a244f3a-d5f2-49d5-b0de-e4bfa96936bd'
  `);

  const call = result.rows[0];
  
  if (!call) {
    console.log("Call not found!");
    process.exit(1);
  }

  console.log(`Current transcript length: ${call.current_length} chars`);
  console.log(`Current transcript (last 200 chars):`);
  console.log(call.transcript.slice(-200));
  console.log("\n" + "=".repeat(80));

  if (!call.recording_url) {
    console.log("\nNo recording URL available!");
    process.exit(1);
  }

  console.log(`\nRecording URL found, re-transcribing...`);
  console.log(`URL: ${call.recording_url.substring(0, 100)}...`);

  try {
    const newTranscript = await submitTranscription(call.recording_url);

    if (newTranscript && newTranscript.length > 50) {
      console.log(`\n✓ New transcript received: ${newTranscript.length} chars`);
      console.log(`\nNew transcript content:`);
      console.log("=".repeat(80));
      console.log(newTranscript);
      console.log("=".repeat(80));

      // Update the database
      await db
        .update(leads)
        .set({ 
          transcript: newTranscript,
          transcriptionStatus: 'completed',
          updatedAt: new Date()
        })
        .where(eq(leads.id, call.id));

      console.log(`\n✓ Database updated with full transcript`);
    } else {
      console.log(`\n✗ Re-transcription failed or empty`);
    }
  } catch (error: any) {
    console.log(`\n✗ Re-transcription error: ${error.message}`);
  }

  process.exit(0);
}

retranscribeGrayCall().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
