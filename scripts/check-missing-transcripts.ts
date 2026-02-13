
import { db } from "../server/db";
import { callSessions } from "@shared/schema";
import { gt, and, isNotNull, isNull, desc, eq, or, sql } from "drizzle-orm";

async function main() {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  console.log(`Checking calls since ${threeDaysAgo.toISOString()}...`);

  // Find calls with recordings
  const calls = await db
    .select({
      id: callSessions.id,
      createdAt: callSessions.createdAt,
      recordingUrl: callSessions.recordingUrl,
      recordingS3Key: callSessions.recordingS3Key,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
    })
    .from(callSessions)
    .where(
        and(
            gt(callSessions.createdAt, threeDaysAgo),
            or(isNotNull(callSessions.recordingUrl), isNotNull(callSessions.recordingS3Key))
        )
    )
    .orderBy(desc(callSessions.createdAt));

  console.log(`Found ${calls.length} calls with recordings in the last 3 days.`);

  const missingTranscript = calls.filter(c => !c.aiTranscript || c.aiTranscript.length < 10);
  console.log(`${missingTranscript.length} calls are missing full transcripts.`);

  for (const call of missingTranscript) {
      console.log(`- Call ${call.id} (${call.durationSec}s) missing transcript. Recording: ${call.recordingS3Key || 'URL'}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
