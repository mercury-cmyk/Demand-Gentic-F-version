
import { pool } from './server/db';

async function listDispositions() {
  const campaignId = '664aff97-ac3c-4fbb-a943-9b123ddb3fda'; // RingCentral Campaign

  console.log(`Checking dispositions for campaign: ${campaignId}`);

  try {
    const result = await pool.query(`
      SELECT 
        ai_disposition,
        COUNT(*) as count
      FROM call_sessions
      WHERE campaign_id = $1
      GROUP BY ai_disposition
      ORDER BY count DESC
    `, [campaignId]);

    console.log('\nDispositions Found:');
    result.rows.forEach(row => {
      console.log(`${row.ai_disposition}: ${row.count}`);
    });

  } catch (error) {
    console.error('Error fetching dispositions:', error);
  } finally {
    await pool.end();
  }
}

listDispositions();
