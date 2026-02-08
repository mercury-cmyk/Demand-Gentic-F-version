/**
 * Update Telnyx TeXML App for local development with ngrok
 * Run this after starting ngrok to update the webhook URLs
 */

import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_TEXML_APP_ID = process.env.TELNYX_TEXML_APP_ID;

async function getNgrokUrl(): Promise<string | null> {
  try {
    const response = await fetch('http://localhost:4040/api/tunnels');
    const data = await response.json() as any;
    const tunnel = data.tunnels?.find((t: any) => t.proto === 'https');
    return tunnel?.public_url || null;
  } catch {
    return null;
  }
}

async function updateTexmlApp() {
  console.log('==================================================');
  console.log('UPDATE TEXML APP FOR LOCAL DEVELOPMENT');
  console.log('==================================================\n');

  if (!TELNYX_API_KEY || !TELNYX_TEXML_APP_ID) {
    console.error('❌ Missing TELNYX_API_KEY or TELNYX_TEXML_APP_ID');
    process.exit(1);
  }

  const ngrokUrl = await getNgrokUrl();
  if (!ngrokUrl) {
    console.error('❌ Ngrok is not running! Start ngrok first with: ngrok http 5000');
    process.exit(1);
  }

  console.log(`📡 Ngrok URL: ${ngrokUrl}\n`);

  const voiceUrl = `${ngrokUrl}/api/texml/ai-call`;
  const statusCallback = `${ngrokUrl}/api/webhooks/telnyx`;

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
      const data = await response.json() as any;
      console.log('✅ TeXML App updated successfully!\n');
      console.log('Updated Configuration:');
      console.log(`  App ID: ${data.data.id}`);
      console.log(`  Name: ${data.data.friendly_name}`);
      console.log(`  Voice URL: ${data.data.voice_url}`);
      console.log(`  Voice Method: ${data.data.voice_method}`);
      console.log(`  Status Callback: ${data.data.status_callback}`);
      console.log('\n✅ Local development ready! AI calls will now route through ngrok.');
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to update TeXML App');
      console.error(`Status: ${response.status}`);
      console.error(`Error: ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Error updating TeXML app:', error);
  }

  console.log('\n==================================================');
}

updateTexmlApp().catch(console.error);
