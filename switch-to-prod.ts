import { env } from './server/env';

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

async function switchToProd() {
  const apiKey = env.TELNYX_API_KEY;
  const prodUrl = 'https://demandgentic.ai';

  // Production app IDs
  const texmlAppIdProd = '2879011868305786305';  // DEmandGentic Production
  const callControlAppIdProd = '2879013346110080480';  // DemandGentic Production API

  if (!apiKey) {
    console.error('Missing TELNYX_API_KEY');
    process.exit(1);
  }

  console.log('=== Switching ALL Telnyx webhooks to PRODUCTION mode ===\n');

  // 1. Update TeXML Application (Production)
  console.log('1. Updating TeXML Application (Production)...');
  const texmlVoiceUrl = `${prodUrl}/api/texml/ai-call`;
  const texmlStatusUrl = `${prodUrl}/api/webhooks/telnyx`;

  console.log(`   Voice URL: ${texmlVoiceUrl}`);
  console.log(`   Status Callback: ${texmlStatusUrl}`);

  const texmlResponse = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppIdProd}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      voice_url: texmlVoiceUrl,
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

  // 2. Update Call Control Application (Production)
  console.log('\n2. Updating Call Control Application (Production)...');
  const callControlWebhookUrl = `${prodUrl}/api/webhooks/telnyx`;

  console.log(`   Webhook URL: ${callControlWebhookUrl}`);

  const ccResponse = await fetch(`${TELNYX_API_BASE}/call_control_applications/${callControlAppIdProd}`, {
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
      const isCurrent = app.id === texmlAppIdProd ? ' (PRODUCTION)' : '';
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
      const isCurrent = app.id === callControlAppIdProd ? ' (PRODUCTION)' : '';
      console.log(`   - ${app.application_name}${isCurrent}`);
      console.log(`     ID: ${app.id}`);
      console.log(`     Webhook URL: ${app.webhook_event_url}`);
    }
  }

  console.log('\n=== Done! All webhooks switched to PRODUCTION ===');
  process.exit(0);
}

switchToProd();
