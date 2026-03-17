import { db } from "../server/db";
import { campaigns } from "@shared/schema";
import { ilike, or } from "drizzle-orm";
import * as fs from "fs";

async function run() {
  const camps = await db.query.campaigns.findMany({
    where: or(
      ilike(campaigns.name, "%UK Export%"),
      ilike(campaigns.name, "%UKEF%"),
      ilike(campaigns.name, "%CIO IT%"),
      ilike(campaigns.name, "%Argyle%")
    )
  });
  
  const results = camps.map(c => ({
    name: c.name,
    id: c.id,
    dialMode: c.dialMode,
    aiAgentSettings: c.aiAgentSettings,
    campaignObjective: c.campaignObjective,
    productServiceInfo: c.productServiceInfo,
    talkingPoints: c.talkingPoints,
    targetAudienceDescription: c.targetAudienceDescription,
    campaignObjections: c.campaignObjections,
    successCriteria: c.successCriteria,
    campaignContextBrief: c.campaignContextBrief,
    callFlow: c.callFlow
  }));
  
  fs.writeFileSync('.tmp/campaigns.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log("Wrote to .tmp/campaigns.json");
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
