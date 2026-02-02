/**
 * Test script to verify recordings API is working and audio is playable
 */
import 'dotenv/config';

const API_BASE = 'http://localhost:5000/api';

async function testRecordingsAPI() {
  console.log('=== Testing Recordings API ===\n');

  try {
    // 1. Test /api/recordings/all endpoint
    console.log('1. Fetching recordings from /api/recordings/all...');
    const allResponse = await fetch(`${API_BASE}/recordings/all?page=1&limit=5&source=all`);
    
    if (!allResponse.ok) {
      throw new Error(`Failed to fetch recordings: ${allResponse.status} ${allResponse.statusText}`);
    }
    
    const allData = await allResponse.json();
    console.log(`   ✅ Found ${allData.pagination?.total || 0} total recordings`);
    console.log(`   - Local recordings: ${allData.meta?.localCount || 0}`);
    console.log(`   - Telnyx recordings: ${allData.meta?.telnyxCount || 0}`);
    
    if (!allData.recordings || allData.recordings.length === 0) {
      console.log('   ⚠️ No recordings found in database');
      return;
    }
    
    console.log(`\n   Sample recordings (first ${allData.recordings.length}):`);
    for (const rec of allData.recordings.slice(0, 5)) {
      console.log(`   - ID: ${rec.id?.slice(0, 8)}... | From: ${rec.fromNumber} | To: ${rec.toNumber} | Duration: ${rec.durationSec}s | Source: ${rec.source}`);
    }

    // 2. Test fetching URL for first recording
    const firstRecording = allData.recordings[0];
    console.log(`\n2. Testing playback URL for recording ${firstRecording.id?.slice(0, 8)}...`);
    
    const urlResponse = await fetch(`${API_BASE}/recordings/${firstRecording.id}/url`);
    
    if (!urlResponse.ok) {
      console.log(`   ❌ Failed to get URL: ${urlResponse.status} ${urlResponse.statusText}`);
      const errorData = await urlResponse.json().catch(() => ({}));
      console.log(`   Error: ${errorData.error || 'Unknown error'}`);
    } else {
      const urlData = await urlResponse.json();
      console.log(`   ✅ Got playback URL`);
      console.log(`   - Source: ${urlData.data?.source}`);
      console.log(`   - URL: ${urlData.data?.url?.slice(0, 80)}...`);
      
      // 3. Test if URL is actually accessible
      console.log(`\n3. Testing if audio URL is accessible...`);
      try {
        const audioResponse = await fetch(urlData.data.url, { method: 'HEAD' });
        if (audioResponse.ok) {
          const contentType = audioResponse.headers.get('content-type');
          const contentLength = audioResponse.headers.get('content-length');
          console.log(`   ✅ Audio is accessible!`);
          console.log(`   - Content-Type: ${contentType}`);
          console.log(`   - Size: ${contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
        } else {
          console.log(`   ❌ Audio URL not accessible: ${audioResponse.status} ${audioResponse.statusText}`);
        }
      } catch (err: any) {
        console.log(`   ❌ Failed to check audio URL: ${err.message}`);
      }
    }

    // 4. Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Total recordings available: ${allData.pagination?.total || 0}`);
    console.log('API Status: ✅ Working');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testRecordingsAPI().then(() => {
  console.log('\n✅ All tests completed!');
  process.exit(0);
}).catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});
