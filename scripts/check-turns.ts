import { pool } from '../server/db';

(async () => {
  const c = await pool.connect();
  try {
    // Count turns in transcripts - turns are typically separated by speaker labels like "Agent:", "Contact:", etc.
    const r = await c.query(`
      SELECT 
        l.id, l.contact_name, l.qa_status, l.ai_score, l.ai_qualification_status,
        l.call_duration, l.telnyx_call_id,
        LENGTH(l.transcript) as transcript_len,
        -- Count turns by looking for speaker changes (Agent:/Contact:/Speaker patterns)
        (LENGTH(l.transcript) - LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(
          l.transcript, 'Agent:', ''), 'Contact:', ''), 'Speaker 1:', ''), 'Speaker 2:', ''))) 
          / GREATEST(LENGTH('Agent:'), 1) as approx_speaker_labels,
        -- Better: count newlines as rough proxy for turns
        (LENGTH(l.transcript) - LENGTH(REPLACE(l.transcript, E'\n', ''))) as newline_count,
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          ELSE 'unknown'
        END as source,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM call_sessions cs 
            JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
            WHERE cs.telnyx_call_id = l.telnyx_call_id
          ) THEN true ELSE false
        END as has_quality_record
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
      ORDER BY newline_count DESC
      LIMIT 5
    `);
    
    // First, peek at transcript format to understand turn structure
    console.log('=== Sample transcript format (top 5 by line count) ===');
    for (const row of r.rows) {
      console.log(`  ${row.contact_name} | lines:${row.newline_count} | labels:${row.approx_speaker_labels} | len:${row.transcript_len}`);
    }

    // Get a small sample to see actual turn format
    const sample = await c.query(`
      SELECT LEFT(l.transcript, 500) as preview
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 200
      LIMIT 1
    `);
    if (sample.rows.length > 0) {
      console.log('\n=== Sample transcript preview ===');
      console.log(sample.rows[0].preview);
    }

    // Now count leads by turn brackets
    // Turns can be: "Agent:", "Contact:", "Speaker 1:", "Speaker 2:", "[Agent]", "[Contact]"
    // Let's check with regex-like counting
    const turnCount = await c.query(`
      SELECT 
        l.id, l.contact_name, l.qa_status, l.ai_score, l.call_duration,
        l.ai_qualification_status,
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          ELSE 'unknown'
        END as source,
        -- Count "Agent:" occurrences as proxy for turns (each Agent: + Contact: = 1 exchange)
        (LENGTH(l.transcript) - LENGTH(REPLACE(lower(l.transcript), 'agent:', ''))) / LENGTH('agent:') as agent_turns,
        (LENGTH(l.transcript) - LENGTH(REPLACE(lower(l.transcript), 'contact:', ''))) / LENGTH('contact:') as contact_turns,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM call_sessions cs 
            JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
            WHERE cs.telnyx_call_id = l.telnyx_call_id
          ) THEN true ELSE false
        END as scored
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
      ORDER BY agent_turns + contact_turns DESC
      LIMIT 10
    `);
    
    console.log('\n=== Top 10 leads by turn count ===');
    for (const row of turnCount.rows) {
      const totalTurns = parseInt(row.agent_turns) + parseInt(row.contact_turns);
      console.log(`  ${totalTurns} turns (A:${row.agent_turns} C:${row.contact_turns}) | ${row.contact_name} | ${row.source} | qa:${row.qa_status} | scored:${row.scored} | ai_score:${row.ai_score || 'null'}`);
    }

    // Distribution of leads by turn count
    const dist = await c.query(`
      SELECT 
        CASE
          WHEN turns >= 30 THEN '30+'
          WHEN turns >= 20 THEN '20-29'
          WHEN turns >= 15 THEN '15-19'
          WHEN turns >= 10 THEN '10-14'
          WHEN turns >= 5 THEN '5-9'
          ELSE '0-4'
        END as turn_bucket,
        COUNT(*) as cnt,
        SUM(CASE WHEN scored THEN 1 ELSE 0 END) as already_scored,
        SUM(CASE WHEN NOT scored THEN 1 ELSE 0 END) as unscored
      FROM (
        SELECT 
          l.id,
          (LENGTH(l.transcript) - LENGTH(REPLACE(lower(l.transcript), 'agent:', ''))) / LENGTH('agent:') +
          (LENGTH(l.transcript) - LENGTH(REPLACE(lower(l.transcript), 'contact:', ''))) / LENGTH('contact:') as turns,
          EXISTS (
            SELECT 1 FROM call_sessions cs 
            JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
            WHERE cs.telnyx_call_id = l.telnyx_call_id
          ) as scored
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
      ) sub
      GROUP BY 1
      ORDER BY 1 DESC
    `);
    
    console.log('\n=== Turn count distribution ===');
    console.log('  Bucket    | Total | Scored | Unscored');
    for (const row of dist.rows) {
      console.log(`  ${row.turn_bucket.padEnd(9)} | ${String(row.cnt).padEnd(5)} | ${String(row.already_scored).padEnd(6)} | ${row.unscored}`);
    }

    // Count leads with 15+ turns that are UNSCORED
    const unscored15 = await c.query(`
      SELECT COUNT(*) as cnt
      FROM (
        SELECT l.id,
          (LENGTH(l.transcript) - LENGTH(REPLACE(lower(l.transcript), 'agent:', ''))) / LENGTH('agent:') +
          (LENGTH(l.transcript) - LENGTH(REPLACE(lower(l.transcript), 'contact:', ''))) / LENGTH('contact:') as turns
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
          AND NOT EXISTS (
            SELECT 1 FROM call_sessions cs 
            JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
            WHERE cs.telnyx_call_id = l.telnyx_call_id
          )
      ) sub WHERE turns >= 15
    `);
    console.log('\nUnscored leads with 15+ turns: ' + unscored15.rows[0].cnt);

  } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
