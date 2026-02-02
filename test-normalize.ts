import { db } from './server/db';
import { callSessions, campaigns, contacts, accounts } from './shared/schema';
import { desc, eq } from 'drizzle-orm';

// Copy of normalizeTranscript from routes.ts
type TranscriptTurn = { role: 'agent' | 'assistant' | 'user' | 'contact' | 'system'; text: string; timestamp?: string };
type NormalizedTranscript = {
  transcript?: string;
  transcriptTurns?: TranscriptTurn[];
};

const normalizeTranscript = (raw?: string | null): NormalizedTranscript => {
  if (!raw) return { transcript: undefined, transcriptTurns: undefined };
  const trimmed = raw.trim();
  if (!trimmed) return { transcript: undefined, transcriptTurns: undefined };

  // Attempt to parse structured JSON transcripts (some providers store rich turn data)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // Array of turns: [{ role, message/original_message, time_in_call_secs, ... }]
      if (Array.isArray(parsed)) {
        const turns = parsed
          .map((turn: any) => {
            const text = turn?.original_message || turn?.message || turn?.text;
            if (!text) return null;

            // Normalize role to agent/contact/system for UI consumption
            const role: 'agent' | 'assistant' | 'user' | 'contact' | 'system' =
              turn?.role === 'assistant' || turn?.role === 'agent' || turn?.agent_metadata
                ? 'agent'
                : turn?.role === 'system'
                  ? 'system'
                  : 'contact';

            // Optional timestamp from provider (seconds into call or ISO string)
            let timestamp: string | undefined;
            if (typeof turn?.time_in_call_secs === 'number') {
              const secs = Math.max(0, Math.floor(turn.time_in_call_secs));
              const minutes = Math.floor(secs / 60).toString().padStart(2, '0');
              const seconds = (secs % 60).toString().padStart(2, '0');
              timestamp = `${minutes}:${seconds}`;
            } else if (turn?.timestamp) {
              const ts = new Date(turn.timestamp);
              if (!isNaN(ts.getTime())) timestamp = ts.toISOString();
            }

            return {
              role,
              text: String(text).trim(),
              timestamp,
            };
          })
          .filter(Boolean) as NormalizedTranscript["transcriptTurns"];

        if (turns && turns.length > 0) {
          return {
            transcript: turns
              .map(t => `${t.role === 'agent' || t.role === 'assistant' ? 'Agent' : t.role === 'system' ? 'System' : 'Contact'}: ${t.text}`)
              .join('\n'),
            transcriptTurns: turns,
          };
        }
      }

      // Object with a transcript field
      if (parsed && typeof parsed === 'object' && (parsed as any).transcript) {
        return { transcript: String((parsed as any).transcript), transcriptTurns: undefined };
      }
    } catch {
      // If parsing fails, fall back to raw text below
    }
  }

  // Plain text transcript
  return { transcript: trimmed, transcriptTurns: undefined };
};

async function test() {
  // Get a session with a real transcript
  const sessions = await db.select({
    id: callSessions.id,
    disposition: callSessions.aiDisposition,
    transcript: callSessions.aiTranscript,
  }).from(callSessions)
    .where(eq(callSessions.aiDisposition, 'Completed'))
    .orderBy(desc(callSessions.startedAt))
    .limit(1);
  
  if (sessions.length === 0) {
    console.log('No sessions found');
    process.exit(0);
  }
  
  const s = sessions[0];
  console.log('=== Raw Transcript ===');
  console.log('Length:', s.transcript?.length);
  console.log('First 300 chars:', s.transcript?.substring(0, 300));
  
  console.log('\n=== Normalized ===');
  const normalized = normalizeTranscript(s.transcript);
  console.log('Has transcript string:', !!normalized.transcript);
  console.log('Has turns:', !!normalized.transcriptTurns);
  console.log('Turns count:', normalized.transcriptTurns?.length);
  
  if (normalized.transcriptTurns && normalized.transcriptTurns.length > 0) {
    console.log('\n=== First 3 turns ===');
    normalized.transcriptTurns.slice(0, 3).forEach((t, i) => {
      console.log(`Turn ${i+1} [${t.role}] ${t.timestamp || ''}: ${t.text.substring(0, 100)}...`);
    });
  }
  
  if (normalized.transcript) {
    console.log('\n=== Transcript preview ===');
    console.log(normalized.transcript.substring(0, 500));
  }
  
  process.exit(0);
}
test();
