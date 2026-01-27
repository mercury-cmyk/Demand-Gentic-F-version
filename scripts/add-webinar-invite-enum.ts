import { db, pool } from "../server/db";

async function addWebinarInviteEnum() {
  console.log("Adding 'webinar_invite' to campaign_type enum...");

  try {
    // Use raw SQL to add the enum value
    await pool.query(`
      ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'webinar_invite';
    `);

    console.log("✅ Successfully added 'webinar_invite' to campaign_type enum");
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log("ℹ️  'webinar_invite' already exists in campaign_type enum");
    } else {
      console.error("❌ Error adding enum value:", error);
      throw error;
    }
  }

  process.exit(0);
}

addWebinarInviteEnum().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
