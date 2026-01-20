
import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function advancedAnalysis() {
  console.log('=== Advanced Transcript Analysis ===');

  const sessions = await db.execute(sql`
    SELECT 
      cs.id,
      cs.ai_disposition,
      cs.ai_transcript,
      cs.duration_sec,
      cs.started_at,
      dca.disposition as dca_disposition,
      l.id as lead_id
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    WHERE cs.agent_type = 'ai'
      AND cs.ai_transcript IS NOT NULL
      AND cs.duration_sec > 30
    ORDER BY cs.started_at DESC
    LIMIT 200
  `);

  console.log(`Analyzing ${String((sessions as any).rows.length)} call sessions (duration > 30s)...
`);

  const interestSignals = ['interested', 'send', 'email', 'yes', 'sure', 'pricing', 'demo', 'meeting', 'follow up', 'tell me more', 'how does it work'];
  const rejectionSignals = ['not interested', 'not a good time', 'remove me', 'no thanks', 'not the right person', 'we already have'];
  const gatekeeperSignals = ['who is this', 'what is this regarding', 'he is not available', 'can I take a message'];

  const categorized = {
    interest: [],
    rejection: [],
    gatekeeper: [],
    other: [],
  };

  for (const row of (sessions as any).rows) {
    const transcript = (row.ai_transcript || '').toLowerCase();
    
    if (interestSignals.some(s => transcript.includes(s))) {
      categorized.interest.push(row);
    } else if (rejectionSignals.some(s => transcript.includes(s))) {
      categorized.rejection.push(row);
    } else if (gatekeeperSignals.some(s => transcript.includes(s))) {
      categorized.gatekeeper.push(row);
    } else {
      categorized.other.push(row);
    }
  }

  console.log('--- Analysis Summary ---');
  console.log(`Interest Signals: ${categorized.interest.length}`);
  console.log(`Rejection Signals: ${categorized.rejection.length}`);
  console.log(`Gatekeeper Signals: ${categorized.gatekeeper.length}`);
  console.log(`Other / Voicemail: ${categorized.other.length}`);
  console.log('------------------------\n');

  function printExamples(category: string, rows: any[]) {
    if (rows.length > 0) {
      console.log(`\n=== Examples: ${category.toUpperCase()} ===`);
      for (const row of rows.slice(0, 5)) {
        const hasLead = row.lead_id ? 'HAS_LEAD' : 'NO_LEAD';
        console.log(`---`);
        console.log(`Session: ${row.id}`);
        console.log(`AI Disp: ${row.ai_disposition} | DCA Disp: ${row.dca_disposition} | Duration: ${row.duration_sec}s | ${hasLead}`);
        console.log(`Transcript: ${(row.ai_transcript || '').replace(/\\n/g, ' ').substring(0, 300)}...`);
      }
    }
  }

  printExamples('Interest', categorized.interest);
  printExamples('Rejection', categorized.rejection);
  printExamples('Gatekeeper', categorized.gatekeeper);
  printExamples('Other / Voicemail', categorized.other);
}

advancedAnalysis().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
