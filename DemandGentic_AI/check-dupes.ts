import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Count duplicates before cleanup
  const beforeStats = await pool.query(`
    WITH dupes AS (
      SELECT id, to_number_e164, from_number, started_at, recording_url,
             ROW_NUMBER() OVER (
               PARTITION BY to_number_e164, from_number, date_trunc('minute', started_at)
               ORDER BY 
                 CASE WHEN campaign_id IS NOT NULL THEN 0 ELSE 1 END, -- prefer rows with campaign_id
                 CASE WHEN contact_id IS NOT NULL THEN 0 ELSE 1 END,  -- prefer rows with contact_id
                 CASE WHEN telnyx_call_id IS NOT NULL THEN 0 ELSE 1 END, -- prefer rows with telnyx_call_id
                 CASE WHEN recording_s3_key IS NOT NULL THEN 0 ELSE 1 END, -- prefer rows with S3 key
                 created_at ASC -- keep oldest
             ) as rn
      FROM call_sessions
      WHERE recording_url IS NOT NULL
    )
    SELECT 
      COUNT(*) FILTER (WHERE rn > 1) as duplicates_to_delete,
      COUNT(*) FILTER (WHERE rn = 1) as records_to_keep,
      COUNT(*) as total
    FROM dupes
  `);
  console.log('=== BEFORE CLEANUP ===');
  console.log(beforeStats.rows[0]);

  // Delete duplicates keeping the best record (with campaign/contact data, or oldest)
  const deleteResult = await pool.query(`
    WITH dupes AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY to_number_e164, from_number, date_trunc('minute', started_at)
               ORDER BY 
                 CASE WHEN campaign_id IS NOT NULL THEN 0 ELSE 1 END,
                 CASE WHEN contact_id IS NOT NULL THEN 0 ELSE 1 END,
                 CASE WHEN telnyx_call_id IS NOT NULL THEN 0 ELSE 1 END,
                 CASE WHEN recording_s3_key IS NOT NULL THEN 0 ELSE 1 END,
                 created_at ASC
             ) as rn
      FROM call_sessions
      WHERE recording_url IS NOT NULL
    )
    DELETE FROM call_sessions
    WHERE id IN (SELECT id FROM dupes WHERE rn > 1)
  `);
  console.log('\n=== CLEANUP RESULT ===');
  console.log('Deleted rows:', deleteResult.rowCount);

  // Verify
  const afterStats = await pool.query(`
    SELECT 
      COUNT(*) as total_with_recording,
      COUNT(DISTINCT recording_url) as unique_urls
    FROM call_sessions
    WHERE recording_url IS NOT NULL
  `);
  const afterDupeGroups = await pool.query(`
    SELECT COUNT(*) as groups FROM (
      SELECT to_number_e164, from_number, date_trunc('minute', started_at)
      FROM call_sessions WHERE recording_url IS NOT NULL
      GROUP BY to_number_e164, from_number, date_trunc('minute', started_at)
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log('\n=== AFTER CLEANUP ===');
  console.log('Total recordings:', afterStats.rows[0].total_with_recording);
  console.log('Remaining duplicate groups:', afterDupeGroups.rows[0].groups);

  await pool.end();
}

main().catch(console.error);