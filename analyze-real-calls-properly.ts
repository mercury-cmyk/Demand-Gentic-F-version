import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * PROPER Analysis of January 15 Calls
 * Let's look at the ACTUAL transcripts and understand what's really happening
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

async function analyzeCallsProperly() {
  console.log('========================================');
  console.log('PROPER CALL ANALYSIS - JANUARY 15');
  console.log('Looking for REAL human conversations');
  console.log('========================================\n');

  // Get ALL transcribed calls, sorted by duration
  const result = await db.execute(sql`
    SELECT
      dca.id,
      dca.call_duration_seconds,
      dca.disposition,
      dca.connected,
      dca.voicemail_detected,
      dca.notes,
      c.first_name,
      c.last_name,
      c.email,
      c.job_title,
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.notes LIKE '%[Call Transcript]%'
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 200
  `);

  console.log(`Fetched ${result.rows.length} calls with transcripts\n`);

  // Let's categorize calls properly by looking at the actual content
  const categories = {
    realConversation: [] as any[],
    voicemailLeft: [] as any[],
    voicemailNoMessage: [] as any[],
    systemError: [] as any[],
    unclear: [] as any[],
  };

  for (const row of result.rows as any[]) {
    const transcript = extractTranscript(row.notes);
    if (!transcript) continue;

    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    const call = {
      id: row.id,
      name,
      email: row.email,
      title: row.job_title,
      company: row.account_name,
      duration: row.call_duration_seconds,
      transcript,
      disposition: row.disposition,
    };

    // REAL conversation indicators - someone OTHER than the AI is speaking
    const lowerTranscript = transcript.toLowerCase();

    // Check for VOICEMAIL indicators
    const isVoicemail = (
      /leave (a |your )?message/i.test(transcript) ||
      /after the (tone|beep)/i.test(transcript) ||
      /voicemail (service|for|box)/i.test(transcript) ||
      /press.*for more options/i.test(transcript) ||
      /not available/i.test(transcript) ||
      /can'?t (take|answer) (your|the) call/i.test(transcript) ||
      /away from (my|the) (phone|desk)/i.test(transcript)
    );

    // Check for REAL person responding
    // These are things a PERSON would say, not a voicemail system
    const personIndicators = [
      /\bwho is this\b/i,
      /\bwho('s| is) calling\b/i,
      /\bwhat (is this|do you want|are you calling)\b/i,
      /\bwhy (are you|do you keep) calling\b/i,
      /\bstop calling\b/i,
      /\bquit.*calling\b/i,
      /\bnot interested\b/i,
      /\bremove (me|us)\b/i,
      /\btake me off\b/i,
      /\bdon'?t call\b/i,
      /\bhow (did you|can I)\b/i,
      /\bi'?m (busy|in a meeting|not)\b/i,
      /\bwe'?re (not|already|currently)\b/i,
      /\byes,? (I|we|that'?s)\b/i,
      /\bno,? (I|we|that'?s|thank)\b/i,
      /\bsure,? (I|we|what)\b/i,
      /\bhello\?+\s*(hello\?+)?/i,  // Multiple "hello?" = real person
      /\bspeak(ing)?\b/i,  // "Speaking" = real person answered
      /\bthis is \w+\b/i,  // "This is [name]" = real person
    ];

    const hasPersonResponse = personIndicators.some(p => p.test(transcript));

    // Check for repetitive content (AI stuck in loop or voicemail)
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 15);
    let isRepetitive = false;
    if (sentences.length >= 4) {
      const sentenceSet = new Set(sentences.map(s => s.trim().toLowerCase()));
      isRepetitive = sentenceSet.size < sentences.length * 0.4;
    }

    // Check for actual dialogue (multiple speakers)
    // Real conversations have variety and context switches
    const wordCount = transcript.split(/\s+/).length;
    const uniqueWords = new Set(transcript.toLowerCase().split(/\s+/));
    const uniqueRatio = uniqueWords.size / wordCount;

    // Categorize
    if (hasPersonResponse && !isRepetitive && uniqueRatio > 0.35) {
      categories.realConversation.push(call);
    } else if (isVoicemail && !isRepetitive) {
      // AI left a message
      categories.voicemailLeft.push(call);
    } else if (isVoicemail && isRepetitive) {
      // Voicemail but AI got stuck
      categories.voicemailNoMessage.push(call);
    } else if (isRepetitive || uniqueRatio < 0.2) {
      // System error - stuck in loop
      categories.systemError.push(call);
    } else {
      categories.unclear.push(call);
    }
  }

  // PRINT RESULTS
  console.log('========================================');
  console.log('CATEGORIZATION RESULTS');
  console.log('========================================\n');

  console.log(`📞 REAL CONVERSATIONS: ${categories.realConversation.length}`);
  console.log(`📫 Voicemail (message left): ${categories.voicemailLeft.length}`);
  console.log(`📭 Voicemail (no message/stuck): ${categories.voicemailNoMessage.length}`);
  console.log(`⚠️  System errors/loops: ${categories.systemError.length}`);
  console.log(`❓ Unclear: ${categories.unclear.length}`);
  console.log('');

  // SHOW REAL CONVERSATIONS IN DETAIL
  console.log('========================================');
  console.log('🎯 REAL HUMAN CONVERSATIONS');
  console.log('========================================\n');

  if (categories.realConversation.length === 0) {
    console.log('No definitive real conversations found.');
    console.log('This could mean:');
    console.log('  1. All calls went to voicemail');
    console.log('  2. The transcription quality is poor');
    console.log('  3. People hung up immediately\n');
  } else {
    categories.realConversation.forEach((call, i) => {
      console.log(`\n--- CONVERSATION ${i + 1} of ${categories.realConversation.length} ---`);
      console.log(`Name: ${call.name}`);
      console.log(`Company: ${call.company || 'N/A'}`);
      console.log(`Email: ${call.email || 'N/A'}`);
      console.log(`Title: ${call.title || 'N/A'}`);
      console.log(`Duration: ${call.duration}s`);
      console.log(`\nFULL TRANSCRIPT:`);
      console.log('─'.repeat(50));
      console.log(call.transcript);
      console.log('─'.repeat(50));
      console.log('');
    });
  }

  // SHOW UNCLEAR CALLS (might be real)
  console.log('\n========================================');
  console.log('❓ UNCLEAR CALLS (Manual Review Needed)');
  console.log('========================================\n');

  console.log(`Found ${categories.unclear.length} unclear calls. Showing first 10:\n`);

  categories.unclear.slice(0, 10).forEach((call, i) => {
    console.log(`\n--- UNCLEAR ${i + 1} ---`);
    console.log(`Name: ${call.name} @ ${call.company || 'N/A'}`);
    console.log(`Duration: ${call.duration}s`);
    console.log(`\nTRANSCRIPT:`);
    console.log('─'.repeat(50));
    console.log(call.transcript.substring(0, 500));
    if (call.transcript.length > 500) console.log('...[truncated]');
    console.log('─'.repeat(50));
  });

  // Summary of voicemails
  console.log('\n========================================');
  console.log('📫 SAMPLE VOICEMAILS (first 5)');
  console.log('========================================\n');

  categories.voicemailLeft.slice(0, 5).forEach((call, i) => {
    console.log(`${i + 1}. ${call.name} @ ${call.company || 'N/A'} (${call.duration}s)`);
    console.log(`   ${call.transcript.substring(0, 150)}...`);
    console.log('');
  });

  // Final summary
  console.log('\n========================================');
  console.log('FINAL ASSESSMENT');
  console.log('========================================\n');

  const totalAnalyzed = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
  const realPct = (categories.realConversation.length / totalAnalyzed * 100).toFixed(1);
  const vmPct = ((categories.voicemailLeft.length + categories.voicemailNoMessage.length) / totalAnalyzed * 100).toFixed(1);

  console.log(`Total calls analyzed: ${totalAnalyzed}`);
  console.log(`Real conversations: ${categories.realConversation.length} (${realPct}%)`);
  console.log(`Voicemails: ${categories.voicemailLeft.length + categories.voicemailNoMessage.length} (${vmPct}%)`);
  console.log(`System errors: ${categories.systemError.length}`);
  console.log(`Need manual review: ${categories.unclear.length}`);

  process.exit(0);
}

analyzeCallsProperly().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
