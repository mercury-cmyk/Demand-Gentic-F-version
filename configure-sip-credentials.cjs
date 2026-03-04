#!/usr/bin/env node
/**
 * Configure SIP Connection Credentials
 */

const https = require('https');

const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) {
  console.error('ERROR: TELNYX_API_KEY not set');
  process.exit(1);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.telnyx.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function run() {
  try {
    const connectionId = '2903106223836497802';
    const username = 'pivotalsip2026';
    const password = 'pivotalsip2026';
    
    console.log(`Configuring SIP Connection: ${connectionId}`);
    console.log(`  Username: ${username}`);
    console.log(`  Password: ***\n`);
    
    const updateData = {
      username: username,
      password: password,
    };
    
    const response = await makeRequest('PATCH', `/v2/connections/${connectionId}`, updateData);
    
    if (response.data.errors) {
      console.error('❌ ERROR:', response.data.errors);
      process.exit(1);
    }
    
    if (response.status === 200 || response.status === 204) {
      console.log('✅ SUCCESS: SIP credentials updated!\n');
      console.log('Connection is now ready for SIP calls.');
      console.log('\nAssigned phone numbers on this connection:');
      console.log('  • +14352819560');
      console.log('  • +13854108900');
      console.log('  • +19704381769');
      console.log('\nNow update Cloud Run:');
      console.log('  gcloud run services update demandgentic-api --region=us-central1 --set-env-vars=TELNYX_FROM_NUMBER=+14352819560');
    } else {
      console.error(`ERROR (${response.status}):`, response.data);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

run();
