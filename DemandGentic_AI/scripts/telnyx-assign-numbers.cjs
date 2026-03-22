/**
 * Script to assign all Telnyx numbers to the SIP connection
 */
const https = require('https');

const TELNYX_API_KEY = process.argv[2] === '--key' ? process.argv[3] : process.env.TELNYX_API_KEY;
const SIP_CONNECTION_ID = '2903106223836497802';

function telnyxRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.telnyx.com',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TELNYX_API_KEY,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Step 1: Get all numbers
  console.log('Fetching all phone numbers...');
  const result = await telnyxRequest('GET', '/v2/phone_numbers?page[size]=250');
  const numbers = result.data.data || [];
  console.log(`Total numbers: ${numbers.length}`);

  // Group by connection
  const byConn = {};
  numbers.forEach(n => {
    const connId = n.connection_id || 'none';
    if (byConn[connId] === undefined) byConn[connId] = [];
    byConn[connId].push(n);
  });

  Object.entries(byConn).forEach(([k, v]) => {
    console.log(`  Connection ${k}: ${v.length} numbers`);
  });

  // Step 2: Find numbers not on SIP connection
  const notOnSip = numbers.filter(n => String(n.connection_id) !== SIP_CONNECTION_ID);
  console.log(`\nNumbers NOT on SIP connection (${SIP_CONNECTION_ID}): ${notOnSip.length}`);

  if (notOnSip.length === 0) {
    console.log('All numbers already assigned to SIP connection.');
    return;
  }

  // Step 3: Assign each number to SIP connection
  const action = process.argv[2];
  if (action !== '--assign') {
    console.log('\nDry run. To actually assign, run with --assign flag.');
    notOnSip.forEach(n => {
      console.log(`  Would reassign: ${n.phone_number} (id: ${n.id}, current conn: ${n.connection_id || 'none'})`);
    });
    return;
  }

  console.log(`\nAssigning ${notOnSip.length} numbers to SIP connection...`);
  let success = 0;
  let failed = 0;

  for (const num of notOnSip) {
    try {
      const patchResult = await telnyxRequest('PATCH', `/v2/phone_numbers/${num.id}`, {
        connection_id: SIP_CONNECTION_ID,
      });

      if (patchResult.status === 200) {
        console.log(`  ✓ ${num.phone_number} assigned`);
        success++;
      } else {
        console.log(`  ✗ ${num.phone_number} failed (${patchResult.status}): ${JSON.stringify(patchResult.data.errors || patchResult.data)}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ✗ ${num.phone_number} error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} assigned, ${failed} failed`);
}

main().catch(console.error);