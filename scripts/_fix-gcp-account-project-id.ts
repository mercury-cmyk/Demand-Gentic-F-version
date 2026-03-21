/**
 * Fix stale projectId in googleCloudAccounts table.
 *
 * The active GCP account has projectId="demandgentic" (project name)
 * instead of "gen-lang-client-0789558283" (actual project ID).
 *
 * Run: npx tsx scripts/_fix-gcp-account-project-id.ts
 */

import { db } from "../server/db";
import { googleCloudAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";

const CORRECT_PROJECT_ID = "gen-lang-client-0789558283";

async function main() {
  // Find all GCP accounts
  const accounts = await db
    .select({
      id: googleCloudAccounts.id,
      name: googleCloudAccounts.name,
      projectId: googleCloudAccounts.projectId,
      isActive: googleCloudAccounts.isActive,
    })
    .from(googleCloudAccounts);

  console.log(`Found ${accounts.length} GCP accounts:`);

  for (const acct of accounts) {
    console.log(`  [${acct.name}] projectId="${acct.projectId}" isActive=${acct.isActive}`);

    if (acct.projectId === CORRECT_PROJECT_ID) {
      console.log(`    ✓ Already correct`);
      continue;
    }

    await db
      .update(googleCloudAccounts)
      .set({ projectId: CORRECT_PROJECT_ID })
      .where(eq(googleCloudAccounts.id, acct.id));

    console.log(`    ✓ Updated: "${acct.projectId}" → "${CORRECT_PROJECT_ID}"`);
  }

  console.log("\nDone. Restart the server for changes to take effect.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
