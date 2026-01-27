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

  for (let i = 0; i < recentCalls.length; i++) {
    const call = recentCalls[i];

    // Get contact name if available
    let contactName = "Unknown";
    if (call.contactId) {
      const [contact] = await db.select({
        firstName: contacts.firstName,
        lastName: contacts.lastName
      })
        .from(contacts)
        .where(eq(contacts.id, call.contactId))
        .limit(1);
      if (contact) {
        contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || "Unknown";
      }
    }

    console.log("=".repeat(80));
    console.log(`CALL #${i + 1}`);
    console.log("=".repeat(80));
    console.log(`Contact: ${contactName}`);
    console.log(`Phone: ${call.toNumber}`);
    console.log(`Disposition: ${call.aiDisposition || 'N/A'}`);
    console.log(`Duration: ${call.durationSec ? call.durationSec + 's' : 'N/A'}`);
    console.log(`Time: ${call.createdAt}`);
    console.log("-".repeat(80));
    console.log("TRANSCRIPT:");
    console.log("-".repeat(80));

    if (call.aiTranscript) {
      console.log(call.aiTranscript);
    } else {
      console.log("(No transcript available)");
    }
    console.log("\n");
  }

  process.exit(0);
}

getRecentTranscripts().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
