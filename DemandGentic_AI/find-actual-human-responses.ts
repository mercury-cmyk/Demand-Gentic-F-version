import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * STRICT Analysis - Find ONLY calls with ACTUAL human responses
 * Not voicemails, not AI loops, REAL people talking
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

// Things a REAL person would say (not voicemail systems)
const HUMAN_RESPONSE_PATTERNS = [
  // Negative/annoyed responses
  { pattern: /why (do you|are you) keep(s)? calling/i, type: 'annoyed' },
  { pattern: /stop calling/i, type: 'annoyed' },
  { pattern: /quit.*calling/i, type: 'annoyed' },
  { pattern: /don'?t call (me|us|here|this|again)/i, type: 'annoyed' },
  { pattern: /remove (me|us) from/i, type: 'annoyed' },
  { pattern: /take (me|us) off/i, type: 'annoyed' },
  { pattern: /\bnot interested\b/i, type: 'rejection' },
  { pattern: /\bno thank(s| you)\b/i, type: 'rejection' },
  { pattern: /\bwrong number\b/i, type: 'wrong_number' },

  // Questions from the person
  { pattern: /who (is this|are you|is calling)/i, type: 'question' },
  { pattern: /who'?s (this|calling)/i, type: 'question' },
  { pattern: /what (is this|do you want|are you calling|company)/i, type: 'question' },
  { pattern: /how did you get (my|this)/i, type: 'question' },
  { pattern: /where (did you|are you) (get|calling from)/i, type: 'question' },

  // Positive/neutral engagement
  { pattern: /\bspeaking\b/i, type: 'answered' },
  { pattern: /this is (he|she|\w+)$/i, type: 'answered' },
  { pattern: /yes,? (this is|that'?s (me|right))/i, type: 'answered' },
  { pattern: /\bgo ahead\b/i, type: 'answered' },
  { pattern: /\bi'?m listening\b/i, type: 'answered' },
  { pattern: /what (can I|do you)/i, type: 'engaged' },
  { pattern: /tell me more/i, type: 'interested' },
  { pattern: /send (me|us|it|that|the|some)/i, type: 'interested' },
  { pattern: /email (me|us|it)/i, type: 'interested' },

  // Busy/callback
  { pattern: /i'?m (in a|busy|in the middle)/i, type: 'busy' },
  { pattern: /call (me |us )?(back|later)/i, type: 'callback' },
  { pattern: /not a good time/i, type: 'busy' },
  { pattern: /can you call (back|later)/i, type: 'callback' },
];

// Voicemail indicators - if present, it's NOT a real conversation
const VOICEMAIL_INDICATORS = [
  /voicemail (service|for|box)/i,
  /leave (a |your )?message after the (tone|beep)/i,
  /please leave (a |your )?(name|message)/i,
  /not available (to take|right now)/i,
  /away from (my |the )(phone|desk)/i,
  /can'?t (take|answer|get to) (your|my|the) (call|phone)/i,
  /press.*for more options/i,
  /when you('ve| have)? finish(ed)? recording/i,
  /at the tone/i,
  /hang up or press/i,
];

async function findActualHumanResponses() {
  console.log('========================================');
  console.log('FINDING ACTUAL HUMAN RESPONSES');
  console.log('========================================\n');

  const result = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.notes,
      c.first_name,
      c.last_name,
      c.email,
      c.direct_phone,
      c.job_title,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.notes LIKE '%[Call Transcript]%'
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Analyzing ${result.rows.length} calls...\n`);

  const humanResponses: any[] = [];
  const voicemails: any[] = [];
  const uncertain: any[] = [];

  for (const row of result.rows as any[]) {
    const transcript = extractTranscript(row.notes);
    if (!transcript) continue;

    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    const call = {
      id: row.id,
      name,
      email: row.email,
      phone: row.direct_phone,
      title: row.job_title,
      company: row.account_name,
      duration: row.call_duration_seconds,
      transcript,
      disposition: row.disposition,
      humanPatterns: [] as string[],
    };

    // First check if it's clearly a voicemail
    const isVoicemail = VOICEMAIL_INDICATORS.some(p => p.test(transcript));

    // Check for human response patterns
    const matches: {pattern: string, type: string}[] = [];
    for (const { pattern, type } of HUMAN_RESPONSE_PATTERNS) {
      const match = transcript.match(pattern);
      if (match) {
        matches.push({ pattern: match[0], type });
      }
    }

    // Determine category
    if (matches.length > 0) {
      // Found human-like responses
      call.humanPatterns = matches.map(m => `[${m.type}] "${m.pattern}"`);

      // But if it's a voicemail greeting that happens to contain these words...
      // We need to check if the human response is SEPARATE from the voicemail
      if (isVoicemail) {
        // Check if the human pattern appears BEFORE the voicemail greeting
        // or if it's clearly a person interrupting the voicemail
        const firstHumanMatch = matches[0];
        const humanIndex = transcript.toLowerCase().indexOf(firstHumanMatch.pattern.toLowerCase());
        const vmMatch = VOICEMAIL_INDICATORS.find(p => p.test(transcript));

        if (vmMatch) {
          const vmText = transcript.match(vmMatch);
          const vmIndex = vmText ? transcript.toLowerCase().indexOf(vmText[0].toLowerCase()) : 999999;

          // If human response comes before voicemail greeting, it's a real person
          if (humanIndex  {
      console.log(`\n===== HUMAN RESPONSE ${i + 1} of ${humanResponses.length} =====`);
      console.log(`👤 Name: ${call.name}`);
      console.log(`🏢 Company: ${call.company || 'N/A'}`);
      console.log(`📧 Email: ${call.email || 'N/A'}`);
      console.log(`📞 Phone: ${call.phone || 'N/A'}`);
      console.log(`💼 Title: ${call.title || 'N/A'}`);
      console.log(`⏱️  Duration: ${call.duration}s`);
      console.log(`\n🗣️  WHAT THEY SAID:`);
      call.humanPatterns.forEach((p: string) => console.log(`   ${p}`));
      console.log(`\n📝 FULL TRANSCRIPT:`);
      console.log('─'.repeat(60));
      console.log(call.transcript);
      console.log('─'.repeat(60));
    });
  }

  // Categorize human responses
  console.log('\n========================================');
  console.log('CATEGORIZATION OF HUMAN RESPONSES');
  console.log('========================================\n');

  const byType = {
    annoyed: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[annoyed]'))),
    rejection: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[rejection]'))),
    question: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[question]'))),
    answered: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[answered]'))),
    interested: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[interested]'))),
    busy: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[busy]'))),
    callback: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[callback]'))),
    wrong_number: humanResponses.filter(c => c.humanPatterns.some((p: string) => p.includes('[wrong_number]'))),
  };

  console.log(`😠 Annoyed/Stop calling: ${byType.annoyed.length}`);
  console.log(`👎 Rejected: ${byType.rejection.length}`);
  console.log(`❓ Asked questions: ${byType.question.length}`);
  console.log(`✅ Answered/Speaking: ${byType.answered.length}`);
  console.log(`⭐ Interested: ${byType.interested.length}`);
  console.log(`⏰ Busy/Callback: ${byType.busy.length + byType.callback.length}`);
  console.log(`📞 Wrong number: ${byType.wrong_number.length}`);

  // Show interested leads
  if (byType.interested.length > 0) {
    console.log('\n========================================');
    console.log('⭐ INTERESTED LEADS - FOLLOW UP!');
    console.log('========================================\n');

    byType.interested.forEach((call, i) => {
      console.log(`${i + 1}. ${call.name} @ ${call.company || 'N/A'}`);
      console.log(`   Email: ${call.email || 'N/A'}`);
      console.log(`   What they said: ${call.humanPatterns.join(', ')}`);
      console.log('');
    });
  }

  // Show uncertain calls for manual review
  console.log('\n========================================');
  console.log('❓ UNCERTAIN CALLS - Need Manual Review');
  console.log('(First 15 shown)');
  console.log('========================================\n');

  uncertain.slice(0, 15).forEach((call, i) => {
    console.log(`${i + 1}. ${call.name} @ ${call.company || 'N/A'} (${call.duration}s)`);
    console.log(`   Preview: ${call.transcript.substring(0, 150)}...`);
    console.log('');
  });

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================\n');

  const total = humanResponses.length + voicemails.length + uncertain.length;
  console.log(`Total calls analyzed: ${total}`);
  console.log(`Human responses: ${humanResponses.length} (${(humanResponses.length/total*100).toFixed(1)}%)`);
  console.log(`Voicemails: ${voicemails.length} (${(voicemails.length/total*100).toFixed(1)}%)`);
  console.log(`Uncertain: ${uncertain.length} (${(uncertain.length/total*100).toFixed(1)}%)\n`);

  if (humanResponses.length === 0) {
    console.log('⚠️  WARNING: No clear human engagement found.');
    console.log('The campaign may need improvement in:');
    console.log('  1. Calling times (currently hitting voicemails)');
    console.log('  2. Phone number quality');
    console.log('  3. AI agent introduction/approach');
  }

  process.exit(0);
}

findActualHumanResponses().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});