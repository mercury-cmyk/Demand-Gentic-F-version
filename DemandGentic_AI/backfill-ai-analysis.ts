import { db } from "./server/db";
import { callSessions } from "./shared/schema";
import { eq, isNull, and, sql } from "drizzle-orm";

async function backfillAiAnalysis() {
  console.log("Starting backfill of missing AI Analysis...");

  // Find sessions with transcript but no analysis (or partial analysis missing summary)
  const sessionsToFix = await db.select()
    .from(callSessions)
    .where(
      and(
        sql`length(${callSessions.aiTranscript}) > 0`,
        sql`(${callSessions.aiAnalysis} IS NULL OR ${callSessions.aiAnalysis}->>'summary' IS NULL)`
      )
    );

  console.log(`Found ${sessionsToFix.length} sessions with transcript but missing analysis.`);

  let updatedCount = 0;
  for (const session of sessionsToFix) {
    const isVoicemail = session.aiDisposition === 'voicemail';
    
    // basic fallback analysis
    const analysis = {
      summary: isVoicemail ? 'Call reached voicemail (Historic).' : 'Conversation recorded (Historic).',
      sentiment: 'neutral',
      outcome: session.aiDisposition || 'completed',
      keyTopics: isVoicemail ? ['voicemail'] : [],
      nextSteps: [],
      conversationState: {
        currentState: 'unknown',
        stateHistory: []
      }
    };

    await db.update(callSessions)
      .set({ aiAnalysis: analysis })
      .where(eq(callSessions.id, session.id));
    
    updatedCount++;
  }

  console.log(`Successfully backfilled analysis for ${updatedCount} sessions.`);
  
  // also handle recent empty voicemail sessions (no transcript, but dispo=voicemail)
  const emptyVoicemails = await db.select()
    .from(callSessions)
    .where(
      and(
         // checks for null or empty transcript
         sql`(${callSessions.aiTranscript} IS NULL OR length(${callSessions.aiTranscript}) = 0)`,
         isNull(callSessions.aiAnalysis),
         eq(callSessions.aiDisposition, 'voicemail')
      )
    );

  console.log(`Found ${emptyVoicemails.length} empty voicemail sessions to fix.`);
  
  for (const session of emptyVoicemails) {
      const analysis = {
      summary: 'Call reached voicemail (No transcript captured).',
      sentiment: 'neutral',
      outcome: 'voicemail',
      keyTopics: ['voicemail'],
      nextSteps: ['retry'],
      conversationState: { currentState: 'GATEKEEPER', stateHistory: [] }
    };

    await db.update(callSessions)
      .set({ aiAnalysis: analysis })
      .where(eq(callSessions.id, session.id));
      
    updatedCount++;
  }

  console.log(`Total sessions updated: ${updatedCount}`);
  process.exit(0);
}

backfillAiAnalysis().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
});