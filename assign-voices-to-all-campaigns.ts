import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function assignVoicesToAllCampaigns() {
  console.log('='.repeat(80));
  console.log('ASSIGNING VOICES TO ALL CAMPAIGNS');
  console.log('='.repeat(80));

  // Default voices for campaigns (professional, B2B-friendly selection)
  const defaultVoices = [
    { id: 'Kore', name: 'Kore' },           // Firm, Professional
    { id: 'Fenrir', name: 'Fenrir' },       // Excitable, Energetic
    { id: 'Charon', name: 'Charon' },       // Informative, Authoritative
    { id: 'Aoede', name: 'Aoede' },         // Breezy, Friendly
  ];

  // Find all campaigns without voices
  const campaignsWithoutVoices = await db.execute(sql`
    SELECT id, name, assigned_voices
    FROM campaigns
    WHERE assigned_voices IS NULL OR 
          assigned_voices::text = '[]' OR 
          assigned_voices::text = 'null'
    ORDER BY name
  `) as any;

  console.log(`\n📋 Found ${campaignsWithoutVoices.rows.length} campaigns without voices\n`);

  if (campaignsWithoutVoices.rows.length === 0) {
    console.log('✅ All campaigns already have voices assigned!');
    process.exit(0);
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < campaignsWithoutVoices.rows.length; i++) {
    const campaign = campaignsWithoutVoices.rows[i];
    
    // Cycle through voices for variety
    const voicesToAssign = defaultVoices.slice(0, Math.min(2, defaultVoices.length));
    
    console.log(`\n⏳ [${i + 1}/${campaignsWithoutVoices.rows.length}] ${campaign.name}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Assigning: ${voicesToAssign.map(v => v.name).join(', ')}`);

    try {
      // Update campaign with voices
      await db.execute(sql`
        UPDATE campaigns
        SET assigned_voices = ${JSON.stringify(voicesToAssign)}::jsonb
        WHERE id = ${campaign.id}
      `);
      console.log(`   ✅ Updated`);
      updated++;
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RESULTS`);
  console.log(`${'='.repeat(80)}`);
  console.log(`✅ Updated: ${updated}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\n🎙️  Assigned Voices (default rotation):`);
  for (const voice of defaultVoices) {
    console.log(`   • ${voice.name}`);
  }
  console.log('');

  process.exit(0);
}

assignVoicesToAllCampaigns().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
