import { pool } from './server/db';

async function inspectTranscripts() {
  const ids = [
    '804791e7-680d-4637-9330-cdc3833aad0f',
    '7b33e3a7-6eca-4c67-9bef-907a6860fd2e', 
    '982bbfcf-be2a-43af-b67a-250ae6ff11dc'
  ];

  for (const id of ids) {
    const res = await pool.query('SELECT ai_transcript, ai_analysis FROM call_sessions WHERE id = $1', [id]);
    if (res.rows.length > 0) {
      console.log(`\n=== ID: ${id} ===`);
      console.log('AI Transcript (Type):', typeof res.rows[0].ai_transcript);
      console.log('AI Transcript (Value snippet):', JSON.stringify(res.rows[0].ai_transcript).slice(0, 500));
      console.log('AI Analysis (Type):', typeof res.rows[0].ai_analysis);
      console.log('AI Analysis (Value snippet):', JSON.stringify(res.rows[0].ai_analysis).slice(0, 200));
    }
  }

  await pool.end();
}

inspectTranscripts();