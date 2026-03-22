import { db } from "./server/db";
import { callSessions, campaigns, contacts, accounts } from "./shared/schema";
import { eq, desc } from "drizzle-orm";

async function checkDbResults() {
  console.log("Checking DB results using NEW ROUTE LOGIC...");

  let baseQuery = db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      status: callSessions.status,
      createdAt: callSessions.createdAt,
    })
    .from(callSessions)
    .leftJoin(campaigns, eq(callSessions.campaignId, campaigns.id))
    .orderBy(desc(callSessions.createdAt));

  // Simulate params
  const limitNum = 100;
  const campaignId = 'all';

  if (campaignId && campaignId !== 'all') {
      // @ts-ignore
      baseQuery = baseQuery.where(eq(callSessions.campaignId, campaignId));
  }

  // Apply limit
  // @ts-ignore
  const callSessionsData = await baseQuery.limit(limitNum);
  
  console.log(`[QA] Found ${callSessionsData.length} call sessions in DB`);
  if (callSessionsData.length > 0) {
      console.log("Sample:", callSessionsData[0]);
  }
  
  process.exit(0);
}

checkDbResults().catch(console.error);