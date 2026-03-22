import 'dotenv/config';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;

if (!TELNYX_API_KEY) {
  console.log('TELNYX_API_KEY not found');
  process.exit(1);
}

async function discover() {
  // 1. Find TeXML Application ending in 64
  console.log('--- TeXML Applications ---');
  const appsRes = await fetch('https://api.telnyx.com/v2/texml_applications', {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  const appsData = await appsRes.json();
  const targetApp = appsData.data?.find((app: any) => app.id.endsWith('64'));
  if (targetApp) {
      console.log(`FOUND TARGET APP: ${targetApp.friendly_name} (${targetApp.id})`);
  } else {
      console.log('Target App ending in 64 NOT FOUND. Listing all:');
      appsData.data?.forEach((app: any) => console.log(`- ${app.friendly_name}: ${app.id}`));
  }

  // 2. Find Billing Groups
  console.log('\n--- Billing Groups ---');
  const billingRes = await fetch('https://api.telnyx.com/v2/billing_groups', {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  const billingData = await billingRes.json();
  if (billingData.data) {
      billingData.data.forEach((bg: any) => console.log(`- ${bg.name}: ${bg.id}`));
  } else {
      console.log('No billing groups found or error fetching.');
  }

  // 3. Find Phone Numbers (and check which one looks new or unconfigured)
  console.log('\n--- Phone Numbers ---');
  const numsRes = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=100', {
    headers: { 'Authorization': `Bearer ${TELNYX_API_KEY}` }
  });
  const numsData = await numsRes.json();
  
  if (numsData.data) {
      numsData.data.forEach((num: any) => {
          console.log(`\nPhone: ${num.phone_number}`);
          console.log(`  ID: ${num.id}`);
          console.log(`  Connection: ${num.connection_id}`);
          console.log(`  Billing Group: ${num.billing_group_id}`);
          console.log(`  CNAM: ${JSON.stringify(num.cnam_listing)}`);
      });
  }
}

discover().catch(console.error);