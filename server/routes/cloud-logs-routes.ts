/**
 * Cloud Logging API Routes
 * Endpoints for accessing Google Cloud Run logs in internal dashboard
 */

import { Router } from 'express';
import { cloudLoggingService } from '../services/cloud-logging-service';
import { requireAuth } from '../auth';

const router = Router();

/**
 * GET /api/cloud-logs/recent
 * Get recent logs (last N minutes)
 */
router.get('/recent', requireAuth, async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 5;
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await cloudLoggingService.getRecentLogs(minutes, limit);

    res.json({
      logs,
      count: logs.length,
      timeWindow: `${minutes} minutes`
    });
  } catch (error: any) {
    console.error('Error fetching recent logs:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch logs' });
  }
});

/**
 * GET /api/cloud-logs/metrics
 * Get log metrics and aggregations
 */
router.get('/metrics', requireAuth, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;

    const metrics = await cloudLoggingService.getLogMetrics(hours);

    res.json(metrics);
  } catch (error: any) {
    console.error('Error fetching log metrics:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch metrics' });
  }
});

/**
 * GET /api/cloud-logs/errors
 * Get error summary with grouping
 */
router.get('/errors', requireAuth, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;

    const errorSummary = await cloudLoggingService.getErrorSummary(hours);

    res.json({
      errors: errorSummary,
      totalTypes: errorSummary.length,
      totalErrors: errorSummary.reduce((sum, e) => sum + e.count, 0)
    });
  } catch (error: any) {
    console.error('Error fetching error summary:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch errors' });
  }
});

/**
 * GET /api/cloud-logs/search
 * Search logs by text query
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ message: 'Query parameter "q" is required' });
    }

    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await cloudLoggingService.searchLogs(query, hours, limit);

    res.json({
      logs,
      count: logs.length,
      query
    });
  } catch (error: any) {
    console.error('Error searching logs:', error);
    res.status(500).json({ message: error.message || 'Failed to search logs' });
  }
});

/**
 * GET /api/cloud-logs/severity/:level
 * Get logs by severity level
 */
router.get('/severity/:level', requireAuth, async (req, res) => {
  try {
    const level = req.params.level.toUpperCase() as 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
    const validLevels = ['ERROR', 'WARNING', 'INFO', 'DEBUG'];

    if (!validLevels.includes(level)) {
      return res.status(400).json({ 
        message: `Invalid severity level. Must be one of: ${validLevels.join(', ')}` 
      });
    }

    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = await cloudLoggingService.fetchLogs({ 
      hours, 
      severity: level,
      limit 
    });

    res.json({
      logs,
      count: logs.length,
      severity: level
    });
  } catch (error: any) {
    console.error(`Error fetching ${req.params.level} logs:`, error);
    res.status(500).json({ message: error.message || 'Failed to fetch logs' });
  }
});

/**
 * GET /api/cloud-logs/health
 * Health check endpoint
 */
router.get('/health', requireAuth, async (req, res) => {
  try {
    // Fetch last 5 minutes of logs as health indicator
    const recentLogs = await cloudLoggingService.getRecentLogs(5, 10);
    const recentErrors = recentLogs.filter(l => l.severity === 'ERROR');

    const status = {
      healthy: recentErrors.length === 0,
      logsAvailable: recentLogs.length > 0,
      recentErrorCount: recentErrors.length,
      lastLogTimestamp: recentLogs[0]?.timestamp || null
    };

    res.json(status);
  } catch (error: any) {
    console.error('Error checking log health:', error);
    res.status(500).json({ message: error.message || 'Failed to check health' });
  }
});

export default router;
