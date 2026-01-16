import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * FINAL STRICT Analysis - Find ONLY calls with ACTUAL human responses
 * Version 2: Fixed false positives from voicemail system messages
 *
 * Key insight: "you were not speaking" is a VOICEMAIL system message, not a human!
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

// VOICEMAIL SYSTEM PATTERNS - These indicate it's NOT a real conversation
const VOICEMAIL_SYSTEM_PATTERNS = [
  // Standard voicemail greetings
  /voicemail (service|for|box|of)/i,
  /leave (a |your )?(brief |detailed )?message/i,
  /after the (tone|beep)/i,
  /please leave (a |your )?(name|message)/i,
  /not available (to take|right now|at the moment)/i,
  /away from (my |the )(phone|desk)/i,
  /can'?t (take|answer|get to|come to) (your|my|the) (call|phone)/i,
  /press.*for more options/i,
  /when you('ve| have)? finish(ed)? recording/i,
  /at the tone/i,
  /hang up or press/i,
  /I'?ll (get back|call you back|return your call)/i,
  /reached the (voicemail|voice mailbox)/i,
  /unable to (take|answer)/i,

  // CRITICAL: Voicemail system error messages (NOT human speech!)
  /we didn'?t get your message/i,
  /you were not speaking/i,
  /because of a bad connection/i,
  /to disconnect,? press/i,
  /to record your message,? press/i,
  /system cannot process your entries/i,
  /please try again later/i,
  /are you still there\?/i,
  /sorry you (are|were) having trouble/i,
  /maximum time permitted/i,

  // Phone number readout (automated system)
  /^\d[\d\s,\-\.]+is not available/i,
  /your call has been forwarded to an automatic/i,

  // Just a greeting with no response
  /^hi,?\s*(this is|you'?ve reached)/i,
];

// TRUE human conversation indicators - things only a REAL person says in dialogue
const TRUE_HUMAN_INDICATORS = [
  // Angry/annoyed responses (DEFINITELY a person)
  { pattern: /why (do you|are you) keep(s)? calling/i, type: 'annoyed', weight: 100 },
  { pattern: /stop calling/i, type: 'annoyed', weight: 100 },
  { pattern: /quit.*calling/i, type: 'annoyed', weight: 100 },
  { pattern: /don'?t call (me|us|here|this|again)/i, type: 'annoyed', weight: 100 },
  { pattern: /worst automated call/i, type: 'annoyed', weight: 100 },
  { pattern: /go away/i, type: 'annoyed', weight: 80 },
  { pattern: /remove (me|us) from/i, type: 'annoyed', weight: 100 },
  { pattern: /take (me|us) off/i, type: 'annoyed', weight: 100 },
  { pattern: /fucking/i, type: 'annoyed', weight: 100 },  // Strong indicator of real person!

  // Direct questions (DEFINITELY a person asking)
  { pattern: /who is this\??$/i, type: 'question', weight: 100 },
  { pattern: /who'?s (this|calling)\??$/i, type: 'question', weight: 100 },
  { pattern: /who are you\??/i, type: 'question', weight: 100 },
  { pattern: /what (do you want|is this about|are you calling about)/i, type: 'question', weight: 100 },
  { pattern: /how did you get (my|this) number/i, type: 'question', weight: 100 },
  { pattern: /depends what you want/i, type: 'question', weight: 100 },

  // Dialogue indicators (AI talking THEN human responding)
  { pattern: /thanks for confirming/i, type: 'confirmed_identity', weight: 90 },
  { pattern: /just to confirm.*am I speaking with/i, type: 'dialogue', weight: 70 },
  { pattern: /hello\?.*hello\?.*may I/i, type: 'dialogue', weight: 80 },

  // Rejection (DEFINITELY a person)
  { pattern: /\bnot interested\b/i, type: 'rejection', weight: 100 },
  { pattern: /\bno thank(s| you)\b/i, type: 'rejection', weight: 90 },
  { pattern: /\bwrong number\b/i, type: 'wrong_number', weight: 100 },

  // Positive engagement indicators
  { pattern: /tell me more/i, type: 'interested', weight: 100 },
  { pattern: /yes,? (please )?(send|email) (me|us)/i, type: 'interested', weight: 100 },
  { pattern: /what can (I|you) help/i, type: 'engaged', weight: 90 },

  // Busy/callback (person on phone)
  { pattern: /i'?m (in a meeting|busy|in the middle)/i, type: 'busy', weight: 90 },
  { pattern: /can you call (me )?(back|later)/i, type: 'callback', weight: 90 },
  { pattern: /not a good time/i, type: 'busy', weight: 90 },
];

function isVoicemailSystem(transcript: string): boolean {
  // Check if transcript contains voicemail system patterns
  const lowerTranscript = transcript.toLowerCase();

  // Strong voicemail indicators
  const hasVoicemailSystemMessage = VOICEMAIL_SYSTEM_PATTERNS.some(p => p.test(transcript));

  // Check for repetitive "press X" patterns (phone menu)
  const pressCount = (transcript.match(/press \d/gi) || []).length;
  if (pressCount >= 2) return true;

  // Check for "not speaking" error message (very common false positive)
  if (/you were not speaking/i.test(transcript)) return true;

  // Check for automated number readout
  if (/^\d[\d\s,\-]+is not available/i.test(transcript.trim())) return true;

  return hasVoicemailSystemMessage;
}

function findHumanIndicators(transcript: string): { pattern: string; type: string; weight: number }[] {
  const matches: { pattern: string; type: string; weight: number }[] = [];

  for (const indicator of TRUE_HUMAN_INDICATORS) {
    const match = transcript.match(indicator.pattern);
    if (match) {
      matches.push({
        pattern: match[0],
        type: indicator.type,
        weight: indicator.weight,
      });
    }
  }

  return matches;
}

function hasRealDialogue(transcript: string): boolean {
  // Look for patterns that indicate back-and-forth conversation
  // AI speaks first, then human responds

  // Pattern: AI greeting followed by human question/response
  if (/Hello,? may I (please )?speak with.*\?.*who is this/i.test(transcript)) return true;
  if (/Hello,? may I (please )?speak with.*\?.*what (do you|is this)/i.test(transcript)) return true;

  // Pattern: Human says something BEFORE the voicemail kicks in
  if (/^(hello\?|who is this|what do you want).*leave (a )?message/is.test(transcript)) return true;

  // Pattern: Actual conversation with "thanks for confirming"
  if (/thanks for confirming/i.test(transcript)) return true;

  // Pattern: Human answered "Hello?" multiple times (trying to talk)
  const helloCount = (transcript.match(/\bhello\?+/gi) || []).length;
  if (helloCount >= 2 && !/you were not speaking/i.test(transcript)) return true;

  return false;
}

async function findRealHumanCalls() {
  console.log('========================================');
  console.log('FINDING REAL HUMAN CALLS (V2 - Fixed)');
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

  const realConversations: any[] = [];
  const voicemails: any[] = [];
  const needsReview: any[] = [];

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
      humanIndicators: [] as { pattern: string; type: string; weight: number }[],
      totalWeight: 0,
      reason: '',
    };

    // Step 1: Find human indicators
    call.humanIndicators = findHumanIndicators(transcript);
    call.totalWeight = call.humanIndicators.reduce((sum, i) => sum + i.weight, 0);

    // Step 2: Check if it's a voicemail system
    const isVoicemail = isVoicemailSystem(transcript);

    // Step 3: Check for real dialogue patterns
    const hasDialogue = hasRealDialogue(transcript);

    // Categorize
    if (call.totalWeight >= 80 && hasDialogue) {
      // High confidence: strong human indicators + dialogue pattern
      call.reason = 'High confidence: Clear human response with dialogue';
      realConversations.push(call);
    } else if (call.totalWeight >= 100 && !isVoicemail) {
      // Strong human indicator without voicemail system
      call.reason = 'Strong human indicator detected';
      realConversations.push(call);
    } else if (call.totalWeight >= 80 && isVoicemail) {
      // Has human indicator but also voicemail - needs review
      call.reason = 'Possible human but voicemail system detected';
      needsReview.push(call);
    } else if (call.totalWeight > 0 && call.totalWeight < 80) {
      // Weak indicators
      call.reason = 'Weak human indicators';
      needsReview.push(call);
    } else {
      // No human indicators
      voicemails.push(call);
    }
  }

  // PRINT RESULTS
  console.log('========================================');
  console.log('RESULTS');
  console.log('========================================\n');

  console.log(`✅ CONFIRMED REAL CONVERSATIONS: ${realConversations.length}`);
  console.log(`❓ Needs Manual Review: ${needsReview.length}`);
  console.log(`📫 Voicemails: ${voicemails.length}\n`);

  // Show ALL real conversations
  console.log('========================================');
  console.log('✅ CONFIRMED REAL CONVERSATIONS');
  console.log('========================================\n');

  if (realConversations.length === 0) {
    console.log('❌ NO confirmed real conversations found.');
    console.log('\nThis means most calls went to voicemail.');
  } else {
    realConversations.forEach((call, i) => {
      console.log(`\n===== REAL CONVERSATION ${i + 1} of ${realConversations.length} =====`);
      console.log(`👤 Name: ${call.name}`);
      console.log(`🏢 Company: ${call.company || 'N/A'}`);
      console.log(`📧 Email: ${call.email || 'N/A'}`);
      console.log(`📞 Phone: ${call.phone || 'N/A'}`);
      console.log(`💼 Title: ${call.title || 'N/A'}`);
      console.log(`⏱️  Duration: ${call.duration}s`);
      console.log(`📊 Confidence: ${call.totalWeight} points`);
      console.log(`💡 Reason: ${call.reason}`);
      console.log(`\n🗣️  WHAT THEY SAID:`);
      call.humanIndicators.forEach((i: any) => console.log(`   [${i.type}] "${i.pattern}"`));
      console.log(`\n📝 FULL TRANSCRIPT:`);
      console.log('─'.repeat(60));
      console.log(call.transcript);
      console.log('─'.repeat(60));
    });
  }

  // Categorize real conversations
  if (realConversations.length > 0) {
    console.log('\n========================================');
    console.log('CATEGORIZATION OF REAL CONVERSATIONS');
    console.log('========================================\n');

    const byType: Record<string, any[]> = {};
    realConversations.forEach(call => {
      call.humanIndicators.forEach((i: any) => {
        if (!byType[i.type]) byType[i.type] = [];
        if (!byType[i.type].includes(call)) byType[i.type].push(call);
      });
    });

    Object.entries(byType).forEach(([type, calls]) => {
      console.log(`${type}: ${calls.length} calls`);
      calls.forEach(c => console.log(`   - ${c.name} @ ${c.company || 'N/A'}`));
    });
  }

  // Show calls that need review
  console.log('\n========================================');
  console.log('❓ NEEDS MANUAL REVIEW');
  console.log('(First 20 shown)');
  console.log('========================================\n');

  needsReview.slice(0, 20).forEach((call, i) => {
    console.log(`${i + 1}. ${call.name} @ ${call.company || 'N/A'} (${call.duration}s)`);
    console.log(`   Reason: ${call.reason}`);
    console.log(`   Indicators: ${call.humanIndicators.map((i: any) => `[${i.type}] "${i.pattern}"`).join(', ') || 'None'}`);
    console.log(`   Preview: ${call.transcript.substring(0, 150)}...`);
    console.log('');
  });

  // Summary
  console.log('\n========================================');
  console.log('FINAL SUMMARY');
  console.log('========================================\n');

  const total = realConversations.length + needsReview.length + voicemails.length;
  console.log(`Total calls analyzed: ${total}`);
  console.log(`✅ Real conversations: ${realConversations.length} (${(realConversations.length/total*100).toFixed(1)}%)`);
  console.log(`❓ Needs review: ${needsReview.length} (${(needsReview.length/total*100).toFixed(1)}%)`);
  console.log(`📫 Voicemails: ${voicemails.length} (${(voicemails.length/total*100).toFixed(1)}%)\n`);

  if (realConversations.length === 0) {
    console.log('⚠️  WARNING: No clear real conversations found in this campaign.');
    console.log('   - Most calls went to voicemail');
    console.log('   - Consider adjusting calling times');
    console.log('   - Review the "needs review" calls for potential leads');
  }

  process.exit(0);
}

findRealHumanCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
