/**
 * Backfill HQ Data for Verification Contacts
 * 
 * Populates missing hqCountry, hqPhone, and other HQ fields in verification_contacts
 * from the linked accounts table. This is critical for smart address selection.
 */

import { db } from '../server/db';
import { verificationContacts, accounts } from '../shared/schema';
import { eq, and, or, isNull } from 'drizzle-orm';

async function backfillVerificationHqData(campaignId?: string) {
  console.log('🔄 Starting Verification Contacts HQ Data Backfill...\n');
  
  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Build where clause
    const whereConditions = [eq(verificationContacts.deleted, false)];
    if (campaignId) {
      whereConditions.push(eq(verificationContacts.campaignId, campaignId));
    }

    // Find all verification contacts that have accountId
    const contactsToUpdate = await db
      .select({
        contactId: verificationContacts.id,
        accountId: verificationContacts.accountId,
        hqCountry: verificationContacts.hqCountry,
        hqPhone: verificationContacts.hqPhone,
      })
      .from(verificationContacts)
      .where(and(...whereConditions));

    console.log(`📊 Found ${contactsToUpdate.length} contacts to backfill\n`);

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i  {
  console.log('Done!');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});