#!/usr/bin/env node
/**
 * Create IP Connection (SIP Credentials) for Drachtio
 */

const https = require('https');

const apiKey = process.env.TELNYX_API_KEY;

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
        resolve({ status: res.statusCode, data: JSON.parse(body) });
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
    console.log('Creating IP Connection (SIP Credentials) for Drachtio...\n');
    
    const connectionData = {
      connection_name: 'Drachtio SIP',
      connection_type: 'ip_connection',
      username: 'pivotalsip2026',
      password: 'pivotalsip2026',
      sip_address: 'sip.telnyx.com',
      sip_port: 5060,
      outbound_voice_profile_id: '2845924790127036233', // Use same profile as FQDN connection
    };
    
    console.log('Payload:', JSON.stringify(connectionData, null, 2));
    console.log('\nSending request...\n');
    
    const response = await makeRequest('POST', '/v2/connections', connectionData);
    
    if (response.data.errors) {
      console.error('❌ ERROR:', response.data.errors);
      process.exit(1);
    }
    
    if (response.status === 201 || response.status === 200) {
      const newConn = response.data.data;
      console.log('✅ SUCCESS: IP Connection created!\n');
      console.log(`Connection ID: ${newConn.id}`);
      console.log(`Name: ${newConn.connection_name}`);
      console.log(`Type: ${newConn.connection_type}`);
      console.log(`Username: ${newConn.username}`);
      console.log(`SIP Address: ${newConn.sip_address}`);
      console.log(`SIP Port: ${newConn.sip_port}`);
      
      console.log(`\nNext steps:`);
      console.log(`1. Assign phone numbers to this connection`);
      console.log(`2. Update drachtio-server.ts to use connection ID: ${newConn.id}`);
      console.log(`3. Redeploy Cloud Run`);
    } else {
      console.error(`ERROR (${response.status}):`, response.data);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

run();
