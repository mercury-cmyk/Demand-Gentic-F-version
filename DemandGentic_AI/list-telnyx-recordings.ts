import 'dotenv/config';
import fetch from 'node-fetch';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

async function listAllRecordings() {
  if (!TELNYX_API_KEY) {
    console.error("TELNYX_API_KEY not configured");
    process.exit(1);
  }

  console.log("========================================");
  console.log("LIST ALL ACCESSIBLE TELNYX RECORDINGS");
  console.log("========================================\n");

  try {
    // Get all recordings from last 7 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const params = new URLSearchParams();
    params.append('filter[created_at][gte]', startDate.toISOString());
    params.append('page[size]', '100');

    console.log(`Searching for recordings since: ${startDate.toISOString()}\n`);

    const response = await fetch(
      `${TELNYX_API_BASE}/recordings?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.log(`Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log(text);
      process.exit(1);
    }

    const data = await response.json() as any;
    
    console.log(`Found ${data.data?.length || 0} recordings\n`);

    if (data.data && data.data.length > 0) {
      for (const rec of data.data) {
        console.log(`Recording ID: ${rec.id}`);
        console.log(`  Call Control ID: ${rec.call_control_id}`);
        console.log(`  Call Leg ID: ${rec.call_leg_id}`);
        console.log(`  Call Session ID: ${rec.call_session_id}`);
        console.log(`  Created: ${rec.created_at}`);
        console.log(`  Duration: ${rec.duration_millis}ms`);
        console.log(`  Status: ${rec.status}`);
        
        if (rec.download_urls) {
          console.log(`  Download URLs:`);
          if (rec.download_urls.mp3) console.log(`    MP3: ${rec.download_urls.mp3.substring(0, 80)}...`);
          if (rec.download_urls.wav) console.log(`    WAV: ${rec.download_urls.wav.substring(0, 80)}...`);
        }
        console.log('');
      }

      // Try to get pagination info
      if (data.meta?.pagination) {
        console.log(`\nPagination: ${data.meta.pagination.total_entries} total entries`);
      }
    }

  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  process.exit(0);
}

listAllRecordings();