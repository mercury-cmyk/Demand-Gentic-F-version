import { pool } from '../server/db';

async function main() {
  // Overall stats
  const r = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(ai_transcript) as has_transcript,
      COUNT(ai_analysis) as has_analysis,
      COUNT(CASE WHEN LENGTH(ai_transcript) > 50 THEN 1 END) as meaningful_transcripts,
      ROUND(AVG(LENGTH(ai_transcript))) as avg_transcript_len,
      MAX(LENGTH(ai_transcript)) as max_transcript_len
    FROM call_sessions 
    WHERE ai_transcript IS NOT NULL AND ai_transcript != ''
  `);
  console.log('\n=== Transcribed call_sessions stats ===');
  console.table(r.rows);

  // Sample a transcript
  const sample = await pool.query(`
    SELECT id, ai_transcript, duration_sec 
    FROM call_sessions 
    WHERE ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 200
    ORDER BY created_at DESC LIMIT 1
  `);
  if (sample.rows.length) {
    console.log('\n=== Sample transcript (first 600 chars) ===');
    console.log('Duration:', sample.rows[0].duration_sec, 'sec');
    console.log(sample.rows[0].ai_transcript.substring(0, 600));
  }

  // Disposition distribution
  const disps = await pool.query(`
    SELECT ai_disposition as disposition, COUNT(*) as cnt
    FROM call_sessions 
    WHERE ai_transcript IS NOT NULL AND ai_transcript != ''
    GROUP BY ai_disposition ORDER BY cnt DESC LIMIT 15
  `);
  console.log('\n=== Disposition distribution (transcribed calls) ===');
  console.table(disps.rows);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
