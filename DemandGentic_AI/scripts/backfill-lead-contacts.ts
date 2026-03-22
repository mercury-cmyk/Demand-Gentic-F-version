/**
 * Backfill script to update leads that have "Unknown" contact names
 * with the actual contact information from the contacts table
 */
import { db } from '../server/db';
import { leads, contacts } from '../shared/schema';
import { eq, isNull, or } from 'drizzle-orm';

async function backfillLeadContacts() {
  console.log('[Backfill] Starting lead contact info backfill...');

  // Find leads with missing/unknown contact info
  const leadsToFix = await db.select({
    id: leads.id,
    contactId: leads.contactId,
    contactName: leads.contactName,
    contactEmail: leads.contactEmail,
  })
  .from(leads)
  .where(
    or(
      isNull(leads.contactName),
      eq(leads.contactName, ''),
      eq(leads.contactName, 'Unknown'),
      isNull(leads.contactEmail),
      eq(leads.contactEmail, '')
    )
  );

  console.log(`[Backfill] Found ${leadsToFix.length} leads with missing contact info`);

  let updated = 0;
  let skipped = 0;

  for (const lead of leadsToFix) {
    if (!lead.contactId) {
      console.log(`[Backfill] Lead ${lead.id} has no contactId - skipping`);
      skipped++;
      continue;
    }

    // Fetch contact info
    const [contact] = await db.select({
      fullName: contacts.fullName,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
    })
    .from(contacts)
    .where(eq(contacts.id, lead.contactId));

    if (!contact) {
      console.log(`[Backfill] Lead ${lead.id}: contact ${lead.contactId} not found - skipping`);
      skipped++;
      continue;
    }

    const contactName = contact.fullName || 
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      null;

    // Only update if we have better info
    const needsContactName = !lead.contactName || lead.contactName === 'Unknown' || lead.contactName === '';
    const needsContactEmail = !lead.contactEmail || lead.contactEmail === '';

    if (!needsContactName && !needsContactEmail) {
      skipped++;
      continue;
    }

    const updates: { contactName?: string; contactEmail?: string } = {};
    
    if (needsContactName && contactName) {
      updates.contactName = contactName;
    }
    if (needsContactEmail && contact.email) {
      updates.contactEmail = contact.email;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(leads)
        .set(updates)
        .where(eq(leads.id, lead.id));

      console.log(`[Backfill] Updated lead ${lead.id}: ${JSON.stringify(updates)}`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`[Backfill] Complete: ${updated} updated, ${skipped} skipped`);
}

backfillLeadContacts()
  .then(() => {
    console.log('[Backfill] Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Backfill] Error:', err);
    process.exit(1);
  });


// Callable leads count query (for campaign analytics)
async function countCallableLeads() {
  try {
    const result = await db.query(
      `SELECT c.campaign_id AS campaign_id,
              c.campaign_name AS campaign_name,
              COUNT(q.id) AS callable_leads
       FROM campaigns c
       JOIN campaignQueue q ON q.campaign_id = c.campaign_id
       WHERE c.active = true
         AND q.status = 'callable'
       ORDER BY c.campaign_id DESC
       LIMIT 1;`
    );
    console.log('[Callable Leads] Result:', result.rows || result);
  } catch (err) {
    console.error('[Callable Leads] Error:', err);
  }
}

// Uncomment to run callable leads count
// countCallableLeads();