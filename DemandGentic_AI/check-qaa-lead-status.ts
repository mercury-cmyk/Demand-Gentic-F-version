/**
 * Check status of all QAA leads
 * Shows current qaStatus and aiQualificationStatus for all leads in the batch
 */

import { db } from "./server/db";
import { leads } from "@shared/schema";
import { inArray } from "drizzle-orm";

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

async function checkLeadStatus() {
  console.log(`\n📊 Checking status of ${emailsToCheck.length} leads...\n`);

  const allLeads = await db
    .select({
      id: leads.id,
      contactEmail: leads.contactEmail,
      contactName: leads.contactName,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      aiQualificationStatus: leads.aiQualificationStatus,
    })
    .from(leads)
    .where(inArray(leads.contactEmail, emailsToCheck));

  console.log(`Found ${allLeads.length} leads in database:\n`);

  // Group by qaStatus
  const byQaStatus: Record = {};
  allLeads.forEach(lead => {
    const status = lead.qaStatus || 'null';
    if (!byQaStatus[status]) byQaStatus[status] = [];
    byQaStatus[status].push(lead);
  });

  console.log('📋 QA Status Breakdown:\n');
  Object.entries(byQaStatus).forEach(([status, leadsInStatus]) => {
    console.log(`  ${status}: ${leadsInStatus.length} leads`);
  });

  // Check if any are still in new or under_review
  const stillPending = allLeads.filter(l => 
    l.qaStatus === 'new' || l.qaStatus === 'under_review'
  );

  console.log('\n');
  
  if (stillPending.length > 0) {
    console.log(`⚠️  ${stillPending.length} leads still pending (new or under_review):\n`);
    stillPending.forEach(lead => {
      console.log(`  • ${lead.contactEmail} - ${lead.contactName || 'No name'}`);
      console.log(`    Status: ${lead.qaStatus} | AI Qual: ${lead.aiQualificationStatus || 'not set'}\n`);
    });
  } else {
    console.log('✅ No leads in "new" or "under_review" status!\n');
  }

  // Show approved & qualified count
  const approvedAndQualified = allLeads.filter(l => 
    l.qaStatus === 'approved' && l.aiQualificationStatus === 'qualified'
  );
  
  console.log(`✅ ${approvedAndQualified.length} leads are APPROVED & QUALIFIED\n`);

  // Show any approved but not qualified
  const approvedNotQualified = allLeads.filter(l =>
    l.qaStatus === 'approved' && l.aiQualificationStatus !== 'qualified'
  );

  if (approvedNotQualified.length > 0) {
    console.log(`⚠️  ${approvedNotQualified.length} leads are approved but NOT qualified:\n`);
    approvedNotQualified.forEach(lead => {
      console.log(`  • ${lead.contactEmail} - AI Qual: ${lead.aiQualificationStatus || 'not set'}`);
    });
    console.log('');
  }

  // Show rejected
  const rejected = allLeads.filter(l => l.qaStatus === 'rejected');
  if (rejected.length > 0) {
    console.log(`❌ ${rejected.length} leads were rejected\n`);
  }

  // Show summary
  console.log('📊 Final Summary:');
  console.log(`  Total leads checked: ${emailsToCheck.length}`);
  console.log(`  Found in database: ${allLeads.length}`);
  console.log(`  Approved & Qualified: ${approvedAndQualified.length}`);
  console.log(`  Still Pending Review: ${stillPending.length}`);
  console.log(`  Rejected: ${rejected.length}`);
  console.log(`  Not found: ${emailsToCheck.length - allLeads.length}`);
  console.log('');
}

checkLeadStatus()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error checking lead status:', error);
    process.exit(1);
  });