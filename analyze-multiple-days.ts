/**
 * Multi-Day Call Analysis
 *
 * Analyzes call data over multiple days to identify patterns
 * and see if the disposition issues are consistent
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface DayStats {
  date: string;
  totalCalls: number;
  noAnswer: number;
  voicemail: number;
  notInterested: number;
  qualified: number;
  other: number;
  leadsCreated: number;
  connectRate: number;
  qualificationRate: number;
  avgDuration: number;
  longestCall: number;
}

async function analyzeMultipleDays(): Promise<void> {
  console.log('='.repeat(120));
  console.log('MULTI-DAY CALL ANALYSIS');
  console.log('='.repeat(120));
  console.log();

  // Analyze last 14 days
  const endDate = new Date('2026-01-21T00:00:00.000Z');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 14);

  console.log(`Analyzing calls from ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

  // Get all calls in date range
  const result = await db.execute(sql`
    SELECT
      DATE(cs.started_at) as call_date,
      cs.ai_disposition,
      dca.disposition as dialer_disposition,
      cs.duration_sec,
      l.id as lead_id
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at < ${endDate.toISOString()}::timestamp
    ORDER BY cs.started_at ASC
  `);

  const calls = (result as any).rows || [];
  console.log(`Total calls in range: ${calls.length}\n`);

  // Group by date
  const dailyStats: Map<string, DayStats> = new Map();

  for (const call of calls) {
    const dateStr = call.call_date?.toISOString?.()?.split('T')[0] ||
                    new Date(call.call_date).toISOString().split('T')[0];

    if (!dailyStats.has(dateStr)) {
      dailyStats.set(dateStr, {
        date: dateStr,
        totalCalls: 0,
        noAnswer: 0,
        voicemail: 0,
        notInterested: 0,
        qualified: 0,
        other: 0,
        leadsCreated: 0,
        connectRate: 0,
        qualificationRate: 0,
        avgDuration: 0,
        longestCall: 0
      });
    }

    const stats = dailyStats.get(dateStr)!;
    stats.totalCalls++;

    const disposition = (call.ai_disposition || call.dialer_disposition || '').toLowerCase();

    if (disposition.includes('no_answer') || disposition.includes('no-answer')) {
      stats.noAnswer++;
    } else if (disposition.includes('voicemail')) {
      stats.voicemail++;
    } else if (disposition.includes('not_interested')) {
      stats.notInterested++;
    } else if (disposition.includes('qualified') || disposition.includes('meeting') || disposition.includes('callback')) {
      stats.qualified++;
    } else {
      stats.other++;
    }

    if (call.lead_id) {
      stats.leadsCreated++;
    }

    const duration = call.duration_sec || 0;
    stats.avgDuration = ((stats.avgDuration * (stats.totalCalls - 1)) + duration) / stats.totalCalls;
    if (duration > stats.longestCall) {
      stats.longestCall = duration;
    }
  }

  // Calculate rates
  for (const stats of dailyStats.values()) {
    stats.connectRate = stats.totalCalls > 0
      ? ((stats.notInterested + stats.qualified) / stats.totalCalls) * 100
      : 0;
    stats.qualificationRate = (stats.notInterested + stats.qualified) > 0
      ? (stats.qualified / (stats.notInterested + stats.qualified)) * 100
      : 0;
  }

  // Sort by date and print
  const sortedStats = Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date));

  console.log('DAILY STATISTICS');
  console.log('='.repeat(120));
  console.log('Date       | Total | NoAns | VM    | NotInt | Qual  | Other | Leads | ConnRate | QualRate | AvgDur | MaxDur');
  console.log('-'.repeat(120));

  let totalCalls = 0;
  let totalNoAnswer = 0;
  let totalVoicemail = 0;
  let totalNotInterested = 0;
  let totalQualified = 0;
  let totalLeads = 0;

  for (const stats of sortedStats) {
    console.log(
      `${stats.date} | ${String(stats.totalCalls).padStart(5)} | ${String(stats.noAnswer).padStart(5)} | ${String(stats.voicemail).padStart(5)} | ${String(stats.notInterested).padStart(6)} | ${String(stats.qualified).padStart(5)} | ${String(stats.other).padStart(5)} | ${String(stats.leadsCreated).padStart(5)} | ${stats.connectRate.toFixed(1).padStart(7)}% | ${stats.qualificationRate.toFixed(1).padStart(7)}% | ${Math.round(stats.avgDuration).toString().padStart(5)}s | ${stats.longestCall.toString().padStart(5)}s`
    );

    totalCalls += stats.totalCalls;
    totalNoAnswer += stats.noAnswer;
    totalVoicemail += stats.voicemail;
    totalNotInterested += stats.notInterested;
    totalQualified += stats.qualified;
    totalLeads += stats.leadsCreated;
  }

  console.log('-'.repeat(120));

  const totalConnectRate = totalCalls > 0 ? ((totalNotInterested + totalQualified) / totalCalls) * 100 : 0;
  const totalQualRate = (totalNotInterested + totalQualified) > 0 ? (totalQualified / (totalNotInterested + totalQualified)) * 100 : 0;

  console.log(
    `TOTAL      | ${String(totalCalls).padStart(5)} | ${String(totalNoAnswer).padStart(5)} | ${String(totalVoicemail).padStart(5)} | ${String(totalNotInterested).padStart(6)} | ${String(totalQualified).padStart(5)} | ${String(sortedStats.reduce((sum, s) => sum + s.other, 0)).padStart(5)} | ${String(totalLeads).padStart(5)} | ${totalConnectRate.toFixed(1).padStart(7)}% | ${totalQualRate.toFixed(1).padStart(7)}%`
  );

  // Check for any qualified dispositions in the raw data
  console.log('\n\nCHECKING FOR QUALIFIED DISPOSITIONS IN RAW DATA');
  console.log('='.repeat(120));

  const qualifiedCheck = await db.execute(sql`
    SELECT
      cs.ai_disposition,
      dca.disposition::text as dialer_disposition,
      COUNT(*) as count
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at < ${endDate.toISOString()}::timestamp
      AND (
        cs.ai_disposition ILIKE '%qualified%' OR
        cs.ai_disposition ILIKE '%meeting%' OR
        cs.ai_disposition ILIKE '%callback%' OR
        cs.ai_disposition ILIKE '%interested%' OR
        dca.disposition::text ILIKE '%qualified%' OR
        dca.disposition::text ILIKE '%meeting%' OR
        dca.disposition::text ILIKE '%callback%'
      )
    GROUP BY cs.ai_disposition, dca.disposition
    ORDER BY count DESC
  `);

  console.log(`Found ${(qualifiedCheck as any).rows?.length || 0} disposition combinations with potential qualified signals:`);
  for (const row of (qualifiedCheck as any).rows || []) {
    console.log(`  AI: "${row.ai_disposition}" | Dialer: "${row.dialer_disposition}" | Count: ${row.count}`);
  }

  // Check distinct dispositions
  console.log('\n\nALL DISTINCT DISPOSITIONS');
  console.log('='.repeat(120));

  const distinctDispositions = await db.execute(sql`
    SELECT
      cs.ai_disposition,
      COUNT(*) as count
    FROM call_sessions cs
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at < ${endDate.toISOString()}::timestamp
      AND cs.ai_disposition IS NOT NULL
    GROUP BY cs.ai_disposition
    ORDER BY count DESC
  `);

  console.log('AI Dispositions:');
  for (const row of (distinctDispositions as any).rows || []) {
    console.log(`  "${row.ai_disposition}": ${row.count}`);
  }

  const distinctDialerDispositions = await db.execute(sql`
    SELECT
      dca.disposition::text as disposition,
      COUNT(*) as count
    FROM dialer_call_attempts dca
    WHERE dca.created_at >= ${startDate.toISOString()}::timestamp
      AND dca.created_at < ${endDate.toISOString()}::timestamp
      AND dca.disposition IS NOT NULL
    GROUP BY dca.disposition
    ORDER BY count DESC
  `);

  console.log('\nDialer Dispositions:');
  for (const row of (distinctDialerDispositions as any).rows || []) {
    console.log(`  "${row.disposition}": ${row.count}`);
  }

  // Check leads table
  console.log('\n\nLEADS CREATED IN DATE RANGE');
  console.log('='.repeat(120));

  const leadsCheck = await db.execute(sql`
    SELECT
      DATE(created_at) as lead_date,
      COUNT(*) as count,
      qa_status
    FROM leads
    WHERE created_at >= ${startDate.toISOString()}::timestamp
      AND created_at < ${endDate.toISOString()}::timestamp
    GROUP BY DATE(created_at), qa_status
    ORDER BY lead_date DESC
  `);

  console.log(`Leads by date and status:`);
  for (const row of (leadsCheck as any).rows || []) {
    const dateStr = row.lead_date?.toISOString?.()?.split('T')[0] ||
                    new Date(row.lead_date).toISOString().split('T')[0];
    console.log(`  ${dateStr}: ${row.count} leads (status: ${row.qa_status})`);
  }

  if ((leadsCheck as any).rows?.length === 0) {
    console.log('  NO LEADS CREATED IN THIS DATE RANGE!');
  }

  // Summary
  console.log('\n' + '='.repeat(120));
  console.log('ANALYSIS SUMMARY');
  console.log('='.repeat(120));
  console.log(`
Date Range:           ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}
Total Calls:          ${totalCalls}
No Answer:            ${totalNoAnswer} (${((totalNoAnswer/totalCalls)*100).toFixed(1)}%)
Voicemail:            ${totalVoicemail} (${((totalVoicemail/totalCalls)*100).toFixed(1)}%)
Not Interested:       ${totalNotInterested} (${((totalNotInterested/totalCalls)*100).toFixed(1)}%)
Qualified:            ${totalQualified} (${((totalQualified/totalCalls)*100).toFixed(1)}%)
Leads Created:        ${totalLeads}
Connect Rate:         ${totalConnectRate.toFixed(1)}%
Qualification Rate:   ${totalQualRate.toFixed(1)}%

KEY FINDING: ${totalQualified === 0 ? '⚠️ ZERO QUALIFIED DISPOSITIONS!' : `${totalQualified} qualified calls`}
KEY FINDING: ${totalLeads === 0 ? '⚠️ ZERO LEADS CREATED!' : `${totalLeads} leads created`}
  `);

  process.exit(0);
}

analyzeMultipleDays().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
