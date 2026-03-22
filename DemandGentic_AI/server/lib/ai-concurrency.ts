/**
 * AI Concurrency Limiter
 *
 * Prevents the server from making too many simultaneous AI API calls,
 * which exhausts HTTP sockets, DB connections, and memory.
 *
 * Supports both a global limit and per-provider limits (openai, google)
 * to enable dual-provider concurrent calling.
 *
 * Usage:
 *   import { withAiConcurrency } from '../lib/ai-concurrency';
 *   const result = await withAiConcurrency(() => openai.chat.completions.create({...}), 'label', 'openai');
 */

export type AiProvider = 'openai' | 'google' | 'kimi';

const MAX_CONCURRENT_AI_CALLS = parseInt(process.env.MAX_CONCURRENT_AI_CALLS || '30', 10);
const AI_QUEUE_TIMEOUT_MS = parseInt(process.env.AI_QUEUE_TIMEOUT_MS || '60000', 10);

// Per-provider limits (0 = no per-provider limit, uses global only)
const MAX_CONCURRENT_OPENAI = parseInt(process.env.MAX_CONCURRENT_OPENAI || '0', 10);
const MAX_CONCURRENT_GOOGLE = parseInt(process.env.MAX_CONCURRENT_GOOGLE || '0', 10);

// Global counters
let activeCount = 0;
const waitQueue: Array void; reject: (err: Error) => void; timer: ReturnType }> = [];

// Per-provider counters
const providerActive: Record = { openai: 0, google: 0, kimi: 0 };
const providerQueues: Record void; reject: (err: Error) => void; timer: ReturnType }>> = {
  openai: [], google: [], kimi: [],
};

function getProviderLimit(provider: AiProvider): number {
  if (provider === 'openai' && MAX_CONCURRENT_OPENAI > 0) return MAX_CONCURRENT_OPENAI;
  if (provider === 'google' && MAX_CONCURRENT_GOOGLE > 0) return MAX_CONCURRENT_GOOGLE;
  return 0; // no per-provider limit
}

export function getAiConcurrencyStats() {
  return {
    active: activeCount,
    queued: waitQueue.length,
    maxConcurrent: MAX_CONCURRENT_AI_CALLS,
    queueTimeoutMs: AI_QUEUE_TIMEOUT_MS,
    providers: {
      openai: { active: providerActive.openai, queued: providerQueues.openai.length, limit: MAX_CONCURRENT_OPENAI || 'global' },
      google: { active: providerActive.google, queued: providerQueues.google.length, limit: MAX_CONCURRENT_GOOGLE || 'global' },
    },
  };
}

function acquire(provider?: AiProvider): Promise {
  // Check per-provider limit first
  if (provider) {
    const limit = getProviderLimit(provider);
    if (limit > 0 && providerActive[provider] >= limit) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const queue = providerQueues[provider];
          const idx = queue.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          reject(new Error(
            `AI provider ${provider} concurrency queue timeout after ${AI_QUEUE_TIMEOUT_MS}ms. ` +
            `Active: ${providerActive[provider]}/${limit}. Global: ${activeCount}/${MAX_CONCURRENT_AI_CALLS}.`
          ));
        }, AI_QUEUE_TIMEOUT_MS);
        providerQueues[provider].push({ resolve, reject, timer });
      });
    }
  }

  // Then check global limit
  if (activeCount ((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waitQueue.findIndex((w) => w.resolve === resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error(
        `AI concurrency queue timeout after ${AI_QUEUE_TIMEOUT_MS}ms. ` +
        `Active: ${activeCount}, Queued: ${waitQueue.length}. ` +
        `Consider increasing MAX_CONCURRENT_AI_CALLS (current: ${MAX_CONCURRENT_AI_CALLS}).`
      ));
    }, AI_QUEUE_TIMEOUT_MS);

    waitQueue.push({ resolve: () => { if (provider) providerActive[provider]++; resolve(); }, reject, timer });
  });
}

function release(provider?: AiProvider) {
  // Release per-provider slot
  if (provider) {
    const providerQueue = providerQueues[provider];
    if (providerQueue.length > 0) {
      const next = providerQueue.shift()!;
      clearTimeout(next.timer);
      // The provider-queued request still needs a global slot
      if (activeCount  { providerActive[provider]++; next.resolve(); }, reject: next.reject, timer: next.timer });
      }
      return;
    }
    providerActive[provider] = Math.max(0, providerActive[provider] - 1);
  }

  // Release global slot
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    clearTimeout(next.timer);
    next.resolve();
  } else {
    activeCount = Math.max(0, activeCount - 1);
  }
}

/**
 * Wraps an AI API call with concurrency limiting.
 * If the max concurrent limit is reached, the call queues until a slot opens.
 * Throws if queued longer than AI_QUEUE_TIMEOUT_MS.
 * @param provider - optional provider for per-provider limiting
 */
export async function withAiConcurrency(fn: () => Promise, label?: string, provider?: AiProvider): Promise {
  const queuedAt = Date.now();
  await acquire(provider);

  const waitMs = Date.now() - queuedAt;
  if (waitMs > 1000 && label) {
    console.warn(`[AI Concurrency] "${label}" waited ${waitMs}ms in queue (active: ${activeCount}, queued: ${waitQueue.length}${provider ? `, provider=${provider} active=${providerActive[provider]}` : ''})`);
  }

  try {
    return await fn();
  } finally {
    release(provider);
  }
}