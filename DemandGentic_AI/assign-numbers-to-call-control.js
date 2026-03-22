import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const CALL_CONTROL_APP_ID = '2853482451592807572'; // DemandGentic-ai

if (!TELNYX_API_KEY) {
  console.log('TELNYX_API_KEY not found in environment');
  process.exit(1);
}

console.log('Assigning phone numbers to Call Control Application...');
console.log(`Target App ID: ${CALL_CONTROL_APP_ID}\n`);

async function assignNumbersToCallControl() {
  // First, fetch all numbers
  const response = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=250', {
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('Failed to fetch numbers:', response.status);
    return;
  }

  const data = await response.json();
  const numbers = data.data || [];

  console.log(`Found ${numbers.length} total numbers\n`);

  // Filter numbers that need to be assigned (unassigned or on FQDN connections)
  const numbersToAssign = numbers.filter(num => {
    const connName = num.connection_name || '';
    // Assign if: no connection, or on FQDN connections (UKEF, Proton, PipelineIQ)
    return !connName || connName === 'UKEF' || connName === 'Proton' || connName === 'PipelineIQ';
  });

  console.log(`Numbers to reassign: ${numbersToAssign.length}\n`);

  if (numbersToAssign.length === 0) {
    console.log('No numbers need reassignment.');
    return;
  }

  // Show what will be assigned
  console.log('Will assign these numbers:');
  numbersToAssign.forEach((num, i) => {
    console.log(`  ${i+1}. ${num.phone_number} (currently: ${num.connection_name || 'unassigned'})`);
  });
  console.log('');

  // Assign each number
  let success = 0;
  let failed = 0;

  for (const num of numbersToAssign) {
    try {
      console.log(`Assigning ${num.phone_number}...`);

      const updateResponse = await fetch(`https://api.telnyx.com/v2/phone_numbers/${num.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connection_id: CALL_CONTROL_APP_ID,
        }),
      });

      if (updateResponse.ok) {
        console.log(`  ✅ Success`);
        success++;
      } else {
        const error = await updateResponse.text();
        console.log(`  ❌ Failed: ${updateResponse.status} - ${error}`);
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Successfully assigned: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${numbersToAssign.length}`);
}

assignNumbersToCallControl().catch(console.error);