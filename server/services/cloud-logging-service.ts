/**
 * GCP Cloud Logging Integration Service
 * Fetches and aggregates Google Cloud Run logs for internal dashboard
 * 
 * To use this service, you need to install the following dependencies:
 * npm install @google-cloud/logging
 */

import { Logging, LogEntry as GCloudLogEntry } from '@google-cloud/logging';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || 'pivotalb2b-2026';
const SERVICE_NAME = 'demandgentic-api';
const REGION = 'us-central1';

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
  labels?: Record<string, string>;
  jsonPayload?: any;
  textPayload?: string;
}

interface LogMetrics {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  recentErrors: LogEntry[];
  timeRange: { start: Date; end: Date };
}

interface ErrorSummary {
  errorType: string;
  count: number;
  lastOccurrence: string;
  samples: string[];
}

export class CloudLoggingService {
  private logging: Logging;

  constructor() {
    this.logging = new Logging({ projectId: PROJECT_ID });
  }

  /**
   * Fetch logs from Cloud Run service
   */
  async fetchLogs(options: {
    hours?: number;
    severity?: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
    limit?: number;
    revisionName?: string;
  } = {}): Promise<LogEntry[]> {
    const {
      hours = 24,
      severity,
      limit = 100,
      revisionName
    } = options;

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    // Build filter query
    let filter = `
      resource.type="cloud_run_revision"
      resource.labels.service_name="${SERVICE_NAME}"
      resource.labels.location="${REGION}"
      timestamp>="${startTime.toISOString()}"
    `.replace(/\s+/g, ' ').trim();

    if (revisionName) {
      filter += ` resource.labels.revision_name="${revisionName}"`;
    }

    if (severity) {
      filter += ` severity>=${severity}`;
    }

    try {
      const log = this.logging.log('projects/' + PROJECT_ID + '/logs/run.googleapis.com%2Fstderr');
      const [entries] = await log.getEntries({
        filter,
        pageSize: limit,
        orderBy: 'timestamp desc'
      });

      return entries.map((entry: GCloudLogEntry) => ({
        timestamp: entry.metadata.timestamp?.toString() || new Date().toISOString(),
        severity: entry.metadata.severity || 'INFO',
        message: this.extractMessage(entry),
        resource: entry.metadata.resource?.type,
        labels: entry.metadata.labels,
        jsonPayload: entry.metadata.jsonPayload,
        textPayload: entry.metadata.textPayload
      }));
    } catch (error: any) {
      console.error('Error fetching Cloud Logs:', error);
      throw new Error(`Failed to fetch logs: ${error.message}`);
    }
  }

  /**
   * Get log metrics and aggregations
   */
  async getLogMetrics(hours: number = 24): Promise<LogMetrics> {
    const logs = await this.fetchLogs({ hours, limit: 1000 });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const errorCount = logs.filter(l => l.severity === 'ERROR').length;
    const warningCount = logs.filter(l => l.severity === 'WARNING').length;
    const infoCount = logs.filter(l => l.severity === 'INFO').length;

    const recentErrors = logs
      .filter(l => l.severity === 'ERROR')
      .slice(0, 10);

    return {
      totalLogs: logs.length,
      errorCount,
      warningCount,
      infoCount,
      recentErrors,
      timeRange: { start: startTime, end: endTime }
    };
  }

  /**
   * Get error summary with grouping
   */
  async getErrorSummary(hours: number = 24): Promise<ErrorSummary[]> {
    const logs = await this.fetchLogs({ hours, severity: 'ERROR', limit: 500 });
    
    const errorGroups = new Map<string, { count: number; lastOccurrence: string; samples: string[] }>();

    for (const log of logs) {
      const errorType = this.categorizeError(log.message);
      const existing = errorGroups.get(errorType) || { count: 0, lastOccurrence: '', samples: [] };
      
      existing.count++;
      if (!existing.lastOccurrence || log.timestamp > existing.lastOccurrence) {
        existing.lastOccurrence = log.timestamp;
      }
      if (existing.samples.length < 3) {
        existing.samples.push(log.message.substring(0, 200));
      }

      errorGroups.set(errorType, existing);
    }

    return Array.from(errorGroups.entries())
      .map(([errorType, data]) => ({
        errorType,
        count: data.count,
        lastOccurrence: data.lastOccurrence,
        samples: data.samples
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Search logs with custom query
   */
  async searchLogs(query: string, hours: number = 24, limit: number = 100): Promise<LogEntry[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const filter = `
      resource.type="cloud_run_revision"
      resource.labels.service_name="${SERVICE_NAME}"
      timestamp>="${startTime.toISOString()}"
      textPayload=~"${query}"
    `.replace(/\s+/g, ' ').trim();

    try {
      const log = this.logging.log('projects/' + PROJECT_ID + '/logs/run.googleapis.com%2Fstderr');
      const [entries] = await log.getEntries({
        filter,
        pageSize: limit,
        orderBy: 'timestamp desc'
      });

      return entries.map((entry: GCloudLogEntry) => ({
        timestamp: entry.metadata.timestamp?.toString() || new Date().toISOString(),
        severity: entry.metadata.severity || 'INFO',
        message: this.extractMessage(entry),
        resource: entry.metadata.resource?.type,
        labels: entry.metadata.labels,
        jsonPayload: entry.metadata.jsonPayload,
        textPayload: entry.metadata.textPayload
      }));
    } catch (error: any) {
      console.error('Error searching logs:', error);
      throw new Error(`Failed to search logs: ${error.message}`);
    }
  }

  /**
   * Get real-time log stream (last N minutes)
   */
  async getRecentLogs(minutes: number = 5, limit: number = 50): Promise<LogEntry[]> {
    return this.fetchLogs({ hours: minutes / 60, limit });
  }

  /**
   * Helper: Extract message from log entry
   */
  private extractMessage(entry: GCloudLogEntry): string {
    if (entry.metadata.textPayload) {
      return entry.metadata.textPayload;
    }
    if (entry.metadata.jsonPayload) {
      return JSON.stringify(entry.metadata.jsonPayload);
    }
    return entry.data?.toString() || 'No message';
  }

  /**
   * Helper: Categorize error by pattern
   */
  private categorizeError(message: string): string {
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) return 'Network Connection Error';
    if (message.includes('timeout')) return 'Timeout Error';
    if (message.includes('EADDRINUSE')) return 'Port Already In Use';
    if (message.includes('database') || message.includes('postgres')) return 'Database Error';
    if (message.includes('authentication') || message.includes('unauthorized')) return 'Authentication Error';
    if (message.includes('validation')) return 'Validation Error';
    if (message.includes('not found') || message.includes('404')) return '404 Not Found';
    if (message.includes('500') || message.includes('internal server')) return 'Internal Server Error';
    if (message.includes('memory') || message.includes('heap')) return 'Memory Error';
    if (message.includes('telnyx')) return 'Telnyx API Error';
    if (message.includes('openai') || message.includes('gemini')) return 'AI Provider Error';
    return 'Other Error';
  }
}

// Export singleton instance
export const cloudLoggingService = new CloudLoggingService();
