import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.log('TELNYX_API_KEY not found in environment');
  process.exit(1);
}

console.log('API Key found, fetching phone numbers...\n');

async function fetchAllNumbers() {
  let allNumbers = [];
  let pageNumber = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.telnyx.com/v2/phone_numbers?page[size]=250&page[number]=${pageNumber}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Error:', response.status, response.statusText);
      const text = await response.text();
      console.error(text);
      break;
    }

    const data = await response.json();
    const numbers = data.data || [];
    allNumbers = allNumbers.concat(numbers);

    console.log(`Page ${pageNumber}: Found ${numbers.length} numbers (Total: ${allNumbers.length})`);

    // Check if there are more pages
    const meta = data.meta;
    hasMore = numbers.length === 250;
    pageNumber++;
  }

  console.log('\n========== ALL TELNYX PHONE NUMBERS ==========');
  console.log(`Total: ${allNumbers.length} numbers\n`);

  allNumbers.forEach((num, i) => {
    console.log(`${i+1}. ${num.phone_number}`);
    console.log(`   Status: ${num.status}`);
    console.log(`   Connection: ${num.connection_name || 'N/A'}`);
    console.log(`   ID: ${num.id}`);
    console.log(`   Created: ${num.created_at}`);
    console.log('');
  });

  return allNumbers;
}

fetchAllNumbers().catch(console.error);
