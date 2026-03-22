import { pool } from '../server/db';

async function check() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT 
        l.id, l.contact_name, l.telnyx_call_id, l.telnyx_recording_id, 
        l.recording_url IS NOT NULL AS has_rec_url,
        l.recording_s3_key, l.call_attempt_id, l.recording_provider,
        l.call_duration,
        cs.id AS session_id,
        cs.telnyx_recording_id AS session_rec_id,
        cs.recording_url IS NOT NULL AS session_has_rec_url,
        cs.recording_s3_key AS session_s3_key,
        CASE WHEN cs.ai_transcript IS NOT NULL AND length(cs.ai_transcript) > 20 
             THEN length(cs.ai_transcript) ELSE 0 END AS session_transcript_chars,
        dca.id AS dca_id,
        dca.recording_url IS NOT NULL AS dca_has_rec_url,
        dca.telnyx_call_id AS dca_telnyx_id,
        CASE WHEN dca.full_transcript IS NOT NULL AND length(dca.full_transcript) > 20
             THEN length(dca.full_transcript) ELSE 0 END AS dca_transcript_chars,
        (SELECT cs2.id FROM call_sessions cs2 
         WHERE cs2.contact_id = l.contact_id AND cs2.campaign_id = l.campaign_id 
         AND cs2.ai_transcript IS NOT NULL AND length(cs2.ai_transcript) > 20
         LIMIT 1) AS alt_session_with_transcript,
        (SELECT cs3.recording_s3_key FROM call_sessions cs3 
         WHERE cs3.contact_id = l.contact_id AND cs3.campaign_id = l.campaign_id 
         AND cs3.recording_s3_key IS NOT NULL
         LIMIT 1) AS alt_session_s3_key,
        (SELECT length(cs5.ai_transcript) FROM call_sessions cs5 
         WHERE cs5.contact_id = l.contact_id AND cs5.campaign_id = l.campaign_id 
         AND cs5.ai_transcript IS NOT NULL AND length(cs5.ai_transcript) > 20
         LIMIT 1) AS alt_transcript_len
      FROM leads l
      LEFT JOIN call_sessions cs ON cs.telnyx_call_id = l.telnyx_call_id
      LEFT JOIN dialer_call_attempts dca ON dca.id = l.call_attempt_id
      WHERE l.qa_status = 'new' AND l.deleted_at IS NULL
        AND (l.transcript IS NULL OR length(l.transcript)  { console.error(err); process.exit(1); });