/**
 * One-time script to fix user role
 * Run with: npx tsx server/scripts/fix-user-role.ts
 */

import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function fixUserRole() {
  const email = "zahid.m@pivotal-b2b.com";

  console.log(`\n🔍 Looking up user: ${email}\n`);

  // Find user by email
  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    console.log(`❌ User not found with email: ${email}`);

    // List all users
    const allUsers = await db.select({ id: users.id, username: users.username, email: users.email, role: users.role }).from(users);
    console.log('\nAll users in database:');
    allUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.email}) - role: ${u.role}`);
    });

    process.exit(1);
  }

  console.log(`✅ Found user:`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Username: ${user.username}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Current Role: ${user.role}`);

  if (user.role === 'admin') {
    console.log(`\n✅ User already has admin role. No changes needed.`);
    process.exit(0);
  }

  // Update to admin
  console.log(`\n🔄 Updating role from "${user.role}" to "admin"...`);

  const [updated] = await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.id, user.id))
    .returning();

  console.log(`✅ Role updated successfully!`);
  console.log(`   New Role: ${updated.role}`);

  console.log(`\n🎉 Done! You can now claim super org ownership.`);
  process.exit(0);
}

fixUserRole().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
