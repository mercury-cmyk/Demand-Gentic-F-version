import { db } from './server/db';
import { sipTrunkConfigs } from './shared/schema';
import { eq } from 'drizzle-orm';

const username = process.env.TELNYX_SIP_USERNAME;
const password = process.env.TELNYX_SIP_PASSWORD;

if (!username || !password) {
  console.error('Missing Telnyx credentials');
  process.exit(1);
}

async function updateSipTrunk() {
  try {
    const result = await db.update(sipTrunkConfigs)
      .set({ 
        sipUsername: username!, 
        sipPassword: password!,
        updatedAt: new Date()
      })
      .where(eq(sipTrunkConfigs.isDefault, true))
      .returning();
    
    console.log('SIP trunk updated successfully:', result[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error updating SIP trunk:', err);
    process.exit(1);
  }
}

updateSipTrunk();
