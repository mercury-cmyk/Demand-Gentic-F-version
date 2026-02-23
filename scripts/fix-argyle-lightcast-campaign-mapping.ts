import { db } from '../server/db';
import { campaigns, clientAccounts, clientCampaignAccess } from '../shared/schema';
import { eq, ilike, or } from 'drizzle-orm';

const TARGET_CAMPAIGN_ID = '6d6d125c-53fb-4015-9046-4ed06b13ef4b';
const ARGYLE_ACCOUNT_ID = '073ac22d-8c16-4db5-bf4f-667021dc0717';
const LIGHTCAST_ACCOUNT_ID = '67b6f74d-0894-46c4-bf86-1dd047b57dd8';

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY' : 'DRY RUN';
  console.log(`[campaign-mapping-fix] Mode: ${mode}`);

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      clientAccountId: campaigns.clientAccountId,
    })
    .from(campaigns)
    .where(
      or(
        eq(campaigns.id, TARGET_CAMPAIGN_ID),
        ilike(campaigns.name, '%Appointment%Campaign%'),
      ),
    )
    .limit(1);

  if (!campaign) {
    throw new Error('Target campaign not found');
  }

  const [argyle] = await db
    .select({ id: clientAccounts.id, name: clientAccounts.name })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, ARGYLE_ACCOUNT_ID))
    .limit(1);

  const [lightcast] = await db
    .select({ id: clientAccounts.id, name: clientAccounts.name })
    .from(clientAccounts)
    .where(eq(clientAccounts.id, LIGHTCAST_ACCOUNT_ID))
    .limit(1);

  if (!argyle || !lightcast) {
    throw new Error('Required client account IDs are missing');
  }

  const accessRows = await db
    .select({
      id: clientCampaignAccess.id,
      clientAccountId: clientCampaignAccess.clientAccountId,
      regularCampaignId: clientCampaignAccess.regularCampaignId,
    })
    .from(clientCampaignAccess)
    .where(eq(clientCampaignAccess.regularCampaignId, campaign.id));

  const lightcastMapping = accessRows.find((row) => row.clientAccountId === LIGHTCAST_ACCOUNT_ID);
  const argyleMapping = accessRows.find((row) => row.clientAccountId === ARGYLE_ACCOUNT_ID);

  console.log('[campaign-mapping-fix] Campaign:', campaign);
  console.log('[campaign-mapping-fix] Access rows:', accessRows);

  if (!apply) {
    console.log('[campaign-mapping-fix] Dry run complete. Re-run with --apply to execute.');
    return;
  }

  await db.transaction(async (tx) => {
    if (campaign.clientAccountId !== ARGYLE_ACCOUNT_ID) {
      const updated = await tx
        .update(campaigns)
        .set({ clientAccountId: ARGYLE_ACCOUNT_ID })
        .where(eq(campaigns.id, campaign.id))
        .returning({ id: campaigns.id });
      if (updated.length !== 1) {
        throw new Error('Campaign owner update failed');
      }
      console.log('[campaign-mapping-fix] Updated campaign owner to Argyle');
    }

    if (lightcastMapping) {
      await tx
        .delete(clientCampaignAccess)
        .where(eq(clientCampaignAccess.id, lightcastMapping.id));
      console.log('[campaign-mapping-fix] Removed Lightcast access mapping');
    }

    if (!argyleMapping) {
      await tx.insert(clientCampaignAccess).values({
        clientAccountId: ARGYLE_ACCOUNT_ID,
        regularCampaignId: campaign.id,
      });
      console.log('[campaign-mapping-fix] Added Argyle access mapping');
    }
  });

  const postAccessRows = await db
    .select({
      id: clientCampaignAccess.id,
      clientAccountId: clientCampaignAccess.clientAccountId,
      regularCampaignId: clientCampaignAccess.regularCampaignId,
    })
    .from(clientCampaignAccess)
    .where(eq(clientCampaignAccess.regularCampaignId, campaign.id));

  const [postCampaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      clientAccountId: campaigns.clientAccountId,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaign.id))
    .limit(1);

  console.log('[campaign-mapping-fix] Post campaign:', postCampaign);
  console.log('[campaign-mapping-fix] Post access rows:', postAccessRows);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[campaign-mapping-fix] Failed:', error);
    process.exit(1);
  });
