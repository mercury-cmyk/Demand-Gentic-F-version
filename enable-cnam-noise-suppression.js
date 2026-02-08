import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.log('TELNYX_API_KEY not found in environment');
  process.exit(1);
}

// ====== Fetch all numbers (paginated) ======
async function fetchAllNumbers() {
  let allNumbers = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const url = `https://api.telnyx.com/v2/phone_numbers?page[size]=250&page[number]=${page}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch page ${page}:`, response.status);
      break;
    }
    
    const data = await response.json();
    const numbers = data.data || [];
    allNumbers = allNumbers.concat(numbers);
    
    console.log(`Fetched page ${page}: ${numbers.length} numbers (total: ${allNumbers.length})`);
    
    if (numbers.length < 250) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  return allNumbers;
}

// ====== Enable CNAM via voice settings endpoint ======
async function enableCNAM(num) {
  const response = await fetch(`https://api.telnyx.com/v2/phone_numbers/${num.id}/voice`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cnam_listing: {
        cnam_listing_enabled: true,
        cnam_listing_details: 'Pivotal B2B',
      },
    }),
  });
  return response;
}

// ====== Enable noise suppression via phone numbers endpoint ======
async function enableNoiseSuppression(num) {
  const response = await fetch(`https://api.telnyx.com/v2/phone_numbers/${num.id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      noise_suppression: 'both',
    }),
  });
  return response;
}

// ====== MAIN ======
async function main() {
  // Fetch all numbers
  console.log('=== Fetching All Phone Numbers ===\n');
  const allNumbers = await fetchAllNumbers();
  console.log(`\nTotal numbers found: ${allNumbers.length}\n`);
  
  if (allNumbers.length === 0) {
    console.log('No numbers found.');
    process.exit(0);
  }

  // Show current state
  console.log('=== Current State ===');
  for (const num of allNumbers) {
    console.log(`  ${num.phone_number} | cnam: ${num.cnam_listing_enabled} | noise: ${num.noise_suppression}`);
  }
  
  console.log('\n=== Updating All Numbers ===\n');
  
  let cnamOk = 0, cnamFail = 0, cnamSkip = 0;
  let noiseOk = 0, noiseFail = 0, noiseSkip = 0;
  
  for (const num of allNumbers) {
    const label = num.phone_number;
    
    // --- CNAM ---
    if (num.cnam_listing_enabled === true) {
      cnamSkip++;
    } else {
      try {
        const r = await enableCNAM(num);
        if (r.ok) {
          const d = await r.json();
          console.log(`  ${label} CNAM -> ${d.data?.cnam_listing?.cnam_listing_enabled ? 'ENABLED' : 'PENDING'} (${d.data?.cnam_listing?.cnam_listing_details || '-'})`);
          cnamOk++;
        } else {
          console.log(`  ${label} CNAM FAIL (${r.status}): ${(await r.text()).substring(0, 200)}`);
          cnamFail++;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.log(`  ${label} CNAM ERROR: ${err.message}`);
        cnamFail++;
      }
    }
    
    // --- Noise Suppression ---
    if (num.noise_suppression === 'both') {
      noiseSkip++;
    } else {
      try {
        const r = await enableNoiseSuppression(num);
        if (r.ok) {
          const d = await r.json();
          console.log(`  ${label} NOISE -> ${d.data?.noise_suppression}`);
          noiseOk++;
        } else {
          console.log(`  ${label} NOISE FAIL (${r.status}): ${(await r.text()).substring(0, 200)}`);
          noiseFail++;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.log(`  ${label} NOISE ERROR: ${err.message}`);
        noiseFail++;
      }
    }
  }
  
  console.log('\n========== SUMMARY ==========');
  console.log(`CNAM:  ${cnamOk} updated, ${cnamSkip} already enabled, ${cnamFail} failed`);
  console.log(`NOISE: ${noiseOk} updated, ${noiseSkip} already "both", ${noiseFail} failed`);
  console.log(`Total numbers: ${allNumbers.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
