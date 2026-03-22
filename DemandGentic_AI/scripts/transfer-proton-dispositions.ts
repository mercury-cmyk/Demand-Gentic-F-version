/**
 * Transfer Do Not Call and Unqualified Lead Dispositions
 * From: Proton UK campaign
 * To: Proton UK 2026 campaign
 *
 * This ensures contacts with these dispositions are not called again in the new campaign.
 *
 * Run with: npx tsx scripts/transfer-proton-dispositions.ts
 */

import { db } from "../server/db";
import {
  campaigns,
  dialerCallAttempts,
  campaignOptOuts,
  contacts,
  globalDnc
} from "../shared/schema";
import { eq, and, inArray, sql, like } from "drizzle-orm";

async function transferDispositions() {
  console.log("=".repeat(60));
  console.log("Disposition Transfer: Proton UK → Proton UK 2026");
  console.log("=".repeat(60));

  // Step 1: Find the source campaign (Proton UK)
  console.log("\n[1] Finding source campaign: Proton UK...");
  const [sourceCampaign] = await db
    .select()
    .from(campaigns)
    .where(like(campaigns.name, "%Proton UK%"))
    .limit(5);

  // Find all campaigns matching "Proton UK" pattern
  const sourceCampaigns = await db
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .where(like(campaigns.name, "%Proton UK%"));

  console.log("\nFound campaigns matching 'Proton UK':");
  sourceCampaigns.forEach(c => console.log(`  - ${c.name} (${c.id}) [${c.status}]`));

  // Find the original Proton UK (not 2026)
  const sourceMatch = sourceCampaigns.find(c =>
    c.name.toLowerCase().includes("proton uk") &&
    !c.name.toLowerCase().includes("2026")
  );

  // Find the target Proton UK 2026
  const targetMatch = sourceCampaigns.find(c =>
    c.name.toLowerCase().includes("proton uk") &&
    c.name.toLowerCase().includes("2026")
  );

  if (!sourceMatch) {
    console.error("\n❌ Could not find source campaign 'Proton UK'");
    console.log("Available campaigns:");
    const allCampaigns = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).limit(20);
    allCampaigns.forEach(c => console.log(`  - ${c.name}`));
    process.exit(1);
  }

  if (!targetMatch) {
    console.error("\n❌ Could not find target campaign 'Proton UK 2026'");
    process.exit(1);
  }

  console.log(`\n✅ Source Campaign: ${sourceMatch.name} (${sourceMatch.id})`);
  console.log(`✅ Target Campaign: ${targetMatch.name} (${targetMatch.id})`);

  // Step 2: Get all Do Not Call and Unqualified dispositions from source campaign
  console.log("\n[2] Finding dispositions to transfer...");

  const dispositionsToTransfer = ['do_not_call', 'invalid_data', 'not_interested', 'qualified_lead'];

  const callAttempts = await db
    .select({
      id: dialerCallAttempts.id,
      contactId: dialerCallAttempts.contactId,
      disposition: dialerCallAttempts.disposition,
      phoneDialed: dialerCallAttempts.phoneDialed,
      notes: dialerCallAttempts.notes,
      createdAt: dialerCallAttempts.createdAt,
    })
    .from(dialerCallAttempts)
    .where(
      and(
        eq(dialerCallAttempts.campaignId, sourceMatch.id),
        inArray(dialerCallAttempts.disposition, dispositionsToTransfer)
      )
    );

  console.log(`\nFound ${callAttempts.length} disposition records to transfer:`);

  // Group by disposition type
  const byDisposition: Record = {};
  callAttempts.forEach(ca => {
    const disp = ca.disposition || 'unknown';
    if (!byDisposition[disp]) byDisposition[disp] = [];
    byDisposition[disp].push(ca);
  });

  Object.entries(byDisposition).forEach(([disp, records]) => {
    console.log(`  - ${disp}: ${records.length} contacts`);
  });

  if (callAttempts.length === 0) {
    console.log("\n⚠️ No dispositions found to transfer. Exiting.");
    process.exit(0);
  }

  // Step 3: Get unique contact IDs
  const contactIds = [...new Set(callAttempts.filter(ca => ca.contactId).map(ca => ca.contactId!))] ;
  console.log(`\n[3] Unique contacts to suppress: ${contactIds.length}`);

  // Step 4: Check existing opt-outs to avoid duplicates
  console.log("\n[4] Checking for existing opt-outs...");

  const existingOptOuts = await db
    .select({ contactId: campaignOptOuts.contactId })
    .from(campaignOptOuts)
    .where(eq(campaignOptOuts.campaignId, targetMatch.id));

  const existingContactIds = new Set(existingOptOuts.map(o => o.contactId));
  const newContactIds = contactIds.filter(id => !existingContactIds.has(id));

  console.log(`  - Already opted out: ${existingContactIds.size}`);
  console.log(`  - New to add: ${newContactIds.length}`);

  // Step 5: Create opt-out records for target campaign
  if (newContactIds.length > 0) {
    console.log("\n[5] Creating campaign opt-outs...");

    const optOutRecords = newContactIds.map(contactId => {
      const originalRecord = callAttempts.find(ca => ca.contactId === contactId);
      return {
        campaignId: targetMatch.id,
        contactId: contactId,
        reason: `Transferred from ${sourceMatch.name}: ${originalRecord?.disposition || 'disposition unknown'}`,
        createdAt: new Date(),
      };
    });

    // Insert in batches of 100
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i 
    l.qaStatus === 'approved' ||
    l.aiQualificationStatus === 'qualified'
  );

  console.log(`  - Approved/Qualified leads to transfer: ${leadsToTransfer.length}`);

  const leadContactIds = [...new Set(leadsToTransfer.filter(l => l.contactId).map(l => l.contactId!))];

  // Check which aren't already opted out
  const newLeadContactIds = leadContactIds.filter(id => !existingContactIds.has(id) && !newContactIds.includes(id));

  console.log(`  - Already opted out: ${leadContactIds.length - newLeadContactIds.length}`);
  console.log(`  - New to add: ${newLeadContactIds.length}`);

  if (newLeadContactIds.length > 0) {
    const leadOptOutRecords = newLeadContactIds.map(contactId => {
      const lead = leadsToTransfer.find(l => l.contactId === contactId);
      return {
        campaignId: targetMatch.id,
        contactId: contactId,
        reason: `Qualified lead from ${sourceMatch.name}: QA=${lead?.qaStatus}, AI=${lead?.aiQualificationStatus}`,
        createdAt: new Date(),
      };
    });

    const batchSize = 100;
    let insertedLeads = 0;

    for (let i = 0; i  ca.disposition === 'do_not_call' && ca.contactId);

  if (dncContacts.length > 0) {
    const dncContactIds = dncContacts.map(ca => ca.contactId!);

    // Get existing global DNC entries
    const existingDnc = await db
      .select({ contactId: globalDnc.contactId })
      .from(globalDnc)
      .where(inArray(globalDnc.contactId, dncContactIds));

    const existingDncContactIds = new Set(existingDnc.map(d => d.contactId));
    const newDncContacts = dncContacts.filter(ca => !existingDncContactIds.has(ca.contactId));

    console.log(`  - Already in global DNC: ${existingDncContactIds.size}`);
    console.log(`  - New DNC entries needed: ${newDncContacts.length}`);

    if (newDncContacts.length > 0) {
      const dncRecords = newDncContacts.map(ca => ({
        contactId: ca.contactId,
        phoneE164: ca.phoneDialed,
        source: 'api' as const,
        reason: `Transferred from ${sourceMatch.name}`,
        createdAt: new Date(),
      }));

      try {
        await db.insert(globalDnc).values(dncRecords).onConflictDoNothing();
        console.log(`  ✅ Added ${dncRecords.length} entries to global DNC`);
      } catch (error: any) {
        console.error(`  - Error adding to global DNC: ${error.message}`);
      }
    }
  }

  // Step 7: Summary
  console.log("\n" + "=".repeat(60));
  console.log("TRANSFER COMPLETE");
  console.log("=".repeat(60));
  console.log(`\nSource: ${sourceMatch.name}`);
  console.log(`Target: ${targetMatch.name}`);
  console.log(`\nDispositions transferred:`);
  Object.entries(byDisposition).forEach(([disp, records]) => {
    console.log(`  - ${disp}: ${records.length} contacts`);
  });
  console.log(`\nTotal unique contacts suppressed: ${newContactIds.length}`);
  console.log(`\nThese contacts will NOT be called in ${targetMatch.name}.`);
}

// Run the transfer
transferDispositions()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });