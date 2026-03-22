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
    
    if (numbers.length  ${d.data?.cnam_listing?.cnam_listing_enabled ? 'ENABLED' : 'PENDING'} (${d.data?.cnam_listing?.cnam_listing_details || '-'})`);
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