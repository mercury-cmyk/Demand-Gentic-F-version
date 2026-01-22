/**
 * Audio Quality Monitoring Service
 * 
 * Tracks and reports on audio quality metrics for Gemini Live calls.
 * Detects connection issues, buffer problems, and audio degradation in real-time.
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
    };
    
    this.metrics.set(callId, metrics);
    console.log(`[AudioQualityMonitor] Started monitoring call: ${callId}`);
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
   * Record buffer backpressure event
   */
  recordBackpressure(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.bufferBackpressureEvents++;
      metrics.qualityScore = Math.max(0, metrics.qualityScore - 10);
      if (!metrics.issues.includes('buffer_backpressure')) {
        metrics.issues.push('buffer_backpressure');
      }
    }
  }
  
  /**
   * Record connection drop
   */
  recordConnectionDrop(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.connectionDrops++;
      metrics.qualityScore = Math.max(0, metrics.qualityScore - 15);
      if (!metrics.issues.includes('connection_drop')) {
        metrics.issues.push('connection_drop');
      }
    }
  }
  
  /**
   * Record audio timeout
   */
  recordAudioTimeout(callId: string): void {
    const metrics = this.metrics.get(callId);
    if (metrics) {
      metrics.audioTimeouts++;
      metrics.qualityScore = Math.max(0, metrics.qualityScore - 20);
      if (!metrics.issues.includes('audio_timeout')) {
        metrics.issues.push('audio_timeout');
      }
    }
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

📊 THROUGHPUT:
  Chunks sent: ${metrics.audioChunksSent}
  Chunks received: ${metrics.audioChunksReceived}
  Data sent: ${(metrics.totalBytesSent / 1024).toFixed(2)} KB
  Data received: ${(metrics.totalBytesReceived / 1024).toFixed(2)} KB
  Bitrate: ${(metrics.averageBitrateBps / 1000).toFixed(1)} kbps

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
    
    return null;
  }
}

// Singleton instance
export const audioQualityMonitor = new AudioQualityMonitor();
