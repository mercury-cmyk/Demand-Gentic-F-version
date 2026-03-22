import { pool } from '../server/db';
(async () => {
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT 
        l.id, l.contact_name, l.qa_status, l.recording_url,
        l.call_duration, l.telnyx_call_id,
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          ELSE 'unknown'
        END as source
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND (l.transcript IS NULL OR l.transcript = '' OR LENGTH(l.transcript)  { console.error(e); process.exit(1); });