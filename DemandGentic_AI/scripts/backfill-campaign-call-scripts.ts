import { db } from "../server/db";
import { campaigns } from "../shared/schema";
import { eq, and, isNull } from "drizzle-orm";

type CampaignRecord = {
  id: string;
  name: string | null;
  type: string | null;
  callScript: string | null;
  aiAgentSettings: any;
  campaignObjective: string | null;
  productServiceInfo: string | null;
  targetAudienceDescription: string | null;
  successCriteria: string | null;
  talkingPoints: string[] | null;
  campaignObjections: Array | null;
};

const buildCampaignCallScript = (data: CampaignRecord): string | null => {
  const parts: string[] = [];

  if (
    data.campaignObjective ||
    data.productServiceInfo ||
    data.targetAudienceDescription ||
    data.successCriteria
  ) {
    parts.push(
      [
        "# Campaign Context",
        data.campaignObjective ? `Objective: ${data.campaignObjective}` : null,
        data.productServiceInfo ? `Product/Service: ${data.productServiceInfo}` : null,
        data.targetAudienceDescription
          ? `Target Audience: ${data.targetAudienceDescription}`
          : null,
        data.successCriteria ? `Success Criteria: ${data.successCriteria}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (Array.isArray(data.talkingPoints) && data.talkingPoints.length > 0) {
    parts.push(
      [
        "# Talking Points",
        ...data.talkingPoints.map(
          (point: string, index: number) => `${index + 1}. ${point}`
        ),
      ].join("\n")
    );
  }

  if (Array.isArray(data.campaignObjections) && data.campaignObjections.length > 0) {
    parts.push(
      [
        "# Objections",
        ...data.campaignObjections.map((item, index) => {
          if (item?.objection || item?.response) {
            return `${index + 1}. ${item?.objection || "Objection"}: ${item?.response || ""}`.trim();
          }
          return `${index + 1}. ${String(item)}`;
        }),
      ].join("\n")
    );
  }

  const scripts = data.aiAgentSettings?.scripts;
  if (scripts) {
    parts.push(
      [
        "# Call Script",
        scripts.opening ? `Opening: ${scripts.opening}` : null,
        scripts.gatekeeper ? `Gatekeeper: ${scripts.gatekeeper}` : null,
        scripts.pitch ? `Pitch: ${scripts.pitch}` : null,
        scripts.objections ? `Objections: ${scripts.objections}` : null,
        scripts.closing ? `Closing: ${scripts.closing}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const result = parts.filter(Boolean).join("\n\n").trim();
  return result.length > 0 ? result : null;
};

async function backfillCallScripts() {
  console.log("Starting campaign callScript backfill...");

  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      callScript: campaigns.callScript,
      aiAgentSettings: campaigns.aiAgentSettings,
      campaignObjective: campaigns.campaignObjective,
      productServiceInfo: campaigns.productServiceInfo,
      targetAudienceDescription: campaigns.targetAudienceDescription,
      successCriteria: campaigns.successCriteria,
      talkingPoints: campaigns.talkingPoints,
      campaignObjections: campaigns.campaignObjections,
    })
    .from(campaigns)
    .where(
      and(
        isNull(campaigns.callScript),
        // Handle both legacy and current naming
        // @ts-expect-error type union in schema
        eq(campaigns.type, "call")
      )
    );

  // Also include campaigns with empty callScript
  const emptyRows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      callScript: campaigns.callScript,
      aiAgentSettings: campaigns.aiAgentSettings,
      campaignObjective: campaigns.campaignObjective,
      productServiceInfo: campaigns.productServiceInfo,
      targetAudienceDescription: campaigns.targetAudienceDescription,
      successCriteria: campaigns.successCriteria,
      talkingPoints: campaigns.talkingPoints,
      campaignObjections: campaigns.campaignObjections,
    })
    .from(campaigns)
    .where(
      and(
        // @ts-expect-error type union in schema
        eq(campaigns.type, "call"),
        // @ts-expect-error drizzle string length comparison
        eq(campaigns.callScript, "")
      )
    );

  const targets = [...rows, ...emptyRows];
  if (targets.length === 0) {
    console.log("No campaigns require backfill.");
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const campaign of targets as CampaignRecord[]) {
    const callScript = buildCampaignCallScript(campaign);
    if (!callScript) {
      skipped++;
      continue;
    }

    await db
      .update(campaigns)
      .set({
        callScript,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    updated++;
    console.log(`Updated: ${campaign.name || campaign.id}`);
  }

  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}`);
}

backfillCallScripts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });