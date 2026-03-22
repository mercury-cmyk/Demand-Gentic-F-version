/**
 * Cloud Logging API Routes
 * Endpoints for accessing Google Cloud Run logs in internal dashboard
 */

import { Router, type Request } from 'express';
import { cloudLoggingService } from '../services/cloud-logging-service';
import { getOpsOverview } from '../services/ops/runtime';
import { vmLogService } from '../services/vm-log-service';
import { requireAuth } from '../auth';

const router = Router();

async function useVmLogs(): Promise {
  const overview = await getOpsOverview();
  return overview.deploymentTarget === 'vm';
}

function getRequestedService(req: Request): string | undefined {
  const service = typeof req.query.service === 'string' ? req.query.service.trim() : '';
  return service || undefined;
}

/**
 * GET /api/cloud-logs/recent
 * Get recent logs (last N minutes)
 */
router.get('/recent', requireAuth, async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 5;
    const limit = parseInt(req.query.limit as string) || 50;
    const service = getRequestedService(req);
    const vmLogs = await useVmLogs();
    const logs = vmLogs
      ? await vmLogService.getRecentLogs(minutes, limit, service)
      : await cloudLoggingService.getRecentLogs(minutes, limit);

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
    const service = getRequestedService(req);
    const vmLogs = await useVmLogs();
    const metrics = vmLogs
      ? await vmLogService.getLogMetrics(hours, service)
      : await cloudLoggingService.getLogMetrics(hours);

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
    const service = getRequestedService(req);
    const vmLogs = await useVmLogs();
    const errorSummary = vmLogs
      ? await vmLogService.getErrorSummary(hours, service)
      : await cloudLoggingService.getErrorSummary(hours);

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
    const service = getRequestedService(req);
    const vmLogs = await useVmLogs();
    const logs = vmLogs
      ? await vmLogService.searchLogs(query, hours, limit, service)
      : await cloudLoggingService.searchLogs(query, hours, limit);

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
    const service = getRequestedService(req);
    const vmLogs = await useVmLogs();
    const logs = vmLogs
      ? await vmLogService.getAdvancedLogs({
          hours,
          severities: [level],
          limit,
          service,
        })
      : await cloudLoggingService.fetchLogs({
          hours,
          severity: level,
          limit,
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
    const service = getRequestedService(req);
    // Fetch last 5 minutes of logs as health indicator
    const vmLogs = await useVmLogs();
    const recentLogs = vmLogs
      ? await vmLogService.getRecentLogs(5, 10, service)
      : await cloudLoggingService.getRecentLogs(5, 10);
    const recentErrors = recentLogs.filter(l => l.severity === 'ERROR' || l.severity === 'CRITICAL');

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

/**
 * POST /api/cloud-logs/advanced
 * Get logs with advanced filtering (severities, resources, search)
 */
router.post('/advanced', requireAuth, async (req, res) => {
  try {
    const {
      hours = 24,
      severities = [],
      resources = [],
      search,
      limit = 100
    } = req.body;
    const service = typeof req.body?.service === 'string' ? req.body.service.trim() : undefined;
    const vmLogs = await useVmLogs();
    const logs = vmLogs
      ? await vmLogService.getAdvancedLogs({
          hours: parseInt(hours as string),
          severities,
          resources,
          search,
          limit: parseInt(limit as string),
          service,
        })
      : await cloudLoggingService.getAdvancedLogs({
          hours: parseInt(hours as string),
          severities,
          resources,
          search,
          limit: parseInt(limit as string)
        });

    res.json({
      logs,
      count: logs.length,
      filters: { hours, severities, resources, search }
    });
  } catch (error: any) {
    console.error('Error fetching advanced logs:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch logs' });
  }
});

/**
 * GET /api/cloud-logs/statistics
 * Get log statistics (counts by severity, resource, etc.)
 */
router.get('/statistics', requireAuth, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const service = getRequestedService(req);
    const vmLogs = await useVmLogs();
    const stats = vmLogs
      ? await vmLogService.getLogStatistics(hours, service)
      : await cloudLoggingService.getLogStatistics(hours);

    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching log statistics:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch statistics' });
  }
});

export default router;