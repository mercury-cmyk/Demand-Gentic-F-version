import { db } from '../db';
import { verificationContacts, verificationSuppressionList } from '@shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

const campaignId = '0e956879-e99c-4d10-83b7-e2b31ea57689';

async function applySuppressionForCampaign() {
  console.log(`[Suppression] Starting suppression check for campaign ${campaignId}...`);
  
  // Get all non-suppressed contacts
  const contacts = await db
    .select({ 
      id: verificationContacts.id,
      emailLower: verificationContacts.emailLower,
      cavId: verificationContacts.cavId,
      cavUserId: verificationContacts.cavUserId,
    })
    .from(verificationContacts)
    .where(
      and(
        eq(verificationContacts.campaignId, campaignId),
        eq(verificationContacts.suppressed, false),
        eq(verificationContacts.deleted, false)
      )
    );
  
  console.log(`[Suppression] Found ${contacts.length} contacts to check`);
  
  // Get suppression list for campaign
  const suppressionEntries = await db
    .select()
    .from(verificationSuppressionList)
    .where(eq(verificationSuppressionList.campaignId, campaignId));
  
  console.log(`[Suppression] Loaded ${suppressionEntries.length} suppression entries`);
  
  // Build lookup sets for fast matching
  const suppressedEmails = new Set<string>();
  const suppressedCavIds = new Set<string>();
  const suppressedCavUserIds = new Set<string>();
  
  for (const entry of suppressionEntries) {
    if (entry.emailLower) suppressedEmails.add(entry.emailLower);
    if (entry.cavId) suppressedCavIds.add(entry.cavId);
    if (entry.cavUserId) suppressedCavUserIds.add(entry.cavUserId);
  }
  
  console.log(`[Suppression] Emails: ${suppressedEmails.size}, CAV IDs: ${suppressedCavIds.size}, CAV User IDs: ${suppressedCavUserIds.size}`);
  
  // Find matching contacts
  const toSuppress: string[] = [];
  
  for (const contact of contacts) {
    const matchEmail = contact.emailLower && suppressedEmails.has(contact.emailLower);
    const matchCavId = contact.cavId && suppressedCavIds.has(contact.cavId);
    const matchCavUserId = contact.cavUserId && suppressedCavUserIds.has(contact.cavUserId);
    
    if (matchEmail || matchCavId || matchCavUserId) {
      toSuppress.push(contact.id);
    }
  }
  
  console.log(`[Suppression] Found ${toSuppress.length} contacts to suppress`);
  
  if (toSuppress.length > 0) {
    // Batch update in chunks of 1000
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < toSuppress.length; i += CHUNK_SIZE) {
      const chunk = toSuppress.slice(i, i + CHUNK_SIZE);
      await db
        .update(verificationContacts)
        .set({ suppressed: true, updatedAt: new Date() })
        .where(inArray(verificationContacts.id, chunk));
      console.log(`[Suppression] Updated ${Math.min(i + CHUNK_SIZE, toSuppress.length)}/${toSuppress.length}`);
    }
  }
  
  console.log(`[Suppression] Complete! Suppressed ${toSuppress.length} contacts`);
  process.exit(0);
}

applySuppressionForCampaign().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
