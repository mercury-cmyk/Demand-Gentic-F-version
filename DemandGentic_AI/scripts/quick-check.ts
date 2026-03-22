import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL!);

async function quick() {
  const c = await sql`SELECT id, name, campaign_objective, success_criteria, custom_qa_rules FROM campaigns WHERE name ILIKE '%Waterfall%' LIMIT 1`;
  if (!c.length) { console.log('No campaign'); process.exit(0); }
  
  console.log('Campaign:', c[0].name);
  console.log('Objective:', c[0].campaign_objective || 'NOT SET');
  console.log('Success Criteria:', c[0].success_criteria || 'NOT SET');
  console.log('QA Rules:', c[0].custom_qa_rules ? 'SET' : 'NOT SET');
  console.log('');
  
  const disps = await sql`SELECT ai_disposition, COUNT(*)::int as cnt FROM call_sessions WHERE campaign_id = ${c[0].id} GROUP BY ai_disposition ORDER BY cnt DESC`;
  console.log('Dispositions:');
  for (const d of disps) console.log(`  ${d.cnt}x ${d.ai_disposition}`);
  
  const recent = await sql`SELECT ai_transcript, ai_disposition FROM call_sessions WHERE campaign_id = ${c[0].id} ORDER BY started_at DESC LIMIT 3`;
  console.log('\nRecent Transcripts:');
  for (let i = 0; i  console.error(e));