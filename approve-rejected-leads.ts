/**
 * Approve the 21 rejected leads
 * Updates rejected leads from the QAA batch to approved & qualified
 */

import { db } from "./server/db";
import { leads } from "@shared/schema";
import { inArray, eq, and } from "drizzle-orm";

const emailsToCheck = [
  "paul@bedfordindependent.co.uk",
  "mike@shapehistory.com",
  "paul.wigger@honestgrapes.co.uk",
  "felixvowles@busbyandfox.com",
  "andrew@december19.co.uk",
  "liz@liverpoollawsociety.org.uk",
  "david.croston@cpadjusting.com",
  "michael.cox@nijimagazine.com",
  "marieke@cannedwine.co",
  "john@youngspirits.co.uk",
  "kate@corepost.co.uk",
  "omarbhatti@beares.com",
  "remi@window-warehouse.co.uk",
  "isabelle@the-aop.org",
  "josh@fothergilltc.com",
  "pirvine@viioni.com",
  "bill@eleven-i.com",
  "hafiz@signaturetrading.co.uk",
  "pete@pvelectronics.co.uk",
  "shaun.thorp@losltd.co.uk",
  "james.spencer@holiday-host.co.uk",
  "jamie@hideandseek.travel",
  "emma@digitally-charged.com",
  "mark@unioncollective.co",
  "steven.bloor@domesticheroes.co.uk",
  "egrant@aerogen.co.uk",
  "keith@haviland.digital",
  "asiya@indusexperiences.co.uk",
  "k.phelan@petergribby.co.uk",
  "ianr@achievetec.com",
  "qasim.mushtaq@arcube.org",
  "odiri@c21media.net",
  "sarah@hometechcentre.co.uk",
  "greg@pandct.com",
  "katie@temptationsoxford.co.uk",
  "jim@thebushcraftstore.co.uk",
  "chris@aicinsure.co.uk",
  "jody.murphy@powerleague.co.uk",
  "jamie@revellstravel.com",
  "kiran@clouddolphin.co.uk",
  "sophia@supalife.shop",
  "helen@elementanimation.com",
  "gilbert.mudoti@gaincare.co.uk",
  "amir@asseticom.co.uk",
  "john@flexible-tubing.com",
  "darren@zealpackaging.com",
  "ross@tayloredcycles.com",
  "alan@breakeryard.com",
  "tim.heath@cybersecurityintelligence.com",
];

async function approveRejectedLeads() {
  console.log(`\n🔍 Finding rejected leads from QAA batch...\n`);

  // Find all rejected leads from this email list
  const rejectedLeads = await db
    .select({
      id: leads.id,
      contactEmail: leads.contactEmail,
      contactName: leads.contactName,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      rejectedReason: leads.rejectedReason,
      aiQualificationStatus: leads.aiQualificationStatus,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.contactEmail, emailsToCheck),
        eq(leads.qaStatus, 'rejected')
      )
    );

  console.log(`📊 Found ${rejectedLeads.length} rejected leads:\n`);

  if (rejectedLeads.length === 0) {
    console.log('✅ No rejected leads found to approve.');
    return;
  }

  rejectedLeads.forEach((lead, idx) => {
    console.log(`  ${idx + 1}. ${lead.contactEmail} - ${lead.contactName || 'No name'}`);
    console.log(`     Rejection reason: ${lead.rejectedReason || 'Not specified'}`);
    console.log(`     Current aiQualificationStatus: ${lead.aiQualificationStatus || 'not set'}\n`);
  });

  console.log(`🔄 Updating ${rejectedLeads.length} rejected leads to approved & qualified...\n`);

  const leadIds = rejectedLeads.map(l => l.id);
  await db
    .update(leads)
    .set({
      qaStatus: 'approved',
      qaDecision: 'Re-approved by QAA - override rejection',
      aiQualificationStatus: 'qualified',
      rejectedReason: null, // Clear rejection reason
      rejectedAt: null,
      rejectedById: null,
      updatedAt: new Date(),
    })
    .where(inArray(leads.id, leadIds));

  console.log(`✅ Successfully approved & qualified ${rejectedLeads.length} previously rejected leads!\n`);

  console.log('📋 Approved leads:');
  rejectedLeads.forEach((lead, idx) => {
    console.log(`  ${idx + 1}. ${lead.contactEmail} - ${lead.contactName || 'No name'} at ${lead.accountName || 'No company'}`);
  });

  console.log('\n✅ All QAA leads (including previously rejected) are now approved & qualified!\n');
}

approveRejectedLeads()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error approving rejected leads:', error);
    process.exit(1);
  });
