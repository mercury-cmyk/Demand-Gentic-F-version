#!/usr/bin/env node
/**
 * Reassign ALL Phone Numbers to Target SIP Connection
 * Takes all numbers from other connections and assigns to 2903106223836497802
 */

const https = require('https');

const apiKey = process.env.TELNYX_API_KEY;
if (!apiKey) {
  console.error('ERROR: TELNYX_API_KEY not set');
  process.exit(1);
}

const targetConnectionId = '2903106223836497802';

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
    
    // Separate by connection
    const targetConnectionNumbers = phoneNumbers.filter(pn => pn.connection_id === targetConnectionId);
    const otherConnectionNumbers = phoneNumbers.filter(pn => pn.connection_id && pn.connection_id !== targetConnectionId);
    
    console.log(`Currently on target connection ${targetConnectionId}: ${targetConnectionNumbers.length}`);
    targetConnectionNumbers.forEach(pn => {
      console.log(`  ✓ ${pn.phone_number}`);
    });
    
    console.log(`\nOn OTHER connections: ${otherConnectionNumbers.length}`);
    otherConnectionNumbers.slice(0, 10).forEach((pn, idx) => {
      console.log(`  ${idx + 1}. ${pn.phone_number} (on ${pn.connection_id})`);
    });
    if (otherConnectionNumbers.length > 10) {
      console.log(`  ... and ${otherConnectionNumbers.length - 10} more`);
    }
    
    if (otherConnectionNumbers.length === 0) {
      console.log('\n✅ All phone numbers already assigned to this connection!');
      process.exit(0);
    }
    
    console.log(`\n🔄 Reassigning ${otherConnectionNumbers.length} numbers to ${targetConnectionId}...\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Reassign each number
    for (const phoneNumber of otherConnectionNumbers) {
      try {
        const updateResponse = await makeRequest('PATCH', `/v2/phone_numbers/${phoneNumber.id}`, {
          connection_id: targetConnectionId,
        });
        
        if (updateResponse.status === 200 || updateResponse.status === 204) {
          console.log(`✅ ${phoneNumber.phone_number}`);
          successCount++;
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 150));
        } else {
          console.log(`❌ ${phoneNumber.phone_number} - Error: ${updateResponse.status}`);
          if (updateResponse.data?.errors) {
            console.log(`   ${JSON.stringify(updateResponse.data.errors)}`);
          }
          failCount++;
        }
      } catch (error) {
        console.log(`❌ ${phoneNumber.phone_number} - Exception: ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`\n📊 Results:`);
    console.log(`  ✅ Successfully reassigned: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  📱 Total numbers on connection: ${targetConnectionNumbers.length + successCount}`);
    
    if (failCount === 0 && successCount > 0) {
      console.log(`\n🎉 All phone numbers successfully assigned to SIP connection!`);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

run();