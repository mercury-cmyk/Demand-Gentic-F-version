import { pool } from '../server/db';

function countTurns(transcript: string): number {
  const t = transcript.trim();
  // JSON array format: [{"role":"agent",...}, {"role":"contact",...}]
  if (t.startsWith('[{')) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.length;
    } catch {}
  }
  // Text format with timestamps like [00:01] or speaker labels
  // Count lines that start with a speaker indicator
  const lines = t.split('\n').filter(l => l.trim().length > 0);
  return lines.length;
}

(async () => {
  const c = await pool.connect();
  try {
    const all = await c.query(`
      SELECT 
        l.id, l.contact_name, l.qa_status, l.call_duration, l.ai_score,
        l.transcript, l.telnyx_call_id,
        CASE 
          WHEN l.notes ILIKE '%ai_agent%' THEN 'ai'
          WHEN l.notes ILIKE '%manual%' THEN 'manual'
          ELSE 'unknown'
        END as source,
        EXISTS (
          SELECT 1 FROM call_sessions cs 
          JOIN call_quality_records cqr ON cqr.call_session_id = cs.id
          WHERE cs.telnyx_call_id = l.telnyx_call_id
        ) as scored
      FROM leads l
      WHERE l.deleted_at IS NULL
        AND l.transcript IS NOT NULL AND LENGTH(l.transcript) > 20
    `);

    const buckets: Record = {
      '30+': { total: 0, scored: 0, unscored: 0 },
      '20-29': { total: 0, scored: 0, unscored: 0 },
      '15-19': { total: 0, scored: 0, unscored: 0 },
      '10-14': { total: 0, scored: 0, unscored: 0 },
      '5-9': { total: 0, scored: 0, unscored: 0 },
      '0-4': { total: 0, scored: 0, unscored: 0 },
    };

    const unscored15: any[] = [];

    for (const row of all.rows) {
      const turns = countTurns(row.transcript);
      let bucket: string;
      if (turns >= 30) bucket = '30+';
      else if (turns >= 20) bucket = '20-29';
      else if (turns >= 15) bucket = '15-19';
      else if (turns >= 10) bucket = '10-14';
      else if (turns >= 5) bucket = '5-9';
      else bucket = '0-4';

      buckets[bucket].total++;
      if (row.scored) buckets[bucket].scored++;
      else buckets[bucket].unscored++;

      if (turns >= 15 && !row.scored) {
        unscored15.push({ ...row, turns, transcript: undefined });
      }
    }

    console.log('=== Turn count distribution (all leads with transcripts) ===');
    console.log('Bucket    | Total | Scored | Unscored');
    for (const [bucket, stats] of Object.entries(buckets)) {
      console.log(`${bucket.padEnd(9)} | ${String(stats.total).padEnd(5)} | ${String(stats.scored).padEnd(6)} | ${stats.unscored}`);
    }

    unscored15.sort((a, b) => b.turns - a.turns);
    console.log(`\n=== Unscored leads with 15+ turns: ${unscored15.length} ===`);
    for (const row of unscored15) {
      const dur = row.call_duration ? `${row.call_duration}s` : 'n/a';
      console.log(`  ${row.turns} turns | ${row.contact_name} | ${row.source} | qa:${row.qa_status} | dur:${dur}`);
    }

    // Count already scored with 15+ turns
    let scored15count = 0;
    for (const row of all.rows) {
      if (row.scored && countTurns(row.transcript) >= 15) scored15count++;
    }
    console.log(`\nAlready scored with 15+ turns: ${scored15count}`);

  } finally { c.release(); await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });