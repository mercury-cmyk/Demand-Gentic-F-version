/**
 * Transcription Health Monitor
 *
 * Tracks transcription success rates and alerts on degradation.
 * This helps detect systemic issues with Gemini real-time transcription
 * and ensures fallback mechanisms are working properly.
 */

const LOG_PREFIX = '[Transcription-Monitor]';

// Metrics window configuration
const WINDOW_SIZE = 100; // Track last 100 calls
const ALERT_THRESHOLD = 0.5; // Alert if >50% of calls missing transcripts
const REALTIME_ALERT_THRESHOLD = 0.7; // Alert if >70% missing real-time transcription

export interface TranscriptionMetrics {
  totalCalls: number;
  callsWithRealtimeTranscript: number;
  callsWithFallbackTranscript: number;
  callsWithNoTranscript: number;
  realtimeSuccessRate: number;
  overallSuccessRate: number;
  lastChecked: Date;
  alertActive: boolean;
  alertMessage?: string;
}

interface MetricsEntry {
  callId: string;
  callAttemptId?: string;
  source: 'realtime' | 'realtime_native' | 'fallback' | 'none';
  timestamp: number;
}

// In-memory metrics window (use Redis in production for multi-instance)
const metricsWindow: MetricsEntry[] = [];

/**
 * Record a transcription result for metrics tracking
 */
export function recordTranscriptionResult(
  callId: string,
  source: 'realtime' | 'realtime_native' | 'fallback' | 'none',
  callAttemptId?: string
): void {
  const timestamp = Date.now();
  const existingIndex = metricsWindow.findIndex((entry) => entry.callId === callId);

  if (existingIndex >= 0) {
    const existing = metricsWindow[existingIndex];
    const sourcePriority = (value: MetricsEntry["source"]): number => {
      if (value === "none") return 0;
      if (value === "fallback") return 1;
      return 2; // realtime + realtime_native
    };

    // Keep the strongest available signal for a call and avoid duplicate counting.
    if (sourcePriority(source) >= sourcePriority(existing.source)) {
      metricsWindow[existingIndex] = {
        callId,
        callAttemptId: callAttemptId || existing.callAttemptId,
        source,
        timestamp,
      };
    }
  } else {
    metricsWindow.push({
      callId,
      callAttemptId,
      source,
      timestamp,
    });
  }

  // Keep window size bounded
  while (metricsWindow.length > WINDOW_SIZE) {
    metricsWindow.shift();
  }

  // Check for degradation
  checkAndAlert();
}

/**
 * Check metrics and log alerts if thresholds are exceeded
 */
function checkAndAlert(): void {
  if (metricsWindow.length  ALERT_THRESHOLD) {
    console.error(
      `${LOG_PREFIX} 🚨 ALERT: ${((1 - metrics.overallSuccessRate) * 100).toFixed(1)}% of calls missing transcripts in last ${metricsWindow.length} calls`
    );
  }

  // Alert on real-time transcription failure (indicates Gemini API issues)
  if (1 - metrics.realtimeSuccessRate > REALTIME_ALERT_THRESHOLD) {
    console.warn(
      `${LOG_PREFIX} ⚠️ WARNING: ${((1 - metrics.realtimeSuccessRate) * 100).toFixed(1)}% of calls missing REAL-TIME transcription - check Gemini API`
    );
  }
}

/**
 * Get current transcription health metrics
 */
export function getTranscriptionHealthMetrics(): TranscriptionMetrics {
  const total = metricsWindow.length;
  const realtime = metricsWindow.filter((m) => m.source === 'realtime' || m.source === 'realtime_native').length;
  const fallback = metricsWindow.filter((m) => m.source === 'fallback').length;
  const none = metricsWindow.filter((m) => m.source === 'none').length;

  const realtimeSuccessRate = total > 0 ? realtime / total : 0;
  const overallSuccessRate = total > 0 ? (realtime + fallback) / total : 0;

  // Determine if alert is active
  const alertActive =
    total >= 10 &&
    (1 - overallSuccessRate > ALERT_THRESHOLD ||
      1 - realtimeSuccessRate > REALTIME_ALERT_THRESHOLD);

  let alertMessage: string | undefined;
  if (alertActive) {
    if (1 - overallSuccessRate > ALERT_THRESHOLD) {
      alertMessage = `${((1 - overallSuccessRate) * 100).toFixed(1)}% of calls missing transcripts`;
    } else if (1 - realtimeSuccessRate > REALTIME_ALERT_THRESHOLD) {
      alertMessage = `${((1 - realtimeSuccessRate) * 100).toFixed(1)}% of calls missing real-time transcription`;
    }
  }

  return {
    totalCalls: total,
    callsWithRealtimeTranscript: realtime,
    callsWithFallbackTranscript: fallback,
    callsWithNoTranscript: none,
    realtimeSuccessRate,
    overallSuccessRate,
    lastChecked: new Date(),
    alertActive,
    alertMessage,
  };
}

/**
 * Get recent transcription failures for debugging
 */
export function getRecentFailures(limit: number = 10): MetricsEntry[] {
  return metricsWindow
    .filter((m) => m.source === 'none')
    .slice(-limit);
}

/**
 * Clear metrics (for testing)
 */
export function clearMetrics(): void {
  metricsWindow.length = 0;
}

export default {
  recordTranscriptionResult,
  getTranscriptionHealthMetrics,
  getRecentFailures,
  clearMetrics,
};