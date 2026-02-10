
import { db } from './server/db';
import { clientAccounts } from './shared/schema';
import { eq } from 'drizzle-orm';
import { isFeatureEnabled } from './server/feature-flags';

async function checkArgyleSetup() {
  console.log('--- Checking Environment ---');
  console.log('FEATURE_FLAGS env var:', process.env.FEATURE_FLAGS);
  console.log('Is "argyle_event_drafts" enabled?', isFeatureEnabled('argyle_event_drafts'));

  console.log('\n--- Checking Database ---');
  const clients = await db.select().from(clientAccounts);
  console.log(`Found ${clients.length} client accounts.`);

  const argyle = clients.find(c => c.name === 'Argyle');
  if (argyle) {
    console.log('✅ Found client account "Argyle" with ID:', argyle.id);
  } else {
    console.log('❌ Client account "Argyle" NOT found.');
    const similar = clients.filter(c => c.name.toLowerCase().includes('argyle'));
    if (similar.length > 0) {
      console.log('Found similar accounts:', similar.map(c => c.name));
    }
  }
}

checkArgyleSetup().catch(console.error).finally(() => process.exit(0));
