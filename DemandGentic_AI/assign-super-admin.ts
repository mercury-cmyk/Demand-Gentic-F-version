/**
 * Assign "admin" + Super Org "owner" privileges to one or more users.
 *
 * Run:
 *   npx tsx assign-super-admin.ts  [more...]
 *
 * Examples:
 *   npx tsx assign-super-admin.ts zahid tabasum
 *   npx tsx assign-super-admin.ts zahid.m@pivotal-b2b.com tabasum@pivotal-b2b.com
 *
 * Notes:
 * - Updates legacy `users.role` to "admin" (many UI checks still use it).
 * - Inserts "admin" into `user_roles` (multi-role JWT support).
 * - Adds/updates Super Organization membership to role "owner".
 */

import { ilike, or } from "drizzle-orm";
import { db } from "./server/db";
import { storage } from "./server/storage";
import { users } from "./shared/schema";
import {
  initializeSuperOrganization,
  setupAdminAsSuperOrgOwner,
} from "./server/services/super-organization-service";

async function findUserByUsernameOrEmail(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(
      or(
        ilike(users.username, trimmed),
        ilike(users.email, trimmed),
      ),
    )
    .limit(1);

  return user ?? null;
}

async function makeSuperAdmin(identifier: string) {
  const user = await findUserByUsernameOrEmail(identifier);
  if (!user) {
    console.error(`\n❌ User not found for: ${identifier}`);
    return { ok: false as const };
  }

  // 1) Legacy single-role field (client still checks user.role in places)
  if (user.role !== "admin") {
    await storage.updateUser(user.id, { role: "admin" });
  }

  // 2) Multi-role table (JWT roles[])
  await storage.assignUserRole(user.id, "admin", user.id);

  // 3) Super Org owner membership (platform-owner permissions)
  await setupAdminAsSuperOrgOwner(user.id);

  const roles = await storage.getUserRoles(user.id);
  console.log(`\n✅ ${user.username} (${user.email})`);
  console.log(`   legacy role: admin`);
  console.log(`   roles: ${roles.length ? roles.join(", ") : "(none)"}`);
  return { ok: true as const };
}

async function main() {
  const identifiers = process.argv.slice(2).filter(Boolean);
  if (identifiers.length === 0) {
    console.error("Usage: npx tsx assign-super-admin.ts  [more...]");
    process.exit(1);
  }

  await initializeSuperOrganization();

  let okCount = 0;
  for (const identifier of identifiers) {
    const result = await makeSuperAdmin(identifier);
    if (result.ok) okCount += 1;
  }

  console.log(`\nDone. Updated ${okCount}/${identifiers.length} user(s).`);
  console.log("IMPORTANT: affected users must log out and log back in to refresh JWT roles.");

  // Ensure the process terminates even if DB clients keep sockets open.
  process.exit(okCount === identifiers.length ? 0 : 2);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});