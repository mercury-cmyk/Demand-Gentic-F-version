#!/usr/bin/env tsx
/**
 * EFFICIENT batch phone reformat - processes in small chunks to avoid timeout
 */

import { db } from '../server/db';
import { contacts as contactsTable, accounts as accountsTable } from '../shared/schema';
import { eq, and, or, isNotNull, sql } from 'drizzle-orm';
import { normalizePhoneE164 } from '../server/normalization';

const BATCH_SIZE = 100; // Small batches to avoid timeout
const MAX_BATCHES = 850; // Process max 85K contacts (850 batches * 100)

async function reformatPhonesBatch() {
  console.log(`[BATCH REFORMAT] Starting efficient phone reformatting...`);
  console.log(`  - Batch size: ${BATCH_SIZE}`);
  console.log(`  - Max batches: ${MAX_BATCHES}\n`);
  
  let totalContactsUpdated = 0;
  let totalAccountsUpdated = 0;
  let batchNum = 0;
  
  // Process contacts
  console.log('[CONTACTS] Processing...');
  
  while (batchNum < MAX_BATCHES) {
    // Fetch contacts with phone numbers
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(
        or(
          isNotNull(contactsTable.directPhone),
          isNotNull(contactsTable.mobilePhone)
        )
      )
      .limit(BATCH_SIZE)
      .offset(batchNum * BATCH_SIZE);
    
    if (contacts.length === 0) break;
    
    let batchUpdated = 0;
    
    for (const contact of contacts) {
      const updates: any = {};
      
      // Reformat directPhone
      if (contact.directPhone) {
        const reformatted = normalizePhoneE164(contact.directPhone, null);
        if (reformatted) {
          updates.directPhoneE164 = reformatted;
        }
      }
      
      // Reformat mobilePhone
      if (contact.mobilePhone) {
        const reformatted = normalizePhoneE164(contact.mobilePhone, null);
        if (reformatted) {
          updates.mobilePhoneE164 = reformatted;
        }
      }
      
      // Update if needed
      if (Object.keys(updates).length > 0) {
        await db.update(contactsTable)
          .set(updates)
          .where(eq(contactsTable.id, contact.id));
        batchUpdated++;
        totalContactsUpdated++;
      }
    }
    
    batchNum++;
    
    if (batchNum % 10 === 0) {
      console.log(`  Batch ${batchNum}/${MAX_BATCHES}: Processed ${batchNum * BATCH_SIZE} contacts, updated ${totalContactsUpdated} total`);
    }
  }
  
  console.log(`[CONTACTS] ✅ Complete: ${totalContactsUpdated} updated\n`);
  
  // Process accounts
  console.log('[ACCOUNTS] Processing...');
  batchNum = 0;
  
  while (batchNum < MAX_BATCHES) {
    const accounts = await db
      .select()
      .from(accountsTable)
      .where(isNotNull(accountsTable.mainPhone))
      .limit(BATCH_SIZE)
      .offset(batchNum * BATCH_SIZE);
    
    if (accounts.length === 0) break;
    
    for (const account of accounts) {
      if (account.mainPhone) {
        const reformatted = normalizePhoneE164(account.mainPhone, account.hqCountry || null);
        if (reformatted) {
          await db.update(accountsTable)
            .set({ mainPhoneE164: reformatted })
            .where(eq(accountsTable.id, account.id));
          totalAccountsUpdated++;
        }
      }
    }
    
    batchNum++;
    
    if (batchNum % 10 === 0) {
      console.log(`  Batch ${batchNum}: Processed ${batchNum * BATCH_SIZE} accounts, updated ${totalAccountsUpdated} total`);
    }
  }
  
  console.log(`\n[BATCH REFORMAT] ✅ COMPLETE!`);
  console.log(`  - Contacts updated: ${totalContactsUpdated}`);
  console.log(`  - Accounts updated: ${totalAccountsUpdated}`);
  console.log(`  - Total: ${totalContactsUpdated + totalAccountsUpdated}\n`);
  
  process.exit(0);
}

reformatPhonesBatch().catch(err => {
  console.error('[BATCH REFORMAT] Error:', err);
  process.exit(1);
});
