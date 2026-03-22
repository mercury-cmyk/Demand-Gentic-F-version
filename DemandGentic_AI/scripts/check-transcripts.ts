import { pool } from '../server/db';
(async () => {
  const c = await pool.connect();
  try {
    // Leads without transcripts
    const r = await c.query(`
      SELECT 
        CASE 
          WHEN l.transcript IS NULL THEN 'null'
          WHEN l.transcript = '' THEN 'empty'
          WHEN LENGTH(l.transcript)  { console.error(e); process.exit(1); });