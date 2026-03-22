/**
 * Debug transcript format for Jan 30-31 calls
 */

import "dotenv/config";
import { db } from "./server/db";
import { callSessions } from "@shared/schema";
import { and, gte, lt, isNotNull } from "drizzle-orm";

async function debugTranscripts() {
  console.log("Debugging transcript formats for Jan 30-31, 2026...\n");

  const startDate = new Date("2026-01-30T00:00:00Z");
  const endDate = new Date("2026-02-01T00:00:00Z");

  const sessions = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
    })
    .from(callSessions)
    .where(
      and(
        gte(callSessions.startedAt, startDate),
        lt(callSessions.startedAt, endDate),
        isNotNull(callSessions.aiTranscript)
      )
    )
    .limit(10);

  console.log(`Found ${sessions.length} sessions with transcripts\n`);

  for (const session of sessions) {
    console.log("=".repeat(80));
    console.log(`Session: ${session.id}`);
    console.log(`Disposition: ${session.aiDisposition}`);
    console.log(`Duration: ${session.durationSec}s`);
    console.log(`\nTranscript type: ${typeof session.aiTranscript}`);
    
    if (session.aiTranscript) {
      const transcript = session.aiTranscript;
      if (Array.isArray(transcript)) {
        console.log(`Transcript is array with ${transcript.length} items`);
        if (transcript.length > 0) {
          console.log(`First item keys: ${Object.keys(transcript[0]).join(", ")}`);
          console.log(`First item: ${JSON.stringify(transcript[0], null, 2)}`);
          
          // Check for user messages
          const userMsgs = transcript.filter((t: any) => t.role === "user");
          console.log(`User messages: ${userMsgs.length}`);
          if (userMsgs.length > 0) {
            console.log(`User content: ${userMsgs.map((m: any) => m.message || m.text || m.content || "NO_TEXT").join(" | ")}`);
          }
        }
      } else if (typeof transcript === "string") {
        console.log(`Transcript is string, length: ${transcript.length}`);
        console.log(`Preview: ${transcript.substring(0, 500)}`);
      } else {
        console.log(`Transcript object keys: ${Object.keys(transcript).join(", ")}`);
        console.log(`Preview: ${JSON.stringify(transcript, null, 2).substring(0, 500)}`);
      }
    }
    console.log();
  }
}

debugTranscripts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });