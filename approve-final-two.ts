/**
 * Approve remaining 2 under_review leads
 * Updates omarbhatti@beares.com and amir@asseticom.co.uk to approved & qualified
 */

import { db } from "./server/db";
import { leads } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";

const emailsToApprove = [
  "omarbhatti@beares.com",
  "amir@asseticom.co.uk",
];

async function approveFinalTwo() {
  console.log(`\n🔍 Finding final 2 under_review leads...\n`);

  // Find these specific leads
  const underReviewLeads = await db
    .select({
      id: leads.id,
      contactEmail: leads.contactEmail,
      contactName: leads.contactName,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      aiQualificationStatus: leads.aiQualificationStatus,
    })
    .from(leads)
    .where(inArray(leads.contactEmail, emailsToApprove));

  console.log(`📊 Found ${underReviewLeads.length} leads:\n`);
  
  underReviewLeads.forEach((lead, idx) => {
    console.log(`  ${idx + 1}. ${lead.contactEmail} - ${lead.contactName || 'No name'}`);
    console.log(`     Current: qaStatus="${lead.qaStatus}", aiQualificationStatus="${lead.aiQualificationStatus || 'not set'}"\n`);
  });

  if (underReviewLeads.length === 0) {
    console.log('⚠️  No leads found to approve.');
    return;
  }

  console.log('🔄 Updating to approved & qualified...\n');

  const leadIds = underReviewLeads.map(l => l.id);
  await db
    .update(leads)
    .set({
      qaStatus: 'approved',
      qaDecision: 'Approved by QAA - final batch',
      aiQualificationStatus: 'qualified',
      updatedAt: new Date(),
    })
    .where(inArray(leads.id, leadIds));

  console.log(`✅ Successfully approved & qualified ${underReviewLeads.length} leads!\n`);
  
  underReviewLeads.forEach(lead => {
    console.log(`  ✓ ${lead.contactEmail} - ${lead.contactName}`);
  });

  console.log('\n✅ All QAA leads are now approved & qualified!\n');
}

approveFinalTwo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error approving final leads:', error);
    process.exit(1);
  });
