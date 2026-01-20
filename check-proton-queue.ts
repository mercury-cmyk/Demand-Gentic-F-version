import { db } from "./server/db";
import { campaignQueue } from "./shared/schema";
import { eq, desc } from "drizzle-orm";

const CAMPAIGN_ID = "ae5b353d-64a9-44d8-92cf-69d4726ca121";

async function checkQueue() {
  console.log("Proton UK Campaign Queue Status:");
  
  const items = await db
    .select()
    .from(campaignQueue)
    .where(eq(campaignQueue.campaignId, CAMPAIGN_ID))
    .orderBy(desc(campaignQueue.updatedAt))
    .limit(10);

  for (const item of items) {
    console.log("  -", item.status, "|", "attempts:", item.attempts, "|", "contactId:", item.contactId.slice(0,8));
  }
  
  console.log("\nTotal queued items:", items.length);
  
  // Count by status
  const statuses = items.reduce((acc: any, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});
  console.log("By status:", statuses);
}

checkQueue().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
