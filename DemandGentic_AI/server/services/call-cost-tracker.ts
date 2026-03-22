/**
 * Call Cost Tracker - Real-time cost visibility for OpenAI Realtime voice calls
 *
 * Pricing (as of Dec 2024 - verify current rates):
 * - Audio Input: $0.06/min ($0.001/sec)
 * - Audio Output: $0.24/min ($0.004/sec)
 * - Text Input: $2.50/1M tokens ($0.0000025/token)
 * - Text Output: $10.00/1M tokens ($0.00001/token)
 * - Transcription (Whisper): ~$0.006/min
 */

const LOG_PREFIX = "[Cost-Tracker]";

// OpenAI Realtime pricing (USD) - update these as pricing changes
export const OPENAI_REALTIME_PRICING = {
  // Audio pricing per second
  audioInputPerSecond: 0.001,      // $0.06/min = $0.001/sec
  audioOutputPerSecond: 0.004,     // $0.24/min = $0.004/sec

  // Text token pricing
  textInputPerToken: 0.0000025,    // $2.50/1M tokens
  textOutputPerToken: 0.00001,     // $10.00/1M tokens

  // Transcription (if enabled)
  transcriptionPerSecond: 0.0001,  // ~$0.006/min

  // Telnyx carrier costs (approximate)
  telnyxPerMinute: 0.007,          // ~$0.007/min for US calls
} as const;

export interface CallCostMetrics {
  callId: string;
  startTime: Date;
  endTime?: Date;

  // Audio metrics
  audioInputSeconds: number;
  audioOutputSeconds: number;
  audioInputFrames: number;
  audioOutputFrames: number;

  // Token metrics
  textInputTokens: number;
  textOutputTokens: number;
  systemPromptTokens: number;

  // Transcription
  transcriptionEnabled: boolean;
  transcriptionSeconds: number;

  // Computed costs
  costs: {
    audioInput: number;
    audioOutput: number;
    textInput: number;
    textOutput: number;
    transcription: number;
    carrier: number;
    total: number;
  };

  // Rate limit info from OpenAI
  rateLimits?: {
    requestsRemaining: number;
    requestsLimit: number;
    tokensRemaining: number;
    tokensLimit: number;
  };
}

export interface CostTrackerSession {
  metrics: CallCostMetrics;
  lastUpdate: Date;
}

const activeCostSessions = new Map();

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Initialize cost tracking for a new call
 */
export function initializeCostTracking(
  callId: string,
  systemPrompt: string,
  transcriptionEnabled: boolean = true
): CostTrackerSession {
  const systemPromptTokens = estimateTokenCount(systemPrompt);

  const metrics: CallCostMetrics = {
    callId,
    startTime: new Date(),
    audioInputSeconds: 0,
    audioOutputSeconds: 0,
    audioInputFrames: 0,
    audioOutputFrames: 0,
    textInputTokens: systemPromptTokens, // System prompt is sent as input
    textOutputTokens: 0,
    systemPromptTokens,
    transcriptionEnabled,
    transcriptionSeconds: 0,
    costs: {
      audioInput: 0,
      audioOutput: 0,
      textInput: systemPromptTokens * OPENAI_REALTIME_PRICING.textInputPerToken,
      textOutput: 0,
      transcription: 0,
      carrier: 0,
      total: 0,
    },
  };

  const session: CostTrackerSession = {
    metrics,
    lastUpdate: new Date(),
  };

  activeCostSessions.set(callId, session);

  console.log(`${LOG_PREFIX} Initialized cost tracking for call ${callId}`);
  console.log(`${LOG_PREFIX}   System prompt: ~${systemPromptTokens} tokens ($${metrics.costs.textInput.toFixed(6)})`);

  return session;
}

/**
 * Record incoming audio (from caller via Telnyx)
 * G.711 µ-law at 8kHz = 8000 bytes/sec = 1 byte per sample
 */
export function recordAudioInput(callId: string, audioBytes: number): void {
  const session = activeCostSessions.get(callId);
  if (!session) return;

  // G.711 at 8kHz = 8000 samples/sec, 1 byte per sample
  const seconds = audioBytes / 8000;
  session.metrics.audioInputSeconds += seconds;
  session.metrics.audioInputFrames++;

  // Update transcription time if enabled
  if (session.metrics.transcriptionEnabled) {
    session.metrics.transcriptionSeconds += seconds;
  }

  session.lastUpdate = new Date();
}

/**
 * Record outgoing audio (from OpenAI to caller)
 */
export function recordAudioOutput(callId: string, audioBytes: number): void {
  const session = activeCostSessions.get(callId);
  if (!session) return;

  const seconds = audioBytes / 8000;
  session.metrics.audioOutputSeconds += seconds;
  session.metrics.audioOutputFrames++;
  session.lastUpdate = new Date();
}

/**
 * Record text tokens (for function calls, transcripts, etc.)
 */
export function recordTextTokens(
  callId: string,
  inputTokens: number,
  outputTokens: number
): void {
  const session = activeCostSessions.get(callId);
  if (!session) return;

  session.metrics.textInputTokens += inputTokens;
  session.metrics.textOutputTokens += outputTokens;
  session.lastUpdate = new Date();
}

/**
 * Update rate limit information from OpenAI response headers
 */
export function updateRateLimits(
  callId: string,
  rateLimits: {
    requestsRemaining: number;
    requestsLimit: number;
    tokensRemaining: number;
    tokensLimit: number;
  }
): void {
  const session = activeCostSessions.get(callId);
  if (!session) return;

  session.metrics.rateLimits = rateLimits;
  session.lastUpdate = new Date();
}

/**
 * Calculate current costs for a call
 */
export function calculateCosts(callId: string): CallCostMetrics['costs'] | null {
  const session = activeCostSessions.get(callId);
  if (!session) return null;

  const m = session.metrics;
  const p = OPENAI_REALTIME_PRICING;

  // Calculate call duration for carrier costs
  const durationSeconds = m.endTime
    ? (m.endTime.getTime() - m.startTime.getTime()) / 1000
    : (Date.now() - m.startTime.getTime()) / 1000;

  const costs = {
    audioInput: m.audioInputSeconds * p.audioInputPerSecond,
    audioOutput: m.audioOutputSeconds * p.audioOutputPerSecond,
    textInput: m.textInputTokens * p.textInputPerToken,
    textOutput: m.textOutputTokens * p.textOutputPerToken,
    transcription: m.transcriptionEnabled ? m.transcriptionSeconds * p.transcriptionPerSecond : 0,
    carrier: (durationSeconds / 60) * p.telnyxPerMinute,
    total: 0,
  };

  costs.total = costs.audioInput + costs.audioOutput + costs.textInput +
                costs.textOutput + costs.transcription + costs.carrier;

  session.metrics.costs = costs;
  return costs;
}

/**
 * Finalize cost tracking for a completed call
 */
export function finalizeCostTracking(callId: string): CallCostMetrics | null {
  const session = activeCostSessions.get(callId);
  if (!session) return null;

  session.metrics.endTime = new Date();
  calculateCosts(callId);

  const m = session.metrics;
  const durationSeconds = (m.endTime!.getTime() - m.startTime.getTime()) / 1000;

  // Log detailed cost breakdown
  console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════════════`);
  console.log(`${LOG_PREFIX} CALL COST SUMMARY: ${callId}`);
  console.log(`${LOG_PREFIX} ───────────────────────────────────────────────────────────`);
  console.log(`${LOG_PREFIX} Duration: ${durationSeconds.toFixed(1)}s (${(durationSeconds/60).toFixed(2)} min)`);
  console.log(`${LOG_PREFIX} `);
  console.log(`${LOG_PREFIX} AUDIO:`);
  console.log(`${LOG_PREFIX}   Input:  ${m.audioInputSeconds.toFixed(1)}s (${m.audioInputFrames} frames)  → $${m.costs.audioInput.toFixed(4)}`);
  console.log(`${LOG_PREFIX}   Output: ${m.audioOutputSeconds.toFixed(1)}s (${m.audioOutputFrames} frames) → $${m.costs.audioOutput.toFixed(4)}`);
  console.log(`${LOG_PREFIX} `);
  console.log(`${LOG_PREFIX} TEXT TOKENS:`);
  console.log(`${LOG_PREFIX}   System prompt: ~${m.systemPromptTokens} tokens`);
  console.log(`${LOG_PREFIX}   Input:  ${m.textInputTokens} tokens → $${m.costs.textInput.toFixed(4)}`);
  console.log(`${LOG_PREFIX}   Output: ${m.textOutputTokens} tokens → $${m.costs.textOutput.toFixed(4)}`);
  console.log(`${LOG_PREFIX} `);
  if (m.transcriptionEnabled) {
    console.log(`${LOG_PREFIX} TRANSCRIPTION: ${m.transcriptionSeconds.toFixed(1)}s → $${m.costs.transcription.toFixed(4)}`);
  } else {
    console.log(`${LOG_PREFIX} TRANSCRIPTION: Disabled (cost saving)`);
  }
  console.log(`${LOG_PREFIX} `);
  console.log(`${LOG_PREFIX} CARRIER (Telnyx): $${m.costs.carrier.toFixed(4)}`);
  console.log(`${LOG_PREFIX} ───────────────────────────────────────────────────────────`);
  console.log(`${LOG_PREFIX} TOTAL COST: $${m.costs.total.toFixed(4)}`);
  console.log(`${LOG_PREFIX} Cost per minute: $${(m.costs.total / (durationSeconds / 60)).toFixed(4)}/min`);
  console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════════════`);

  // Clean up
  activeCostSessions.delete(callId);

  return m;
}

/**
 * Get current cost metrics for a call (without finalizing)
 */
export function getCurrentCostMetrics(callId: string): CallCostMetrics | null {
  const session = activeCostSessions.get(callId);
  if (!session) return null;

  calculateCosts(callId);
  return { ...session.metrics };
}

/**
 * Get cost estimate for a given configuration
 */
export function estimateCallCost(config: {
  durationMinutes: number;
  systemPromptTokens: number;
  avgResponseTokensPerTurn: number;
  turnsPerCall: number;
  transcriptionEnabled: boolean;
}): { estimated: number; breakdown: Record } {
  const p = OPENAI_REALTIME_PRICING;
  const durationSeconds = config.durationMinutes * 60;

  // Assume 50% of call is audio input, 50% is output (rough estimate)
  const audioInputSeconds = durationSeconds * 0.5;
  const audioOutputSeconds = durationSeconds * 0.5;

  // Text tokens: system prompt + conversation
  const textInputTokens = config.systemPromptTokens + (config.turnsPerCall * 50); // ~50 tokens per user turn
  const textOutputTokens = config.turnsPerCall * config.avgResponseTokensPerTurn;

  const breakdown = {
    audioInput: audioInputSeconds * p.audioInputPerSecond,
    audioOutput: audioOutputSeconds * p.audioOutputPerSecond,
    textInput: textInputTokens * p.textInputPerToken,
    textOutput: textOutputTokens * p.textOutputPerToken,
    transcription: config.transcriptionEnabled ? durationSeconds * p.transcriptionPerSecond : 0,
    carrier: config.durationMinutes * p.telnyxPerMinute,
  };

  const estimated = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { estimated, breakdown };
}

/**
 * Get summary of all active cost sessions
 */
export function getActiveCostSummary(): {
  activeCalls: number;
  totalEstimatedCost: number;
  calls: Array;
} {
  const calls: Array = [];
  let totalCost = 0;

  for (const [callId, session] of activeCostSessions) {
    calculateCosts(callId);
    const durationSeconds = (Date.now() - session.metrics.startTime.getTime()) / 1000;
    calls.push({
      callId,
      durationSeconds,
      currentCost: session.metrics.costs.total,
    });
    totalCost += session.metrics.costs.total;
  }

  return {
    activeCalls: calls.length,
    totalEstimatedCost: totalCost,
    calls,
  };
}