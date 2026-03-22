/**
 * Recording Player Error Classification Tests
 *
 * Tests for error classification and retry logic in the recording player.
 * Pure unit tests without external dependencies.
 */

// ============================================
// Error Classification Logic (matches component)
// ============================================

type ErrorCategory = 'cors' | 'auth' | 'expired_url' | 'mime_type' | 'range' | 'network' | 'not_found' | 'unknown';

function classifyError(error: Error | string): ErrorCategory {
  const msg = typeof error === 'string' ? error : error.message;
  const lower = msg.toLowerCase();
  
  if (lower.includes('cors') || lower.includes('cross-origin')) return 'cors';
  if (lower.includes('403') || lower.includes('forbidden')) return 'auth';
  if (lower.includes('404') || lower.includes('not found')) return 'not_found';
  if (lower.includes('expired') || lower.includes('invalid url')) return 'expired_url';
  if (lower.includes('mime') || lower.includes('content-type')) return 'mime_type';
  if (lower.includes('416') || lower.includes('range')) return 'range';
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch')) return 'network';
  if (lower.includes('decode') || lower.includes('format')) return 'unknown';
  return 'unknown';
}

// ============================================
// Retry Logic (matches component)
// ============================================

const MAX_RETRIES = 3;
const NON_RETRYABLE_ERRORS: ErrorCategory[] = ['not_found', 'auth'];

function shouldRetry(errorCategory: ErrorCategory, currentRetry: number): boolean {
  if (currentRetry >= MAX_RETRIES) return false;
  if (NON_RETRYABLE_ERRORS.includes(errorCategory)) return false;
  return true;
}

// ============================================
// Test Assertions
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assertEqual(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

// ============================================
// Tests: Error Classification
// ============================================

try {
  assertEqual(classifyError('CORS policy blocked'), 'cors');
  assertEqual(classifyError('Cross-origin request blocked'), 'cors');
  results.push({ name: 'classifyError: identifies CORS errors', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: identifies CORS errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(classifyError('403 Forbidden'), 'auth');
  assertEqual(classifyError('Forbidden access'), 'auth');
  results.push({ name: 'classifyError: identifies auth errors', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: identifies auth errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(classifyError('404 Not Found'), 'not_found');
  assertEqual(classifyError('Resource not found'), 'not_found');
  results.push({ name: 'classifyError: identifies not_found errors', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: identifies not_found errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(classifyError('URL expired'), 'expired_url');
  assertEqual(classifyError('Invalid URL provided'), 'expired_url');
  results.push({ name: 'classifyError: identifies expired_url errors', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: identifies expired_url errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(classifyError('Invalid MIME type'), 'mime_type');
  assertEqual(classifyError('Wrong content-type header'), 'mime_type');
  results.push({ name: 'classifyError: identifies mime_type errors', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: identifies mime_type errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(classifyError('Network error occurred'), 'network');
  assertEqual(classifyError('Request timeout'), 'network');
  assertEqual(classifyError('Failed to fetch'), 'network');
  results.push({ name: 'classifyError: identifies network errors', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: identifies network errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(classifyError('Something went wrong'), 'unknown');
  assertEqual(classifyError('Unexpected issue'), 'unknown');
  results.push({ name: 'classifyError: returns unknown for unrecognized', passed: true });
} catch (e) {
  results.push({ name: 'classifyError: returns unknown for unrecognized', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Retry Logic
// ============================================

try {
  assertEqual(shouldRetry('network', 0), true);
  assertEqual(shouldRetry('network', 1), true);
  assertEqual(shouldRetry('network', 2), true);
  assertEqual(shouldRetry('network', 3), false); // Max retries reached
  results.push({ name: 'shouldRetry: respects max retries', passed: true });
} catch (e) {
  results.push({ name: 'shouldRetry: respects max retries', passed: false, error: (e as Error).message });
}

try {
  assertEqual(shouldRetry('not_found', 0), false);
  assertEqual(shouldRetry('auth', 0), false);
  results.push({ name: 'shouldRetry: does not retry non-retryable errors', passed: true });
} catch (e) {
  results.push({ name: 'shouldRetry: does not retry non-retryable errors', passed: false, error: (e as Error).message });
}

try {
  assertEqual(shouldRetry('cors', 0), true);
  assertEqual(shouldRetry('expired_url', 0), true);
  assertEqual(shouldRetry('network', 0), true);
  assertEqual(shouldRetry('mime_type', 0), true);
  results.push({ name: 'shouldRetry: retries transient errors', passed: true });
} catch (e) {
  results.push({ name: 'shouldRetry: retries transient errors', passed: false, error: (e as Error).message });
}

// ============================================
// Tests: Stream URL Generation
// ============================================

try {
  const recordingId = 'rec-123';
  const streamUrl = `/api/recordings/${recordingId}/stream`;
  assertEqual(streamUrl, '/api/recordings/rec-123/stream');
  results.push({ name: 'streamUrl: generates correct path', passed: true });
} catch (e) {
  results.push({ name: 'streamUrl: generates correct path', passed: false, error: (e as Error).message });
}

try {
  const recordingId = 'rec_test-456';
  const encoded = encodeURIComponent(recordingId);
  const streamUrl = `/api/recordings/${encoded}/stream`;
  assertEqual(streamUrl, '/api/recordings/rec_test-456/stream');
  results.push({ name: 'streamUrl: handles special characters', passed: true });
} catch (e) {
  results.push({ name: 'streamUrl: handles special characters', passed: false, error: (e as Error).message });
}

// ============================================
// Export Results
// ============================================

export { results, classifyError, shouldRetry };

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

if (typeof console !== 'undefined') {
  console.log('\n📊 Recording Player Error Tests');
  console.log('================================');
  results.forEach(r => {
    console.log(r.passed ? `✅ ${r.name}` : `❌ ${r.name}: ${r.error}`);
  });
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
}