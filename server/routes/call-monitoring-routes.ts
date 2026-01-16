/**
 * Call Monitoring Routes
 *
 * API endpoints for viewing call monitoring data
 */

import { Router } from 'express';
import {
  getCallMetrics,
  checkAlertThresholds,
  generateDailyReport,
  detectPotentialFalsePositives,
  getVoicemailDetectionEfficiency,
} from '../services/call-monitoring-service';

const router = Router();

/**
 * GET /api/monitoring/calls/metrics
 *
 * Get call metrics for a date range
 *
 * Query params:
 *   - startDate: ISO date string (default: 7 days ago)
 *   - endDate: ISO date string (default: now)
 */
router.get('/metrics', async (req, res) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    const metrics = await getCallMetrics(startDate, endDate);

    // Add alert status to each metric
    const metricsWithAlerts = metrics.map(m => ({
      ...m,
      alerts: checkAlertThresholds(m),
    }));

    res.json({
      success: true,
      data: metricsWithAlerts,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching call metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch call metrics',
    });
  }
});

/**
 * GET /api/monitoring/calls/daily-report
 *
 * Get daily monitoring report
 *
 * Query params:
 *   - date: ISO date string (default: yesterday)
 */
router.get('/daily-report', async (req, res) => {
  try {
    const date = req.query.date
      ? new Date(req.query.date as string)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const report = await generateDailyReport(date);

    res.json({
      success: true,
      report,
      date: date.toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Error generating daily report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate daily report',
    });
  }
});

/**
 * GET /api/monitoring/calls/false-positives
 *
 * Get potential false positives (human calls marked as voicemail)
 *
 * Query params:
 *   - hours: number of hours to look back (default: 24)
 */
router.get('/false-positives', async (req, res) => {
  try {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;

    const falsePositives = await detectPotentialFalsePositives(hours);

    res.json({
      success: true,
      data: falsePositives,
      count: falsePositives.length,
      hours,
    });
  } catch (error) {
    console.error('Error detecting false positives:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect false positives',
    });
  }
});

/**
 * GET /api/monitoring/calls/voicemail-efficiency
 *
 * Get voicemail detection efficiency metrics
 *
 * Query params:
 *   - days: number of days to analyze (default: 7)
 */
router.get('/voicemail-efficiency', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 7;

    const efficiency = await getVoicemailDetectionEfficiency(days);

    res.json({
      success: true,
      data: efficiency,
      days,
    });
  } catch (error) {
    console.error('Error getting voicemail efficiency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get voicemail efficiency metrics',
    });
  }
});

/**
 * GET /api/monitoring/calls/health
 *
 * Health check endpoint showing current system status
 */
router.get('/health', async (req, res) => {
  try {
    // Get metrics for last 24 hours
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const metrics = await getCallMetrics(startDate, endDate);

    if (metrics.length === 0) {
      return res.json({
        success: true,
        status: 'healthy',
        message: 'No call data in last 24 hours',
      });
    }

    const latestMetrics = metrics[0];
    const { alerts, severity } = checkAlertThresholds(latestMetrics);

    const status = severity === 'none' ? 'healthy' : severity === 'warning' ? 'degraded' : 'critical';

    res.json({
      success: true,
      status,
      severity,
      alerts,
      metrics: {
        totalCalls: latestMetrics.totalCalls,
        humanDetectionRate: latestMetrics.humanDetectionRate,
        avgVoicemailDuration: latestMetrics.avgVoicemailDuration,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error checking health:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      error: 'Failed to check system health',
    });
  }
});

export default router;
