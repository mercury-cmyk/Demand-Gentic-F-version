#!/usr/bin/env tsx
/**
 * Restart Enrichment Job - Cancel old slow job and start new optimized one
 */

import { db } from '../db';
import { verificationEnrichmentJobs, verificationContacts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { queueEnrichmentJob } from '../lib/enrichment-queue';

const OLD_JOB_ID = '72d8f435-6445-4bd7-94c6-8866f52dfc14';
const CAMPAIGN_ID = '9ed0de24-2e46-4881-958c-2d2e7017f60b';

async function restartEnrichment() {
  console.log('🔄 Restarting enrichment with optimized settings...\n');

  try {
    // Cancel old job
    console.log(`❌ Cancelling old job: ${OLD_JOB_ID}`);
    await db
      .update(verificationEnrichmentJobs)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(verificationEnrichmentJobs.id, OLD_JOB_ID));
    
    console.log('✅ Old job cancelled\n');

    // Get reserved contacts for the campaign
    console.log('📥 Fetching reserved contacts...');
    const contacts = await db
      .select({ id: verificationContacts.id })
      .from(verificationContacts)
      .where(
        and(
          eq(verificationContacts.campaignId, CAMPAIGN_ID),
          eq(verificationContacts.reservedSlot, true)
        )
      );

    const contactIds = contacts.map(c => c.id);
    console.log(`Found ${contactIds.length} reserved contacts\n`);

    // Create new job record
    console.log('🚀 Creating new enrichment job...');
    const [job] = await db
      .insert(verificationEnrichmentJobs)
      .values({
        campaignId: CAMPAIGN_ID,
        userId: 'system', // System-initiated restart
        totalContacts: contactIds.length,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Queue the job
    await queueEnrichmentJob(
      job.id,
      CAMPAIGN_ID,
      'system',
      contactIds
    );

    console.log(`✅ New job started: ${job.id}`);
    console.log('\n📊 New Settings:');
    console.log('   - Concurrency: 10 (parallel processing)');
    console.log('   - Chunk size: 40 contacts');
    console.log('   - Rate limit: 40 jobs/minute');
    console.log('   - Contacts to process: ' + contactIds.length);
    console.log('   - Expected time: ~45-60 minutes (10x faster!)');
    console.log('\n✨ Enrichment job restarted successfully!\n');

  } catch (error) {
    console.error('❌ Error restarting enrichment:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

restartEnrichment();