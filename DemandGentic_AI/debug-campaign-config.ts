/**
 * Debug: Verify RingCentral campaign has businessHoursConfig loaded
 */

import { storage } from "./server/storage";

async function debugCampaignConfig() {
  console.log("=== DEBUG: Campaign businessHoursConfig ===\n");

  const campaignId = "664aff97-ac3c-4fbb-a943-9b123ddb3fda";
  
  try {
    const campaign = await storage.getCampaign(campaignId);
    
    if (!campaign) {
      console.log("❌ Campaign not found!");
      return;
    }
    
    console.log("✅ Campaign found:");
    console.log(`  ID: ${campaign.id}`);
    console.log(`  Name: ${campaign.name}`);
    console.log(`  Status: ${campaign.status}`);
    console.log(`  Dial Mode: ${campaign.dialMode}`);
    
    console.log("\n📋 businessHoursConfig:");
    if (!campaign.businessHoursConfig) {
      console.log("  ❌ NOT FOUND (null/undefined)");
    } else {
      const config = campaign.businessHoursConfig as any;
      console.log(`  Enabled: ${config.enabled}`);
      console.log(`  Operating Days: ${JSON.stringify(config.operatingDays)}`);
      console.log(`  Start Time: ${config.startTime}`);
      console.log(`  End Time: ${config.endTime}`);
      console.log(`  Timezone: ${config.timezone}`);
      console.log(`  Respect Contact TZ: ${config.respectContactTimezone}`);
      
      // Check if Saturday is included
      if (config.operatingDays && Array.isArray(config.operatingDays)) {
        const hasSaturday = config.operatingDays.includes("saturday");
        console.log(`  \n  Saturday Included: ${hasSaturday ? "✅ YES" : "❌ NO"}`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
  
  process.exit(0);
}

debugCampaignConfig();