#!/usr/bin/env node
/**
 * Get outbound voice profile details
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
    const response = await makeRequest('/v2/outbound_voice_profiles/2845924790127036233');
    const profile = response.data;
    
    console.log('Outbound Voice Profile: 2845924790127036233');
    console.log('  Name:', profile.name);
    console.log('  Traffic Type:', profile.traffic_type);
    console.log('  Enabled:', profile.enabled);
    console.log('  ', JSON.stringify(profile, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  }
}

run();