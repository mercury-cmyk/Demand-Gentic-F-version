/**
 * Diagnose Telnyx TeXML App Configuration
 * Checks if the TeXML App ID is valid and has proper webhook configuration
 */

import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID;
const PUBLIC_TEXML_HOST = process.env.PUBLIC_TEXML_HOST;
const PUBLIC_WEBHOOK_HOST = process.env.PUBLIC_WEBHOOK_HOST;

async function diagnose() {
  console.log('==================================================');
  console.log('TELNYX TEXML APP CONFIGURATION DIAGNOSTIC');
  console.log('==================================================\n');

  // 1. Check environment variables
  console.log('1. ENVIRONMENT VARIABLES');
  console.log(`   TELNYX_API_KEY: ${TELNYX_API_KEY ? '✅ Set (' + TELNYX_API_KEY.substring(0, 15) + '...)' : '❌ NOT SET'}`);
  console.log(`   TELNYX_TEXML_APP_ID: ${TELNYX_TEXML_APP_ID || '❌ NOT SET'}`);
  console.log(`   PUBLIC_TEXML_HOST: ${PUBLIC_TEXML_HOST || '⚠️ NOT SET'}`);
  console.log(`   PUBLIC_WEBHOOK_HOST: ${PUBLIC_WEBHOOK_HOST || '⚠️ NOT SET'}`);

  if (!TELNYX_API_KEY || !TELNYX_TEXML_APP_ID) {
    console.error('\n❌ ERROR: Missing required environment variables');
    process.exit(1);
  }

  // 2. Check if TeXML App exists
  console.log('\n2. VERIFYING TEXML APP');
  console.log(`   Checking TeXML App ID: ${TELNYX_TEXML_APP_ID}`);

  try {
    const response = await fetch(`https://api.telnyx.com/v2/texml_applications/${TELNYX_TEXML_APP_ID}`, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ TeXML App exists');
      console.log(`   App Name: ${data.data.friendly_name || 'N/A'}`);
      console.log(`   Status: ${data.data.status || 'N/A'}`);
      console.log(`   Voice URL: ${data.data.voice_url || '❌ NOT SET'}`);
      console.log(`   Voice Method: ${data.data.voice_method || 'N/A'}`);
      console.log(`   Status Callback: ${data.data.status_callback || '⚠️ NOT SET'}`);

      // Check if webhook URL is configured
      if (!data.data.voice_url) {
        console.error('\n❌ PROBLEM FOUND: voice_url is not configured on TeXML app');
        console.error('   This is likely why calls are failing with connection_id error');
        console.error(`   Expected URL: https://${PUBLIC_TEXML_HOST || PUBLIC_WEBHOOK_HOST || 'YOUR_DOMAIN'}/api/texml/ai-call`);
      } else {
        console.log('\n✅ Webhook URL is configured');
      }
    } else {
      const errorText = await response.text();
      console.error('   ❌ TeXML App NOT FOUND or inaccessible');
      console.error(`   Status: ${response.status}`);
      console.error(`   Error: ${errorText}`);
      
      if (response.status === 404) {
        console.error('\n❌ PROBLEM: The TELNYX_TEXML_APP_ID does not exist in your Telnyx account');
        console.error('   Solution: Create a new TeXML Application in Telnyx Portal or use correct ID');
      } else if (response.status === 401) {
        console.error('\n❌ PROBLEM: Invalid Telnyx API key');
        console.error('   Solution: Check TELNYX_API_KEY in .env file');
      }
    }
  } catch (error) {
    console.error('   ❌ Error checking TeXML app:', error);
  }

  // 3. List all TeXML applications
  console.log('\n3. LISTING ALL TEXML APPLICATIONS');
  try {
    const response = await fetch('https://api.telnyx.com/v2/texml_applications', {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const apps = data.data || [];
      console.log(`   Found ${apps.length} TeXML application(s):`);
      
      if (apps.length === 0) {
        console.error('\n❌ PROBLEM: No TeXML applications found in your Telnyx account');
        console.error('   Solution: Create a TeXML Application in Telnyx Portal:');
        console.error('   1. Go to https://portal.telnyx.com/');
        console.error('   2. Navigate to Voice → TeXML Applications');
        console.error('   3. Create new application');
        console.error(`   4. Set Voice URL to: https://${PUBLIC_TEXML_HOST || PUBLIC_WEBHOOK_HOST || 'YOUR_DOMAIN'}/api/texml/ai-call`);
        console.error('   5. Update TELNYX_TEXML_APP_ID in .env with the new ID');
      } else {
        apps.forEach((app: any, idx: number) => {
          const isCurrentApp = app.id === TELNYX_TEXML_APP_ID;
          console.log(`\n   ${isCurrentApp ? '👉' : '  '} App ${idx + 1}:`);
          console.log(`      ID: ${app.id}${isCurrentApp ? ' (CURRENT)' : ''}`);
          console.log(`      Name: ${app.friendly_name || 'N/A'}`);
          console.log(`      Status: ${app.status || 'N/A'}`);
          console.log(`      Voice URL: ${app.voice_url || '❌ NOT SET'}`);
          console.log(`      Status Callback: ${app.status_callback || '⚠️ NOT SET'}`);
        });
      }
    } else {
      console.error('   ❌ Failed to list TeXML applications');
    }
  } catch (error) {
    console.error('   ❌ Error listing TeXML apps:', error);
  }

  // 4. Recommendations
  console.log('\n4. RECOMMENDATIONS');
  const webhookHost = PUBLIC_TEXML_HOST || PUBLIC_WEBHOOK_HOST;
  if (!webhookHost) {
    console.log('   ⚠️ PUBLIC_TEXML_HOST or PUBLIC_WEBHOOK_HOST not set');
    console.log('   Set one of these in .env to your public domain');
  }
  
  console.log('\n   To fix the connection_id error:');
  console.log('   1. Ensure TELNYX_TEXML_APP_ID exists in your Telnyx account');
  console.log('   2. Configure voice_url in TeXML app settings');
  console.log(`   3. Voice URL should be: https://${webhookHost || 'YOUR_DOMAIN'}/api/texml/ai-call`);
  console.log('   4. Ensure your domain is publicly accessible (not localhost)');
  console.log('   5. Update .env with correct values and restart server');

  console.log('\n==================================================\n');
}

diagnose().catch(console.error);
