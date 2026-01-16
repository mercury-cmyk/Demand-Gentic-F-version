/**
 * Call Monitoring Service
 *
 * Monitors call metrics and triggers alerts for voicemail detection improvements
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

interface CallMetrics {
  date: string;
  totalCalls: number;
  voicemailCalls: number;
  humanCalls: number;
  avgVoicemailDuration: number;
  avgHumanDuration: number;
  callsEndedAt60s: number;
  humanDetectionRate: number;
  avgCallDuration: number;
}

interface AlertThresholds {
  maxAvgVoicemailDuration: number; // seconds
  minHumanDetectionRate: number; // percentage
  maxHumanDetectionRate: number; // percentage
  maxCallsEndedAt60s: number; // percentage
  minCallCompletionRate: number; // percentage
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  maxAvgVoicemailDuration: 75, // Alert if avg voicemail duration > 75s
  minHumanDetectionRate: 10, // Alert if < 10% human detection
  maxHumanDetectionRate: 40, // Alert if > 40% human detection (suspicious)
  maxCallsEndedAt60s: 90, // Alert if > 90% calls end at exactly 60s
  minCallCompletionRate: 90, // Alert if < 90% calls complete successfully
};

/**
 * Get call metrics for a date range
 */
export async function getCallMetrics(startDate: Date, endDate: Date): Promise<CallMetrics[]> {
  const metrics = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE disposition = 'voicemail') as voicemail_calls,
      COUNT(*) FILTER (WHERE disposition IN ('qualified_lead', 'not_interested', 'do_not_call')) as human_calls,
      AVG(call_duration_seconds) FILTER (WHERE disposition = 'voicemail') as avg_voicemail_duration,
      AVG(call_duration_seconds) FILTER (WHERE disposition IN ('qualified_lead', 'not_interested', 'do_not_call')) as avg_human_duration,
      COUNT(*) FILTER (WHERE disposition IN ('voicemail', 'no_answer') AND call_duration_seconds BETWEEN 58 AND 62) as calls_ended_at_60s,
      ROUND(100.0 * COUNT(*) FILTER (WHERE disposition IN ('qualified_lead', 'not_interested', 'do_not_call')) / NULLIF(COUNT(*), 0), 2) as human_detection_rate,
      AVG(call_duration_seconds) as avg_call_duration
    FROM dialer_call_attempts
    WHERE created_at >= ${startDate}
      AND created_at < ${endDate}
      AND call_duration_seconds > 0
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
  `);

  return metrics.rows.map((row: any) => ({
    date: row.date,
    totalCalls: Number(row.total_calls) || 0,
    voicemailCalls: Number(row.voicemail_calls) || 0,
    humanCalls: Number(row.human_calls) || 0,
    avgVoicemailDuration: Number(row.avg_voicemail_duration) || 0,
    avgHumanDuration: Number(row.avg_human_duration) || 0,
    callsEndedAt60s: Number(row.calls_ended_at_60s) || 0,
    humanDetectionRate: Number(row.human_detection_rate) || 0,
    avgCallDuration: Number(row.avg_call_duration) || 0,
  }));
}

/**
 * Check if metrics breach alert thresholds
 */
export function checkAlertThresholds(
  metrics: CallMetrics,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): { alerts: string[]; severity: 'none' | 'warning' | 'critical' } {
  const alerts: string[] = [];
  let severity: 'none' | 'warning' | 'critical' = 'none';

  // Check voicemail duration
  if (metrics.avgVoicemailDuration > thresholds.maxAvgVoicemailDuration) {
    alerts.push(
      `⚠️ Average voicemail duration (${Math.round(metrics.avgVoicemailDuration)}s) exceeds threshold (${thresholds.maxAvgVoicemailDuration}s)`
    );
    severity = 'warning';
  }

  // Check human detection rate
  if (metrics.humanDetectionRate < thresholds.minHumanDetectionRate) {
    alerts.push(
      `🚨 Human detection rate (${metrics.humanDetectionRate.toFixed(1)}%) below threshold (${thresholds.minHumanDetectionRate}%)`
    );
    severity = 'critical';
  } else if (metrics.humanDetectionRate > thresholds.maxHumanDetectionRate) {
    alerts.push(
      `⚠️ Human detection rate (${metrics.humanDetectionRate.toFixed(1)}%) above expected range (>${thresholds.maxHumanDetectionRate}%)`
    );
    severity = severity === 'critical' ? 'critical' : 'warning';
  }

  // Check if too many calls ending at exactly 60s (indicates timeout triggering frequently)
  const pctEndedAt60s = (metrics.callsEndedAt60s / metrics.totalCalls) * 100;
  if (pctEndedAt60s > thresholds.maxCallsEndedAt60s) {
    alerts.push(
      `⚠️ ${pctEndedAt60s.toFixed(1)}% of calls ending at 60s (threshold: ${thresholds.maxCallsEndedAt60s}%) - timeout may be too aggressive`
    );
    severity = severity === 'critical' ? 'critical' : 'warning';
  }

  return { alerts, severity };
}

/**
 * Generate daily monitoring report
 */
export async function generateDailyReport(date: Date = new Date()): Promise<string> {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const metrics = await getCallMetrics(startDate, endDate);

  if (metrics.length === 0) {
    return `No call data available for ${date.toISOString().split('T')[0]}`;
  }

  const m = metrics[0];
  const { alerts, severity } = checkAlertThresholds(m);

  let report = `
📊 CALL MONITORING REPORT
========================
Date: ${m.date}
Status: ${severity === 'none' ? '✅ All metrics normal' : severity === 'warning' ? '⚠️ Warning' : '🚨 Critical'}

CALL VOLUME
-----------
Total Calls: ${m.totalCalls}
Human Calls: ${m.humanCalls} (${m.humanDetectionRate.toFixed(1)}%)
Voicemail Calls: ${m.voicemailCalls} (${((m.voicemailCalls / m.totalCalls) * 100).toFixed(1)}%)

CALL DURATION
-------------
Avg Overall: ${Math.round(m.avgCallDuration)}s
Avg Human: ${Math.round(m.avgHumanDuration)}s
Avg Voicemail: ${Math.round(m.avgVoicemailDuration)}s

TIMEOUT METRICS
---------------
Calls Ended at 60s: ${m.callsEndedAt60s} (${((m.callsEndedAt60s / m.totalCalls) * 100).toFixed(1)}%)

`;

  if (alerts.length > 0) {
    report += `\nALERTS\n------\n${alerts.join('\n')}\n`;
  }

  return report;
}

/**
 * Get recent calls with potential false positives
 * (Human calls marked as voicemail - short duration but marked as voicemail)
 */
export async function detectPotentialFalsePositives(hours: number = 24): Promise<any[]> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);

  const suspiciousCalls = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.notes,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    WHERE dca.created_at >= ${cutoffDate}
      AND dca.disposition = 'voicemail'
      AND dca.call_duration_seconds BETWEEN 10 AND 30
      AND (
        dca.notes ILIKE '%yes%'
        OR dca.notes ILIKE '%hello%'
        OR dca.notes ILIKE '%speaking%'
        OR dca.notes ILIKE '%this is%'
      )
    ORDER BY dca.created_at DESC
    LIMIT 50
  `);

  return suspiciousCalls.rows;
}

/**
 * Get voicemail detection efficiency metrics
 */
export async function getVoicemailDetectionEfficiency(days: number = 7): Promise<{
  avgDetectionTime: number;
  distribution: { bucket: string; count: number }[];
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Get distribution of voicemail call durations
  const distribution = await db.execute(sql`
    SELECT
      CASE
        WHEN call_duration_seconds <= 30 THEN '0-30s'
        WHEN call_duration_seconds <= 45 THEN '31-45s'
        WHEN call_duration_seconds <= 60 THEN '46-60s'
        WHEN call_duration_seconds <= 75 THEN '61-75s'
        WHEN call_duration_seconds <= 90 THEN '76-90s'
        ELSE '>90s'
      END as bucket,
      COUNT(*) as count
    FROM dialer_call_attempts
    WHERE created_at >= ${cutoffDate}
      AND disposition = 'voicemail'
      AND call_duration_seconds > 0
    GROUP BY 1
    ORDER BY 1
  `);

  const avgResult = await db.execute(sql`
    SELECT AVG(call_duration_seconds) as avg_duration
    FROM dialer_call_attempts
    WHERE created_at >= ${cutoffDate}
      AND disposition = 'voicemail'
      AND call_duration_seconds > 0
  `);

  return {
    avgDetectionTime: Number(avgResult.rows[0]?.avg_duration) || 0,
    distribution: distribution.rows.map((row: any) => ({
      bucket: row.bucket,
      count: Number(row.count),
    })),
  };
}

/**
 * Send alert via console (can be extended to Slack, email, etc.)
 */
export function sendAlert(message: string, severity: 'warning' | 'critical' = 'warning'): void {
  const prefix = severity === 'critical' ? '🚨 CRITICAL ALERT' : '⚠️ WARNING';
  console.error(`\n${prefix}\n${'='.repeat(50)}\n${message}\n${'='.repeat(50)}\n`);

  // TODO: Integrate with alerting service (Slack, PagerDuty, etc.)
  // Example:
  // await sendSlackAlert({ channel: '#alerts', message, severity });
  // await sendPagerDutyAlert({ message, severity });
}

/**
 * Run monitoring check (can be scheduled via cron)
 */
export async function runMonitoringCheck(): Promise<void> {
  console.log('[Call Monitoring] Running daily check...');

  try {
    // Get yesterday's metrics
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const report = await generateDailyReport(yesterday);
    console.log(report);

    // Check for false positives
    const falsePositives = await detectPotentialFalsePositives(24);
    if (falsePositives.length > 0) {
      sendAlert(
        `⚠️ Detected ${falsePositives.length} potential false positives (human calls marked as voicemail)\n` +
        `Review these calls manually:\n` +
        falsePositives.slice(0, 5).map((call: any) =>
          `- ${call.first_name} ${call.last_name} (${call.call_duration_seconds}s, ${call.created_at})`
        ).join('\n'),
        'warning'
      );
    }

    // Check voicemail detection efficiency
    const efficiency = await getVoicemailDetectionEfficiency(7);
    console.log(`\n📈 Voicemail Detection Efficiency (7 days):`);
    console.log(`Average detection time: ${Math.round(efficiency.avgDetectionTime)}s`);
    console.log(`Distribution:`);
    efficiency.distribution.forEach(d => {
      console.log(`  ${d.bucket}: ${d.count} calls`);
    });

    if (efficiency.avgDetectionTime > 70) {
      sendAlert(
        `⚠️ Voicemail detection taking longer than expected\n` +
        `Average: ${Math.round(efficiency.avgDetectionTime)}s (target: <65s)\n` +
        `Check if 60s timeout is working correctly.`,
        'warning'
      );
    }

  } catch (error) {
    console.error('[Call Monitoring] Error running check:', error);
    sendAlert(`🚨 Call monitoring check failed: ${error}`, 'critical');
  }
}

// Export for use in scheduled jobs
export default {
  getCallMetrics,
  checkAlertThresholds,
  generateDailyReport,
  detectPotentialFalsePositives,
  getVoicemailDetectionEfficiency,
  sendAlert,
  runMonitoringCheck,
};
