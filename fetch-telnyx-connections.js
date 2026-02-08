import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.log('TELNYX_API_KEY not found in environment');
  process.exit(1);
}

console.log('Fetching Telnyx connections and apps...\n');

async function fetchConnections() {
  // Fetch Call Control Applications
  console.log('========== CALL CONTROL APPLICATIONS ==========');
  try {
    const appsResponse = await fetch('https://api.telnyx.com/v2/call_control_applications', {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (appsResponse.ok) {
      const appsData = await appsResponse.json();
      const apps = appsData.data || [];
      console.log(`Found ${apps.length} Call Control Applications:\n`);
      apps.forEach((app, i) => {
        console.log(`${i+1}. ${app.application_name}`);
        console.log(`   ID: ${app.id}`);
        console.log(`   Webhook URL: ${app.webhook_event_url || 'N/A'}`);
        console.log(`   Active: ${app.active}`);
        console.log('');
      });
    } else {
      console.log('Error fetching apps:', appsResponse.status);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }

  // Fetch Credentials Connections (SIP)
  console.log('\n========== CREDENTIAL CONNECTIONS (SIP) ==========');
  try {
    const connResponse = await fetch('https://api.telnyx.com/v2/credential_connections', {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (connResponse.ok) {
      const connData = await connResponse.json();
      const connections = connData.data || [];
      console.log(`Found ${connections.length} Credential Connections:\n`);
      connections.forEach((conn, i) => {
        console.log(`${i+1}. ${conn.connection_name}`);
        console.log(`   ID: ${conn.id}`);
        console.log(`   Active: ${conn.active}`);
        console.log('');
      });
    } else {
      console.log('Error fetching credential connections:', connResponse.status);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }

  // Fetch FQDN Connections
  console.log('\n========== FQDN CONNECTIONS ==========');
  try {
    const fqdnResponse = await fetch('https://api.telnyx.com/v2/fqdn_connections', {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (fqdnResponse.ok) {
      const fqdnData = await fqdnResponse.json();
      const connections = fqdnData.data || [];
      console.log(`Found ${connections.length} FQDN Connections:\n`);
      connections.forEach((conn, i) => {
        console.log(`${i+1}. ${conn.connection_name}`);
        console.log(`   ID: ${conn.id}`);
        console.log(`   Active: ${conn.active}`);
        console.log('');
      });
    } else {
      console.log('Error fetching FQDN connections:', fqdnResponse.status);
    }
  } catch (err) {
    console.log('Error:', err.message);
  }

  // Show current env config
  console.log('\n========== YOUR CURRENT .env CONFIG ==========');
  console.log(`TELNYX_CONNECTION_ID: ${process.env.TELNYX_CONNECTION_ID || 'NOT SET'}`);
  console.log(`TELNYX_CALL_CONTROL_APP_ID: ${process.env.TELNYX_CALL_CONTROL_APP_ID || 'NOT SET'}`);
  console.log(`TELNYX_TEXML_APP_ID: ${process.env.TELNYX_TEXML_APP_ID || 'NOT SET'}`);
  console.log(`TELNYX_SIP_CONNECTION_ID: ${process.env.TELNYX_SIP_CONNECTION_ID || 'NOT SET'}`);
  console.log(`TELNYX_FROM_NUMBER: ${process.env.TELNYX_FROM_NUMBER || 'NOT SET'}`);
}

fetchConnections().catch(console.error);
