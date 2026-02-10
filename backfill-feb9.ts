
import 'dotenv/config';
import { db } from './server/db';
import { callSessions, callQualityRecords } from './shared/schema';
import { and, gte, lt, isNull, eq } from 'drizzle-orm';
import { submitTranscription } from './server/services/google-transcription';
import { analyzeConversationQuality } from './server/services/conversation-quality-analyzer';
import { logCallIntelligence } from './server/services/call-intelligence-logger';
import { fetchTelnyxRecording } from './server/services/telnyx-recordings';
import { transcribeWithGemini } from './server/services/gemini-transcription';

async function backfillFeb9() {
  const date = '2026-02-09';
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  console.log(`Searching for calls on ${date} needing backfill...`);

  // Step 1: Find calls with missing transcripts
  const missingTranscripts = await db.select()
    .from(callSessions)
    .where(and(
      gte(callSessions.startedAt, startOfDay),
      lt(callSessions.startedAt, endOfDay),
      isNull(callSessions.aiTranscript)
    ));

  console.log(`Found ${missingTranscripts.length} calls missing transcripts.`);

  for (const session of missingTranscripts) {
    if (!session.recordingUrl && !session.recordingS3Key) {
      console.log(`Skipping session ${session.id} - No recording found.`);
      continue;
    }

    console.log(`Processing session ${session.id}...`);

    let audioUrl = session.recordingUrl || '';
    
    // Attempt to refresh URL if likely expired
    if (audioUrl && audioUrl.includes('X-Amz-Expires')) {
       // Try to extract the recording UUID from the filename (usually UUID-timestamp)
       // format: .../DATE/UUID-TIMESTAMP...
       const filenameUuidMatch = audioUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+/i);
       
       let uuidToTry = '';
       if (filenameUuidMatch) {
           uuidToTry = filenameUuidMatch[1];
       } else {
           // Fallback: Try all UUIDs, pick the second one if available (first is usually account/folder)
           const allUuids = audioUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
           if (allUuids && allUuids.length >= 2) {
               uuidToTry = allUuids[1];
           } else if (allUuids && allUuids.length > 0) {
               uuidToTry = allUuids[0];
           }
       }

       if (uuidToTry) {
          try {
             console.log(`  - Trying to refresh expired URL using ID: ${uuidToTry}`);
             const freshUrl = await fetchTelnyxRecording(uuidToTry);
             if (freshUrl) {
                console.log(`  > Got fresh URL.`);
                audioUrl = freshUrl;
                // Update DB to help frontend too
                await db.update(callSessions).set({ recordingUrl: freshUrl }).where(eq(callSessions.id, session.id));
             } else {
                console.log(`  > Could not refresh URL.`);
             }
          } catch (e) {
             console.log(`  > Error refreshing URL: ${e}`);
          }
       }
    }

    try {
      // 1. Transcribe
      console.log(`  - Transcribing...`);
      let transcript = await submitTranscription(audioUrl, {
        recordingS3Key: session.recordingS3Key
      });

      if (!transcript) {
        console.log(`  - Google STT failed or empty. Trying Gemini fallback...`);
        const geminiResult = await transcribeWithGemini(audioUrl);
        if (geminiResult.success && geminiResult.transcript) {
            transcript = geminiResult.transcript;
            console.log(`  - Gemini fallback succeeded.`);
        }
      }

      if (!transcript) {
        console.log(`  - Transcription failed even with fallback.`);
        continue;
      }

      console.log(`  - Got transcript (${transcript.length} chars). Saving...`);
      
      await db.update(callSessions)
        .set({ aiTranscript: transcript })
        .where(eq(callSessions.id, session.id));

      session.aiTranscript = transcript;
    } catch (error) {
      console.error(`  - Error transcribing session ${session.id}:`, error);
      continue; // Skip analysis if transcription failed
    }

    // 2. Analyze (now that we have transcript)
    try {
      if (session.aiTranscript && session.aiTranscript.length > 15) {
        console.log(`  - Analyzing...`);
        const analysis = await analyzeConversationQuality({
            transcript: session.aiTranscript,
            interactionType: 'live_call',
            analysisStage: 'post_call',
            callDurationSeconds: session.durationSec || 0,
            disposition: session.aiDisposition || undefined,
            campaignId: session.campaignId || undefined,
            agentName: 'AI Agent',
        });

        console.log(`  - Analysis complete. Saving to db...`);
        
        // Save to callSessions
        await db.update(callSessions)
            .set({ aiAnalysis: analysis })
            .where(eq(callSessions.id, session.id));

        // Save to callQualityRecords
        await logCallIntelligence({
            callSessionId: session.id,
            campaignId: session.campaignId || undefined,
            contactId: session.contactId || undefined,
            qualityAnalysis: analysis,
            fullTranscript: session.aiTranscript
        });
        
        console.log(`  - Saved.`);
      }
    } catch (error) {
       console.error(`  - Error analyzing session ${session.id}:`, error);
    }
  }

  // Step 2: Find calls with transcript but missing analysis (in case Step 1 was partially done)
  // ... (Can implement if needed, but loop above covers flows)
  
  console.log('Backfill complete.');
}

backfillFeb9().catch(console.error).finally(() => process.exit(0));
