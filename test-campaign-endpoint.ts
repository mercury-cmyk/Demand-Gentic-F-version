/**
 * Test the campaign test-call endpoint to get exact error
 */

import 'dotenv/config';

const CAMPAIGN_ID = '664aff97-ac3c-4fbb-a943-9b123ddb3fda'; // RingCentral Campaign
// Use localhost with ngrok port (server running on 5000)
const API_URL = 'http://localhost:5000'; 

async function testEndpoint() {
  console.log('========================================');
  console.log('TESTING CAMPAIGN TEST-CALL ENDPOINT');
  console.log('========================================\n');

  const endpoint = `${API_URL}/api/campaigns/${CAMPAIGN_ID}/test-call`;
  console.log(`Endpoint: ${endpoint}\n`);

  const payload = {
    testPhoneNumber: '+14179003844',
    testContactName: 'Zahid M',
    testCompanyName: 'Pivotal B2B',
    testJobTitle: 'CEO',
    testContactEmail: 'zahid.m@pivotal-b2b.com',
    voiceProvider: 'google'
  };

  console.log('Payload:', JSON.stringify(payload, null, 2), '\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Token from generate-test-token.ts output
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiYWRtaW5AZGVtYW5kZ2VudGljLmFpIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzcwNDMxODAxLCJleHAiOjE3NzA1MTgyMDF9.dx5jjx19y4h8wKIIpSo1ooMtLtdaAttnR2WTr1VRCFc'
      },
      body: JSON.stringify(payload)
    });

    console.log(`Response Status: ${response.status} ${response.statusText}\n`);

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('✅ SUCCESS!');
      const data = JSON.parse(responseText);
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ FAILED!');
      console.log('Raw Response:', responseText, '\n');
      
      try {
        const errorData = JSON.parse(responseText);
        console.log('Error Details:');
        console.log('  Message:', errorData.message);
        if (errorData.error) console.log('  Error:', errorData.error);
        if (errorData.errors) console.log('  Validation Errors:', JSON.stringify(errorData.errors, null, 2));
        if (errorData.suggestion) console.log('  Suggestion:', errorData.suggestion);
        if (errorData.provider) console.log('  Provider:', errorData.provider);
        
        // Common error patterns
        if (errorData.message?.includes('credentials')) {
          console.log('\n🔍 DIAGNOSIS: Missing API credentials on production server');
          console.log('   The Cloud Run service needs environment variables set');
        } else if (errorData.message?.includes('AI agent')) {
          console.log('\n🔍 DIAGNOSIS: No AI agent assigned to campaign');
          console.log('   Check campaign configuration in database');
        } else if (errorData.message?.includes('Telnyx')) {
          console.log('\n🔍 DIAGNOSIS: Telnyx API configuration issue');
          console.log('   Check TELNYX_API_KEY, TELNYX_FROM_NUMBER, TELNYX_TEXML_APP_ID');
        }
      } catch (e) {
        console.log('Could not parse error as JSON');
      }
    }
  } catch (error) {
    console.error('❌ REQUEST FAILED:', error);
  }

  console.log('\n========================================');
}

testEndpoint().catch(console.error);
