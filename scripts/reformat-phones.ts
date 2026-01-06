#!/usr/bin/env tsx
/**
 * Batch reformat all phone numbers in the database to fix inconsistent E.164 formatting
 * Fixes issues like:
 * - UK numbers with "0" after country code: +4401908802874 → +441908802874
 * - Missing country codes
 */

import { db } from '../server/db';
import { contacts as contactsTable, accounts as accountsTable } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { normalizePhoneE164 } from '../server/normalization';

async function reformatAllPhones() {
  console.log('[BATCH REFORMAT] Starting phone number reformatting for all contacts and accounts...\n');
  
  let contactsUpdated = 0;
  let accountsUpdated = 0;
  const batchSize = 500;
  let offset = 0;
  
  // Process contacts in batches
  console.log('[BATCH REFORMAT] Processing contacts...');
  while (true) {
    const contacts = await db.select().from(contactsTable).limit(batchSize).offset(offset);
    if (contacts.length === 0) break;
    
    for (const contact of contacts) {
      let needsUpdate = false;
      const updates: any = {};
      
      // Reformat directPhone if exists
      // FORCE reformat from source field to fix UK "0" issue and missing "+" prefix
      if (contact.directPhone) {
        const reformatted = normalizePhoneE164(contact.directPhone, null); // Use null to force country detection
        if (reformatted) {
          // Always update to ensure proper formatting
          updates.directPhoneE164 = reformatted;
          needsUpdate = true;
          
          if (contactsUpdated < 10) {
            console.log(`  Example: ${contact.directPhone} → ${contact.directPhoneE164} => ${reformatted}`);
          }
        }
      }
      
      // Reformat mobilePhone if exists
      if (contact.mobilePhone) {
        const reformatted = normalizePhoneE164(contact.mobilePhone, null); // Use null to force country detection
        if (reformatted) {
          updates.mobilePhoneE164 = reformatted;
          needsUpdate = true;
        }
      }
      
      // Update if needed
      if (needsUpdate) {
        await db.update(contactsTable)
          .set(updates)
          .where(eq(contactsTable.id, contact.id));
        contactsUpdated++;
      }
    }
    
    offset += batchSize;
    if (offset % 5000 === 0) {
      console.log(`  Processed ${offset} contacts, updated ${contactsUpdated} so far...`);
    }
  }
  
  console.log(`[BATCH REFORMAT] Contacts complete: ${contactsUpdated} updated\n`);
  
  // Process accounts in batches
  console.log('[BATCH REFORMAT] Processing accounts...');
  offset = 0;
  while (true) {
    const accounts = await db.select().from(accountsTable).limit(batchSize).offset(offset);
    if (accounts.length === 0) break;
    
    for (const account of accounts) {
      let needsUpdate = false;
      const updates: any = {};
      
      // Reformat mainPhone if exists
      if (account.mainPhone) {
        const reformatted = normalizePhoneE164(account.mainPhone, account.hqCountry || undefined);
        if (reformatted && reformatted !== account.mainPhoneE164) {
          updates.mainPhoneE164 = reformatted;
          needsUpdate = true;
          
          if (accountsUpdated < 5) {
            console.log(`  Example: ${account.mainPhone} (${account.hqCountry || 'no country'}) → ${account.mainPhoneE164} => ${reformatted}`);
          }
        }
      }
      
      // Update if needed
      if (needsUpdate) {
        await db.update(accountsTable)
          .set(updates)
          .where(eq(accountsTable.id, account.id));
        accountsUpdated++;
      }
    }
    
    offset += batchSize;
    if (offset % 5000 === 0) {
      console.log(`  Processed ${offset} accounts, updated ${accountsUpdated} so far...`);
    }
  }
  
  console.log(`\n[BATCH REFORMAT] ✅ Complete!`);
  console.log(`  - Contacts updated: ${contactsUpdated}`);
  console.log(`  - Accounts updated: ${accountsUpdated}`);
  console.log(`  - Total: ${contactsUpdated + accountsUpdated}\n`);
  
  process.exit(0);
}

reformatAllPhones().catch(err => {
  console.error('[BATCH REFORMAT] Error:', err);
  process.exit(1);
});
