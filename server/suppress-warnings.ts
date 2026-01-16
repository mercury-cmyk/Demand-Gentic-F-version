/**
 * Suppress noisy console warnings that are expected in our environment
 * This file must be imported FIRST before any other modules
 */

// Suppress BullMQ Redis eviction policy warning (Redis Cloud uses volatile-lru by default)
// This warning is expected and safe to ignore for our use case
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (chunk: any, ...args: any[]): boolean => {
  const message = chunk?.toString?.() || '';
  // Suppress BullMQ eviction policy warnings
  if (message.includes('IMPORTANT!') && message.includes('Eviction policy')) {
    return true;
  }
  return originalStdoutWrite(chunk, ...args);
};

export {};
