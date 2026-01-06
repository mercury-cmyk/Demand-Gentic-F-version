/**
 * Background Job: Continuous AI Enrichment
 * Automatically identifies and queues contacts missing BOTH phone AND address for AI enrichment
 * Runs continuously to ensure all eligible contacts get enriched
 */

import cron from 'node-cron';
import { db } from '../db';
import { verificationCampaigns } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { identifyContactsForEnrichment, queueForEnrichment } from '../lib/continuous-enrichment';

// Run every 15 minutes to continuously scan for contacts needing enrichment
const ENRICHMENT_INTERVAL = '*/15 * * * *';

let isProcessing = false;

/**
 * Process all active campaigns and identify contacts needing enrichment
 */
async function processEnrichmentQueue(): Promise<void> {
  if (isProcessing) {
    console.log('[AI Enrichment Job] Already processing, skipping this run');
    return;
  }
  
  isProcessing = true;
  
  try {
    console.log('[AI Enrichment Job] Starting enrichment scan...');
    
    // Get all active verification campaigns
    const activeCampaigns = await db.execute(sql`
      SELECT id, name
      FROM verification_campaigns
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);
    
    if (activeCampaigns.rows.length === 0) {
      console.log('[AI Enrichment Job] No active campaigns found');
      return;
    }
    
    console.log(`[AI Enrichment Job] Scanning ${activeCampaigns.rows.length} active campaigns`);
    
    let totalQueued = 0;
    let totalScanned = 0;
    let campaignsWithWork = 0;
    
    // Process each campaign
    for (const campaign of activeCampaigns.rows as any[]) {
      try {
        // Identify contacts needing enrichment (missing BOTH phone and address)
        const result = await identifyContactsForEnrichment(campaign.id);
        
        totalScanned += result.stats.scanned;
        
        // Auto-queue contacts if any found
        if (result.needsBothEnrichment.length > 0) {
          const queued = await queueForEnrichment(result.needsBothEnrichment);
          totalQueued += queued;
          campaignsWithWork++;
          
          console.log(`[AI Enrichment Job] Campaign "${campaign.name}": Queued ${queued} contacts`);
        }
      } catch (error) {
        console.error(`[AI Enrichment Job] Error processing campaign ${campaign.id}:`, error);
      }
    }
    
    if (totalQueued > 0) {
      console.log(`[AI Enrichment Job] ✅ Completed: Queued ${totalQueued} contacts across ${campaignsWithWork} campaigns (scanned ${totalScanned} total)`);
    } else {
      console.log(`[AI Enrichment Job] ✓ No contacts need enrichment (scanned ${totalScanned} contacts)`);
    }
  } catch (error) {
    console.error('[AI Enrichment Job] Error:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Manually trigger AI enrichment (for on-demand execution)
 */
export async function triggerAiEnrichment(): Promise<{ success: boolean; message: string; stats?: any }> {
  try {
    console.log('[AI Enrichment Job] Manual trigger initiated');
    await processEnrichmentQueue();
    return { success: true, message: 'AI enrichment completed successfully' };
  } catch (error: any) {
    console.error('[AI Enrichment Job] Manual trigger error:', error);
    return { success: false, message: error.message || 'AI enrichment failed' };
  }
}

/**
 * Start the continuous AI enrichment job
 */
export function startAiEnrichmentJob(): void {
  console.log(`[AI Enrichment Job] Starting continuous enrichment job (runs every 15 minutes)`);
  console.log(`[AI Enrichment Job] Target: Contacts missing BOTH Best Phone AND Best Address`);
  
  // Schedule the cron job
  cron.schedule(ENRICHMENT_INTERVAL, async () => {
    await processEnrichmentQueue();
  });
  
  // Run immediately on startup (after 30 seconds delay to let the system initialize)
  setTimeout(async () => {
    console.log('[AI Enrichment Job] Running initial enrichment scan...');
    await processEnrichmentQueue();
  }, 30000);
}
