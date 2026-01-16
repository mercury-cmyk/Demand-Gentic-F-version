/**
 * Preload script to suppress BullMQ eviction policy warnings
 * This runs BEFORE any other code via Node's --require flag
 */

// Only install once (check using a symbol to avoid name collisions)
const FILTER_KEY = Symbol.for('eviction-policy-filter-installed');
if (!global[FILTER_KEY]) {
  global[FILTER_KEY] = true;

  // Filter function to check for eviction policy warnings
  const shouldSuppress = (chunk) => {
    const str = chunk?.toString?.() || '';
    return str.includes('IMPORTANT!') && str.includes('Eviction policy');
  };

  // Intercept stdout (some libraries write directly here)
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = function(chunk, ...args) {
    if (shouldSuppress(chunk)) return true;
    return originalStdoutWrite(chunk, ...args);
  };

  // Intercept stderr (console.warn writes here)
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function(chunk, ...args) {
    if (shouldSuppress(chunk)) return true;
    return originalStderrWrite(chunk, ...args);
  };

  console.log('[Preload] Eviction policy warning filter installed');
}
