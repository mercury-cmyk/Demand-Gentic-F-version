import { db } from "../server/db";
import { callSessions, contacts } from "../shared/schema";
import { desc, isNotNull, eq } from "drizzle-orm";

async function getRecentTranscripts() {
  console.log("Fetching recent call transcripts...\n");

  const recentCalls = await db.select({
    id: callSessions.id,
    toNumber: callSessions.toNumberE164,
    aiDisposition: callSessions.aiDisposition,
    aiTranscript: callSessions.aiTranscript,
    durationSec: callSessions.durationSec,
    createdAt: callSessions.createdAt,
    contactId: callSessions.contactId,
  })
    .from(callSessions)
    .where(isNotNull(callSessions.aiTranscript))
    .orderBy(desc(callSessions.createdAt))
    .limit(15);

  console.log(`Found ${recentCalls.length} calls with transcripts:\n`);

  for (let i = 0; i  {
  console.error("Error:", error);
  process.exit(1);
});