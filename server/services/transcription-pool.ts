/**
 * Multi-Provider Transcription Pool
 *
 * Distributes transcription work across Deepgram, Google STT, and Telnyx
 * in parallel for dramatically higher throughput. Includes:
 * - Weighted round-robin provider selection
 * - Per-provider concurrency semaphores
 * - Circuit breaker for failing providers
 * - Parallel batch processing via Promise.allSettled()
 */

import { transcribeFromRecording as deepgramTranscribe } from './deepgram-postcall-transcription';
import { transcribeFromRecording as googleTranscribe } from './google-transcription';
import { transcribeRecording as telnyxTranscribe } from './telnyx-transcription';

const LOG_PREFIX = '[TranscriptionPool]';

// ── Configuration (env-var overrideable) ──

const POOL_CONCURRENCY = parseInt(process.env.TRANSCRIPTION_POOL_CONCURRENCY || '10', 10);
const POOL_INTER_CHUNK_DELAY_MS = parseInt(process.env.TRANSCRIPTION_POOL_DELAY_MS || '200', 10);

const PROVIDER_WEIGHTS: Record<string, number> = {
  deepgram: parseInt(process.env.TRANSCRIPTION_POOL_DEEPGRAM_WEIGHT || '5', 10),
  google_stt: parseInt(process.env.TRANSCRIPTION_POOL_GOOGLE_WEIGHT || '3', 10),
  telnyx: parseInt(process.env.TRANSCRIPTION_POOL_TELNYX_WEIGHT || '2', 10),
};

const MAX_CONCURRENT_PER_PROVIDER: Record<string, number> = {
  deepgram: 5,
  google_stt: 3,
  telnyx: 4,
};

const CIRCUIT_OPEN_THRESHOLD = 5;   // Open circuit after 5 consecutive failures
const CIRCUIT_RESET_MS = 60_000;    // Reset circuit after 60s cooldown

// ── Types ──

export interface TranscriptionProviderResult {
  transcript: string;
  wordCount: number;
}

interface TranscriptionProvider {
  name: string;
  isAvailable(): boolean;
  transcribe(
    recordingUrl: string,
    options?: { telnyxCallId?: string | null; recordingS3Key?: string | null }
  ): Promise<TranscriptionProviderResult | null>;
}

interface ProviderHealth {
  consecutiveFailures: number;
  lastFailureAt: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  isCircuitOpen: boolean;
}

export interface BatchTranscriptionItem {
  callAttemptId: string;
  recordingUrl: string | null;
  telnyxCallId: string | null;
  recordingS3Key?: string | null;
}

export interface BatchTranscriptionResult {
  callAttemptId: string;
  success: boolean;
  transcript?: string;
  wordCount?: number;
  provider?: string;
  error?: string;
}

// ── Provider Adapters ──

const deepgramProvider: TranscriptionProvider = {
  name: 'deepgram',
  isAvailable: () => !!(process.env.DEEPGRAM_API_KEY || '').trim(),
  transcribe: async (url, opts) => {
    return deepgramTranscribe(url, {
      telnyxCallId: opts?.telnyxCallId,
      recordingS3Key: opts?.recordingS3Key,
    });
  },
};

const googleSttProvider: TranscriptionProvider = {
  name: 'google_stt',
  isAvailable: () => !!process.env.GOOGLE_CLOUD_PROJECT,
  transcribe: async (url, opts) => {
    return googleTranscribe(url, {
      telnyxCallId: opts?.telnyxCallId,
      recordingS3Key: opts?.recordingS3Key,
    });
  },
};

const telnyxProvider: TranscriptionProvider = {
  name: 'telnyx',
  isAvailable: () => !!(process.env.TELNYX_API_KEY || '').trim(),
  transcribe: async (url, _opts) => {
    const result = await telnyxTranscribe(url);
    if (!result.success || !result.text) return null;
    return {
      transcript: result.text,
      wordCount: result.wordCount,
    };
  },
};

const ALL_PROVIDERS: TranscriptionProvider[] = [deepgramProvider, googleSttProvider, telnyxProvider];

// ── Health Tracking ──

const healthMap = new Map<string, ProviderHealth>();

function getHealth(providerName: string): ProviderHealth {
  let h = healthMap.get(providerName);
  if (!h) {
    h = {
      consecutiveFailures: 0,
      lastFailureAt: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      isCircuitOpen: false,
    };
    healthMap.set(providerName, h);
  }
  return h;
}

function recordSuccess(providerName: string): void {
  const h = getHealth(providerName);
  h.consecutiveFailures = 0;
  h.totalRequests++;
  h.totalSuccesses++;
  h.isCircuitOpen = false;
}

function recordFailure(providerName: string): void {
  const h = getHealth(providerName);
  h.consecutiveFailures++;
  h.lastFailureAt = Date.now();
  h.totalRequests++;
  h.totalFailures++;
  if (h.consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
    h.isCircuitOpen = true;
    console.warn(`${LOG_PREFIX} Circuit OPEN for ${providerName} after ${h.consecutiveFailures} consecutive failures`);
  }
}

function isProviderHealthy(providerName: string): boolean {
  const h = getHealth(providerName);
  if (!h.isCircuitOpen) return true;
  // Half-open: allow a test request after cooldown
  if (Date.now() - h.lastFailureAt >= CIRCUIT_RESET_MS) {
    return true;
  }
  return false;
}

// ── Per-Provider Semaphore ──

const activeCounts = new Map<string, number>();

function canAcquire(providerName: string): boolean {
  const current = activeCounts.get(providerName) || 0;
  const max = MAX_CONCURRENT_PER_PROVIDER[providerName] || 3;
  return current < max;
}

function acquire(providerName: string): void {
  activeCounts.set(providerName, (activeCounts.get(providerName) || 0) + 1);
}

function release(providerName: string): void {
  const current = activeCounts.get(providerName) || 0;
  activeCounts.set(providerName, Math.max(0, current - 1));
}

// ── Weighted Round-Robin ──

let roundRobinIndex = 0;

/**
 * Build the weighted provider rotation list.
 * E.g. weights {deepgram:5, google_stt:3, telnyx:2} → [deepgram x5, google_stt x3, telnyx x2]
 */
function buildRotation(): TranscriptionProvider[] {
  const rotation: TranscriptionProvider[] = [];
  for (const provider of ALL_PROVIDERS) {
    if (!provider.isAvailable()) continue;
    const weight = PROVIDER_WEIGHTS[provider.name] || 1;
    for (let i = 0; i < weight; i++) {
      rotation.push(provider);
    }
  }
  return rotation;
}

function pickNextProvider(): TranscriptionProvider | null {
  const rotation = buildRotation();
  if (rotation.length === 0) return null;

  // Try up to rotation.length providers to find a healthy one with capacity
  for (let i = 0; i < rotation.length; i++) {
    const idx = (roundRobinIndex + i) % rotation.length;
    const provider = rotation[idx];
    if (isProviderHealthy(provider.name) && canAcquire(provider.name)) {
      roundRobinIndex = (idx + 1) % rotation.length;
      return provider;
    }
  }

  // All providers at capacity or unhealthy — return any available one (will queue)
  for (const provider of ALL_PROVIDERS) {
    if (provider.isAvailable() && isProviderHealthy(provider.name)) {
      return provider;
    }
  }

  return null;
}

// ── Core Pool Function ──

export async function transcribeWithPool(
  recordingUrl: string,
  options?: {
    telnyxCallId?: string | null;
    recordingS3Key?: string | null;
    preferredProvider?: string;
  }
): Promise<(TranscriptionProviderResult & { provider: string }) | null> {
  // Early exit: if there's no usable audio locator at all, don't penalize providers
  const hasUrl = !!recordingUrl && recordingUrl.length > 5 && !recordingUrl.startsWith('gcs-internal://');
  const hasS3Key = !!options?.recordingS3Key;
  const hasTelnyxId = !!options?.telnyxCallId;
  if (!hasUrl && !hasS3Key && !hasTelnyxId) {
    console.warn(`${LOG_PREFIX} Skipping — no usable audio locator (url=${!!recordingUrl}, s3Key=${hasS3Key}, telnyxId=${hasTelnyxId})`);
    return null;
  }

  // Pick provider
  let provider: TranscriptionProvider | null = null;

  if (options?.preferredProvider) {
    provider = ALL_PROVIDERS.find(
      p => p.name === options.preferredProvider && p.isAvailable() && isProviderHealthy(p.name)
    ) || null;
  }

  if (!provider) {
    provider = pickNextProvider();
  }

  if (!provider) {
    console.warn(`${LOG_PREFIX} No healthy provider available`);
    return null;
  }

  // Try primary provider, then fall back to others
  const tried = new Set<string>();
  let current: TranscriptionProvider | null = provider;

  while (current) {
    tried.add(current.name);
    acquire(current.name);
    try {
      const result = await current.transcribe(recordingUrl, {
        telnyxCallId: options?.telnyxCallId,
        recordingS3Key: options?.recordingS3Key,
      });

      if (result && result.transcript && result.transcript.length > 20) {
        recordSuccess(current.name);
        return { ...result, provider: current.name };
      }

      recordFailure(current.name);
    } catch (err: any) {
      recordFailure(current.name);
      console.warn(`${LOG_PREFIX} ${current.name} failed: ${err?.message || err}`);
    } finally {
      release(current.name);
    }

    // Find next untried healthy provider
    current = ALL_PROVIDERS.find(
      p => !tried.has(p.name) && p.isAvailable() && isProviderHealthy(p.name)
    ) || null;
  }

  return null;
}

// ── Batch Parallel Processing ──

async function transcribeSingleItem(item: BatchTranscriptionItem): Promise<BatchTranscriptionResult> {
  if (!item.recordingUrl && !item.telnyxCallId && !item.recordingS3Key) {
    return {
      callAttemptId: item.callAttemptId,
      success: false,
      error: 'No recording URL, S3 key, or Telnyx call ID',
    };
  }

  try {
    const result = await transcribeWithPool(item.recordingUrl || '', {
      telnyxCallId: item.telnyxCallId,
      recordingS3Key: item.recordingS3Key,
    });

    if (result) {
      return {
        callAttemptId: item.callAttemptId,
        success: true,
        transcript: result.transcript,
        wordCount: result.wordCount,
        provider: result.provider,
      };
    }

    return {
      callAttemptId: item.callAttemptId,
      success: false,
      error: 'All providers returned empty transcript',
    };
  } catch (err: any) {
    return {
      callAttemptId: item.callAttemptId,
      success: false,
      error: err?.message || 'Unknown error',
    };
  }
}

/**
 * Process a batch of transcription items in parallel using the multi-provider pool.
 * Uses chunked Promise.allSettled() with a semaphore to limit concurrent API calls.
 */
export async function transcribeBatchParallel(
  items: BatchTranscriptionItem[],
  concurrency: number = POOL_CONCURRENCY,
  interChunkDelayMs: number = POOL_INTER_CHUNK_DELAY_MS
): Promise<BatchTranscriptionResult[]> {
  if (items.length === 0) return [];

  console.log(`${LOG_PREFIX} Starting parallel batch: ${items.length} items, concurrency=${concurrency}`);
  const startTime = Date.now();
  const results: BatchTranscriptionResult[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);

    const chunkResults = await Promise.allSettled(
      chunk.map(item => transcribeSingleItem(item))
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const settled = chunkResults[j];
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        results.push({
          callAttemptId: chunk[j].callAttemptId,
          success: false,
          error: settled.reason?.message || 'Unknown error',
        });
      }
    }

    // Small delay between chunks to let API rate limits breathe
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, interChunkDelayMs));
    }
  }

  const elapsed = Date.now() - startTime;
  const succeeded = results.filter(r => r.success).length;
  console.log(`${LOG_PREFIX} Batch complete: ${succeeded}/${results.length} succeeded in ${(elapsed / 1000).toFixed(1)}s`);

  return results;
}

// ── Pool Status / Observability ──

export function getPoolStatus(): {
  providers: Array<{
    name: string;
    available: boolean;
    healthy: boolean;
    totalRequests: number;
    successRate: number;
    consecutiveFailures: number;
    activeRequests: number;
  }>;
  totalProcessed: number;
  overallSuccessRate: number;
} {
  let totalProcessed = 0;
  let totalSuccesses = 0;

  const providers = ALL_PROVIDERS.map(p => {
    const h = getHealth(p.name);
    totalProcessed += h.totalRequests;
    totalSuccesses += h.totalSuccesses;
    return {
      name: p.name,
      available: p.isAvailable(),
      healthy: isProviderHealthy(p.name),
      totalRequests: h.totalRequests,
      successRate: h.totalRequests > 0 ? Math.round((h.totalSuccesses / h.totalRequests) * 100) : 100,
      consecutiveFailures: h.consecutiveFailures,
      activeRequests: activeCounts.get(p.name) || 0,
    };
  });

  return {
    providers,
    totalProcessed,
    overallSuccessRate: totalProcessed > 0 ? Math.round((totalSuccesses / totalProcessed) * 100) : 100,
  };
}
