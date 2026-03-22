/**
 * Fix stale GOOGLE_CLOUD_PROJECT / GCP_PROJECT_ID secrets in the DB secret store.
 *
 * The encrypted secret store has the project NAME ("demandgentic") instead of
 * the project ID ("gen-lang-client-0789558283"). This causes Vertex AI to
 * use the wrong project and get 404 Not Found for models.
 *
 * Run: npx tsx scripts/_fix-gcp-project-secrets.ts
 */

import { db } from "../server/db";
import { secretStore } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { encryptJson, decryptJson } from "../server/lib/encryption";

const CORRECT_PROJECT_ID = "gen-lang-client-0789558283";
const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET || "";

async function main() {
  if (!MASTER_KEY) {
    console.error("ERROR: SECRET_MANAGER_MASTER_KEY or SESSION_SECRET not set");
    process.exit(1);
  }

  // Find the GOOGLE_CLOUD_PROJECT and GCP_PROJECT_ID secrets
  const secrets = await db
    .select()
    .from(secretStore)
    .where(
      and(
        inArray(secretStore.name, ["GOOGLE_CLOUD_PROJECT", "GCP_PROJECT_ID"]),
        eq(secretStore.isActive, true)
      )
    );

  console.log(`Found ${secrets.length} matching secrets:`);

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

    if (currentValue === CORRECT_PROJECT_ID) {
      console.log(`    ✓ Already correct`);
      continue;
    }

    // Encrypt the correct value
    const encryptedCorrect = encryptJson(CORRECT_PROJECT_ID, MASTER_KEY);

    await db
      .update(secretStore)
      .set({
        encryptedValue: encryptedCorrect,
        updatedAt: new Date(),
      })
      .where(eq(secretStore.id, secret.id));

    console.log(`    ✓ Updated: "${currentValue}" → "${CORRECT_PROJECT_ID}"`);
  }

  console.log("\nDone. Restart the server for changes to take effect.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});