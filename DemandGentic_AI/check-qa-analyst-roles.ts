/**
 * Script to check and verify QA analyst user roles
 * Run with: npx tsx check-qa-analyst-roles.ts
 */

import { db } from './server/db';
import { users, userRoles } from './shared/schema';
import { eq, or, like } from 'drizzle-orm';

async function checkQAAnalystRoles() {
  console.log('='.repeat(60));
  console.log('QA Analyst Role Check');
  console.log('='.repeat(60));

  try {
    // Find all users
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      legacyRole: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
    }).from(users);

    console.log(`\nFound ${allUsers.length} users in the system.\n`);

    // For each user, check their roles in the user_roles table
    for (const user of allUsers) {
      const roles = await db.select({
        role: userRoles.role,
      }).from(userRoles).where(eq(userRoles.userId, user.id));

      const roleList = roles.map(r => r.role);
      const hasQA = roleList.includes('quality_analyst') || user.legacyRole === 'quality_analyst';
      
      console.log(`User: ${user.username} (${user.firstName || ''} ${user.lastName || ''})`);
      console.log(`  Legacy role: ${user.legacyRole}`);
      console.log(`  Assigned roles: ${roleList.length > 0 ? roleList.join(', ') : '(none - will fall back to legacy role)'}`);
      console.log(`  Can access QA/Leads: ${hasQA ? '✅ YES' : '❌ NO'}`);
      console.log('');
    }

    // Summary
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    
    const qaUsers = allUsers.filter(u => u.legacyRole === 'quality_analyst');
    console.log(`\nUsers with legacy role 'quality_analyst': ${qaUsers.length}`);
    qaUsers.forEach(u => console.log(`  - ${u.username}`));

    const rolesWithQA = await db.select({
      userId: userRoles.userId,
    }).from(userRoles).where(eq(userRoles.role, 'quality_analyst'));
    
    console.log(`\nUsers with 'quality_analyst' in user_roles table: ${rolesWithQA.length}`);
    for (const r of rolesWithQA) {
      const user = allUsers.find(u => u.id === r.userId);
      console.log(`  - ${user?.username || r.userId}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('HOW TO FIX:');
    console.log('='.repeat(60));
    console.log(`
1. If a user should have QA analyst access but shows ❌ NO above:
   - Go to Settings → Users & Roles
   - Edit the user
   - Check the "Quality Analyst" checkbox
   - Save changes

2. After assigning the role, the user MUST log out and log back in
   to receive the updated JWT token with their new roles.

3. Alternatively, run this SQL to assign the role directly:
   INSERT INTO user_roles (id, user_id, role, assigned_at)
   VALUES (gen_random_uuid(), 'USER_ID_HERE', 'quality_analyst', NOW())
   ON CONFLICT DO NOTHING;
`);

  } catch (error) {
    console.error('Error checking roles:', error);
  }

  process.exit(0);
}

checkQAAnalystRoles();