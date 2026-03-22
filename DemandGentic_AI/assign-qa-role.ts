/**
 * Script to assign quality_analyst role to a user
 * Run with: npx tsx assign-qa-role.ts 
 * 
 * Example: npx tsx assign-qa-role.ts belalm
 */

import { db } from './server/db';
import { users, userRoles } from './shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function assignQARole(username: string) {
  console.log('='.repeat(60));
  console.log(`Assigning 'quality_analyst' role to: ${username}`);
  console.log('='.repeat(60));

  try {
    // Find the user
    const user = await db.select().from(users).where(eq(users.username, username)).limit(1);
    
    if (user.length === 0) {
      console.error(`\n❌ User '${username}' not found!`);
      console.log('\nAvailable users:');
      const allUsers = await db.select({ username: users.username }).from(users);
      allUsers.forEach(u => console.log(`  - ${u.username}`));
      process.exit(1);
    }

    const userId = user[0].id;
    console.log(`\nFound user: ${user[0].username} (${user[0].firstName} ${user[0].lastName})`);

    // Check if already has the role
    const existingRole = await db.select().from(userRoles)
      .where(eq(userRoles.userId, userId));
    
    const hasQA = existingRole.some(r => r.role === 'quality_analyst');
    
    if (hasQA) {
      console.log('\n✅ User already has the quality_analyst role!');
    } else {
      // Assign the role
      await db.insert(userRoles).values({
        id: randomUUID(),
        userId: userId,
        role: 'quality_analyst',
        assignedAt: new Date(),
      });
      console.log('\n✅ Successfully assigned quality_analyst role!');
    }

    // Show current roles
    const currentRoles = await db.select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    
    console.log('\nCurrent roles for this user:');
    currentRoles.forEach(r => console.log(`  - ${r.role}`));

    console.log('\n⚠️  IMPORTANT: The user must log out and log back in');
    console.log('   to receive the updated JWT token with their new roles.');

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

const username = process.argv[2];
if (!username) {
  console.error('Usage: npx tsx assign-qa-role.ts ');
  console.error('Example: npx tsx assign-qa-role.ts belalm');
  process.exit(1);
}

assignQARole(username);