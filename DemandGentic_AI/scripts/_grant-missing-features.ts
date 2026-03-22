/**
 * Grant email_inbox feature to all client accounts.
 */
import { db } from '../server/db';
import { clientAccounts, clientPermissionGrants } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

const FEATURES_TO_GRANT = ['email_inbox'] as const;
const ADMIN_USER_ID = 'da0c653b-c853-47b9-82df-de9b7b754378';

async function main() {
  const accounts = await db.select({ id: clientAccounts.id, name: clientAccounts.companyName })
    .from(clientAccounts);

  console.log(`Found ${accounts.length} client accounts`);

  let grantedCount = 0;

  for (const account of accounts) {
    for (const feature of FEATURES_TO_GRANT) {
      const [existing] = await db.select({ id: clientPermissionGrants.id })
        .from(clientPermissionGrants)
        .where(and(
          eq(clientPermissionGrants.clientAccountId, account.id),
          eq(clientPermissionGrants.feature, feature),
        ))
        .limit(1);

      if (existing) {
        console.log(`  ${account.name}: ${feature} — already exists`);
        continue;
      }

      await db.insert(clientPermissionGrants).values({
        clientAccountId: account.id,
        feature,
        scopeType: 'all',
        isEnabled: true,
        grantedBy: ADMIN_USER_ID,
        notes: 'Auto-granted: shared inbox for client portal',
      });

      grantedCount++;
      console.log(`  ✓ ${account.name}: ${feature} — GRANTED`);
    }
  }

  console.log(`\nDone. Granted ${grantedCount} new permissions.`);
  process.exit(0);
}

main();