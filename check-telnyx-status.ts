import 'dotenv/config';
import { env } from './server/env';

async function checkTelnyxConfig() {
  const apiKey = process.env.TELNYX_API_KEY; // Use process.env directly to be sure
  const texmlAppId = process.env.TELNYX_TEXML_APP_ID;
  const callControlAppId = process.env.TELNYX_CALL_CONTROL_APP_ID;

  console.log('--- Environment Check ---');
  console.log(`TELNYX_API_KEY: ${apiKey ? 'Set' : 'Missing'}`);
  console.log(`TELNYX_TEXML_APP_ID: ${texmlAppId}`);
  console.log(`TELNYX_CALL_CONTROL_APP_ID: ${callControlAppId}`);

  if (!apiKey) {
    console.error('❌ Critical: TELNYX_API_KEY is missing');
    return;
  }

  const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

  console.log('\n--- API Check: TeXML Application ---');
  if (texmlAppId) {
    try {
        const res = await fetch(`${TELNYX_API_BASE}/texml_applications/${texmlAppId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            console.log('✅ Found TeXML App:', data.data.friendly_name);
            console.log('   ID:', data.data.id);
            console.log('   Voice URL:', data.data.voice_url);
            console.log('   Status Callback:', data.data.status_callback);
        } else {
            console.error(`❌ Failed to fetch TeXML App ${texmlAppId}:`, res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Network error fetching TeXML App:', e);
    }
  } else {
      console.log('⚠️ No TeXML App ID configured to check.');
  }

  console.log('\n--- API Check: Call Control Application ---');
  if (callControlAppId) {
    try {
        const res = await fetch(`${TELNYX_API_BASE}/call_control_applications/${callControlAppId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            console.log('✅ Found Call Control App:', data.data.application_name);
            console.log('   Webhook Event URL:', data.data.webhook_event_url);
        } else {
            console.error(`❌ Failed to fetch Call Control App ${callControlAppId}:`, res.status, await res.text());
        }
    } catch (e) {
        console.error('❌ Network error fetching Call Control App:', e);
    }
  } else {
      console.log('⚠️ No Call Control App ID configured to check.');
  }
}

checkTelnyxConfig().catch(console.error);
