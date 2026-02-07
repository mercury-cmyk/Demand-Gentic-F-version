/**
 * Check campaigns voice configuration
 */
import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkCampaigns() {
  console.log('=== CHECKING CAMPAIGN VOICE CONFIGURATION ===\n');
  
  const allCampaigns = await db.execute(sql`
    SELECT id, name, status, virtual_agent_id, voice_settings 
    FROM campaigns
  `) as any;
  
  for (const c of allCampaigns.rows) {
    console.log('━'.repeat(60));
    console.log(`Campaign: ${c.name}`);
    console.log(`ID: ${c.id}`);
    console.log(`Status: ${c.status}`);
    console.log(`Virtual Agent ID: ${c.virtual_agent_id || 'NOT SET'}`);
    
    const voiceSettings = c.voice_settings as any;
    if (voiceSettings) {
      console.log('Voice Settings:');
      console.log(`  - Voice: ${voiceSettings.voice || 'NOT SET'}`);
      console.log(`  - Provider: ${voiceSettings.provider || 'NOT SET'}`);
    } else {
      console.log('Voice Settings: NOT SET');
    }
    
    if (c.virtual_agent_id) {
      const agentResult = await db.execute(sql`
        SELECT id, name, voice, settings FROM virtual_agents WHERE id = ${c.virtual_agent_id}
      `) as any;
      const agent = agentResult.rows[0];
      if (agent) {
        console.log(`\nLinked Virtual Agent:`);
        console.log(`  - Name: ${agent.name}`);
        console.log(`  - Voice: ${agent.voice || 'NOT SET'}`);
        const settings = agent.settings as any;
        if (settings?.persona) {
          console.log(`  - Persona Name: ${settings.persona.name || 'NOT SET'}`);
          console.log(`  - Persona Voice: ${settings.persona.voice || 'NOT SET'}`);
        }
        if (settings?.scripts) {
          console.log(`  - Has Opening Script: ${settings.scripts.opening ? 'YES' : 'NO'}`);
          console.log(`  - Has System Prompt: ${settings.scripts.systemPrompt ? 'YES' : 'NO'}`);
        }
      } else {
        console.log(`\n⚠️  Virtual Agent ${c.virtual_agent_id} NOT FOUND!`);
      }
    } else {
      console.log('\n⚠️  No Virtual Agent linked to this campaign');
    }
    console.log('');
  }
  
  console.log('━'.repeat(60));
  process.exit(0);
}

checkCampaigns().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
