/**
 * Revert GCP project ID back to "demandgentic" in both
 * googleCloudAccounts and secretStore tables.
 *
 * Run: npx tsx scripts/_revert-gcp-project-id.ts
 */

import { db } from "../server/db";
import { googleCloudAccounts, secretStore } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { encryptJson, decryptJson } from "../server/lib/encryption";

const CORRECT_PROJECT = "demandgentic";
const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET || "";

async function main() {
  // 1. Fix googleCloudAccounts
  const accounts = await db
    .select({ id: googleCloudAccounts.id, name: googleCloudAccounts.name, projectId: googleCloudAccounts.projectId })
    .from(googleCloudAccounts);

  console.log(`=== googleCloudAccounts (${accounts.length}) ===`);
  for (const acct of accounts) {
    console.log(`  [${acct.name}] projectId="${acct.projectId}"`);
    if (acct.projectId === CORRECT_PROJECT) {
      console.log(`    ✓ Already correct`);
      continue;
    }
    await db.update(googleCloudAccounts).set({ projectId: CORRECT_PROJECT }).where(eq(googleCloudAccounts.id, acct.id));
    console.log(`    ✓ Reverted: "${acct.projectId}" → "${CORRECT_PROJECT}"`);
  }

  // 2. Fix secretStore
  if (!MASTER_KEY) {
    console.warn("No MASTER_KEY — skipping secretStore revert");
    process.exit(0);
  }

  const secrets = await db
    .select()
    .from(secretStore)
    .where(and(
      inArray(secretStore.name, ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT_ID"]),
      eq(secretStore.isActive, true),
    ));

  console.log(`\n=== secretStore (${secrets.length}) ===`);
  for (const secret of secrets) {
    let currentValue: string;
    try {
      currentValue = decryptJson(secret.encryptedValue, MASTER_KEY);
      if (typeof currentValue !== "string") currentValue = JSON.stringify(currentValue);
    } catch (e: any) {
      console.log(`  [${secret.name}] (${secret.environment}) — cannot decrypt: ${e.message}`);
      continue;
    }
    console.log(`  [${secret.name}] (${secret.environment}) = "${currentValue}"`);
    if (currentValue === CORRECT_PROJECT) {
      console.log(`    ✓ Already correct`);
      continue;
    }
    const enc = encryptJson(CORRECT_PROJECT, MASTER_KEY);
    await db.update(secretStore).set({ encryptedValue: enc, updatedAt: new Date() }).where(eq(secretStore.id, secret.id));
    console.log(`    ✓ Reverted: "${currentValue}" → "${CORRECT_PROJECT}"`);
  }

  console.log("\nDone. Restart the server.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });