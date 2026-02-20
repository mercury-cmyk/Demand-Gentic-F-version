/**
 * Quick utility to find and restore campaigns paused during deployment scaling
 * Usage: npx tsx restore-scale-paused-campaigns.ts
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    console.log('[Scale Pause Recovery] Checking for recently paused AI agent campaigns...\n');

    // Find campaigns paused in the last 5 minutes (typical scale event window)
    const recentlyPaused = await db.execute(sql`
      SELECT 
        c.id,
        c.name,
        c.status,
        c.dial_mode,
        c.updated_at,
        EXTRACT(EPOCH FROM (NOW() - c.updated_at)) as seconds_since_pause,
        COUNT(q.id) FILTER (WHERE q.status = 'queued') as queued_count
      FROM campaigns c
      LEFT JOIN campaign_queue q ON q.campaign_id = c.id
      WHERE c.dial_mode = 'ai_agent'
        AND c.status = 'paused'
        AND c.updated_at > NOW() - INTERVAL '5 minutes'
      GROUP BY c.id, c.name, c.status, c.dial_mode, c.updated_at
      ORDER BY c.updated_at DESC
    `);

    const campaigns = (recentlyPaused as any[]);
    
    if (campaigns.length === 0) {
      console.log('✅ No campaigns paused in the last 5 minutes. All campaigns are in good state.');
      return;
    }

    console.log(`⚠️ Found ${campaigns.length} campaigns paused recently (likely during scaling):\n`);
    
    for (const campaign of campaigns) {
      const secondsSince = Math.round(campaign.seconds_since_pause);
      const minutes = Math.round(secondsSince / 60);
      console.log(`  • ${campaign.name}`);
      console.log(`    ID: ${campaign.id}`);
      console.log(`    Paused: ${minutes} minute(s) ago`);
      console.log(`    Queued contacts: ${campaign.queued_count || 0}`);
      console.log('');
    }

    // Confirm before restore
    console.log('Restoring all recently paused campaigns to ACTIVE status...\n');

    const restoreResult = await db.execute(sql`
      UPDATE campaigns
      SET status = 'active',
          updated_at = NOW()
      WHERE dial_mode = 'ai_agent'
        AND status = 'paused'
        AND updated_at > NOW() - INTERVAL '5 minutes'
      RETURNING id, name, status
    `);

    const restored = (restoreResult as any).rows || [];
    console.log(`✅ Successfully restored ${restored.length} campaigns!\n`);

    for (const campaign of restored) {
      console.log(`  ✓ ${campaign.name}: ${campaign.status}`);
    }

    console.log('\n✅ All scaled-pause campaigns have been restored and will resume processing contacts.');

  } catch (error) {
    console.error('[Scale Pause Recovery] Error:', error);
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
});
