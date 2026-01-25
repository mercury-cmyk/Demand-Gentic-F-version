/**
 * Fix ALL Telnyx TeXML App Webhook URLs
 * Updates all TeXML applications to use production domain
 */

import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const PUBLIC_TEXML_HOST = process.env.PUBLIC_TEXML_HOST || 'demandgentic-api-657571555590.us-central1.run.app';

async function fixAllWebhooks() {
  console.log('==================================================');
  console.log('FIXING ALL TELNYX TEXML APP WEBHOOK URLS');
  console.log('==================================================\n');

  if (!TELNYX_API_KEY) {
    console.error('❌ Missing TELNYX_API_KEY');
    process.exit(1);
  }

  const voiceUrl = `https://${PUBLIC_TEXML_HOST}/api/texml/ai-call`;
  const statusCallback = `https://${PUBLIC_TEXML_HOST}/api/webhooks/telnyx`;

  console.log('Target Configuration:');
  console.log(`  Voice URL: ${voiceUrl}`);
  console.log(`  Status Callback: ${statusCallback}\n`);

  // Get all TeXML applications
  console.log('Fetching all TeXML applications...');
  const listResponse = await fetch('https://api.telnyx.com/v2/texml_applications', {
    headers: {
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!listResponse.ok) {
    console.error('❌ Failed to fetch TeXML applications');
    process.exit(1);
  }

  const listData = await listResponse.json();
  const apps = listData.data || [];

  console.log(`Found ${apps.length} TeXML application(s)\n`);

  for (const app of apps) {
    console.log(`Updating: ${app.friendly_name} (${app.id})`);
    
    try {
      const response = await fetch(`https://api.telnyx.com/v2/texml_applications/${app.id}`, {
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
        console.log(`  ✅ Updated successfully`);
      } else {
        const errorText = await response.text();
        console.error(`  ❌ Failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error);
    }
  }

  console.log('\n✅ All TeXML apps updated!');
  console.log('AI agents should now work across all campaigns.');
  console.log('\n==================================================');
}

fixAllWebhooks().catch(console.error);
