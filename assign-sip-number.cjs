#!/usr/bin/env node

/**
 * Telnyx API Script: Assign Phone Number to SIP Connection
 * 
 * Gets list of available phone numbers and assigns one to the SIP connection
 */

const https = require('https');

// Get API key from process env
const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) {
  console.error('ERROR: TELNYX_API_KEY environment variable not set');
  process.exit(1);
}

const connectionId = '2903106223836497802';

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
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
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
    console.log('Fetching available phone numbers...\n');
    
    const listResponse = await makeRequest('GET', '/v2/phone_numbers?page[size]=50');
    
    if (listResponse.status !== 200) {
      console.error('ERROR fetching phone numbers:', listResponse.data);
      process.exit(1);
    }
    
    const phoneNumbers = listResponse.data.data || [];
    console.log(`Found ${phoneNumbers.length} phone numbers:\n`);
    
    // Show all numbers
    phoneNumbers.forEach((pn, idx) => {
      const connectionStatus = pn.connection_id ? `assigned to ${pn.connection_id}` : 'NOT assigned';
      console.log(`${idx + 1}. ${pn.phone_number} (${pn.id}) - ${connectionStatus}`);
    });
    
    // Find unassigned number
    const unassigned = phoneNumbers.find(pn => !pn.connection_id);
    
    if (!unassigned) {
      console.log('\nNo unassigned phone numbers found.');
      console.log('All available numbers are already assigned to connections.');
      process.exit(1);
    }
    
    console.log(`\n✓ Selected unassigned number: ${unassigned.phone_number}`);
    console.log(`  Assigning to SIP connection: ${connectionId}\n`);
    
    // Assign the number to the SIP connection
    const updateResponse = await makeRequest('PATCH', `/v2/phone_numbers/${unassigned.id}`, {
      connection_id: connectionId,
    });
    
    if (updateResponse.status === 200 || updateResponse.status === 204) {
      console.log('✅ SUCCESS: Phone number assigned to SIP connection!');
      console.log(`\n   Phone Number: ${unassigned.phone_number}`);
      console.log(`   Connection ID: ${connectionId}`);
      console.log(`\nUpdate Cloud Run with: gcloud run services update demandgentic-api --region=us-central1 --set-env-vars=TELNYX_FROM_NUMBER=${unassigned.phone_number}`);
    } else {
      console.error('ERROR assigning number:', updateResponse.status, updateResponse.data);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

run();
