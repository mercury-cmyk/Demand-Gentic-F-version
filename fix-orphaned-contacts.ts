import { db } from "./server/db";
import { campaigns, contacts, accounts, campaignQueue } from "@shared/schema";
import { eq, sql, isNull, and, inArray } from "drizzle-orm";

async function fixOrphanedContacts() {
  console.log("=".repeat(80));
  console.log("DIAGNOSTIC: Finding orphaned contacts in AI campaigns");
  console.log("=".repeat(80));

  // Step 1: Find all active AI agent campaigns
  console.log("\n📋 Step 1: Finding active AI agent campaigns...");
  const aiCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      dialMode: campaigns.dialMode,
    })
    .from(campaigns)
    .where(eq(campaigns.dialMode, "ai_agent"));

  console.log(`Found ${aiCampaigns.length} AI agent campaigns:`);
  aiCampaigns.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.id}) - Status: ${c.status}`);
  });

  if (aiCampaigns.length === 0) {
    console.log("\n❌ No AI agent campaigns found. Exiting.");
    return;
  }

  const campaignIds = aiCampaigns.map((c) => c.id);

  // Step 2: Check contacts in campaign queues for missing accountId
  console.log("\n🔍 Step 2: Checking contacts in campaign queues...");

  const orphanedContactsQuery = await db.execute(sql`
    SELECT
      cq.id as queue_item_id,
      cq.campaign_id,
      cq.contact_id,
      c.first_name,
      c.last_name,
      c.full_name,
      c.account_id,
      c.email,
      c.job_title,
      cam.name as campaign_name
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    JOIN campaigns cam ON cam.id = cq.campaign_id
    WHERE cq.campaign_id IN (${sql.raw(campaignIds.map(id => `'${id}'`).join(", "))})
      AND cq.status IN ('queued', 'in_progress')
      AND c.account_id IS NULL
    ORDER BY cq.campaign_id, cq.created_at
    LIMIT 100
  `);

  const orphanedContacts = orphanedContactsQuery.rows as any[];
  console.log(`\n📊 Found ${orphanedContacts.length} contacts without account_id`);

  if (orphanedContacts.length === 0) {
    console.log("\n✅ All contacts in campaign queues have account_id assigned!");

    // Show summary stats
    const statsQuery = await db.execute(sql`
      SELECT
        cam.name as campaign_name,
        COUNT(*) FILTER (WHERE c.account_id IS NULL) as contacts_without_account,
        COUNT(*) FILTER (WHERE c.account_id IS NOT NULL) as contacts_with_account,
        COUNT(*) as total
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      JOIN campaigns cam ON cam.id = cq.campaign_id
      WHERE cq.campaign_id IN (${sql.raw(campaignIds.map(id => `'${id}'`).join(", "))})
        AND cq.status IN ('queued', 'in_progress')
      GROUP BY cam.name
    `);

    console.log("\n📈 Campaign Queue Statistics:");
    (statsQuery.rows as any[]).forEach((row) => {
      console.log(`  ${row.campaign_name}:`);
      console.log(`    ✅ With Account: ${row.contacts_with_account}`);
      console.log(`    ❌ Without Account: ${row.contacts_without_account}`);
      console.log(`    📊 Total: ${row.total}`);
    });

    return;
  }

  // For contacts without accountId, we need to create a default account
  // Since contacts table doesn't have company_name, we'll create one default account
  console.log("\n📝 Details of first 10 orphaned contacts:");
  orphanedContacts.slice(0, 10).forEach((contact, i) => {
    console.log(`  ${i + 1}. ${contact.full_name} (${contact.email || "no email"}) - Campaign: ${contact.campaign_name}`);
  });

  const defaultCompanyName = "Unknown Company - AI Campaign Contacts";

  // Step 3: Create or find default account for orphaned contacts
  console.log("\n🏗️  Step 3: Creating/finding default account...");

  let defaultAccountId: string;

  try {
    // Check if default account already exists
    const existingAccount = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.name, defaultCompanyName))
      .limit(1);

    if (existingAccount.length > 0) {
      console.log(`  ✓ Found existing account: "${defaultCompanyName}" (${existingAccount[0].id})`);
      defaultAccountId = existingAccount[0].id;
    } else {
      // Create new account
      const [newAccount] = await db
        .insert(accounts)
        .values({
          name: defaultCompanyName,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: accounts.id, name: accounts.name });

      console.log(`  ✓ Created new account: "${defaultCompanyName}" (${newAccount.id})`);
      defaultAccountId = newAccount.id;
    }
  } catch (error) {
    console.error(`  ✗ Error creating default account:`, error);
    throw error;
  }

  // Step 4: Assign default account to all orphaned contacts
  console.log("\n🔗 Step 4: Assigning account to all orphaned contacts...");

  let assignedCount = 0;
  let failedCount = 0;

  const contactIds = orphanedContacts.map((c) => c.contact_id);

  try {
    const result = await db
      .update(contacts)
      .set({
        accountId: defaultAccountId,
        updatedAt: new Date(),
      })
      .where(inArray(contacts.id, contactIds));

    assignedCount = contactIds.length;
    console.log(`  ✓ Assigned ${contactIds.length} contacts to "${defaultCompanyName}"`);
  } catch (error) {
    failedCount = contactIds.length;
    console.error(`  ✗ Failed to assign contacts:`, error);
    throw error;
  }

  // Step 5: Verification
  console.log("\n✅ Step 5: Verification...");

  const verificationQuery = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE c.account_id IS NULL) as still_orphaned,
      COUNT(*) FILTER (WHERE c.account_id IS NOT NULL) as now_assigned,
      COUNT(*) as total
    FROM campaign_queue cq
    JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id IN (${sql.raw(campaignIds.map(id => `'${id}'`).join(", "))})
      AND cq.status IN ('queued', 'in_progress')
  `);

  const verificationResult = verificationQuery.rows[0] as any;

  console.log("\n📊 Final Statistics:");
  console.log(`  ✅ Contacts with account: ${verificationResult.now_assigned}`);
  console.log(`  ❌ Contacts still orphaned: ${verificationResult.still_orphaned}`);
  console.log(`  📊 Total contacts: ${verificationResult.total}`);
  console.log(`\n  📝 Assigned in this run: ${assignedCount}`);
  console.log(`  ❌ Failed assignments: ${failedCount}`);

  if (verificationResult.still_orphaned > 0) {
    console.log("\n⚠️  Warning: Some contacts still don't have accounts assigned.");
    console.log("   This may be due to missing company_name data.");
  } else {
    console.log("\n🎉 Success! All contacts in AI campaign queues now have accounts assigned!");
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ Fix complete! Your campaign calls should now work properly.");
  console.log("=".repeat(80));
}

// Run the fix
fixOrphanedContacts()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed with error:", error);
    process.exit(1);
  });
