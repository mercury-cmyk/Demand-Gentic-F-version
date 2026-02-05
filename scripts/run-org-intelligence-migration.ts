/**
 * Migration script to add organization_intelligence feature flag
 */
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { clientFeatureAccess, clientAccounts } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function runMigration() {
  console.log('[Migration] Starting organization_intelligence feature flag migration...');
  
  try {
    // Step 1: Add the enum value (if not exists)
    console.log('[Migration] Adding enum value...');
    try {
      await db.execute(sql`ALTER TYPE client_feature_flag ADD VALUE IF NOT EXISTS 'organization_intelligence'`);
      console.log('[Migration] ✅ Enum value added successfully');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log('[Migration] ℹ️ Enum value already exists');
      } else {
        throw e;
      }
    }
    
    // Step 2: Get all active client accounts
    console.log('[Migration] Fetching active client accounts...');
    const activeClients = await db
      .select({ id: clientAccounts.id, companyName: clientAccounts.companyName })
      .from(clientAccounts)
      .where(eq(clientAccounts.isActive, true));
    
    console.log(`[Migration] Found ${activeClients.length} active client accounts`);
    
    // Step 3: Enable the feature for all active clients
    let enabled = 0;
    let skipped = 0;
    
    for (const client of activeClients) {
      try {
        // Check if already exists
        const existing = await db
          .select()
          .from(clientFeatureAccess)
          .where(
            sql`${clientFeatureAccess.clientAccountId} = ${client.id} 
            AND ${clientFeatureAccess.feature} = 'organization_intelligence'`
          );
        
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        
        // Insert new feature access
        await db.insert(clientFeatureAccess).values({
          clientAccountId: client.id,
          feature: 'organization_intelligence' as any,
          isEnabled: true,
        });
        enabled++;
        console.log(`[Migration] ✅ Enabled for: ${client.companyName}`);
      } catch (e: any) {
        console.log(`[Migration] ⚠️ Skipped ${client.companyName}: ${e.message}`);
        skipped++;
      }
    }
    
    console.log('[Migration] ========================================');
    console.log(`[Migration] ✅ Migration complete!`);
    console.log(`[Migration]    Enabled: ${enabled}`);
    console.log(`[Migration]    Skipped: ${skipped}`);
    console.log('[Migration] ========================================');
    
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
