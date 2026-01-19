
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function updateCampaignsToGoogle() {
  console.log('Updating all campaigns to use Google/Gemini Live provider...\n');

  try {
    // First, check current provider settings
    const currentResult = await db.execute(sql`
      SELECT id, name, voice_provider
      FROM campaigns
      WHERE voice_provider IS NOT NULL AND voice_provider != 'google'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    console.log(`Found ${currentResult.rows.length} campaigns with non-Google providers:\n`);
    for (const row of currentResult.rows) {
      console.log(`  - ${row.name}: ${row.voice_provider}`);
    }

    // Update all campaigns to use Google
    const updateResult = await db.execute(sql`
      UPDATE campaigns
      SET voice_provider = 'google'
      WHERE voice_provider IS NOT NULL AND voice_provider != 'google'
    `);

    console.log(`\n✅ Updated campaigns to use Google/Gemini Live provider`);

    // Verify the update
    const verifyResult = await db.execute(sql`
      SELECT voice_provider, COUNT(*) as count
      FROM campaigns
      GROUP BY voice_provider
    `);

    console.log('\nProvider distribution after update:');
    for (const row of verifyResult.rows) {
      console.log(`  - ${row.voice_provider || 'NULL (will use default)'}: ${row.count} campaigns`);
    }

  } catch (error) {
    console.error('Error updating campaigns:', error);
  }

  process.exit(0);
}

updateCampaignsToGoogle();
