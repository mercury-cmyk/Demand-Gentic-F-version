#!/usr/bin/env node
/**
 * Get complete connection details
 */

const https = require('https');

const apiKey = process.env.TELNYX_API_KEY;

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
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    const response = await makeRequest('/v2/connections/2903106223836497802');
    console.log(JSON.stringify(response.data, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  }
}

run();
