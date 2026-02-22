/**
 * Qualify approved leads
 * Updates all approved leads from the email list to set aiQualificationStatus='qualified'
 */

import { db } from "./server/db";
import { leads } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";

const emailsToQualify = [
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

async function qualifyLeads() {
  console.log(`\n🔍 Searching for approved leads with ${emailsToQualify.length} email addresses...\n`);

  // Find all approved leads matching these emails
  const approvedLeads = await db
    .select({
      id: leads.id,
      contactEmail: leads.contactEmail,
      contactName: leads.contactName,
      accountName: leads.accountName,
      qaStatus: leads.qaStatus,
      aiQualificationStatus: leads.aiQualificationStatus,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.contactEmail, emailsToQualify),
        eq(leads.qaStatus, 'approved')
      )
    );

  console.log(`📊 Found ${approvedLeads.length} approved leads:\n`);

  // Group by qualification status
  const byQualStatus: Record<string, typeof approvedLeads> = {};
  approvedLeads.forEach(lead => {
    const status = lead.aiQualificationStatus || 'null';
    if (!byQualStatus[status]) byQualStatus[status] = [];
    byQualStatus[status].push(lead);
  });

  // Display summary
  Object.entries(byQualStatus).forEach(([status, leadsInStatus]) => {
    console.log(`  aiQualificationStatus="${status}": ${leadsInStatus.length} leads`);
  });
  console.log('');

  // All approved leads will be qualified
  if (approvedLeads.length === 0) {
    console.log('⚠️  No approved leads found to qualify.');
    return;
  }

  console.log(`✅ Qualifying ${approvedLeads.length} approved leads:\n`);
  approvedLeads.forEach((lead, idx) => {
    const qualStatus = lead.aiQualificationStatus || 'not set';
    console.log(`  ${idx + 1}. ${lead.contactEmail} - ${lead.contactName || 'No name'} [Current: ${qualStatus}]`);
  });

  console.log('\n🔄 Updating aiQualificationStatus to "qualified"...\n');

  // Update all approved leads to qualified
  const leadIds = approvedLeads.map(l => l.id);
  await db
    .update(leads)
    .set({
      aiQualificationStatus: 'qualified',
      updatedAt: new Date(),
    })
    .where(inArray(leads.id, leadIds));

  console.log(`✅ Successfully qualified ${approvedLeads.length} approved leads!\n`);

  // Show what changed
  const alreadyQualified = approvedLeads.filter(l => l.aiQualificationStatus === 'qualified').length;
  const newlyQualified = approvedLeads.length - alreadyQualified;

  console.log('📊 Qualification Summary:');
  console.log(`  Total approved leads processed: ${approvedLeads.length}`);
  console.log(`  Already qualified: ${alreadyQualified}`);
  console.log(`  Newly qualified: ${newlyQualified}`);
  console.log('\n✅ Done! All approved leads are now qualified.\n');
}

qualifyLeads()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error qualifying leads:', error);
    process.exit(1);
  });
