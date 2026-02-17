import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { campaigns } from "../shared/schema";
import {
  AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME,
  AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE,
} from "../server/services/agentic-demand-voice-lift";

async function run() {
  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      aiAgentSettings: campaigns.aiAgentSettings,
    })
    .from(campaigns)
    .where(eq(campaigns.name, AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME))
    .limit(1);

  if (!campaign) {
    console.log(`Campaign not found: ${AGENTIC_DEMAND_VOICE_CAMPAIGN_NAME}`);
    return;
  }

  const aiSettings = ((campaign.aiAgentSettings as any) || {}) as Record<string, any>;
  const scripts = { ...(aiSettings.scripts || {}) };
  scripts.opening = AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE;

  await db
    .update(campaigns)
    .set({
      aiAgentSettings: {
        ...aiSettings,
        scripts,
      } as any,
      callScript:
        `OPENING:\n"${AGENTIC_DEMAND_VARIANT_B_IDENTITY_TEMPLATE}"\n\n` +
        `IF IDENTITY CONFIRMED:\n` +
        `"This is [Agent Name] from DemandGentic. Quick reason for my call: we help B2B demand gen leaders replace spray-and-pray outreach using Problem Intelligence and Solution Mapping. Do you have 30 seconds for a quick overview?"`,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaign.id));

  console.log(`Updated campaign opening for ${campaign.id} (${campaign.name})`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to update campaign opening:", error);
    process.exit(1);
  });

