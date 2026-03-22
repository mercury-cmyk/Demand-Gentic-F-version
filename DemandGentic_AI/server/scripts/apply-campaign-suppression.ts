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
  const suppressedEmails = new Set();
  const suppressedCavIds = new Set();
  const suppressedCavUserIds = new Set();
  
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
    for (let i = 0; i  {
  console.error('Error:', err);
  process.exit(1);
});