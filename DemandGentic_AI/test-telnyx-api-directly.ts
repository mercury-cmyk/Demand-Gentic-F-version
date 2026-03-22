/**
 * Test Telnyx API directly to see the exact error
 */

import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID;
const TELNYX_FROM_NUMBER = process.env.TELNYX_FROM_NUMBER;
const PUBLIC_TEXML_HOST = process.env.PUBLIC_TEXML_HOST || 'demandgentic-api-657571555590.us-central1.run.app';

// Test with a UK number
const TEST_PHONE = '+447798787206';

async function testTelnyxCall() {
  console.log('========================================');
  console.log('TESTING TELNYX API CALL DIRECTLY');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  API Key: ${TELNYX_API_KEY?.substring(0, 15)}...`);
  console.log(`  TeXML App ID: ${TELNYX_TEXML_APP_ID}`);
  console.log(`  From Number: ${TELNYX_FROM_NUMBER}`);
  console.log(`  Test Phone: ${TEST_PHONE}`);
  console.log(`  TeXML Host: ${PUBLIC_TEXML_HOST}\n`);

  const voiceUrl = `https://${PUBLIC_TEXML_HOST}/api/texml/ai-call?test=true`;
  const statusCallback = `https://${PUBLIC_TEXML_HOST}/api/webhooks/telnyx`;

  console.log('URLs:');
  console.log(`  Voice URL: ${voiceUrl}`);
  console.log(`  Status Callback: ${statusCallback}\n`);

  const endpoint = `https://api.telnyx.com/v2/texml/calls/${TELNYX_TEXML_APP_ID}`;
  
  console.log(`Making request to: ${endpoint}\n`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        To: TEST_PHONE,
        From: TELNYX_FROM_NUMBER,
        Url: voiceUrl,
        StatusCallback: statusCallback
      })
    });

    console.log(`Response Status: ${response.status} ${response.statusText}\n`);

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ SUCCESS!');
      console.log('Response:', JSON.stringify(JSON.parse(responseText), null, 2));
    } else {
      console.log('❌ FAILED!');
      console.log('Error Response:', responseText);
      
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.errors) {
          console.log('\nError Details:');
          errorJson.errors.forEach((err: any) => {
            console.log(`  Code: ${err.code}`);
            console.log(`  Title: ${err.title}`);
            console.log(`  Detail: ${err.detail}`);
          });
        }
      } catch (e) {
        // Not JSON
      }
    }
  } catch (error) {
    console.error('❌ REQUEST FAILED:', error);
  }

  console.log('\n========================================');
}

testTelnyxCall().catch(console.error);