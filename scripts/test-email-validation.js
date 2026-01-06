/**
 * Email Validation Testing Script (Node.js)
 * 
 * Usage:
 *   1. Get your JWT token from browser localStorage (F12 -> Console -> localStorage.getItem('token'))
 *   2. Set it as environment variable: export AUTH_TOKEN='your-token'
 *   3. Run: node scripts/test-email-validation.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TOKEN = process.env.AUTH_TOKEN;

if (!TOKEN) {
  console.error('❌ Error: AUTH_TOKEN environment variable not set');
  console.log('Please run: export AUTH_TOKEN="your-jwt-token"');
  console.log('Get your token from browser console: localStorage.getItem("token")');
  process.exit(1);
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  return response.json();
}

async function runTests() {
  console.log('🧪 Email Validation Testing Suite\n');
  console.log('Configuration:');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Token: ${TOKEN.substring(0, 20)}...`);
  console.log('');

  try {
    // Test 1: System Status
    console.log('📊 Test 1: System Status');
    console.log('━'.repeat(60));
    const status = await apiRequest('/api/test/email-validation/status');
    console.log('Configuration:', status.configuration);
    console.log('Domain Cache:', status.domainCache);
    console.log('');

    // Test 2: Valid Corporate Email
    console.log('✅ Test 2: Valid Corporate Email');
    console.log('━'.repeat(60));
    const valid = await apiRequest('/api/test/email-validation/single', 'POST', {
      email: 'test@microsoft.com',
      skipCache: false,
    });
    console.log(`Email: ${valid.email}`);
    console.log(`Status: ${valid.result?.status} (confidence: ${valid.result?.confidence})`);
    console.log(`Duration: ${valid.duration}`);
    console.log('Summary:', valid.result?.summary);
    console.log('');

    // Test 3: Invalid Syntax
    console.log('❌ Test 3: Invalid Email Syntax');
    console.log('━'.repeat(60));
    const invalid = await apiRequest('/api/test/email-validation/single', 'POST', {
      email: 'not-an-email',
      skipCache: false,
    });
    console.log(`Email: ${invalid.email}`);
    console.log(`Status: ${invalid.result?.status} (confidence: ${invalid.result?.confidence})`);
    console.log(`Syntax Valid: ${invalid.result?.summary?.syntaxValid}`);
    console.log('');

    // Test 4: Disposable Email
    console.log('🗑️  Test 4: Disposable Email');
    console.log('━'.repeat(60));
    const disposable = await apiRequest('/api/test/email-validation/single', 'POST', {
      email: 'temp@mailinator.com',
      skipCache: false,
    });
    console.log(`Email: ${disposable.email}`);
    console.log(`Status: ${disposable.result?.status} (confidence: ${disposable.result?.confidence})`);
    console.log(`Is Disposable: ${disposable.result?.summary?.isDisposable}`);
    console.log('');

    // Test 5: Role Account
    console.log('⚠️  Test 5: Role Account (Risky)');
    console.log('━'.repeat(60));
    const role = await apiRequest('/api/test/email-validation/single', 'POST', {
      email: 'admin@company.com',
      skipCache: false,
    });
    console.log(`Email: ${role.email}`);
    console.log(`Status: ${role.result?.status} (confidence: ${role.result?.confidence})`);
    console.log(`Is Role: ${role.result?.summary?.isRole}`);
    console.log('');

    // Test 6: Batch Validation
    console.log('📦 Test 6: Batch Validation (Mixed Emails)');
    console.log('━'.repeat(60));
    const batch = await apiRequest('/api/test/email-validation/batch', 'POST', {
      emails: [
        'valid@salesforce.com',
        'invalid@nonexistent-domain-xyz.com',
        'info@company.com',
        'test@guerrillamail.com',
      ],
      skipCache: false,
    });
    console.log(`Total Emails: ${batch.totalEmails}`);
    console.log(`Total Duration: ${batch.totalDuration}`);
    console.log(`Average Duration: ${batch.averageDuration}`);
    console.log('\nResults:');
    batch.results?.forEach((result, idx) => {
      console.log(`  ${idx + 1}. ${result.email}`);
      console.log(`     Status: ${result.status} | Confidence: ${result.confidence} | Duration: ${result.duration}`);
    });
    console.log('');

    // Summary
    console.log('🎉 All Tests Completed!');
    console.log('━'.repeat(60));
    console.log('Next steps:');
    console.log('  1. Review validation accuracy above');
    console.log('  2. Check SKIP_SMTP_VALIDATION setting in .env');
    console.log('  3. Monitor domain cache hit rate for performance');
    console.log('  4. See docs/EMAIL_VALIDATION_TESTING.md for more details');

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error.message?.includes('fetch')) {
      console.log('\nMake sure the server is running on', BASE_URL);
    }
    process.exit(1);
  }
}

runTests();
