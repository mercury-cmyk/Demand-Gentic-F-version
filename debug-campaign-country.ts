
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function debugCampaign() {
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';
  console.log(`Checking campaign: ${campaignId}`);

  try {
    // Check queue items and their countries
    const queueResult = await db.execute(sql`
      SELECT
        q.id as queue_id,
        q.status,
        c.id as contact_id,
        c.country,
        c.first_name,
        c.last_name
      FROM campaign_queue q
      LEFT JOIN contacts c ON q.contact_id = c.id
      WHERE q.campaign_id = ${campaignId}
      AND q.status = 'queued'
      LIMIT 20
    `);
    const queueItems = queueResult.rows;

    console.log(`Found ${queueItems.length} queued items.`);
    if (queueItems.length > 0) {
      console.log('Sample items:', JSON.stringify(queueItems, null, 2));
    }

    // specific check for countries
    const countriesResult = await db.execute(sql`
      SELECT DISTINCT c.country
      FROM campaign_queue q
      JOIN contacts c ON q.contact_id = c.id
      WHERE q.campaign_id = ${campaignId}
      AND q.status = 'queued'
    `);

    console.log('Distinct countries in queue:', JSON.stringify(countriesResult.rows, null, 2));

  } catch (error) {
    console.error("Error querying DB:", error);
  }
  process.exit(0);
}

debugCampaign();
