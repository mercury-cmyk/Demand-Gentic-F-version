import { db } from "./server/db";
import { campaigns } from "./shared/schema";
import { ilike } from "drizzle-orm";

async function findCampaign() {
  const results = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(ilike(campaigns.name, '%proton%'));

  console.log("Proton campaigns found:");
  console.log(JSON.stringify(results, null, 2));
}

findCampaign().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
