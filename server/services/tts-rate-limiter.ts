/**
 * TTS Rate Limiter & Cache Service
 * 
 * Solves the Google Cloud Text-to-Speech quota exceeded issue (157% utilization)
 * by implementing:
 * 
 * 1. SINGLETON TTS CLIENT - Reuse one client instance instead of creating per-call
 * 2. IN-MEMORY AUDIO CACHE - Cache synthesized audio by text+voice hash (LRU, 10min TTL)
 * 3. TOKEN BUCKET RATE LIMITER - Cap requests/minute to stay under quota
 * 4. REQUEST QUEUE - Queue excess requests instead of failing
 * 5. EXPONENTIAL BACKOFF - Retry on rate limit errors with backoff
 * 
 * Quota: texttospeech.googleapis.com JourneyRequestsPerMinutePerProject
 * Default limit: 300 requests/minute (Journey voices)
 * Current usage: 157% → ~470 req/min → need to reduce to <250 req/min (safe margin)
 */

import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import crypto from 'crypto';

const LOG_PREFIX = '[TTS-RateLimiter]';

// ==================== CONFIGURATION ====================

// Rate limit: stay well under 300 req/min quota (Journey voices)
const MAX_REQUESTS_PER_MINUTE = 200; // Safe: 67% of 300 quota
const TOKEN_REFILL_INTERVAL_MS = 60_000 / MAX_REQUESTS_PER_MINUTE; // ~300ms per token

// Cache configuration
const CACHE_MAX_SIZE = 500;          // Max cached audio entries
const CACHE_TTL_MS = 10 * 60_000;   // 10 minute TTL for cached audio

// Retry configuration  
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;         // 1 second base backoff
const MAX_BACKOFF_MS = 15_000;        // 15 second max backoff

// Queue configuration
const MAX_QUEUE_SIZE = 100;           // Max pending TTS requests
const QUEUE_TIMEOUT_MS = 30_000;      // 30 second timeout for queued requests

// ==================== TYPES ====================

interface CachedAudio {
  buffer: Buffer;
  createdAt: number;
  accessedAt: number;
  hitCount: number;
}

interface QueuedRequest {
  text: string;
  voiceName: string;
  languageCode: string;
  audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
  resolve: (buffer: Buffer) => void;
  reject: (error: Error) => void;
  queuedAt: number;
}

interface TTSStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  rateLimited: number;
  errors: number;
  avgLatencyMs: number;
  cacheSize: number;
  queueSize: number;
  tokensAvailable: number;
  requestsPerMinute: number;
}

// ==================== SINGLETON CLIENT ====================

let _ttsClient: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
  if (!_ttsClient) {
    _ttsClient = new TextToSpeechClient();
    console.log(`${LOG_PREFIX} Initialized singleton TextToSpeechClient`);
  }
  return _ttsClient;
}

// ==================== TOKEN BUCKET RATE LIMITER ====================

class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillIntervalMs: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillIntervalMs: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  get available(): number {
    this.refill();
    return this.tokens;
  }

  // Estimated wait time in ms until a token is available
  get estimatedWaitMs(): number {
    if (this.tokens > 0) return 0;
    return this.refillIntervalMs;
  }
}

// ==================== LRU CACHE ====================

class TTSCache {
  private cache: Map<string, CachedAudio> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  private makeKey(text: string, voiceName: string): string {
    // Hash text+voice to create a compact key
    const hash = crypto.createHash('md5')
      .update(`${voiceName}:${text}`)
      .digest('hex');
    return hash;
  }

  get(text: string, voiceName: string): Buffer | null {
    const key = this.makeKey(text, voiceName);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update access time and hit count (LRU tracking)
    entry.accessedAt = Date.now();
    entry.hitCount++;
    return entry.buffer;
  }

  set(text: string, voiceName: string, buffer: Buffer): void {
    const key = this.makeKey(text, voiceName);

    // Evict if at capacity (remove least recently accessed)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      buffer,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      hitCount: 0,
    });
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  // Clean expired entries
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ==================== GLOBAL INSTANCES ====================

const rateLimiter = new TokenBucket(MAX_REQUESTS_PER_MINUTE, TOKEN_REFILL_INTERVAL_MS);
const audioCache = new TTSCache(CACHE_MAX_SIZE, CACHE_TTL_MS);
const requestQueue: QueuedRequest[] = [];

// Stats tracking
let stats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  rateLimited: 0,
  errors: 0,
  totalLatencyMs: 0,
  requestTimestamps: [] as number[],
};

// Periodic cache cleanup
setInterval(() => {
  const cleaned = audioCache.cleanup();
  if (cleaned > 0) {
    console.log(`${LOG_PREFIX} Cache cleanup: removed ${cleaned} expired entries, ${audioCache.size} remaining`);
  }
}, 60_000); // Every minute

// Process queue
setInterval(() => {
  processQueue();
}, 100); // Check queue every 100ms

// ==================== QUEUE PROCESSOR ====================

async function processQueue(): Promise<void> {
  if (requestQueue.length === 0) return;
  if (!rateLimiter.tryConsume()) return;

  const request = requestQueue.shift();
  if (!request) return;

  // Check timeout
  if (Date.now() - request.queuedAt > QUEUE_TIMEOUT_MS) {
    request.reject(new Error('TTS request timed out in queue'));
    return;
  }

  try {
    const buffer = await synthesizeWithRetry(
      request.text,
      request.voiceName,
      request.languageCode,
      request.audioEncoding
    );
    request.resolve(buffer);
  } catch (error) {
    request.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

// ==================== CORE SYNTHESIS WITH RETRY ====================

async function synthesizeWithRetry(
  text: string,
  voiceName: string,
  languageCode: string,
  audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS',
  retryCount = 0
): Promise<Buffer> {
  try {
    const client = getClient();
    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: { name: voiceName, languageCode },
      audioConfig: {
        audioEncoding: audioEncoding as any,
        speakingRate: 1.0,
        pitch: 0,
      },
    });

    if (!response.audioContent) {
      throw new Error('No audio content returned from Google TTS');
    }

    return Buffer.from(response.audioContent as Uint8Array);
  } catch (error: any) {
    const isRateLimit = error?.code === 8 || // RESOURCE_EXHAUSTED
      error?.code === 429 ||
      error?.message?.includes('RESOURCE_EXHAUSTED') ||
      error?.message?.includes('Quota exceeded') ||
      error?.message?.includes('rate') ||
      error?.message?.includes('429');

    if (isRateLimit && retryCount < MAX_RETRIES) {
      const backoffMs = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, retryCount) + Math.random() * 1000,
        MAX_BACKOFF_MS
      );
      console.warn(`${LOG_PREFIX} Rate limited (attempt ${retryCount + 1}/${MAX_RETRIES}), backing off ${Math.round(backoffMs)}ms`);
      stats.rateLimited++;
      
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return synthesizeWithRetry(text, voiceName, languageCode, audioEncoding, retryCount + 1);
    }

    stats.errors++;
    throw error;
  }
}

// ==================== PUBLIC API ====================

/**
 * Rate-limited, cached TTS synthesis.
 * This is the ONLY function that should be used for Google Cloud TTS across the entire app.
 * 
 * @param text - Text to synthesize
 * @param voiceName - Google Cloud TTS voice name (e.g., 'en-US-Journey-D')
 * @param languageCode - Language code (default: 'en-US')
 * @param audioEncoding - Audio format (default: 'MP3')
 * @returns Buffer containing audio data
 */
export async function synthesizeSpeechRateLimited(
  text: string,
  voiceName: string,
  languageCode: string = 'en-US',
  audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS' = 'MP3'
): Promise<Buffer> {
  const startTime = Date.now();
  stats.totalRequests++;
  stats.requestTimestamps.push(startTime);
  
  // Clean old timestamps (keep last minute)
  const oneMinAgo = startTime - 60_000;
  stats.requestTimestamps = stats.requestTimestamps.filter(t => t > oneMinAgo);

  // 1. Check cache first
  const cached = audioCache.get(text, voiceName);
  if (cached) {
    stats.cacheHits++;
    return cached;
  }
  stats.cacheMisses++;

  // 2. Try to consume a rate limit token
  if (rateLimiter.tryConsume()) {
    // Token available - synthesize immediately
    const buffer = await synthesizeWithRetry(text, voiceName, languageCode, audioEncoding);
    audioCache.set(text, voiceName, buffer);
    stats.totalLatencyMs += Date.now() - startTime;
    return buffer;
  }

  // 3. No token available - queue the request
  if (requestQueue.length >= MAX_QUEUE_SIZE) {
    stats.errors++;
    throw new Error(`TTS queue full (${MAX_QUEUE_SIZE} pending). Too many concurrent TTS requests.`);
  }

  console.warn(`${LOG_PREFIX} Rate limited, queuing request (queue size: ${requestQueue.length + 1}, est wait: ${rateLimiter.estimatedWaitMs}ms)`);

  return new Promise<Buffer>((resolve, reject) => {
    requestQueue.push({
      text,
      voiceName,
      languageCode,
      audioEncoding,
      resolve: (buffer: Buffer) => {
        audioCache.set(text, voiceName, buffer);
        stats.totalLatencyMs += Date.now() - startTime;
        resolve(buffer);
      },
      reject,
      queuedAt: Date.now(),
    });
  });
}

/**
 * Get current TTS rate limiter stats for monitoring
 */
export function getTTSStats(): TTSStats {
  const oneMinAgo = Date.now() - 60_000;
  const recentRequests = stats.requestTimestamps.filter(t => t > oneMinAgo).length;

  return {
    totalRequests: stats.totalRequests,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
    rateLimited: stats.rateLimited,
    errors: stats.errors,
    avgLatencyMs: stats.cacheMisses > 0 
      ? Math.round(stats.totalLatencyMs / stats.cacheMisses) 
      : 0,
    cacheSize: audioCache.size,
    queueSize: requestQueue.length,
    tokensAvailable: rateLimiter.available,
    requestsPerMinute: recentRequests,
  };
}

/**
 * Clear the TTS audio cache
 */
export function clearTTSCache(): void {
  audioCache.clear();
  console.log(`${LOG_PREFIX} Cache cleared`);
}

/**
 * Get the singleton TTS client (for listVoices health checks etc.)
 */
export function getTTSClient(): TextToSpeechClient {
  return getClient();
}

/**
 * Reset stats (for testing)
 */
export function resetTTSStats(): void {
  stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    rateLimited: 0,
    errors: 0,
    totalLatencyMs: 0,
    requestTimestamps: [],
  };
}
