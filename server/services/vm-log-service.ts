import { getDeploymentLogs } from "./ops/runtime";

const DEFAULT_SERVICE = (process.env.VM_LOG_STREAM_SERVICE || "api").trim() || "api";

export interface VmLogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
  labels?: Record<string, string>;
  jsonPayload?: any;
  textPayload?: string;
}

export interface VmLogMetrics {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  recentErrors: VmLogEntry[];
  timeRange: { start: Date; end: Date };
}

export interface VmErrorSummary {
  errorType: string;
  count: number;
  lastOccurrence: string;
  samples: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchPattern(value: string): RegExp {
  try {
    return new RegExp(value, "i");
  } catch {
    return new RegExp(escapeRegExp(value), "i");
  }
}

function toSinceWindow(hours: number): string {
  const minutes = Math.max(1, Math.ceil(hours * 60));
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

function estimateTail(hours: number, minimum: number, maximum: number): number {
  return clamp(Math.ceil(hours * 240), minimum, maximum);
}

function normalizeSeverity(value?: string | null): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "WARN") return "WARNING";
  if (upper === "FATAL") return "CRITICAL";
  if (upper === "TRACE") return "DEBUG";
  if (["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "DEFAULT"].includes(upper)) {
    return upper;
  }
  return null;
}

function getPayloadSeverity(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  return normalizeSeverity(
    payload.severity ||
    payload.level ||
    payload.logLevel ||
    payload.log_level ||
    payload.type,
  );
}

function getPayloadMessage(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const key of ["message", "msg", "error", "event", "detail"]) {
    if (typeof payload[key] === "string" && payload[key].trim()) {
      return payload[key].trim();
    }
  }
  return null;
}

function detectSeverity(message: string, payload?: any): string {
  const payloadSeverity = getPayloadSeverity(payload);
  if (payloadSeverity) {
    return payloadSeverity;
  }

  if (/\b(CRITICAL|FATAL)\b/i.test(message)) return "CRITICAL";
  if (/\b(ERROR|ERR)\b/i.test(message)) return "ERROR";
  if (/\b(WARN|WARNING)\b/i.test(message)) return "WARNING";
  if (/\b(DEBUG|TRACE)\b/i.test(message)) return "DEBUG";
  if (/\b(INFO|STARTUP|BOOT)\b/i.test(message)) return "INFO";
  return "DEFAULT";
}

function parseTimestampedLine(rawLine: string): { timestamp: string; message: string } {
  const trimmed = rawLine.trim();
  const timestampMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$/,
  );

  if (timestampMatch) {
    return {
      timestamp: timestampMatch[1],
      message: timestampMatch[2],
    };
  }

  return {
    timestamp: new Date().toISOString(),
    message: trimmed,
  };
}

function parseJsonPayload(message: string): any | undefined {
  if (!message.startsWith("{") || !message.endsWith("}")) {
    return undefined;
  }

  try {
    return JSON.parse(message);
  } catch {
    return undefined;
  }
}

export function parseVmLogLine(rawLine: string, service = DEFAULT_SERVICE): VmLogEntry | null {
  if (!rawLine.trim()) {
    return null;
  }

  const { timestamp, message } = parseTimestampedLine(rawLine);
  const jsonPayload = parseJsonPayload(message);
  const normalizedMessage = getPayloadMessage(jsonPayload) || message;

  return {
    timestamp,
    severity: detectSeverity(normalizedMessage, jsonPayload),
    message: normalizedMessage,
    resource: `vm:${service}`,
    labels: {
      service,
      source: "vm",
    },
    jsonPayload,
    textPayload: message,
  };
}

function categorizeError(message: string): string {
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) return "Network Connection Error";
  if (/timeout|timed out/i.test(message)) return "Timeout Error";
  if (/EADDRINUSE/i.test(message)) return "Port Already In Use";
  if (/database|postgres|sql/i.test(message)) return "Database Error";
  if (/authentication|unauthorized|forbidden/i.test(message)) return "Authentication Error";
  if (/validation|invalid input/i.test(message)) return "Validation Error";
  if (/not found|404/i.test(message)) return "404 Not Found";
  if (/500|internal server/i.test(message)) return "Internal Server Error";
  if (/memory|heap|out of memory/i.test(message)) return "Memory Error";
  if (/telnyx|twilio|drachtio|sip/i.test(message)) return "Telephony Error";
  if (/openai|gemini|anthropic/i.test(message)) return "AI Provider Error";
  return "Other Error";
}

async function loadVmLogs(options: {
  service?: string;
  hours?: number;
  since?: string;
  tail?: number;
  grep?: string;
} = {}): Promise<VmLogEntry[]> {
  const service = (options.service || DEFAULT_SERVICE).trim() || DEFAULT_SERVICE;
  const hours = options.hours ?? 24;
  const snapshot = await getDeploymentLogs(service, {
    tail: options.tail ?? estimateTail(hours, 200, 5000),
    since: options.since || toSinceWindow(hours),
    grep: options.grep,
  });

  return snapshot.lines
    .map((line) => parseVmLogLine(line, service))
    .filter((entry): entry is VmLogEntry => Boolean(entry));
}

export class VmLogService {
  async getRecentLogs(
    minutes = 5,
    limit = 50,
    service = DEFAULT_SERVICE,
  ): Promise<VmLogEntry[]> {
    const logs = await loadVmLogs({
      service,
      since: `${Math.max(1, minutes)}m`,
      tail: clamp(limit, 10, 500),
    });
    return logs.slice(-limit).reverse();
  }

  async getLogMetrics(hours = 24, service = DEFAULT_SERVICE): Promise<VmLogMetrics> {
    const logs = await loadVmLogs({
      service,
      hours,
      tail: estimateTail(hours, 400, 5000),
    });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const errorCount = logs.filter((log) => log.severity === "ERROR" || log.severity === "CRITICAL").length;
    const warningCount = logs.filter((log) => log.severity === "WARNING").length;
    const infoCount = logs.filter((log) => log.severity === "INFO" || log.severity === "DEFAULT").length;
    const recentErrors = logs
      .filter((log) => log.severity === "ERROR" || log.severity === "CRITICAL")
      .slice(-10)
      .reverse();

    return {
      totalLogs: logs.length,
      errorCount,
      warningCount,
      infoCount,
      recentErrors,
      timeRange: { start: startTime, end: endTime },
    };
  }

  async getErrorSummary(hours = 24, service = DEFAULT_SERVICE): Promise<VmErrorSummary[]> {
    const logs = await loadVmLogs({
      service,
      hours,
      tail: estimateTail(hours, 400, 5000),
    });
    const errorLogs = logs.filter((log) => log.severity === "ERROR" || log.severity === "CRITICAL");
    const groups = new Map<string, { count: number; lastOccurrence: string; samples: string[] }>();

    for (const log of errorLogs) {
      const errorType = categorizeError(log.message);
      const existing = groups.get(errorType) || {
        count: 0,
        lastOccurrence: "",
        samples: [],
      };

      existing.count += 1;
      if (!existing.lastOccurrence || log.timestamp > existing.lastOccurrence) {
        existing.lastOccurrence = log.timestamp;
      }
      if (existing.samples.length < 3) {
        existing.samples.push(log.message.slice(0, 200));
      }

      groups.set(errorType, existing);
    }

    return Array.from(groups.entries())
      .map(([errorType, data]) => ({
        errorType,
        count: data.count,
        lastOccurrence: data.lastOccurrence,
        samples: data.samples,
      }))
      .sort((left, right) => right.count - left.count);
  }

  async searchLogs(
    query: string,
    hours = 24,
    limit = 100,
    service = DEFAULT_SERVICE,
  ): Promise<VmLogEntry[]> {
    const pattern = buildSearchPattern(query);
    const logs = await loadVmLogs({
      service,
      hours,
      grep: query,
      tail: estimateTail(hours, Math.max(limit * 4, 400), 5000),
    });

    return logs
      .filter((log) => pattern.test(log.message) || pattern.test(log.textPayload || ""))
      .slice(-limit)
      .reverse();
  }

  async getAdvancedLogs(options: {
    hours?: number;
    severities?: string[];
    resources?: string[];
    search?: string;
    limit?: number;
    service?: string;
  } = {}): Promise<VmLogEntry[]> {
    const {
      hours = 24,
      severities = [],
      resources = [],
      search,
      limit = 100,
      service = DEFAULT_SERVICE,
    } = options;
    const normalizedSeverities = severities.map((severity) => severity.toUpperCase());
    const searchPattern = search ? buildSearchPattern(search) : null;
    const logs = await loadVmLogs({
      service,
      hours,
      grep: search,
      tail: estimateTail(hours, Math.max(limit * 4, 400), 5000),
    });

    return logs
      .filter((log) => {
        if (normalizedSeverities.length > 0 && !normalizedSeverities.includes(log.severity)) {
          return false;
        }
        if (resources.length > 0 && (!log.resource || !resources.includes(log.resource))) {
          return false;
        }
        if (searchPattern && !searchPattern.test(log.message) && !searchPattern.test(log.textPayload || "")) {
          return false;
        }
        return true;
      })
      .slice(-limit)
      .reverse();
  }

  async getLogStatistics(hours = 24, service = DEFAULT_SERVICE): Promise<{
    bySeverity: Record<string, number>;
    byResource: Record<string, number>;
    totalCount: number;
    timeRange: { start: Date; end: Date };
  }> {
    const logs = await loadVmLogs({
      service,
      hours,
      tail: estimateTail(hours, 400, 5000),
    });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
    const bySeverity: Record<string, number> = {};
    const byResource: Record<string, number> = {};

    for (const log of logs) {
      bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
      if (log.resource) {
        byResource[log.resource] = (byResource[log.resource] || 0) + 1;
      }
    }

    return {
      bySeverity,
      byResource,
      totalCount: logs.length,
      timeRange: { start: startTime, end: endTime },
    };
  }
}

export const vmLogService = new VmLogService();
