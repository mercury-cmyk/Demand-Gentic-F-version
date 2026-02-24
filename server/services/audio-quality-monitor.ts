/**
 * Audio Quality Monitoring Service
 *
 * Tracks and reports on audio quality metrics for Gemini Live calls.
 * Detects connection issues, buffer problems, and audio degradation in real-time.
 *
 * Features:
 * - Warmup grace period: ignores penalty events during Gemini setup/negotiation
 * - Real-time latency tracking via rolling RTT window
 * - Interruption pattern detection for echo/feedback issues
 */

export interface AudioQualityMetrics {
  callId: string;
  startTime: number;
  duration: number;

  // Throughput metrics
  audioChunksSent: number;
  audioChunksReceived: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  averageBitrateBps: number;

  // Health metrics
  bufferBackpressureEvents: number;
  connectionDrops: number;
  audioTimeouts: number;
  roundTripTimeMs: number;

  // Quality scoring
  qualityScore: number; // 0-100 (100 = excellent)
  qualityRating: 'excellent' | 'good' | 'fair' | 'poor' | 'degraded';
  issues: string[];

  // Warmup phase - don't penalize quality during Gemini negotiation
  warmupComplete: boolean;
  warmupCompletedAt: number | null;

  // Latency tracking (rolling RTT window)
  lastAudioSentAt: number | null;
  lastAudioReceivedAt: number | null;
  roundTripSamples: number[];

  // Interruption tracking
  interruptionCount: number;
  interruptionTimestamps: number[];
}

export class AudioQualityMonitor {
  private metrics: Map<string, AudioQualityMetrics> = new Map();

  /**
   * Start monitoring a call
   */
  startCall(callId: string): void {
    const metrics: AudioQualityMetrics = {
      callId,
      startTime: Date.now(),
      duration: 0,
      audioChunksSent: 0,
      audioChunksReceived: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      averageBitrateBps: 0,
      bufferBackpressureEvents: 0,
      connectionDrops: 0,
      audioTimeouts: 0,
      roundTripTimeMs: 0,
      qualityScore: 100,
      qualityRating: 'excellent',
      issues: [],
      warmupComplete: false,
      warmupCompletedAt: null,
      lastAudioSentAt: null,
      lastAudioReceivedAt: null,
      roundTripSamples: [],
      interruptionCount: 0,
      interruptionTimestamps: [],
    };

    this.metrics.set(callId, metrics);
    console.log(`[AudioQualityMonitor] Started monitoring call: ${callId}`);
  }

  /**
   * Signal that warmup/negotiation phase is complete.
   * Resets quality score to 100 so connection events during Gemini setup
   * don't contaminate the post-warmup quality assessment.
   */
  completeWarmup(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics && !metrics.warmupComplete) {
      metrics.warmupComplete = true;
      metrics.warmupCompletedAt = Date.now();
      // Reset penalties accumulated during warmup - clean slate for real audio
      metrics.qualityScore = 100;
      metrics.connectionDrops = 0;
      metrics.bufferBackpressureEvents = 0;
      metrics.audioTimeouts = 0;
      metrics.issues = [];
      console.log(`[AudioQualityMonitor] Warmup complete for ${callId} - quality score reset to 100`);
    }
  }

  /**
   * Record audio sent
   */
  recordAudioSent(callId: string, bytes: number): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.audioChunksSent++;
      metrics.totalBytesSent += bytes;
    }
  }

  /**
   * Record audio received
   */
  recordAudioReceived(callId: string, bytes: number): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.audioChunksReceived++;
      metrics.totalBytesReceived += bytes;
    }
  }

  /**
   * Record a send timestamp for latency measurement.
   * Call this periodically (e.g. every 50th chunk) to avoid overhead.
   */
  recordAudioSentTimestamp(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.lastAudioSentAt = Date.now();
    }
  }

  /**
   * Record a receive timestamp and calculate RTT from last send timestamp.
   * Maintains a rolling window of 50 samples for average RTT.
   */
  recordAudioReceivedTimestamp(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics && metrics.lastAudioSentAt) {
      const rtt = Date.now() - metrics.lastAudioSentAt;
      metrics.roundTripSamples.push(rtt);
      // Keep rolling window of last 50 samples
      if (metrics.roundTripSamples.length > 50) {
        metrics.roundTripSamples.shift();
      }
      // Update roundTripTimeMs as rolling average
      metrics.roundTripTimeMs = Math.round(
        metrics.roundTripSamples.reduce((a, b) => a + b, 0) / metrics.roundTripSamples.length
      );
      metrics.lastAudioSentAt = null; // Reset for next measurement
    }
  }

  /**
   * Record buffer backpressure event.
   * During warmup: counts event but does not penalize score.
   */
  recordBackpressure(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.bufferBackpressureEvents++;
      if (metrics.warmupComplete) {
        metrics.qualityScore = Math.max(0, metrics.qualityScore - 10);
        if (!metrics.issues.includes('buffer_backpressure')) {
          metrics.issues.push('buffer_backpressure');
        }
      }
    }
  }

  /**
   * Record connection drop.
   * During warmup: counts event but does not penalize score.
   */
  recordConnectionDrop(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.connectionDrops++;
      if (metrics.warmupComplete) {
        metrics.qualityScore = Math.max(0, metrics.qualityScore - 15);
        if (!metrics.issues.includes('connection_drop')) {
          metrics.issues.push('connection_drop');
        }
      }
    }
  }

  /**
   * Record audio timeout.
   * During warmup: counts event but does not penalize score.
   */
  recordAudioTimeout(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.audioTimeouts++;
      if (metrics.warmupComplete) {
        metrics.qualityScore = Math.max(0, metrics.qualityScore - 20);
        if (!metrics.issues.includes('audio_timeout')) {
          metrics.issues.push('audio_timeout');
        }
      }
    }
  }

  /**
   * Record an interruption event.
   * Tracks timestamps in a 60s rolling window.
   * If 5+ interruptions in 30s, flags excessive_interruptions (possible echo/feedback).
   */
  recordInterruption(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (!metrics) return;

    const now = Date.now();
    metrics.interruptionCount++;
    metrics.interruptionTimestamps.push(now);

    // Keep only last 60 seconds of timestamps
    const cutoff = now - 60000;
    metrics.interruptionTimestamps = metrics.interruptionTimestamps.filter(t => t >= cutoff);

    // If 5+ interruptions in 30 seconds, likely echo/feedback issue
    const recent30s = metrics.interruptionTimestamps.filter(t => t >= now - 30000).length;
    if (recent30s >= 5 && !metrics.issues.includes('excessive_interruptions')) {
      metrics.issues.push('excessive_interruptions');
      metrics.qualityScore = Math.max(0, metrics.qualityScore - 25);
      console.warn(`[AudioQualityMonitor] ${callId}: Excessive interruptions (${recent30s} in 30s) - possible echo/feedback`);
    }
  }

  /**
   * Get interruption rate for a call.
   */
  getInterruptionRate(callId: string): { recentCount: number; isExcessive: boolean } | null {
    const metrics = this.metrics.get(callId);
    if (!metrics) return null;
    const now = Date.now();
    const recent30s = metrics.interruptionTimestamps.filter(t => t >= now - 30000).length;
    return { recentCount: recent30s, isExcessive: recent30s >= 5 };
  }

  /**
   * End monitoring and calculate final metrics
   */
  endCall(callId: string): AudioQualityMetrics | null {
    const metrics = this.metrics.get(callId);
    if (!metrics) return null;

    // Calculate duration and bitrate
    metrics.duration = (Date.now() - metrics.startTime) / 1000;
    const totalBytes = Math.max(metrics.totalBytesSent, metrics.totalBytesReceived);
    metrics.averageBitrateBps = totalBytes > 0
      ? Math.round((totalBytes * 8) / Math.max(metrics.duration, 0.1))
      : 0;

    // Calculate quality rating based on score and issues
    const qualityScore = this.calculateQualityScore(metrics);
    metrics.qualityScore = qualityScore;
    metrics.qualityRating = this.getQualityRating(qualityScore);

    // Log results
    this.logMetrics(metrics);

    // Clean up
    this.metrics.delete(callId);

    return metrics;
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateQualityScore(metrics: AudioQualityMetrics): number {
    let score = 100;

    // Penalize for backpressure events (each = -5 points)
    score -= metrics.bufferBackpressureEvents * 5;

    // Penalize for connection drops (each = -15 points)
    score -= metrics.connectionDrops * 15;

    // Penalize for audio timeouts (each = -20 points)
    score -= metrics.audioTimeouts * 20;

    // Check for audio imbalance (more than 10% difference between sent and received)
    if (metrics.audioChunksSent > 0) {
      const ratio = metrics.audioChunksReceived / metrics.audioChunksSent;
      if (ratio < 0.9) {
        score -= Math.round((1 - ratio) * 30); // Up to -30 points
      }
    }

    // Normalize to 0-100 range
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get quality rating based on score
   */
  private getQualityRating(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'degraded' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'degraded';
  }

  /**
   * Log metrics to console
   */
  private logMetrics(metrics: AudioQualityMetrics): void {
    console.log(`
[AudioQualityMonitor] ===== CALL QUALITY REPORT: ${metrics.callId} =====
Duration: ${metrics.duration.toFixed(1)}s
Quality: ${metrics.qualityRating.toUpperCase()} (${metrics.qualityScore}/100)
Warmup: ${metrics.warmupComplete ? 'complete' : 'in-progress'}

📊 THROUGHPUT:
  Chunks sent: ${metrics.audioChunksSent}
  Chunks received: ${metrics.audioChunksReceived}
  Data sent: ${(metrics.totalBytesSent / 1024).toFixed(2)} KB
  Data received: ${(metrics.totalBytesReceived / 1024).toFixed(2)} KB
  Bitrate: ${(metrics.averageBitrateBps / 1000).toFixed(1)} kbps

🏓 LATENCY:
  RTT: ${metrics.roundTripTimeMs}ms (${metrics.roundTripSamples.length} samples)

✋ INTERRUPTIONS:
  Total: ${metrics.interruptionCount}
  Recent (60s window): ${metrics.interruptionTimestamps.length}

⚠️ ISSUES:
  Buffer backpressure: ${metrics.bufferBackpressureEvents}
  Connection drops: ${metrics.connectionDrops}
  Audio timeouts: ${metrics.audioTimeouts}

🔴 DETECTED PROBLEMS: ${metrics.issues.length > 0 ? metrics.issues.join(', ') : 'None'}
    `);
  }

  /**
   * Get current metrics for a call (doesn't end monitoring)
   */
  getMetrics(callId: string): AudioQualityMetrics | null {
    return this.metrics.get(callId) || null;
  }

  /**
   * Get a real-time quality snapshot without ending monitoring
   */
  getQualitySnapshot(callId: string): {
    score: number;
    rating: AudioQualityMetrics['qualityRating'];
    issues: string[];
    durationSeconds: number;
  } | null {
    const metrics = this.metrics.get(callId);
    if (!metrics) return null;

    const durationSeconds = (Date.now() - metrics.startTime) / 1000;
    const score = this.calculateQualityScore(metrics);
    const rating = this.getQualityRating(score);

    return {
      score,
      rating,
      issues: [...metrics.issues],
      durationSeconds,
    };
  }

  /**
   * Generate audio quality alert if issues detected
   */
  checkAndAlert(callId: string): string | null {
    const metrics = this.metrics.get(callId);
    if (!metrics) return null;

    if (metrics.bufferBackpressureEvents > 3) {
      return `⚠️ ${callId}: High buffer backpressure (${metrics.bufferBackpressureEvents} events) - audio may be distorted`;
    }

    if (metrics.connectionDrops > 1) {
      return `❌ ${callId}: Multiple connection drops detected - call quality degraded`;
    }

    if (metrics.audioTimeouts > 0) {
      return `❌ ${callId}: Audio timeout detected - connection may be stalled`;
    }

    const ratio = metrics.audioChunksSent > 0
      ? metrics.audioChunksReceived / metrics.audioChunksSent
      : 1;

    if (ratio < 0.8) {
      return `⚠️ ${callId}: Audio imbalance detected (${(ratio * 100).toFixed(0)}% received) - may indicate Gemini processing issues`;
    }

    const interruptionRate = this.getInterruptionRate(callId);
    if (interruptionRate?.isExcessive) {
      return `⚠️ ${callId}: Excessive interruptions (${interruptionRate.recentCount} in 30s) - possible echo/feedback loop`;
    }

    return null;
  }
}

// Singleton instance
export const audioQualityMonitor = new AudioQualityMonitor();
