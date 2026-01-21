import { db } from '../server/db';
import { callSessions, leads, callAttempts, campaigns, campaignQueue } from '../shared/schema';
import { eq, and, isNotNull, desc, or, inArray, count } from 'drizzle-orm';

async function checkActiveCalls() {
  // Check active call sessions (connected, connecting, or ringing)
  const activeSessions = await db.select()
    .from(callSessions)
    .where(inArray(callSessions.status, ['connected', 'connecting', 'ringing']))
    .orderBy(desc(callSessions.createdAt))
    .limit(20);

  console.log('=== ACTIVE CALL SESSIONS ===');
  console.log('Count:', activeSessions.length);

  if (activeSessions.length > 0) {
    activeSessions.forEach(s => {
      console.log(`- ${s.id} | Contact: ${s.contactId} | Campaign: ${s.campaignId} | Created: ${s.createdAt}`);
    });
  }

  // Check recently created leads (any status)
  const recentLeads = await db.select()
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(30);

  console.log('\n=== RECENTLY CREATED LEADS ===');
  console.log('Count:', recentLeads.length);

  if (recentLeads.length > 0) {
    recentLeads.forEach(l => {
      console.log(`- ${l.id} | Contact: ${l.contactId} | Campaign: ${l.campaignId} | Status: ${l.aiQualificationStatus || 'pending'} | Created: ${l.createdAt}`);
    });
  }

  // Check recent call attempts
  const recentAttempts = await db.select()
    .from(callAttempts)
    .orderBy(desc(callAttempts.createdAt))
    .limit(20);

  console.log('\n=== RECENT CALL ATTEMPTS ===');
  console.log('Count:', recentAttempts.length);

  if (recentAttempts.length > 0) {
    recentAttempts.forEach(a => {
      console.log(`- ${a.id} | Contact: ${a.contactId} | Campaign: ${a.campaignId} | Status: ${a.status} | Created: ${a.createdAt}`);
    });
  }

  // Check active campaigns
  const activeCampaigns = await db.select()
    .from(campaigns)
    .where(eq(campaigns.status, 'active'));

  console.log('\n=== ACTIVE CAMPAIGNS ===');
  console.log('Count:', activeCampaigns.length);

  console.log(`\nEnv TELNYX_FROM_NUMBER: ${process.env.TELNYX_FROM_NUMBER || 'NOT SET'}`);

  for (const c of activeCampaigns) {
    console.log(`\n- ${c.id} | Name: ${c.name} | Status: ${c.status} | Dial Mode: ${c.dialMode}`);
    console.log(`  AI Settings: ${JSON.stringify(c.aiAgentSettings || {})}`);

    // Check queue for this campaign
    const queuedContacts = await db.select({ count: count() })
      .from(campaignQueue)
      .where(and(
        eq(campaignQueue.campaignId, c.id),
        eq(campaignQueue.status, 'queued')
      ));

    console.log(`  Queue: ${queuedContacts[0]?.count || 0} contacts queued`);
  }

  process.exit(0);
}

checkActiveCalls().catch(e => { console.error(e); process.exit(1); });
