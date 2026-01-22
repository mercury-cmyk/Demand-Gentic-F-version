/**
 * AI Calls Monitor - Real-time terminal monitoring for AI voice calls
 *
 * Usage: npx tsx scripts/monitor-ai-calls.ts [campaignId]
 *
 * This script polls the database and displays real-time call activity.
 */

import { db } from '../server/db';
import { callSessions, dialerCallAttempts, agentQueue, campaigns } from '../shared/schema';
import { eq, desc, and, gte, isNotNull, sql } from 'drizzle-orm';

const POLL_INTERVAL = 3000; // 3 seconds
const campaignIdFilter = process.argv[2] || null;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function clearLine() {
  process.stdout.write('\x1b[2K\r');
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDisposition(disposition: string | null): string {
  if (!disposition) return `${colors.dim}pending${colors.reset}`;

  const dispColors: Record<string, string> = {
    'qualified_lead': `${colors.bgGreen}${colors.white} QUALIFIED ${colors.reset}`,
    'not_interested': `${colors.yellow}not_interested${colors.reset}`,
    'do_not_call': `${colors.red}DNC${colors.reset}`,
    'voicemail': `${colors.magenta}voicemail${colors.reset}`,
    'no_answer': `${colors.dim}no_answer${colors.reset}`,
    'connected': `${colors.green}connected${colors.reset}`,
    'busy': `${colors.yellow}busy${colors.reset}`,
    'failed': `${colors.red}failed${colors.reset}`,
  };

  return dispColors[disposition] || disposition;
}

function formatStatus(status: string | null): string {
  const statusColors: Record<string, string> = {
    'in_progress': `${colors.cyan}IN PROGRESS${colors.reset}`,
    'completed': `${colors.green}completed${colors.reset}`,
    'queued': `${colors.dim}queued${colors.reset}`,
    'removed': `${colors.red}removed${colors.reset}`,
  };
  return statusColors[status || ''] || (status || 'unknown');
}

async function getActiveCalls() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  let query = db
    .select({
      id: callSessions.id,
      campaignId: callSessions.campaignId,
      contactName: sql<string>`COALESCE(${callSessions.contactName}, 'Unknown')`,
      phoneNumber: callSessions.toPhoneNumber,
      status: callSessions.status,
      aiDisposition: callSessions.aiDisposition,
      duration: callSessions.duration,
      startedAt: callSessions.createdAt,
      transcript: callSessions.transcript,
    })
    .from(callSessions)
    .where(
      and(
        gte(callSessions.createdAt, fiveMinutesAgo),
        campaignIdFilter ? eq(callSessions.campaignId, campaignIdFilter) : sql`1=1`
      )
    )
    .orderBy(desc(callSessions.createdAt))
    .limit(20);

  return await query;
}

async function getQueueStats() {
  const conditions = campaignIdFilter
    ? eq(agentQueue.campaignId, campaignIdFilter)
    : sql`1=1`;

  const stats = await db
    .select({
      status: agentQueue.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(agentQueue)
    .where(conditions)
    .groupBy(agentQueue.status);

  return stats.reduce((acc, s) => {
    acc[s.status || 'unknown'] = s.count;
    return acc;
  }, {} as Record<string, number>);
}

async function getCallStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const conditions = and(
    gte(dialerCallAttempts.createdAt, today),
    isNotNull(dialerCallAttempts.callStartedAt),
    campaignIdFilter ? eq(dialerCallAttempts.campaignId, campaignIdFilter) : sql`1=1`
  );

  const [stats] = await db
    .select({
      totalCalls: sql<number>`COUNT(*)::int`,
      connected: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.connected} = true THEN 1 END)::int`,
      qualified: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'qualified_lead' THEN 1 END)::int`,
      noAnswer: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'no_answer' THEN 1 END)::int`,
      voicemail: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'voicemail' OR ${dialerCallAttempts.voicemailDetected} = true THEN 1 END)::int`,
      notInterested: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'not_interested' THEN 1 END)::int`,
      dnc: sql<number>`COUNT(CASE WHEN ${dialerCallAttempts.disposition} = 'do_not_call' THEN 1 END)::int`,
    })
    .from(dialerCallAttempts)
    .where(conditions);

  return stats;
}

async function getCampaignInfo() {
  if (!campaignIdFilter) return null;

  const [campaign] = await db
    .select({
      name: campaigns.name,
      status: campaigns.status,
      dialMode: campaigns.dialMode,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignIdFilter))
    .limit(1);

  return campaign;
}

async function displayDashboard() {
  console.clear();

  const now = new Date().toLocaleTimeString();
  const campaign = await getCampaignInfo();

  // Header
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}  AI CALLS MONITOR ${colors.reset}${colors.dim}| ${now} | Refresh: ${POLL_INTERVAL/1000}s${colors.reset}`);
  if (campaign) {
    console.log(`${colors.bright}  Campaign: ${colors.yellow}${campaign.name}${colors.reset} ${colors.dim}(${campaign.status} - ${campaign.dialMode})${colors.reset}`);
  } else if (campaignIdFilter) {
    console.log(`${colors.bright}  Campaign: ${colors.yellow}${campaignIdFilter}${colors.reset}`);
  } else {
    console.log(`${colors.dim}  Monitoring ALL campaigns${colors.reset}`);
  }
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Stats
  const callStats = await getCallStats();
  const queueStats = await getQueueStats();

  console.log(`${colors.bright}TODAY'S STATS:${colors.reset}`);
  console.log(`  Calls Made: ${colors.bright}${callStats.totalCalls}${colors.reset}  |  Connected: ${colors.green}${callStats.connected}${colors.reset}  |  ${colors.bgGreen}${colors.white} Qualified: ${callStats.qualified} ${colors.reset}`);
  console.log(`  No Answer: ${callStats.noAnswer}  |  Voicemail: ${callStats.voicemail}  |  Not Interested: ${callStats.notInterested}  |  DNC: ${colors.red}${callStats.dnc}${colors.reset}`);

  const connectRate = callStats.totalCalls > 0 ? ((callStats.connected / callStats.totalCalls) * 100).toFixed(1) : '0';
  console.log(`  ${colors.dim}Connect Rate: ${connectRate}%${colors.reset}\n`);

  // Queue
  console.log(`${colors.bright}QUEUE STATUS:${colors.reset}`);
  console.log(`  Queued: ${colors.cyan}${queueStats.queued || 0}${colors.reset}  |  In Progress: ${colors.yellow}${queueStats.in_progress || 0}${colors.reset}  |  Completed: ${queueStats.completed || 0}  |  Removed: ${queueStats.removed || 0}\n`);

  // Recent Calls
  const activeCalls = await getActiveCalls();

  console.log(`${colors.bright}RECENT CALLS (last 5 min):${colors.reset}`);
  console.log(`${colors.dim}──────────────────────────────────────────────────────────────────────${colors.reset}`);

  if (activeCalls.length === 0) {
    console.log(`  ${colors.dim}No recent calls${colors.reset}`);
  } else {
    for (const call of activeCalls) {
      const time = call.startedAt ? new Date(call.startedAt).toLocaleTimeString() : '--';
      const phone = call.phoneNumber?.slice(-4) || '????';
      const name = (call.contactName || 'Unknown').substring(0, 20).padEnd(20);
      const dur = formatDuration(call.duration);
      const disp = formatDisposition(call.aiDisposition);
      const status = formatStatus(call.status);

      // Show transcript snippet if qualified or interesting
      let snippet = '';
      if (call.aiDisposition === 'qualified_lead' && call.transcript) {
        const transcriptText = typeof call.transcript === 'string'
          ? call.transcript
          : JSON.stringify(call.transcript);
        snippet = `\n    ${colors.dim}${transcriptText.substring(0, 80)}...${colors.reset}`;
      }

      console.log(`  ${colors.dim}${time}${colors.reset} | ${phone} | ${name} | ${dur} | ${status} | ${disp}${snippet}`);
    }
  }

  console.log(`\n${colors.dim}Press Ctrl+C to exit${colors.reset}`);
}

async function main() {
  console.log(`${colors.bright}Starting AI Calls Monitor...${colors.reset}`);

  if (campaignIdFilter) {
    console.log(`Filtering for campaign: ${campaignIdFilter}`);
  }

  // Initial display
  await displayDashboard();

  // Poll every POLL_INTERVAL
  setInterval(async () => {
    try {
      await displayDashboard();
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    }
  }, POLL_INTERVAL);
}

main().catch(console.error);
