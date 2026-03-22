/**
 * Create Lightcast client account and users.
 *
 * Run:
 *   npx tsx create-lightcast-users.ts
 *
 * This script will:
 * 1. Create or find the "Lightcast" client account
 * 2. Create client portal users for the Lightcast team
 */

import { eq, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./server/db";
import { clientAccounts, clientUsers } from "./shared/schema";

const LIGHTCAST_USERS = [
  {
    email: "amanda.mcdermott@lightcast.io",
    firstName: "Amanda",
    lastName: "McDermott",
  },
  {
    email: "richard.wade@lightcast.io",
    firstName: "Richard",
    lastName: "Wade",
  },
  {
    email: "ash.walia@lightcast.io",
    firstName: "Ash",
    lastName: "Walia",
  },
];

function generateInviteSlug() {
  return `join_${crypto.randomBytes(6).toString("hex")}`;
}

function generateTempPassword() {
  // Generate a secure temporary password
  return crypto.randomBytes(12).toString("base64").slice(0, 16);
}

async function findOrCreateLightcastAccount() {
  // Check if Lightcast account already exists
  const [existing] = await db
    .select()
    .from(clientAccounts)
    .where(ilike(clientAccounts.name, "Lightcast"))
    .limit(1);

  if (existing) {
    console.log(`✅ Found existing Lightcast account: ${existing.id}`);
    return existing;
  }

  // Create new Lightcast account
  const [account] = await db
    .insert(clientAccounts)
    .values({
      name: "Lightcast",
      companyName: "Lightcast",
      contactEmail: "amanda.mcdermott@lightcast.io",
      inviteDomains: ["lightcast.io"],
      inviteSlug: generateInviteSlug(),
      inviteEnabled: true,
      isActive: true,
    })
    .returning();

  console.log(`✅ Created Lightcast account: ${account.id}`);
  return account;
}

async function createClientUser(
  clientAccountId: string,
  userData: { email: string; firstName: string; lastName: string }
) {
  // Check if user already exists
  const [existing] = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.email, userData.email.toLowerCase()))
    .limit(1);

  if (existing) {
    console.log(`⏭️  User already exists: ${userData.email}`);
    return { user: existing, password: null, isNew: false };
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  // Create user
  const [user] = await db
    .insert(clientUsers)
    .values({
      clientAccountId,
      email: userData.email.toLowerCase(),
      password: hashedPassword,
      firstName: userData.firstName,
      lastName: userData.lastName,
      isActive: true,
    })
    .returning();

  console.log(`✅ Created user: ${userData.email}`);
  return { user, password: tempPassword, isNew: true };
}

async function main() {
  console.log("Creating Lightcast client account and users...\n");

  // 1. Find or create Lightcast account
  const account = await findOrCreateLightcastAccount();

  // 2. Create users
  const results: Array = [];

  for (const userData of LIGHTCAST_USERS) {
    const { password, isNew } = await createClientUser(account.id, userData);
    results.push({
      ...userData,
      password,
      isNew,
    });
  }

  // 3. Print summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY - Lightcast Client Portal Users");
  console.log("=".repeat(60));
  console.log(`\nClient Account: ${account.name} (${account.id})`);
  console.log(`\nPortal Login URL: https://app.pivotal-b2b.com/client-portal/login`);
  console.log("\nUsers:");

  const newUsers = results.filter((r) => r.isNew);
  const existingUsers = results.filter((r) => !r.isNew);

  if (newUsers.length > 0) {
    console.log("\n--- NEW USERS (send credentials) ---");
    for (const user of newUsers) {
      console.log(`\n  ${user.firstName} ${user.lastName}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Temporary Password: ${user.password}`);
    }
  }

  if (existingUsers.length > 0) {
    console.log("\n--- EXISTING USERS (already have access) ---");
    for (const user of existingUsers) {
      console.log(`  - ${user.firstName} ${user.lastName} `);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("IMPORTANT: New users should change their password after first login.");
  console.log("=".repeat(60) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});