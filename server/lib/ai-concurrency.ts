/**
 * AI Concurrency Limiter
 *
 * Prevents the server from making too many simultaneous AI API calls,
 * which exhausts HTTP sockets, DB connections, and memory.
 *
 * Usage:
 *   import { withAiConcurrency } from '../lib/ai-concurrency';
 *   const result = await withAiConcurrency(() => openai.chat.completions.create({...}));
 */

const MAX_CONCURRENT_AI_CALLS = parseInt(process.env.MAX_CONCURRENT_AI_CALLS || '30', 10);
const AI_QUEUE_TIMEOUT_MS = parseInt(process.env.AI_QUEUE_TIMEOUT_MS || '60000', 10);

let activeCount = 0;
const waitQueue: Array<{ resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

export function getAiConcurrencyStats() {
  return {
    active: activeCount,
    queued: waitQueue.length,
    maxConcurrent: MAX_CONCURRENT_AI_CALLS,
    queueTimeoutMs: AI_QUEUE_TIMEOUT_MS,
  };
}

function acquire(): Promise<void> {
  if (activeCount < MAX_CONCURRENT_AI_CALLS) {
    activeCount++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waitQueue.findIndex((w) => w.resolve === resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error(
        `AI concurrency queue timeout after ${AI_QUEUE_TIMEOUT_MS}ms. ` +
        `Active: ${activeCount}, Queued: ${waitQueue.length}. ` +
        `Consider increasing MAX_CONCURRENT_AI_CALLS (current: ${MAX_CONCURRENT_AI_CALLS}).`
      ));
    }, AI_QUEUE_TIMEOUT_MS);

    waitQueue.push({ resolve, reject, timer });
  });
}

function release() {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    clearTimeout(next.timer);
    next.resolve();
  } else {
    activeCount--;
  }
}

/**
 * Wraps an AI API call with concurrency limiting.
 * If the max concurrent limit is reached, the call queues until a slot opens.
 * Throws if queued longer than AI_QUEUE_TIMEOUT_MS.
 */
export async function withAiConcurrency<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  const queuedAt = Date.now();
  await acquire();

  const waitMs = Date.now() - queuedAt;
  if (waitMs > 1000 && label) {
    console.warn(`[AI Concurrency] "${label}" waited ${waitMs}ms in queue (active: ${activeCount}, queued: ${waitQueue.length})`);
  }

  try {
    return await fn();
  } finally {
    release();
  }
}
