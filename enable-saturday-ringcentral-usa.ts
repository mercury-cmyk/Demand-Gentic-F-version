/**
 * Enable Saturday calling for RingCentral USA campaign for today only (2026-02-21)
 * Testing platform behavior with extended calling hours
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const RINGCENTRAL_CAMPAIGN_ID = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';
const RINGCENTRAL_CAMPAIGN_NAME = 'RingCentral_AppointmentGen';

async function enableSaturdayForRingCentral() {
  console.log('=== Enable Saturday Calling for RingCentral USA Campaign ===\n');
  console.log('Date: 2026-02-21 (Today)');
  console.log('Purpose: Testing platform behavior with extended calling hours\n');

  try {
    // Find the campaign
    const campaignResult = await db.execute(sql`
      SELECT id, name, type, business_hours_config
      FROM campaigns
      WHERE id = ${RINGCENTRAL_CAMPAIGN_ID} OR name = ${RINGCENTRAL_CAMPAIGN_NAME}
      LIMIT 1
    `);

    const campaign = campaignResult.rows[0] as any | undefined;
    if (!campaign) {
      console.log('❌ RingCentral campaign not found');
      process.exit(1);
    }

    console.log(`✅ Found Campaign: ${campaign.name}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Type: ${campaign.type}`);
    console.log(`   Region: USA\n`);

    // Get current business hours config
    const currentConfig = (campaign.business_hours_config as any) || {};
    console.log('📋 Current Business Hours Config:');
    console.log(JSON.stringify(currentConfig, null, 2));

    // Update config to include Saturday
    const updatedConfig = {
      ...currentConfig,
      enabled: currentConfig.enabled !== false, // Ensure enabled
      operatingDays: (() => {
        const days = Array.isArray(currentConfig.operatingDays)
          ? [...currentConfig.operatingDays]
          : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

        // Add Saturday if not already present
        if (!days.includes('saturday')) {
          days.push('saturday');
          return days.sort((a, b) => {
            const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            return dayOrder.indexOf(a) - dayOrder.indexOf(b);
          });
        }
        return days;
      })(),
      timezone: currentConfig.timezone || 'America/New_York', // Default to Eastern for USA
      startTime: currentConfig.startTime || '09:00',
      endTime: currentConfig.endTime || '18:00',
      respectContactTimezone: currentConfig.respectContactTimezone !== false,
      // Add metadata for tracking this override
      _saturdayOverrideDate: '2026-02-21',
      _note: 'Saturday calling enabled for testing on 2026-02-21 only',
    };

    console.log('\n📝 Updated Business Hours Config:');
    console.log(JSON.stringify(updatedConfig, null, 2));

    // Update the campaign using SQL
    await db.execute(sql`
      UPDATE campaigns 
      SET business_hours_config = ${JSON.stringify(updatedConfig)},
          updated_at = NOW()
      WHERE id = ${RINGCENTRAL_CAMPAIGN_ID}
    `);

    console.log('\n✅ Successfully updated RingCentral campaign!');
    console.log(`   Saturday calling is now ENABLED for USA region`);
    console.log(`   Operating days: ${updatedConfig.operatingDays.join(', ')}`);
    console.log(`   Business hours: ${updatedConfig.startTime} - ${updatedConfig.endTime}`);
    console.log(`   Timezone: ${updatedConfig.timezone}`);
    console.log(`\n⚠️  This is a temporary override for testing only`);
    console.log(`   Remember to revert tomorrow by removing 'saturday' from operatingDays`);

  } catch (error) {
    console.error('❌ Error updating campaign:', error);
    process.exit(1);
  }
}

enableSaturdayForRingCentral();
