import 'dotenv/config';
import { db } from './server/db';
import { callSessions, dialerCallAttempts, leads } from '@shared/schema';
import { sql } from 'drizzle-orm';

type TranscriptRow = {
  callSessionId: string;
  callAttemptId: string | null;
  campaignId: string | null;
  contactId: string | null;
  aiDisposition: string | null;
  aiTranscript: string | null;
  aiSummary: string | null;
  aiOutcome: string | null;
  aiEngagement: string | null;
  aiSentiment: string | null;
  followUpConsent: string | null;
  durationSec: number | null;
  startedAt: Date | null;
  leadId: string | null;
};

type ScoredRow = TranscriptRow & {
  score: number;
  reasons: string[];
};

const INTEREST_PHRASES = [
  'send',
  'email',
  'follow up',
  'follow-up',
  'pricing',
  'demo',
  'meeting',
  'book',
  'schedule',
  'calendar',
  'materials',
  'info',
  'information',
  'details',
  'yes,',
  'sure',
  'interested',
  'call back',
  'callback',
];

function scoreTranscript(row: TranscriptRow): ScoredRow {
  const reasons: string[] = [];
  let score = 0;

  if (row.aiDisposition?.toLowerCase().includes('qualified')) {
    score += 4;
    reasons.push('ai_disposition=qualified');
  }

  if (row.followUpConsent?.toLowerCase() === 'yes') {
    score += 4;
    reasons.push('follow_up_consent=yes');
  }

  if (row.aiEngagement?.toLowerCase() === 'high') {
    score += 2;
    reasons.push('engagement=high');
  }

  if (row.aiSentiment?.toLowerCase() === 'positive') {
    score += 1;
    reasons.push('sentiment=positive');
  }

  if (typeof row.durationSec === 'number' && row.durationSec >= 30) {
    score += 1;
    reasons.push('duration>=30s');
  }

  const transcript = (row.aiTranscript || '').toLowerCase();
  const matchedPhrases = INTEREST_PHRASES.filter((phrase) => transcript.includes(phrase));
  if (matchedPhrases.length > 0) {
    score += Math.min(3, matchedPhrases.length);
    reasons.push(`transcript_phrases=${matchedPhrases.slice(0, 3).join(',')}`);
  }

  return { ...row, score, reasons };
}

async function analyzeTodaysTranscripts(): Promise<void> {
  console.log('=== Analyze Today\'s Call Transcripts ===\n');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db.execute(sql<TranscriptRow>`
    SELECT
      cs.id as "callSessionId",
      dca.id as "callAttemptId",
      cs.campaign_id as "campaignId",
      cs.contact_id as "contactId",
      cs.ai_disposition as "aiDisposition",
      cs.ai_transcript as "aiTranscript",
      cs.ai_analysis ->> 'summary' as "aiSummary",
      cs.ai_analysis ->> 'outcome' as "aiOutcome",
      cs.ai_analysis ->> 'engagement_level' as "aiEngagement",
      cs.ai_analysis ->> 'sentiment' as "aiSentiment",
      cs.ai_analysis ->> 'follow_up_consent' as "followUpConsent",
      cs.duration_sec as "durationSec",
      cs.started_at as "startedAt",
      l.id as "leadId"
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE cs.started_at >= ${today}
      AND cs.agent_type = 'ai'
      AND cs.ai_transcript IS NOT NULL
    ORDER BY cs.started_at DESC
  `);
  const rows = (result as any).rows || [];
  const scored = rows.map(scoreTranscript).sort((a, b) => b.score - a.score);

  console.log(`Found ${rows.length} AI call sessions with transcripts today.`);
  console.log(`Top candidates (score >= 5):\n`);

  const top = scored.filter((row) => row.score >= 5).slice(0, 50);
  if (top.length === 0) {
    console.log('No strong candidates found with score >= 5.');
  }

  for (const row of top) {
    const leadStatus = row.leadId ? `lead=${row.leadId}` : 'lead=missing';
    const startedAt = row.startedAt ? row.startedAt.toISOString() : 'unknown';
    console.log(
      `- score=${row.score} ${leadStatus} callSession=${row.callSessionId} callAttempt=${row.callAttemptId || 'none'} started=${startedAt}`
    );
    console.log(`  reasons: ${row.reasons.join('; ') || 'none'}`);
    if (row.aiSummary) {
      console.log(`  summary: ${row.aiSummary.substring(0, 200)}`);
    }
  }

  const missingLead = scored.filter((row) => !row.leadId);
  console.log(`\nCalls with transcripts but no lead: ${missingLead.length}`);
}

analyzeTodaysTranscripts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
