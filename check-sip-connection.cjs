#!/usr/bin/env node
/**
 * Check SIP Connection Configuration
 */

const https = require('https');

const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) {
  console.error('ERROR: TELNYX_API_KEY not set');
  process.exit(1);
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.telnyx.com',
      port: 443,
      path: path,
      method: 'GET',
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
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    const connectionId = '2903106223836497802';
    
    console.log('Fetching SIP connection details...\n');
    const response = await makeRequest(`/v2/connections/${connectionId}`);
    
    if (response.errors) {
      console.error('ERROR:', response.errors);
      process.exit(1);
    }
    
    const conn = response.data;
    
    console.log(`SIP Connection: ${connectionId}`);
    console.log(`  Name: ${conn.name || 'N/A'}`);
    console.log(`  Status: ${conn.active ? 'ACTIVE ✅' : 'INACTIVE ❌'}`);
    console.log(`  Type: ${conn.connection_type}`);
    console.log(`  Username: ${conn.username}`);
    console.log(`  SIP Port: ${conn.sip_port || 'N/A'}`);
    console.log(`  Transport: ${conn.transport_protocol || 'N/A'}`);
    console.log(`  Outbound Voice Profile: ${conn.outbound_voice_profile_id || 'Default'}`);
    
    console.log(`\n  Credentials:`);
    console.log(`    Username: ${conn.username}`);
    console.log(`    Password: ${conn.password ? '***configured***' : 'NOT SET'}`);
    
    console.log(`\n  IP Addresses (for allowlisting):`);
    if (conn.ip_addresses && conn.ip_addresses.length > 0) {
      conn.ip_addresses.forEach(ip => {
        console.log(`    - ${ip.ip_address}`);
      });
    } else {
      console.log('    None configured');
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

run();
