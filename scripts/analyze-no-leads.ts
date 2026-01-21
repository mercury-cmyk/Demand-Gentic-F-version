import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

neonConfig.webSocketConstructor = ws;

async function analyze() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const cid = 'ad8c5155-fcc3-4b4c-bdc6-55b4b58cbb37';
  
  console.log('=== WHY NO LEADS? CALL OUTCOME ANALYSIS ===\n');
  
  // Get calls with actual conversations (not no_answer/voicemail)
  const connected = await pool.query(`
    SELECT id, ai_disposition, duration_sec, ai_transcript, ai_analysis, to_number_e164, created_at
    FROM call_sessions 
    WHERE campaign_id = $1 
      AND ai_disposition NOT IN ('no_answer', 'voicemail', 'invalid_data')
    ORDER BY created_at DESC
    LIMIT 10
  `, [cid]);
  
  console.log('CONNECTED CALLS (where someone answered):');
  console.log('Total:', connected.rows.length);
  
  for (const call of connected.rows) {
    console.log('\n---');
    console.log('ID:', call.id.substring(0, 8));
    console.log('Disposition:', call.ai_disposition);
    console.log('Duration:', call.duration_sec, 'seconds');
    console.log('Phone:', call.to_number_e164);
    if (call.ai_transcript) {
      console.log('Transcript:', call.ai_transcript.substring(0, 800));
    }
    if (call.ai_analysis) {
      const analysis = typeof call.ai_analysis === 'string' ? JSON.parse(call.ai_analysis) : call.ai_analysis;
      console.log('Analysis:', JSON.stringify(analysis, null, 2).substring(0, 500));
    }
  }
  
  // Check average call duration by disposition
  console.log('\n\n=== CALL DURATION BY DISPOSITION ===');
  const durations = await pool.query(`
    SELECT ai_disposition, 
           COUNT(*) as count,
           ROUND(AVG(duration_sec)::numeric, 1) as avg_duration,
           MAX(duration_sec) as max_duration
    FROM call_sessions 
    WHERE campaign_id = $1
    GROUP BY ai_disposition
    ORDER BY count DESC
  `, [cid]);
  
  for (const d of durations.rows) {
    console.log(`${d.ai_disposition}: ${d.count} calls, avg ${d.avg_duration || 0}s, max ${d.max_duration || 0}s`);
  }
  
  // Summary
  console.log('\n\n=== ROOT CAUSE SUMMARY ===');
  const total = durations.rows.reduce((sum: number, d: any) => sum + parseInt(d.count), 0);
  const noAnswer = durations.rows.find((d: any) => d.ai_disposition === 'no_answer')?.count || 0;
  const voicemail = durations.rows.find((d: any) => d.ai_disposition === 'voicemail')?.count || 0;
  const humanContact = total - parseInt(noAnswer) - parseInt(voicemail);
  
  console.log(`Total calls: ${total}`);
  console.log(`No answer: ${noAnswer} (${Math.round(parseInt(noAnswer)/total*100)}%)`);
  console.log(`Voicemail: ${voicemail} (${Math.round(parseInt(voicemail)/total*100)}%)`);
  console.log(`Human contact: ${humanContact} (${Math.round(humanContact/total*100)}%)`);
  console.log(`\nLead generation requires human contact + interest.`);
  console.log(`With only ${humanContact} human contacts, and those being "not interested",`);
  console.log(`no leads were generated.`);
  
  await pool.end();
}

analyze().catch(console.error);
