import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function verifyCampaignVoices() {
  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION: All Campaigns Voice Assignment');
  console.log('='.repeat(80) + '\n');

  const campaigns = await db.execute(sql`
    SELECT id, name, status, assigned_voices
    FROM campaigns
    ORDER BY name
  `) as any;

  for (const campaign of campaigns.rows) {
    const voices = campaign.assigned_voices as any;
    const voicesList = Array.isArray(voices) && voices.length > 0 
      ? voices.map((v: any) => v.name).join(', ')
      : 'NONE';
    
    const status = voicesList === 'NONE' ? '❌' : '✅';
    console.log(`${status} ${campaign.name}`);
    console.log(`   Voices: ${voicesList}`);
    console.log(`   Status: ${campaign.status}\n`);
  }

  console.log('='.repeat(80) + '\n');
  process.exit(0);
}

verifyCampaignVoices().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});