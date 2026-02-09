import 'dotenv/config';
import { db } from './server/db';
import { sql, eq, inArray } from 'drizzle-orm';
import { contacts, accounts, lists, campaignQueue } from '@shared/schema';
import { storage } from './server/storage';
import { getBestPhoneForContact } from './server/lib/phone-utils';

const CAMPAIGN_ID = '664aff97-ac3c-4fbb-a943-9b123ddb3fda';
const LIST_ID = '935562d2-ba00-4d0f-9fe7-1fe8a90ff7af';

async function main() {
  console.log('=== Pre-test Queue Status ===');
  const q = await db.execute(sql`SELECT COUNT(*) as c FROM campaign_queue WHERE campaign_id = ${CAMPAIGN_ID}`);
  console.log(`Queue total: ${q.rows[0]?.c}`);

  // 1. Get list
  const [list] = await db.select().from(lists).where(eq(lists.id, LIST_ID)).limit(1);
  if (!list?.recordIds) { console.log('List not found'); process.exit(1); }
  console.log(`List has ${list.recordIds.length} contact IDs`);

  // 2. Resolve contacts
  let allContacts: any[] = [];
  for (let i = 0; i < list.recordIds.length; i += 1000) {
    const batch = list.recordIds.slice(i, i + 1000);
    const batchContacts = await storage.getContactsByIds(batch);
    allContacts.push(...batchContacts);
  }
  console.log(`Resolved ${allContacts.length} contacts`);

  // 3. Dedup + accountId
  const unique = Array.from(new Map(allContacts.map(c => [c.id, c])).values());
  const withAccount = unique.filter(c => c.accountId);
  console.log(`${unique.length} unique -> ${withAccount.length} with account`);

  // 4. Phone validation
  const phoneValid: any[] = [];
  for (let i = 0; i < withAccount.length; i += 500) {
    const batch = withAccount.slice(i, i + 500);
    const ids = batch.map(c => c.id);
    const full = await db.select().from(contacts).leftJoin(accounts, eq(contacts.accountId, accounts.id)).where(inArray(contacts.id, ids));
    for (const row of full) {
      const phone = getBestPhoneForContact({
        directPhone: row.contacts.directPhone, directPhoneE164: row.contacts.directPhoneE164,
        mobilePhone: row.contacts.mobilePhone, mobilePhoneE164: row.contacts.mobilePhoneE164,
        country: row.contacts.country, hqPhone: row.accounts?.mainPhone, hqPhoneE164: row.accounts?.mainPhoneE164,
      });
      if (phone.phone) phoneValid.push(row);
    }
  }
  console.log(`With callable phone: ${phoneValid.length}`);

  // 5. Dedup against existing queue
  const existing = await db.select({ contactId: campaignQueue.contactId }).from(campaignQueue).where(eq(campaignQueue.campaignId, CAMPAIGN_ID));
  const existingSet = new Set(existing.map(q => q.contactId));
  const newContacts = phoneValid.filter(row => !existingSet.has(row.contacts.id));
  console.log(`Already in queue: ${phoneValid.length - newContacts.length}, New to enqueue: ${newContacts.length}`);

  // 6. Enqueue
  if (newContacts.length > 0) {
    const toEnqueue = newContacts.map(row => ({
      contactId: row.contacts.id, accountId: row.contacts.accountId!, priority: 100,
    }));
    console.log(`\nEnqueuing ${toEnqueue.length} contacts...`);
    const start = Date.now();
    const { enqueued } = await storage.bulkEnqueueContacts(CAMPAIGN_ID, toEnqueue);
    console.log(`DONE: ${enqueued} enqueued in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } else {
    console.log('\nAll contacts already in queue.');
  }

  // 7. Post-test
  const qAfter = await db.execute(sql`
    SELECT status, COUNT(*) as count FROM campaign_queue WHERE campaign_id = ${CAMPAIGN_ID} GROUP BY status ORDER BY status
  `);
  console.log('\n=== Post-test Queue Status ===');
  let total = 0;
  for (const r of qAfter.rows) { console.log(`  ${r.status}: ${r.count}`); total += Number(r.count); }
  console.log(`  TOTAL: ${total}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });