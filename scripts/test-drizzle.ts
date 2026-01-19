import { db } from '../server/db';
import { accounts, campaignAccountProblems } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const accountId = '003d96fe-73c7-4c63-9c7d-ea7821864041';
const campaignId = '2df6b4f5-c1ff-4324-87f0-94053d4c5cbf';

async function test() {
  try {
    // Test 1: Query account
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    console.log('Account query works:', account ? account.name : 'Not found');

    // Test 2: Query campaign_account_problems
    const [existing] = await db
      .select()
      .from(campaignAccountProblems)
      .where(
        and(
          eq(campaignAccountProblems.campaignId, campaignId),
          eq(campaignAccountProblems.accountId, accountId)
        )
      )
      .limit(1);
    console.log('Campaign account problems query works:', existing ? 'Found' : 'Not found');

  } catch (err: any) {
    console.error('Error:', err.message);
    console.error('Full error:', err);
  }
  process.exit(0);
}

test();
