/**
 * Approve QAA-qualified leads
 * Updates leads from qaStatus='new' to qaStatus='approved' for given email addresses
 */

import { db } from "./server/db";
import { leads } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";

const emailsToApprove = [
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

async function approveLeads() {
  console.log(`\n🔍 Searching for leads with ${emailsToApprove.length} email addresses...\n`);

  // Find all leads matching these emails
  const matchingLeads = await db
    .select({
      id: leads.id,
      contactEmail: leads.contactEmail,
      contactName: leads.contactName,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      campaignId: leads.campaignId,
    })
    .from(leads)
    .where(inArray(leads.contactEmail, emailsToApprove));

  console.log(`📊 Found ${matchingLeads.length} leads matching these emails:\n`);

  // Group by qaStatus
  const byStatus: Record = {};
  matchingLeads.forEach(lead => {
    const status = lead.qaStatus || 'null';
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(lead);
  });

  // Display summary
  Object.entries(byStatus).forEach(([status, leadsInStatus]) => {
    console.log(`  ${status}: ${leadsInStatus.length} leads`);
  });
  console.log('');

  // Filter leads that need approval (qaStatus = 'new')
  const leadsToApprove = matchingLeads.filter(l => l.qaStatus === 'new');

  if (leadsToApprove.length === 0) {
    console.log('✅ No leads found with qaStatus="new". All leads are already processed.');
    
    // Show what statuses exist
    console.log('\n📋 Current status breakdown:');
    Object.entries(byStatus).forEach(([status, leadsInStatus]) => {
      console.log(`  • ${status}: ${leadsInStatus.length} leads`);
      leadsInStatus.slice(0, 3).forEach(l => {
        console.log(`    - ${l.contactEmail} (${l.contactName || 'No name'})`);
      });
      if (leadsInStatus.length > 3) {
        console.log(`    ... and ${leadsInStatus.length - 3} more`);
      }
    });
    
    return;
  }

  console.log(`\n✅ Found ${leadsToApprove.length} leads with qaStatus="new" that will be approved:\n`);
  leadsToApprove.forEach((lead, idx) => {
    console.log(`  ${idx + 1}. ${lead.contactEmail} - ${lead.contactName || 'No name'} at ${lead.accountName || 'No company'}`);
  });

  console.log('\n🔄 Updating qaStatus to "approved" and aiQualificationStatus to "qualified"...\n');

  // Update leads to approved AND qualified
  const leadIds = leadsToApprove.map(l => l.id);
  const result = await db
    .update(leads)
    .set({
      qaStatus: 'approved',
      qaDecision: 'Approved by QAA - batch approval',
      aiQualificationStatus: 'qualified',
      updatedAt: new Date(),
    })
    .where(inArray(leads.id, leadIds));

  console.log(`✅ Successfully approved and qualified ${leadsToApprove.length} leads!\n`);

  // Show summary of what was approved
  console.log('📊 Approval Summary:');
  console.log(`  Total emails provided: ${emailsToApprove.length}`);
  console.log(`  Leads found in database: ${matchingLeads.length}`);
  console.log(`  Leads approved (new → approved): ${leadsToApprove.length}`);
  console.log(`  Leads already processed: ${matchingLeads.length - leadsToApprove.length}`);

  // Show emails that weren't found
  const foundEmails = new Set(matchingLeads.map(l => l.contactEmail).filter(Boolean));
  const notFound = emailsToApprove.filter(email => !foundEmails.has(email));
  
  if (notFound.length > 0) {
    console.log(`\n⚠️  ${notFound.length} emails not found in leads table:`);
    notFound.forEach(email => console.log(`  - ${email}`));
  }

  console.log('\n✅ Done!\n');
}

approveLeads()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error approving leads:', error);
    process.exit(1);
  });