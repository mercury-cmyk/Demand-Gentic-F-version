import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * Find Real Conversations (Not Voicemails)
 * Look for patterns indicating actual human responses
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

function isRealConversation(transcript: string): {
  isReal: boolean;
  score: number;
  reasons: string[];
  prospectResponses: string[];
} {
  const reasons: string[] = [];
  const prospectResponses: string[] = [];
  let score = 0;

  // Patterns indicating voicemail (negative indicators)
  const vmPatterns = [
    { pattern: /leave a message/i, penalty: -50, reason: 'Voicemail greeting' },
    { pattern: /after the tone/i, penalty: -50, reason: 'Voicemail tone instruction' },
    { pattern: /press.*for/i, penalty: -40, reason: 'IVR/menu system' },
    { pattern: /mailbox is full/i, penalty: -100, reason: 'Mailbox full' },
    { pattern: /not available/i, penalty: -30, reason: 'Not available message' },
  ];

  // Patterns indicating real conversation (positive indicators)
  const conversationPatterns = [
    { pattern: /\b(who is this|who are you)\b/i, points: 50, reason: 'Prospect asking identity' },
    { pattern: /\b(why.*calling|stop calling|quit calling)\b/i, points: 60, reason: 'Prospect responding (negative)' },
    { pattern: /\b(yes|yeah|yep|sure|okay)\b.*\b(interested|send|email|tell me)\b/i, points: 100, reason: 'Positive engagement' },
    { pattern: /\b(no thanks|not interested|remove.*list)\b/i, points: 40, reason: 'Prospect declining (real response)' },
    { pattern: /\b(i'?m|we'?re).*\b(busy|meeting|call back)\b/i, points: 70, reason: 'Prospect giving reason' },
    { pattern: /\bwhat.*about\b/i, points: 60, reason: 'Prospect asking question' },
    { pattern: /\bhello\?+\b/i, points: 30, reason: 'Prospect answering' },
  ];

  // Check for voicemail
  vmPatterns.forEach(({ pattern, penalty, reason }) => {
    if (pattern.test(transcript)) {
      score += penalty;
      reasons.push(`❌ ${reason}`);
    }
  });

  // Check for conversation
  conversationPatterns.forEach(({ pattern, points, reason }) => {
    const match = transcript.match(pattern);
    if (match) {
      score += points;
      reasons.push(`✅ ${reason}`);
      prospectResponses.push(match[0]);
    }
  });

  // Check for repetitive content (voicemail stuck in loop)
  const lines = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  if (lines.length > 5) {
    const firstLine = lines[0];
    const repetitions = lines.filter(l => l === firstLine).length;
    if (repetitions > lines.length * 0.4) {
      score -= 60;
      reasons.push('❌ Repetitive content (voicemail loop)');
    }
  }

  // Unique word ratio
  const words = transcript.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / Math.max(words.length, 1);
  if (uniqueRatio  0.6) {
    score += 30;
    reasons.push('✅ High variety (natural conversation)');
  }

  const isReal = score > 0;
  return { isReal, score, reasons, prospectResponses };
}

async function findRealConversations() {
  console.log('========================================');
  console.log('FINDING REAL CONVERSATIONS');
  console.log('========================================\n');

  const result = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.voicemail_detected,
      dca.notes,
      dca.recording_url,
      c.first_name,
      c.last_name,
      c.email,
      c.job_title,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds >= 30
      AND dca.notes LIKE '%[Call Transcript]%'
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Analyzing ${result.rows.length} transcribed calls...\n`);

  const conversations: any[] = [];

  result.rows.forEach((row: any) => {
    const transcript = extractTranscript(row.notes);
    if (!transcript) return;

    const analysis = isRealConversation(transcript);

    if (analysis.isReal) {
      conversations.push({
        id: row.id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        email: row.email,
        jobTitle: row.job_title,
        company: row.account_name,
        duration: row.call_duration_seconds,
        disposition: row.disposition,
        connected: row.connected,
        voicemailDetected: row.voicemail_detected,
        score: analysis.score,
        reasons: analysis.reasons,
        prospectResponses: analysis.prospectResponses,
        transcript: transcript,
        recordingUrl: row.recording_url,
      });
    }
  });

  // Sort by score (most likely real conversation first)
  conversations.sort((a, b) => b.score - a.score);

  console.log(`✅ Found ${conversations.length} real conversations!\n`);

  console.log('========================================');
  console.log('REAL CONVERSATIONS (Sorted by confidence)');
  console.log('========================================\n');

  conversations.forEach((conv, i) => {
    console.log(`${i + 1}. ${conv.name} @ ${conv.company || 'N/A'}`);
    console.log(`   Email: ${conv.email || 'N/A'}`);
    console.log(`   Title: ${conv.jobTitle || 'N/A'}`);
    console.log(`   Score: ${conv.score} | Duration: ${conv.duration}s`);
    console.log(`   Disposition: ${conv.disposition} | Connected: ${conv.connected} | VM Detected: ${conv.voicemailDetected}`);
    console.log(`   \nReasons:`);
    conv.reasons.forEach((r: string) => console.log(`     ${r}`));
    if (conv.prospectResponses.length > 0) {
      console.log(`   \nProspect said: "${conv.prospectResponses.join('", "')}"`);
    }
    console.log(`   \nTranscript (first 400 chars):`);
    console.log(`   ${conv.transcript.substring(0, 400)}...`);
    console.log('');
  });

  console.log('========================================');
  console.log('CATEGORIZATION');
  console.log('========================================\n');

  const positive = conversations.filter(c => c.prospectResponses.some((r: string) =>
    /interested|send|email|tell me|yes|sure|okay/i.test(r)
  ));
  const negative = conversations.filter(c => c.prospectResponses.some((r: string) =>
    /stop|quit|not interested|remove|no thanks/i.test(r)
  ));
  const neutral = conversations.filter(c =>
    !positive.includes(c) && !negative.includes(c)
  );

  console.log(`Positive/Interested: ${positive.length}`);
  console.log(`Negative/Not Interested: ${negative.length}`);
  console.log(`Neutral: ${neutral.length}\n`);

  if (positive.length > 0) {
    console.log('🎯 POSITIVE/INTERESTED CONVERSATIONS:\n');
    positive.forEach(c => {
      console.log(`  - ${c.name} @ ${c.company}`);
      console.log(`    Email: ${c.email}`);
      console.log(`    Response: ${c.prospectResponses.join(', ')}`);
      console.log('');
    });
  }

  console.log('========================================');
  console.log('SYSTEM FLAGS ACCURACY');
  console.log('========================================\n');

  const correctlyConnected = conversations.filter(c => c.connected).length;
  const correctlyVM = result.rows.filter((r: any) => r.voicemail_detected).length;

  console.log(`Connected flag accuracy: ${correctlyConnected}/${conversations.length} (${(correctlyConnected/Math.max(conversations.length,1)*100).toFixed(1)}%)`);
  console.log(`Should be: ${conversations.length} real conversations marked as connected`);
  console.log(`Actually marked: ${correctlyConnected}\n`);

  console.log(`Voicemail detection should catch: ~${result.rows.length - conversations.length} voicemails`);
  console.log(`Actually detected: ${correctlyVM} voicemails`);
  console.log(`Accuracy: ${(correctlyVM/Math.max(result.rows.length - conversations.length,1)*100).toFixed(1)}%\n`);

  process.exit(0);
}

findRealConversations().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});