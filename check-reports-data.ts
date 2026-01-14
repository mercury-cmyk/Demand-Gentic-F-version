import { db } from './server/db';
import { leads, dialerCallAttempts, dialerRuns, callSessions, agentQueue } from './shared/schema';
import { sql, count, desc } from 'drizzle-orm';

async function checkReportsData() {
  console.log('=== DATABASE REPORT DATA CHECK ===\n');
  
  try {
    // Check leads count
    const leadsResult = await db.select({ count: count() }).from(leads);
    console.log('Total leads:', leadsResult[0].count);
    
    // Check dialer call attempts (main source for AI dialer reports)
    const dialerResult = await db.select({ count: count() }).from(dialerCallAttempts);
    console.log('Total dialer call attempts:', dialerResult[0].count);
    
    // Check dialer runs
    const runsResult = await db.select({ count: count() }).from(dialerRuns);
    console.log('Total dialer runs:', runsResult[0].count);
    
    // Check legacy call sessions
    const sessionsResult = await db.select({ count: count() }).from(callSessions);
    console.log('Total legacy call sessions:', sessionsResult[0].count);
    
    // Check agent queue
    const queueResult = await db.select({ count: count() }).from(agentQueue);
    console.log('Total agent queue entries:', queueResult[0].count);
    
    // Get disposition breakdown from dialerCallAttempts
    console.log('\n=== DISPOSITION BREAKDOWN (dialerCallAttempts) ===');
    const dispositionBreakdown = await db.select({
      disposition: dialerCallAttempts.disposition,
      count: count()
    })
    .from(dialerCallAttempts)
    .groupBy(dialerCallAttempts.disposition);
    
    if (dispositionBreakdown.length === 0) {
      console.log('No dispositions found - no calls have been made through the AI dialer yet');
    } else {
      console.table(dispositionBreakdown);
    }
    
    // Get recent dialer attempts
    console.log('\n=== RECENT DIALER CALL ATTEMPTS (last 10) ===');
    const recentAttempts = await db.select({
      id: dialerCallAttempts.id,
      disposition: dialerCallAttempts.disposition,
      duration: dialerCallAttempts.callDurationSeconds,
      connected: dialerCallAttempts.connected,
      createdAt: dialerCallAttempts.createdAt
    })
    .from(dialerCallAttempts)
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(10);
    
    if (recentAttempts.length === 0) {
      console.log('No call attempts found');
    } else {
      console.table(recentAttempts);
    }

    // Check leads with transcripts
    console.log('\n=== LEADS WITH TRANSCRIPTS ===');
    const leadsWithTranscripts = await db.select({
      count: count()
    })
    .from(leads)
    .where(sql`${leads.transcript} IS NOT NULL AND ${leads.transcript} != ''`);
    console.log('Leads with transcripts:', leadsWithTranscripts[0].count);

  } catch (error) {
    console.error('Error checking data:', error);
  }
  
  process.exit(0);
}

checkReportsData();
