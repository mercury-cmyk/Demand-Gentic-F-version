import { db } from './server/db';
import { callSessions, campaigns } from './shared/schema';
import { desc, eq, and, gt, sql } from 'drizzle-orm';

async function checkRecentActivity() {
  console.log('Checking recent call activity...');

  // 1. Get active campaigns
  const activeCampaigns = await db.select()
    .from(campaigns)
    .where(eq(campaigns.status, 'active'));
  
  console.log(`\nActive Campaigns: ${activeCampaigns.length}`);
  activeCampaigns.forEach(c => {
    console.log(`- [${c.id}] ${c.name} (Type: ${c.type})`);
  });

  if (activeCampaigns.length === 0) {
    console.log('No active campaigns found. Calls might not be generating because no campaign is running.');
  }

  // 2. Check calls in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const recentCalls = await db.select({
    id: callSessions.id,
    startedAt: callSessions.startedAt,
    status: callSessions.status,
    campaignId: callSessions.campaignId,
    disposition: callSessions.aiDisposition
  })
  .from(callSessions)
  .where(gt(callSessions.startedAt, oneHourAgo))
  .orderBy(desc(callSessions.startedAt))
  .limit(10);

  console.log(`\nCalls in the last hour: ${recentCalls.length} (showing last 10)`);
  
  if (recentCalls.length > 0) {
    recentCalls.forEach(call => {
      const timeStr = call.startedAt ? new Date(call.startedAt).toLocaleTimeString() : 'N/A';
      console.log(`- ${timeStr}: ID ${call.id.slice(0,8)}... Status: ${call.status}, Disp: ${call.disposition || 'N/A'}, CampID: ${call.campaignId}`);
    });
    
    // Check specifically for very recent calls (last 15 mins)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const veryRecent = recentCalls.filter(c => c.startedAt && new Date(c.startedAt) > fifteenMinsAgo);
    
    if (veryRecent.length > 0) {
        console.log(`\n✅ SYSTEM IS ACTIVE. ${veryRecent.length} calls initiated in the last 15 minutes.`);
    } else {
        console.log(`\n⚠️  WARNING: Recent calls found, but none in the last 15 minutes.`);
    }

  } else {
    console.log('\n❌ NO CALLS in the last hour.');
  }
}

checkRecentActivity().catch(console.error).finally(() => process.exit(0));