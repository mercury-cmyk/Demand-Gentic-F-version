#!/usr/bin/env node
/**
 * Assign All Unassigned Phone Numbers to SIP Connection
 * Connection ID: 2903106223836497802
 */

const https = require('https');

const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) {
  console.error('ERROR: TELNYX_API_KEY not set');
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
    console.log(`Fetching all phone numbers...\n`);
    
    const listResponse = await makeRequest('GET', '/v2/phone_numbers?page[size]=100');
    
    if (listResponse.status !== 200) {
      console.error('ERROR fetching phone numbers:', listResponse.data);
      process.exit(1);
    }
    
    const phoneNumbers = listResponse.data.data || [];
    console.log(`Found ${phoneNumbers.length} total phone numbers\n`);
    
    // Filter unassigned numbers
    const unassignedNumbers = phoneNumbers.filter(pn => !pn.connection_id);
    const assignedToThisConnection = phoneNumbers.filter(pn => pn.connection_id === connectionId);
    
    console.log(`Already assigned to ${connectionId}: ${assignedToThisConnection.length}`);
    assignedToThisConnection.forEach(pn => {
      console.log(`  ✓ ${pn.phone_number}`);
    });
    
    console.log(`\nUnassigned numbers: ${unassignedNumbers.length}`);
    unassignedNumbers.forEach((pn, idx) => {
      console.log(`  ${idx + 1}. ${pn.phone_number}`);
    });
    
    if (unassignedNumbers.length === 0) {
      console.log('\n✅ All phone numbers are already assigned to connections!');
      process.exit(0);
    }
    
    console.log(`\n🔄 Assigning ${unassignedNumbers.length} unassigned numbers to ${connectionId}...\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Assign each number sequentially to avoid rate limits
    for (const phoneNumber of unassignedNumbers) {
      try {
        const updateResponse = await makeRequest('PATCH', `/v2/phone_numbers/${phoneNumber.id}`, {
          connection_id: connectionId,
        });
        
        if (updateResponse.status === 200 || updateResponse.status === 204) {
          console.log(`✅ ${phoneNumber.phone_number}`);
          successCount++;
          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.log(`❌ ${phoneNumber.phone_number} - Error: ${updateResponse.status}`);
          failCount++;
        }
      } catch (error) {
        console.log(`❌ ${phoneNumber.phone_number} - Exception: ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`  ✅ Successfully assigned: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  📱 Total numbers on connection: ${assignedToThisConnection.length + successCount}`);
    
    if (failCount === 0) {
      console.log(`\n🎉 All phone numbers successfully assigned to SIP connection!`);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

run();
