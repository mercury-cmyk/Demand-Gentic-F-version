import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function getDecSessionTranscript() {
  console.log('========================================');
  console.log('GET DEC 24 CALL SESSION FULL DATA');
  console.log('========================================\n');

  const session = await db.execute(sql`
    SELECT *
    FROM call_sessions
    WHERE id = 'f3bdbcd4-af0f-4345-923c-49da537141b2'
  `);

  if (session.rows.length === 0) {
    console.log('No session found');
    process.exit(0);
  }

  const s = session.rows[0] as any;

  console.log('Session ID:', s.id);
  console.log('Created:', s.created_at);
  console.log('Ended:', s.ended_at);
  console.log('AI Disposition:', s.ai_disposition);

  console.log('\n========================================');
  console.log('AI TRANSCRIPT (full):');
  console.log('========================================\n');
  console.log(s.ai_transcript);

  console.log('\n========================================');
  console.log('AI ANALYSIS (full):');
  console.log('========================================\n');
  console.log(JSON.stringify(s.ai_analysis, null, 2));

  console.log('\n========================================');
  console.log('TRANSCRIPT field:');
  console.log('========================================\n');
  console.log(s.transcript || 'NULL');

  process.exit(0);
}

getDecSessionTranscript().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
