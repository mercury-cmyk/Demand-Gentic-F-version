import { db } from './db';
import { sql } from 'drizzle-orm';

/**
 * Monitor campaign status changes to detect auto-pause events during scaling
 * This utility helps identify when campaigns are being paused unexpectedly
 */
export async function monitorCampaignStatusChanges() {
  try {
    const recentUpdates = await db.execute(sql`
      SELECT 
        c.id,
        c.name,
        c.status,
        c.dial_mode,
        c.updated_at,
        c.created_at,
        EXTRACT(EPOCH FROM (NOW() - c.updated_at)) as seconds_since_update
      FROM campaigns c
      WHERE c.dial_mode = 'ai_agent'
        AND c.updated_at > NOW() - INTERVAL '5 minutes'
      ORDER BY c.updated_at DESC
      LIMIT 50
    `);

    const paused = (recentUpdates as any[]).filter(c => c.status === 'paused');
    
    if (paused.length > 0) {
      console.warn(`[Campaign Monitor] ⚠️ ${paused.length} AI agent campaigns recently paused:`);
      paused.forEach((c: any) => {
        const secondsSince = Math.round(c.seconds_since_update);
        console.warn(`  - ${c.name} (${c.id}): paused ${secondsSince}s ago`);
      });
      return { paused, total: (recentUpdates as any[]).length };
    }

    return { paused: [], total: (recentUpdates as any[]).length };
  } catch (error) {
    console.error('[Campaign Monitor] Error checking campaign status:', error);
    return { paused: [], total: 0, error };
  }
}

/**
 * Emergency restore for campaigns paused during scaling
 * Only resumes campaigns that were paused in the last few minutes (scale event window)
 */
export async function emergencyRestoreScalePausedCampaigns() {
  try {
    const result = await db.execute(sql`
      UPDATE campaigns
      SET status = 'active',
          updated_at = NOW(),
          stall_reason = 'Restored after deployment scale pause event'
      WHERE dial_mode = 'ai_agent'
        AND status = 'paused'
        AND updated_at > NOW() - INTERVAL '5 minutes'
      RETURNING id, name, status
    `);

    if ((result as any).rowCount > 0) {
      console.log(`[Campaign Restore] ✅ Restored ${(result as any).rowCount} campaigns from scale pause event`);
      return { restored: (result as any).rowCount };
    }
    
    return { restored: 0 };
  } catch (error) {
    console.error('[Campaign Restore] Error restoring campaigns:', error);
    return { restored: 0, error };
  }
}

/**
 * Check in database to see if campaigns were paused due to scaling
 */
export async function checkForScalePausedCampaigns() {
  try {
    const result = await db.execute(sql`
      SELECT id, name, status, updated_at
      FROM campaigns
      WHERE dial_mode = 'ai_agent'
        AND status = 'paused'
        AND updated_at > NOW() - INTERVAL '5 minutes'
        AND updated_at < NOW() - INTERVAL '30 seconds'
      ORDER BY updated_at DESC
    `);

    return (result as any);
  } catch (error) {
    console.error('[Campaign Scale Check] Error:', error);
    return [];
  }
}
