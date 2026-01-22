/**
 * Quick check for leads with call_attempt_id
 */
import { db } from '../server/db';
import { leads, dialerCallAttempts } from '../shared/schema';
import { eq, sql, and } from 'drizzle-orm';

async function check() {
  // Check leads table for any with callAttemptId
  const leadsWithAttempts = await db
    .select({ 
      id: leads.id, 
      callAttemptId: leads.callAttemptId,
      qaStatus: leads.qaStatus 
    })
    .from(leads)
    .where(sql`${leads.callAttemptId} IS NOT NULL`);
  
  console.log('Leads with callAttemptId:', leadsWithAttempts.length);
  for (const l of leadsWithAttempts) {
    console.log(`  - Lead ${l.id} -> callAttemptId: ${l.callAttemptId}`);
  }

  // Check the qualified calls
  const qualifiedCalls = await db
    .select({
      id: dialerCallAttempts.id,
      disposition: dialerCallAttempts.disposition,
      dispositionProcessed: dialerCallAttempts.dispositionProcessed,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.disposition, 'qualified_lead'));

  console.log('\nQualified call attempts:', qualifiedCalls.length);
  for (const c of qualifiedCalls) {
    // Check if lead exists for this call
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.callAttemptId, c.id))
      .limit(1);
    
    console.log(`  - ${c.id} | processed: ${c.dispositionProcessed} | hasLead: ${!!existingLead}`);
  }

  // Also check leads table structure
  const allLeads = await db
    .select({ 
      id: leads.id, 
      callAttemptId: leads.callAttemptId,
      contactId: leads.contactId,
      qaStatus: leads.qaStatus,
      createdAt: leads.createdAt
    })
    .from(leads)
    .limit(10);

  console.log('\nRecent leads sample:');
  for (const l of allLeads) {
    console.log(`  - Lead ${l.id.substring(0,8)}... | callAttemptId: ${l.callAttemptId || 'NULL'} | contactId: ${l.contactId?.substring(0,8) || 'NULL'}...`);
  }

  process.exit(0);
}

check().catch(console.error);
