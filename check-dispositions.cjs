const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_7sYERC3kqXcd@ep-mute-sky-ahoyd10z-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require' });
c.connect().then(async () => {
  const r = await c.query("SELECT ai_disposition, COUNT(*) as cnt FROM call_sessions WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY ai_disposition ORDER BY cnt DESC");
  console.log('Disposition breakdown (24h):');
  r.rows.forEach(r => console.log('  ' + (r.ai_disposition || 'NULL') + ': ' + r.cnt));

  const r2 = await c.query("SELECT ai_disposition, COUNT(*) as cnt FROM call_sessions WHERE created_at > NOW() - INTERVAL '24 hours' AND ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 50 GROUP BY ai_disposition ORDER BY cnt DESC");
  console.log('\nWith transcript (24h):');
  r2.rows.forEach(r => console.log('  ' + (r.ai_disposition || 'NULL') + ': ' + r.cnt));

  const r3 = await c.query("SELECT to_number_e164, ai_disposition, LEFT(ai_transcript, 200) as transcript_preview FROM call_sessions WHERE created_at > NOW() - INTERVAL '24 hours' AND ai_transcript IS NOT NULL AND LENGTH(ai_transcript) > 100 ORDER BY created_at DESC LIMIT 5");
  console.log('\nRecent calls with transcripts:');
  r3.rows.forEach(r => console.log(JSON.stringify(r)));

  await c.end();
}).catch(e => console.error(e));
