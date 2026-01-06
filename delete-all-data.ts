
import { db } from "./server/db";
import { accounts, contacts } from "@shared/schema";

async function deleteAllData() {
  try {
    console.log("Starting deletion process...");
    
    // Count before deletion
    const contactsBefore = await db.select().from(contacts);
    const accountsBefore = await db.select().from(accounts);
    
    console.log(`Found ${contactsBefore.length} contacts`);
    console.log(`Found ${accountsBefore.length} accounts`);
    
    // Delete all contacts first (due to foreign key constraints)
    console.log("\nDeleting all contacts...");
    await db.delete(contacts);
    
    // Delete all accounts
    console.log("Deleting all accounts...");
    await db.delete(accounts);
    
    // Verify deletion
    const contactsAfter = await db.select().from(contacts);
    const accountsAfter = await db.select().from(accounts);
    
    console.log("\n✅ Deletion complete!");
    console.log(`Contacts remaining: ${contactsAfter.length}`);
    console.log(`Accounts remaining: ${accountsAfter.length}`);
    
    if (contactsAfter.length === 0 && accountsAfter.length === 0) {
      console.log("\n🎉 All accounts and contacts have been successfully deleted!");
    } else {
      console.log("\n⚠️ Warning: Some records may still exist");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error during deletion:", error);
    process.exit(1);
  }
}

deleteAllData();
