/**
 * Fix Telnyx TeXML App Webhook URLs
 * Updates the TeXML application to use production domain
 */

import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID;
const PUBLIC_TEXML_HOST = process.env.PUBLIC_TEXML_HOST || 'demandgentic-api-657571555590.us-central1.run.app';

async function fixWebhooks() {
  console.log('==================================================');
  console.log('FIXING TELNYX TEXML APP WEBHOOK URLS');
  console.log('==================================================\n');

  if (!TELNYX_API_KEY || !TELNYX_TEXML_APP_ID) {
    console.error('❌ Missing TELNYX_API_KEY or TELNYX_TEXML_APP_ID');
    process.exit(1);
  }

  const voiceUrl = `https://${PUBLIC_TEXML_HOST}/api/texml/ai-call`;
  const statusCallback = `https://${PUBLIC_TEXML_HOST}/api/webhooks/telnyx`;

  console.log('Target Configuration:');
  console.log(`  Voice URL: ${voiceUrl}`);
  console.log(`  Status Callback: ${statusCallback}\n`);

  console.log('Updating TeXML App...');

  try {
    const response = await fetch(`https://api.telnyx.com/v2/texml_applications/${TELNYX_TEXML_APP_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        voice_url: voiceUrl,
        voice_method: 'POST',
        status_callback: statusCallback,
        status_callback_method: 'POST'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ TeXML App updated successfully!\n');
      console.log('Updated Configuration:');
      console.log(`  App ID: ${data.data.id}`);
      console.log(`  Name: ${data.data.friendly_name}`);
      console.log(`  Voice URL: ${data.data.voice_url}`);
      console.log(`  Voice Method: ${data.data.voice_method}`);
      console.log(`  Status Callback: ${data.data.status_callback}`);
      console.log('\n✅ AI agents should now work properly!');
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to update TeXML App');
      console.error(`Status: ${response.status}`);
      console.error(`Error: ${errorText}`);
      
      if (response.status === 401) {
        console.error('\nInvalid API key. Check TELNYX_API_KEY in .env');
      } else if (response.status === 404) {
        console.error('\nTeXML App not found. Check TELNYX_TEXML_APP_ID in .env');
      }
    }
  } catch (error) {
    console.error('❌ Error updating TeXML app:', error);
  }

  console.log('\n==================================================');
}

fixWebhooks().catch(console.error);