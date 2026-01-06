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
    for (let i = 0; i < contactsToUpdate.length; i += batchSize) {
      const batch = contactsToUpdate.slice(i, i + batchSize);
      
      for (const contact of batch) {
        try {
          stats.processed++;
          
          if (!contact.accountId) {
            stats.skipped++;
            continue;
          }

          // Get account data
          const account = await db
            .select()
            .from(accounts)
            .where(eq(accounts.id, contact.accountId))
            .limit(1);

          if (account.length === 0) {
            stats.skipped++;
            continue;
          }

          const accountData = account[0];

          // Build update data
          const updateData: any = {};
          let hasUpdates = false;

          // Update HQ fields if missing in contact but present in account
          if ((!contact.hqCountry || contact.hqCountry === '') && accountData.hqCountry) {
            updateData.hqCountry = accountData.hqCountry;
            hasUpdates = true;
          }
          
          if ((!contact.hqPhone || contact.hqPhone === '') && accountData.mainPhone) {
            updateData.hqPhone = accountData.mainPhone;
            hasUpdates = true;
          }

          // Also update other HQ fields if they're missing
          const hqFields = [
            { contact: 'hqAddress1', account: 'hqStreet1' },
            { contact: 'hqAddress2', account: 'hqStreet2' },
            { contact: 'hqAddress3', account: 'hqStreet3' },
            { contact: 'hqCity', account: 'hqCity' },
            { contact: 'hqState', account: 'hqState' },
            { contact: 'hqPostal', account: 'hqPostalCode' },
          ];

          for (const field of hqFields) {
            const contactValue = (contact as any)[field.contact];
            const accountValue = (accountData as any)[field.account];
            
            if ((!contactValue || contactValue === '') && accountValue) {
              updateData[field.contact] = accountValue;
              hasUpdates = true;
            }
          }

          if (hasUpdates) {
            updateData.updatedAt = new Date();
            
            await db
              .update(verificationContacts)
              .set(updateData)
              .where(eq(verificationContacts.id, contact.contactId));

            stats.updated++;
            
            if (stats.updated % 100 === 0) {
              console.log(`✓ Updated ${stats.updated} contacts...`);
            }
          } else {
            stats.skipped++;
          }
        } catch (error: any) {
          stats.errors++;
          console.error(`✗ Error updating contact ${contact.contactId}:`, error.message);
        }
      }
    }

    console.log('\n📈 BACKFILL RESULTS:');
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Updated:   ${stats.updated}`);
    console.log(`   Skipped:   ${stats.skipped}`);
    console.log(`   Errors:    ${stats.errors}`);
    console.log('\n✅ Backfill complete!\n');

  } catch (error: any) {
    console.error('\n❌ Backfill failed:', error.message);
    process.exit(1);
  }
}

// Get campaign ID from command line args
const campaignId = process.argv[2];

if (campaignId) {
  console.log(`🎯 Backfilling campaign: ${campaignId}\n`);
} else {
  console.log('🌍 Backfilling ALL verification campaigns\n');
}

backfillVerificationHqData(campaignId).then(() => {
  console.log('Done!');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
