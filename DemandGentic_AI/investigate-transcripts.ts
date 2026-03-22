import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function analyze() {
  // Check all call sessions with transcripts
  const sessions = await db.execute(sql`
    SELECT 
      cs.id,
      cs.ai_disposition,
      cs.ai_transcript,
      cs.ai_analysis,
      cs.duration_sec,
      cs.started_at,
      dca.id as call_attempt_id,
      dca.disposition as dca_disposition,
      l.id as lead_id
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    WHERE cs.agent_type = 'ai'
      AND cs.ai_transcript IS NOT NULL
      AND LENGTH(cs.ai_transcript) > 50
    ORDER BY cs.started_at DESC
    LIMIT 50
  `);

  console.log('=== AI Call Sessions with Transcripts ===');     
  console.log('Total found:', (sessions as any).rows?.length || 0);

  for (const row of ((sessions as any).rows || []).slice(0, 20)) {
    const hasLead = row.lead_id ? 'HAS_LEAD' : 'NO_LEAD';       
    const transcript = (row.ai_transcript || '').substring(0, 150);
    console.log('---');
    console.log('Session:', row.id, '| Attempt:', row.call_attempt_id || 'none');
    console.log('AI Disp:', row.ai_disposition, '| DCA Disp:', row.dca_disposition, '| Duration:', row.duration_sec, 's |', hasLead);
    console.log('Started:', row.started_at);
    console.log('Transcript:', transcript.replace(/\\n/g, ' '));

    // Check for interest signals
    const lower = transcript.toLowerCase();
    const signals = ['interested', 'send', 'email', 'yes', 'sure', 'pricing', 'demo', 'meeting', 'follow'].filter(s => lower.includes(s));
    if (signals.length > 0) {
      console.log(' INTEREST SIGNALS:', signals.join(', '));    
    }
  }
}

analyze().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });