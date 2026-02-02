/**
 * Quick check on disposition status after reanalysis
 */

import { pool } from './server/db';

async function checkStatus() {
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121';

  const result = await pool.query(`
    SELECT 
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE campaign_id = $1
    GROUP BY ai_disposition
    ORDER BY count DESC
  `, [campaignId]);

  console.log('📊 CURRENT DISPOSITION COUNTS:');
  for (const row of result.rows as any[]) {
    console.log(`  ${row.ai_disposition || 'NULL'}: ${row.count}`);
  }

  // Check needs_review
  const needsReview = await pool.query(`
    SELECT id, ai_transcript
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_disposition = 'needs_review'
    LIMIT 5
  `, [campaignId]);

  console.log(`\n📝 needs_review sessions: ${needsReview.rows.length}`);
  for (const row of needsReview.rows as any[]) {
    console.log(`  - ${row.id}`);
  }

  await pool.end();
  process.exit(0);
}

checkStatus().catch(console.error);
