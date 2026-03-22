import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'http://localhost:5000';
const TEST_TOKEN = process.env.TEST_AUTH_TOKEN;

if (!TEST_TOKEN) {
  console.error('❌ TEST_AUTH_TOKEN not found in .env.local');
  process.exit(1);
}

async function testEndpoint(name: string, url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const status = response.status;
    const statusText = response.statusText;
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${name}: ${status} ${statusText}`);
      console.log(`   Response keys: ${Object.keys(data).join(', ')}`);
      if (data.logs) console.log(`   Logs count: ${data.logs.length}`);
      if (data.errors) console.log(`   Errors count: ${data.errors.length}`);
      if (data.metrics) {
        console.log(`   Metrics: ${JSON.stringify(data.metrics)}`);
      }
      return true;
    } else {
      console.error(`❌ ${name}: ${status} ${statusText}`);
      const text = await response.text();
      console.error(`   Error: ${text}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ ${name}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n🔍 Testing Cloud Logs API Endpoints...\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth Token: ${TEST_TOKEN!.substring(0, 50)}...\n`);

  const results = await Promise.all([
    testEndpoint('Health Check', `${BASE_URL}/api/cloud-logs/health`),
    testEndpoint('Recent Logs (15min)', `${BASE_URL}/api/cloud-logs/recent?minutes=15`),
    testEndpoint('Log Metrics', `${BASE_URL}/api/cloud-logs/metrics?minutes=60`),
    testEndpoint('Error Summary', `${BASE_URL}/api/cloud-logs/errors?minutes=60`),
    testEndpoint('Search Logs', `${BASE_URL}/api/cloud-logs/search?query=error&minutes=30`),
    testEndpoint('Severity Filter (ERROR)', `${BASE_URL}/api/cloud-logs/severity/ERROR?minutes=30`)
  ]);

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log(`${'='.repeat(50)}\n`);

  if (passed === total) {
    console.log('🎉 All cloud logs API endpoints are working!');
  } else {
    console.log('⚠️  Some endpoints failed. Check server logs for details.');
    process.exit(1);
  }
}

runTests().catch(console.error);