/**
 * Test the campaign test-call endpoint to get exact error
 */

import 'dotenv/config';

const CAMPAIGN_ID = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';
const API_URL = 'https://demandgentic-api-657571555590.us-central1.run.app';

async function testEndpoint() {
  console.log('========================================');
  console.log('TESTING CAMPAIGN TEST-CALL ENDPOINT');
  console.log('========================================\n');

  const endpoint = `${API_URL}/api/campaigns/${CAMPAIGN_ID}/test-call`;
  console.log(`Endpoint: ${endpoint}\n`);

  const payload = {
    testPhoneNumber: '+447798787206',
    testContactName: 'Test User',
    testCompanyName: 'Test Company',
    testJobTitle: 'Test Title',
    voiceProvider: 'google'
  };

  console.log('Payload:', JSON.stringify(payload, null, 2), '\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add auth token here if testing with real auth
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
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
