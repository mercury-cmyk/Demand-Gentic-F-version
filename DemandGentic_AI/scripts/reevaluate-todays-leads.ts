import { db } from '../server/db';
import { leads } from '../shared/schema';
import { gte } from 'drizzle-orm';
import { analyzeLeadQualification } from '../server/services/ai-qa-analyzer';

async function reEvaluateTodaysLeads() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  console.log(`Finding leads created today (${today.toISOString()})...`);
  
  const todaysLeads = await db.select({
    id: leads.id,
    contactName: leads.contactName,
    qaStatus: leads.qaStatus,
    callDuration: leads.callDuration,
    createdAt: leads.createdAt
  })
  .from(leads)
  .where(gte(leads.createdAt, today));
  
  console.log(`Found ${todaysLeads.length} leads created today`);
  
  if (todaysLeads.length === 0) {
    console.log('No leads to re-evaluate');
    return;
  }
  
  let processed = 0;
  let updated = 0;
  let failed = 0;
  
  for (const lead of todaysLeads) {
    try {
      processed++;
      console.log(`[${processed}/${todaysLeads.length}] Re-evaluating lead: ${lead.id} (${lead.contactName || 'Unknown'}) - Duration: ${lead.callDuration || 0}s, Status: ${lead.qaStatus}`);
      
      const result = await analyzeLeadQualification(lead.id);
      if (result) {
        updated++;
        console.log(`  ✓ Updated - Score: ${result.score}, Status: ${result.qualification_status}`);
      } else {
        console.log(`  ⚠ No analysis returned (may lack transcript)`);
      }
    } catch (error: any) {
      failed++;
      console.error(`  ✗ Failed:`, error.message);
    }
  }
  
  console.log('');
  console.log('========== SUMMARY ==========');
  console.log(`Total leads: ${todaysLeads.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log('==============================');
}

reEvaluateTodaysLeads().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });