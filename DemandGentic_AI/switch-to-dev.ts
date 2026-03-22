import { env } from './server/env';

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

// Helper to fetch tunnel URL from ngrok local API
async function getNgrokUrl() {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (!res.ok) return null;
    const data: any = await res.json();
    const tunnel = data.tunnels.find((t: any) => t.proto === 'https');
    return tunnel ? tunnel.public_url : null;
  } catch (e) {
    return null;
  }
}

async function switchToDev() {
  const apiKey = env.TELNYX_API_KEY;
  const texmlAppId = env.TELNYX_TEXML_APP_ID;
  const callControlAppId = env.TELNYX_CALL_CONTROL_APP_ID;
  
  // Try to get dynamic ngrok URL first, fallback to hardcoded
  const dynamicNgrokUrl = await getNgrokUrl();
  const ngrokUrl = dynamicNgrokUrl || 'https://steve-unbalking-guessingly.ngrok-free.dev';

  if (dynamicNgrokUrl) {
    console.log(`✅ Detected active ngrok tunnel: ${dynamicNgrokUrl}`);
  } else {
    console.log(`⚠️  No active ngrok tunnel found via API, using fallback: ${ngrokUrl}`);
  }

  if (!apiKey) {
    console.error('Missing TELNYX_API_KEY');
    process.exit(1);
  }

  console.log('=== Switching ALL Telnyx webhooks to DEV mode ===\n');

  // 1. Update TeXML Application (AI Calls)
  if (texmlAppId) {
    console.log('1. Updating TeXML Application (AI Calls)...');
    const texmlVoiceUrl = `${ngrokUrl}/api/texml/ai-call`;
    const texmlStatusUrl = `${ngrokUrl}/api/webhooks/telnyx`;

    console.log(`   Voice URL: ${texmlVoiceUrl}`);
    console.log(`   Status Callback: ${texmlStatusUrl}`);

    const texmlResponse = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voice_url: texmlVoiceUrl,
        status_callback: texmlStatusUrl,
        status_callback_url: texmlStatusUrl,
      }),
    });

    if (!texmlResponse.ok) {
      const errorText = await texmlResponse.text();
      console.error('   ❌ Failed:', texmlResponse.status, errorText);
    } else {
      const data = await texmlResponse.json();
      console.log(`   ✅ TeXML App updated: ${data.data.friendly_name}`);
    }
  } else {
    console.log('1. ⚠️  TELNYX_TEXML_APP_ID not set - skipping TeXML app');
  }

  // 2. Update Call Control Application
  if (callControlAppId) {
    console.log('\n2. Updating Call Control Application...');
    const callControlWebhookUrl = `${ngrokUrl}/api/webhooks/telnyx`;

    console.log(`   Webhook URL: ${callControlWebhookUrl}`);

    const ccResponse = await fetch(`${TELNYX_API_BASE}/call_control_applications/${callControlAppId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_event_url: callControlWebhookUrl,
        webhook_event_failover_url: callControlWebhookUrl,
      }),
    });

    if (!ccResponse.ok) {
      const errorText = await ccResponse.text();
      console.error('   ❌ Failed:', ccResponse.status, errorText);
    } else {
      const data = await ccResponse.json();
      console.log(`   ✅ Call Control App updated: ${data.data.application_name}`);
    }
  } else {
    console.log('\n2. ⚠️  TELNYX_CALL_CONTROL_APP_ID not set - skipping Call Control app');
  }

  // 3. List all TeXML applications to show current state
  console.log('\n3. Listing all TeXML Applications...');
  const texmlListResponse = await fetch(`${TELNYX_API_BASE}/texml_applications`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (texmlListResponse.ok) {
    const texmlList = await texmlListResponse.json();
    console.log(`   Found ${texmlList.data.length} TeXML app(s):`);
    for (const app of texmlList.data) {
      const isCurrent = app.id === texmlAppId ? ' (CURRENT)' : '';
      console.log(`   - ${app.friendly_name}${isCurrent}`);
      console.log(`     ID: ${app.id}`);
      console.log(`     Voice URL: ${app.voice_url}`);
      console.log(`     Status Callback: ${app.status_callback}`);
    }
  }

  // 4. List all Call Control applications
  console.log('\n4. Listing all Call Control Applications...');
  const ccListResponse = await fetch(`${TELNYX_API_BASE}/call_control_applications`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (ccListResponse.ok) {
    const ccList = await ccListResponse.json();
    console.log(`   Found ${ccList.data.length} Call Control app(s):`);
    for (const app of ccList.data) {
      const isCurrent = app.id === callControlAppId ? ' (CURRENT)' : '';
      console.log(`   - ${app.application_name}${isCurrent}`);
      console.log(`     ID: ${app.id}`);
      console.log(`     Webhook URL: ${app.webhook_event_url}`);
    }
  }

  console.log('\n=== Done! All webhooks switched to DEV (ngrok) ===');
  process.exit(0);
}

switchToDev();