
import { db } from "./server/db";
import { callSessions, campaigns, contacts, accounts } from "./shared/schema";
import { eq, desc } from "drizzle-orm";

async function checkDbResults() {
  console.log("Checking DB results for QA routes...");

  let callSessionsQuery = db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      contactId: callSessions.contactId,
      status: callSessions.status,
      agentType: callSessions.agentType,
      startedAt: callSessions.startedAt,
      endedAt: callSessions.endedAt,
      durationSec: callSessions.durationSec,
      aiTranscript: callSessions.aiTranscript,
      aiAnalysis: callSessions.aiAnalysis,
      aiDisposition: callSessions.aiDisposition,
      recordingUrl: callSessions.recordingUrl,
      createdAt: callSessions.createdAt,
      campaignName: campaigns.name,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      companyName: accounts.name,
    })
    .from(callSessions)
    .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
    .leftJoin(contacts, eq(callSessions.contactId, contacts.id))
    .leftJoin(accounts, eq(contacts.accountId, accounts.id))
    .orderBy(desc(callSessions.createdAt))
    .limit(10);

  const results = await callSessionsQuery;
  console.log(`Found ${results.length} call sessions.`);
  
  if (results.length > 0) {
      console.log("First result sample:", JSON.stringify(results[0], null, 2));
  } else {
      // Check just call sessions table
      const count = await db.select({ id: callSessions.id }).from(callSessions).limit(5);
      console.log(`Raw call_sessions count (limit 5): ${count.length}`);
  }
  
  process.exit(0);
}

checkDbResults().catch(console.error);
