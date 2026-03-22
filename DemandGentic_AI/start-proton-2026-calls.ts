import { db } from './server/db';

(async () => {
  try {
    // Find Proton 2026 campaign
    const campaignResult = await db.execute(`
      SELECT id, name, status, dial_mode
      FROM campaigns
      WHERE name ILIKE '%proton%2026%' OR name ILIKE '%proton 2026%'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (campaignResult.rows.length === 0) {
      console.log('❌ No campaign found matching "Proton 2026"');
      console.log('\nSearching for any campaigns with "proton" in the name...\n');
      
      const allProtonCampaigns = await db.execute(`
        SELECT id, name, status, dial_mode, created_at
        FROM campaigns
        WHERE name ILIKE '%proton%'
        ORDER BY created_at DESC
      `);
      
      if (allProtonCampaigns.rows.length > 0) {
        console.log('Found campaigns:');
        allProtonCampaigns.rows.forEach((c: any, i: number) => {
          console.log(`${i + 1}. ${c.name} (ID: ${c.id}) - Status: ${c.status} - Mode: ${c.dial_mode || 'N/A'}`);
        });
      } else {
        console.log('No campaigns found with "proton" in the name.');
      }
      process.exit(1);
    }

    const campaign = campaignResult.rows[0] as any;
    console.log('\n✅ Found Campaign:');
    console.log(`   Name: ${campaign.name}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Dial Mode: ${campaign.dial_mode || 'manual'}\n`);

    // Check queue
    const queueResult = await db.execute(`
      SELECT COUNT(*) as total
      FROM campaign_queue
      WHERE campaign_id = '${campaign.id}'
    `);

    const queueCount = parseInt(queueResult.rows[0].total as string);
    console.log(`📋 Queue Status: ${queueCount} contacts in queue\n`);

    if (queueCount === 0) {
      console.log('⚠️  Queue is empty. Add contacts to the queue first.');
      process.exit(1);
    }

    // Check if campaign is active
    if (campaign.status !== 'active') {
      console.log(`⚠️  Campaign status is "${campaign.status}". Setting to "active"...`);
      await db.execute(`
        UPDATE campaigns 
        SET status = 'active', updated_at = NOW()
        WHERE id = '${campaign.id}'
      `);
      console.log('✅ Campaign activated\n');
    }

    // Check dial mode
    if (campaign.dial_mode !== 'ai_agent' && campaign.dial_mode !== 'hybrid') {
      console.log(`⚠️  Campaign dial mode is "${campaign.dial_mode || 'manual'}"`);
      console.log('   For AI calls, dial_mode should be "ai_agent" or "hybrid"');
      console.log('   Would you like to update it? (Update manually via UI or database)\n');
    }

    console.log('🚀 Starting AI Calls...\n');
    
    // Trigger auto-dialer by calling the orchestrator endpoint
    const response = await fetch('http://localhost:5000/api/auto-dialer/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaignId: campaign.id,
        mode: campaign.dial_mode || 'ai_agent'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Auto-dialer triggered successfully');
      console.log('   Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('⚠️  Auto-dialer trigger failed:', response.status, response.statusText);
      console.log('\nAlternative: The auto-dialer should start automatically if:');
      console.log('  1. Campaign status = "active"');
      console.log('  2. Queue has pending contacts');
      console.log('  3. Server is running (npm run dev)');
    }

    console.log('\n📊 Monitor calls with: npx tsx check-ai-call-logs.ts');
    console.log('🔄 Check queue status via the campaign UI\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();