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
  
  while (batchNum  0) {
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
  
  while (batchNum  {
  console.error('[BATCH REFORMAT] Error:', err);
  process.exit(1);
});