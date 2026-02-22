/**
 * Trigger RingCentral campaign queue reprocessing to pick up new Saturday business hours
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

const RINGCENTRAL_CAMPAIGN_ID = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';

async function triggerQueueReprocessing() {
  console.log('=== Trigger RingCentral Queue Reprocessing ===\n');

  try {
    // Clear the stall reason so orchestrator knows to retry
    const campaignUpdate = await db.execute(sql`
      UPDATE campaigns
      SET last_stall_reason = NULL,
          last_stall_reason_at = NULL,
          updated_at = NOW()
      WHERE id = ${RINGCENTRAL_CAMPAIGN_ID}
      RETURNING name, status, dial_mode, business_hours_config
    `);

    if (campaignUpdate.rows.length === 0) {
      console.log('❌ Campaign not found');
      process.exit(1);
    }

    const campaign = campaignUpdate.rows[0] as any;
    console.log(`✅ Cleared stall reason for: ${campaign.name}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Dial Mode: ${campaign.dial_mode}`);
    console.log(`\n📋 Current Business Hours Config:`);
    console.log(JSON.stringify(campaign.business_hours_config, null, 2));

    // Update queue status to trigger reprocessing
    const resetResult = await db.execute(sql`
      UPDATE campaign_queue
      SET status = 'queued',
          next_attempt_at = NOW(),
          updated_at = NOW(),
          enqueued_reason = 'saturday_override|business_hours_updated'
      WHERE campaign_id = ${RINGCENTRAL_CAMPAIGN_ID}
        AND status = 'queued'
        AND next_attempt_at > NOW()
    `);

    console.log(`\n✅ Ready to process on Saturday!`);
    console.log(`   Operating days now include: saturday`);
    console.log(`   Business hours: 9:00 AM - 6:00 PM (each contact's local timezone)`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. The orchestrator will pick up contacts next cycle`);
    console.log(`   2. Contacts will be evaluated against the new Saturday business hours`);
    console.log(`   3. Calls will resume automatically for contacts in call windows`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

triggerQueueReprocessing();
