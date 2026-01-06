
import { db } from "./db";
import { users, accounts, contacts, lists, segments, campaigns, events, resources, news, senderProfiles } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Check if admin user exists
    const existingAdmin = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    
    if (existingAdmin.length === 0) {
      // Create admin user with hashed password
      const adminPassword = await bcrypt.hash('admin123', 10);
      await db.insert(users).values({
        username: 'admin',
        email: 'admin@crm.local',
        password: adminPassword,
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User'
      });
      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user already exists');
    }

    // Check if agent user exists
    const existingAgent = await db.select().from(users).where(eq(users.username, 'agent')).limit(1);
    
    if (existingAgent.length === 0) {
      // Create agent user with hashed password
      const agentPassword = await bcrypt.hash('agent123', 10);
      await db.insert(users).values({
        username: 'agent',
        email: 'agent@crm.local',
        password: agentPassword,
        role: 'agent',
        firstName: 'Test',
        lastName: 'Agent'
      });
      console.log('✅ Agent user created');
    } else {
      // Update agent password to ensure it's correct
      const agentPassword = await bcrypt.hash('agent123', 10);
      await db.update(users)
        .set({ password: agentPassword })
        .where(eq(users.username, 'agent'));
      console.log('✅ Agent user password updated');
    }

    console.log("\n✅ Database seeding complete!");
    console.log("\n📋 Login Credentials:");
    console.log("   Admin - Username: admin, Password: admin123");
    console.log("   Agent - Username: agent, Password: agent123\n");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  }
}

seed()
  .catch(console.error)
  .finally(() => process.exit());
