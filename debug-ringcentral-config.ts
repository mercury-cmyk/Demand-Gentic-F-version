/**
 * Debug: Check what's actually stored in the database for RingCentral campaign
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const RINGCENTRAL_CAMPAIGN_ID = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';

async function debugCampaignConfig() {
  console.log('=== Debug RingCentral Campaign Config ===\n');

  try {
    // Get raw campaign data
    const result = await db.execute(sql`
      SELECT 
        id,
        name,
        type,
        status,
        timezone,
        business_hours_config,
        dial_mode,
        updated_at
      FROM campaigns
      WHERE id = ${RINGCENTRAL_CAMPAIGN_ID}
    `);

    const campaign = result.rows[0] as any;
    if (!campaign) {
      console.log('❌ Campaign not found');
      process.exit(1);
    }

    console.log(`Campaign: ${campaign.name}`);
    console.log(`ID: ${campaign.id}`);
    console.log(`Type: ${campaign.type}`);
    console.log(`Status: ${campaign.status}`);
    console.log(`Dial Mode: ${campaign.dial_mode}`);
    console.log(`Updated At: ${campaign.updated_at}`);
    console.log(`\nTimezone (top-level): ${campaign.timezone || 'null'}`);
    
    console.log(`\nBusiness Hours Config (raw):`, campaign.business_hours_config);
    console.log(`\nBusiness Hours Config (formatted):`);
    console.log(JSON.stringify(campaign.business_hours_config, null, 2));

    // Check current time
    const timeResult = await db.execute(sql`
      SELECT NOW() as current_time
    `);
    const currentTime = new Date(timeResult.rows[0].current_time as string);
    console.log(`\nCurrent Server Time: ${currentTime.toISOString()}`);
    console.log(`Day: ${currentTime.toLocaleString('en-US', { weekday: 'long' })}`);
    console.log(`Time: ${currentTime.toLocaleTimeString('en-US', { hour12: false })}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugCampaignConfig();
