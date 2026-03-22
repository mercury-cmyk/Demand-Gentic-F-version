import { pool } from "./server/db";

async function findCampaignRecordings() {
  console.log("========================================");
  console.log("CAMPAIGN RECORDINGS SEARCH");
  console.log("========================================\n");

  // Check campaigns with calls
  const campaignsResult = await pool.query(`
    SELECT DISTINCT
      c.id,
      c.name,
      c.type,
      c.status,
      c.created_at,
      COUNT(l.id) as lead_count,
      COUNT(CASE WHEN l.recording_url IS NOT NULL THEN 1 END) as leads_with_recordings,
      COUNT(CASE WHEN l.transcript IS NOT NULL AND LENGTH(l.transcript) > 50 THEN 1 END) as leads_with_transcripts
    FROM campaigns c
    LEFT JOIN leads l ON l.campaign_id = c.id
    WHERE c.created_at >= '2026-01-15'
      AND c.type = 'call'
    GROUP BY c.id, c.name, c.type, c.status, c.created_at
    ORDER BY c.created_at DESC
  `);

  console.log(`Found ${campaignsResult.rows.length} call campaigns since Jan 15\n`);
  
  for (const campaign of campaignsResult.rows) {
    console.log(`Campaign: ${campaign.name}`);
    console.log(`  ID: ${campaign.id}`);
    console.log(`  Status: ${campaign.status}`);
    console.log(`  Created: ${campaign.created_at}`);
    console.log(`  Total leads: ${campaign.lead_count}`);
    console.log(`  With recordings: ${campaign.leads_with_recordings}`);
    console.log(`  With transcripts: ${campaign.leads_with_transcripts}`);
    console.log('');
  }

  // Get all recordings from these campaigns
  console.log("========================================");
  console.log("ALL RECORDINGS FROM CAMPAIGNS");
  console.log("========================================\n");

  const recordingsResult = await pool.query(`
    SELECT 
      l.id,
      l.contact_name,
      l.dialed_number,
      l.call_duration,
      l.recording_url,
      l.recording_s3_key,
      l.transcript IS NOT NULL as has_transcript,
      LENGTH(l.transcript) as transcript_length,
      c.name as campaign_name,
      l.created_at,
      l.updated_at
    FROM leads l
    JOIN campaigns c ON l.campaign_id = c.id
    WHERE l.recording_url IS NOT NULL
      AND l.created_at >= '2026-01-15'
    ORDER BY l.updated_at DESC
    LIMIT 50
  `);

  console.log(`Found ${recordingsResult.rows.length} leads with recordings\n`);

  for (const rec of recordingsResult.rows) {
    console.log(`ID: ${rec.id}`);
    console.log(`  Campaign: ${rec.campaign_name}`);
    console.log(`  Contact: ${rec.contact_name} (${rec.dialed_number})`);
    console.log(`  Duration: ${rec.call_duration}s`);
    console.log(`  Transcript: ${rec.has_transcript ? `${rec.transcript_length} chars` : 'NO'}`);
    console.log(`  Recording URL: ${rec.recording_url ? 'YES' : 'NO'}`);
    console.log(`  S3 Key: ${rec.recording_s3_key || 'NOT STORED'}`);
    console.log('');
  }

  // Check for any table with recent recordings
  console.log("========================================");
  console.log("ALL LEADS WITH RECORDINGS (ANY SOURCE)");
  console.log("========================================\n");

  const allResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN recording_url IS NOT NULL THEN 1 END) as with_url,
      COUNT(CASE WHEN recording_s3_key IS NOT NULL THEN 1 END) as with_s3_key,
      COUNT(CASE WHEN transcript IS NOT NULL AND LENGTH(transcript) > 50 THEN 1 END) as with_transcript
    FROM leads
    WHERE created_at >= '2026-01-15'
      AND call_duration > 0
  `);

  const stats = allResult.rows[0];
  console.log(`Total calls: ${stats.total}`);
  console.log(`With recording URLs: ${stats.with_url}`);
  console.log(`With S3 keys (stored): ${stats.with_s3_key}`);
  console.log(`With transcripts: ${stats.with_transcript}`);

  process.exit(0);
}

findCampaignRecordings().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});