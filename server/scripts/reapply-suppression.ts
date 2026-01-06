import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Reapply suppression logic to all verification campaigns
 * This script uses an optimized single SQL query to update suppression flags
 * New logic: Email, CAV ID, CAV User ID only (name+company hash removed)
 */
async function reapplySuppressionLogic() {
  console.log('[SUPPRESSION MIGRATION] Starting suppression logic reapplication...');
  console.log('[SUPPRESSION MIGRATION] New logic: Email, CAV ID, CAV User ID only');
  console.log('[SUPPRESSION MIGRATION] Using optimized bulk SQL update...');
  
  try {
    const startTime = Date.now();
    
    // Single optimized SQL query that:
    // 1. Resets all suppressed flags to false
    // 2. Sets suppressed = true for contacts matching the new 3-field logic
    const result = await db.execute(sql`
      WITH suppression_matches AS (
        SELECT DISTINCT vc.id
        FROM verification_contacts vc
        INNER JOIN verification_suppression_list vsl ON (
          -- Match on Email (lowercase)
          (vc.email_lower = vsl.email_lower AND vsl.email_lower IS NOT NULL)
          -- Match on CAV ID
          OR (vc.cav_id = vsl.cav_id AND vsl.cav_id IS NOT NULL)
          -- Match on CAV User ID
          OR (vc.cav_user_id = vsl.cav_user_id AND vsl.cav_user_id IS NOT NULL)
        )
        WHERE 
          vc.deleted = FALSE
          AND (vsl.campaign_id = vc.campaign_id OR vsl.campaign_id IS NULL)
      )
      UPDATE verification_contacts
      SET suppressed = CASE 
        WHEN id IN (SELECT id FROM suppression_matches) THEN TRUE
        ELSE FALSE
      END,
      updated_at = NOW()
      WHERE deleted = FALSE
      RETURNING id, suppressed
    `);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Count results
    const totalUpdated = result.rowCount || 0;
    const suppressedCount = result.rows.filter((r: any) => r.suppressed === true).length;
    const unsuppressedCount = totalUpdated - suppressedCount;
    
    console.log('\n[SUPPRESSION MIGRATION] ========================================');
    console.log(`[SUPPRESSION MIGRATION] COMPLETED SUCCESSFULLY in ${duration}s`);
    console.log(`[SUPPRESSION MIGRATION] Total contacts updated: ${totalUpdated}`);
    console.log(`[SUPPRESSION MIGRATION] Contacts suppressed: ${suppressedCount}`);
    console.log(`[SUPPRESSION MIGRATION] Contacts unsuppressed: ${unsuppressedCount}`);
    console.log(`[SUPPRESSION MIGRATION] Suppression rate: ${((suppressedCount / totalUpdated) * 100).toFixed(2)}%`);
    console.log('[SUPPRESSION MIGRATION] ========================================\n');
    
    // Get per-campaign stats
    console.log('[SUPPRESSION MIGRATION] Per-campaign breakdown:');
    const campaignStats = await db.execute(sql`
      SELECT 
        vc.campaign_id,
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE suppressed = TRUE) as suppressed_count,
        COUNT(*) FILTER (WHERE suppressed = FALSE) as active_count
      FROM verification_contacts vc
      WHERE deleted = FALSE
      GROUP BY vc.campaign_id
      ORDER BY vc.campaign_id
    `);
    
    for (const stat of campaignStats.rows) {
      const campaignId = (stat as any).campaign_id;
      const total = Number((stat as any).total_contacts);
      const suppressed = Number((stat as any).suppressed_count);
      const active = Number((stat as any).active_count);
      const rate = ((suppressed / total) * 100).toFixed(2);
      
      console.log(`  Campaign ${campaignId}:`);
      console.log(`    Total: ${total} | Suppressed: ${suppressed} (${rate}%) | Active: ${active}`);
    }
    
  } catch (error) {
    console.error('[SUPPRESSION MIGRATION] ERROR:', error);
    throw error;
  }
}

// Run the script
reapplySuppressionLogic()
  .then(() => {
    console.log('[SUPPRESSION MIGRATION] Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[SUPPRESSION MIGRATION] Script failed:', error);
    process.exit(1);
  });
