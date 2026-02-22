import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function diagnoseTestAllCampaign() {
  console.log('='.repeat(80));
  console.log('DIAGNOSING: Test All Call Campaign');
  console.log('='.repeat(80));
  
  // Find "test all" campaign
  const campaignQuery = await db.execute(sql`
    SELECT id, name, status, dial_mode, assigned_voices, ai_agent_settings
    FROM campaigns
    WHERE LOWER(name) LIKE '%test%all%' OR LOWER(name) LIKE '%test all%'
    LIMIT 5
  `) as any;
  
  if (campaignQuery.rows.length === 0) {
    console.log('\n❌ No "test all" campaign found. Showing all campaigns:\n');
    const allCampaigns = await db.execute(sql`
      SELECT id, name, status, dial_mode
      FROM campaigns
      ORDER BY created_at DESC
      LIMIT 10
    `) as any;
    
    for (const c of allCampaigns.rows) {
      console.log(`📋 ${c.name} (${c.id})`);
      console.log(`   Status: ${c.status} | Mode: ${c.dial_mode}`);
    }
    return;
  }
  
  for (const campaign of campaignQuery.rows) {
    console.log(`\n📋 Found Campaign: ${campaign.name}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Dial Mode: ${campaign.dial_mode}`);
    
    // Check assigned voices
    console.log(`\n🎙️ Assigned Voices:`);
    if (campaign.assigned_voices && Array.isArray(campaign.assigned_voices) && campaign.assigned_voices.length > 0) {
      for (const voice of campaign.assigned_voices) {
        console.log(`   ✅ ${voice.name} (ID: ${voice.id})`);
      }
    } else {
      console.log(`   ❌ NO VOICES ASSIGNED - This is likely the cause of silent calls!`);
    }
    
    // Check AI Agent Settings
    console.log(`\n⚙️ AI Agent Settings:`);
    if (campaign.ai_agent_settings) {
      const settings = campaign.ai_agent_settings as any;
      if (settings.persona) {
        console.log(`   Persona: ${settings.persona.name || 'NOT SET'}`);
        console.log(`   Persona Voice: ${settings.persona.voice || 'NOT SET'}`);
      }
    } else {
      console.log(`   ❌ No AI Agent Settings configured`);
    }
    
    // Check contacts
    const contactStats = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN account_id IS NOT NULL THEN 1 END) as with_account,
        COUNT(CASE WHEN account_id IS NULL THEN 1 END) as without_account
      FROM contacts
      WHERE id IN (
        SELECT contact_id FROM campaign_queue WHERE campaign_id = ${campaign.id}
      )
    `) as any;
    
    const stats = contactStats.rows[0] as any;
    console.log(`\n👥 Contact Statistics:`);
    console.log(`   Total contacts: ${stats.total}`);
    console.log(`   ✅ With account_id: ${stats.with_account}`);
    console.log(`   ❌ WITHOUT account_id: ${stats.without_account}`);
    
    if (stats.without_account > 0) {
      console.log(`   ⚠️  WARNING: ${stats.without_account} contacts missing account_id → May cause SILENT CALLS`);
    }
    
    // Sample some queued contacts
    const sampleContacts = await db.execute(sql`
      SELECT 
        c.id,
        c.first_name,
        c.last_name,
        c.account_id,
        a.name as account_name,
        cq.status as queue_status
      FROM campaign_queue cq
      JOIN contacts c ON c.id = cq.contact_id
      LEFT JOIN accounts a ON a.id = c.account_id
      WHERE cq.campaign_id = ${campaign.id}
      LIMIT 3
    `) as any;
    
    if (sampleContacts.rows.length > 0) {
      console.log(`\n📞 Sample Queued Contacts:`);
      for (const c of sampleContacts.rows) {
        console.log(`   • ${c.first_name} ${c.last_name}`);
        if (c.account_id) {
          console.log(`     ✅ Account: ${c.account_name || c.account_id}`);
        } else {
          console.log(`     ❌ Account: MISSING`);
        }
      }
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  process.exit(0);
}

diagnoseTestAllCampaign().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
