#!/usr/bin/env node
/**
 * List all connections to find the right type
 */

const https = require('https');

const apiKey = process.env.TENLYX_API_KEY;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telnyx.com',
      path: path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    const response = await makeRequest('/v2/connections?page[size]=50');
    const connections = response.data || [];
    
    console.log(`Found ${connections.length} connections:\n`);
    
    connections.forEach(conn => {
      console.log(`ID: ${conn.id}`);
      console.log(`  Type: ${conn.record_type}`);
      console.log(`  Name: ${conn.connection_name || 'N/A'}`);
      console.log(`  Active: ${conn.active ? '✅' : '❌'}`);
      
      // Show SIP-related fields if they exist
      if (conn.sip_address) console.log(`  SIP Address: ${conn.sip_address}`);
      if (conn.username) console.log(`  Username: ${conn.username}`);
      if (conn.password) console.log(`  Password: ***`);
      if (conn.sip_port) console.log(`  SIP Port: ${conn.sip_port}`);
      console.log('');
    });
  } catch(e) {
    console.error('Error:', e.message);
  }
}

run();
