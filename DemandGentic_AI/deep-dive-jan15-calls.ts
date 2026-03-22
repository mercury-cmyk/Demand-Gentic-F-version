import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * Deep Dive Analysis of January 15 Calls
 * Check if there are actual conversations being missed
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

async function deepDiveAnalysis() {
  console.log('========================================');
  console.log('DEEP DIVE: JANUARY 15 CALL ANALYSIS');
  console.log('========================================\n');

  // Get calls with various dispositions to understand patterns
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
      a.name as account_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at::date = '2026-01-15'
      AND dca.call_duration_seconds >= 30
      AND dca.notes LIKE '%[Call Transcript]%'
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 100
  `);

  const calls = result.rows.map((row: any) => ({
    id: row.id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    company: row.account_name,
    duration: row.call_duration_seconds,
    disposition: row.disposition,
    connected: row.connected,
    voicemailDetected: row.voicemail_detected,
    transcript: extractTranscript(row.notes),
  }));

  console.log(`Analyzing ${calls.length} calls...\n`);

  // Categorize transcripts
  let hasVoicemailGreeting = 0;
  let hasDialoguePattern = 0;
  let hasOnlyAgentSpeaking = 0;
  let hasBackAndForth = 0;
  let hasTwoWayConversation = 0;

  const conversationSamples: any[] = [];

  calls.forEach(call => {
    if (!call.transcript) return;

    const transcript = call.transcript.toLowerCase();

    // Check for voicemail indicators
    const vmIndicators = [
      'leave a message',
      'voicemail',
      'press 1 for',
      'after the tone',
      'mailbox is full',
    ];
    const hasVM = vmIndicators.some(indicator => transcript.includes(indicator));

    // Check for dialogue patterns (prospect responding)
    const dialoguePatterns = [
      /\byes\b/i,
      /\bno\b/i,
      /\bok\b/i,
      /\bsure\b/i,
      /\bwho is this\b/i,
      /\bwhat.*about\b/i,
      /\bi'm (not |)interested\b/i,
      /\bcan you\b/i,
      /\bwhat do you\b/i,
      /\btell me more\b/i,
    ];
    const hasDialogue = dialoguePatterns.some(pattern => pattern.test(call.transcript!));

    // Count unique sentences (more variety = real conversation)
    const sentences = call.transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    const uniqueSentences = new Set(sentences);
    const uniqueRatio = uniqueSentences.size / Math.max(sentences.length, 1);

    // Detect two-way conversation (has prospect responses)
    const prospectResponses = [
      /\b(yeah|yep|uh-huh|mhm|right|exactly)\b/i,
      /\b(hello|hi|hey)\b.*\b(who|what|why)\b/i,
      /\b(i|we|my|our)\b/i,
    ];
    const hasTwoWay = prospectResponses.some(pattern => pattern.test(call.transcript!));

    if (hasVM) hasVoicemailGreeting++;
    if (hasDialogue) hasDialoguePattern++;
    if (uniqueRatio  0.5) hasBackAndForth++;
    if (hasTwoWay && !hasVM) {
      hasTwoWayConversation++;
      if (conversationSamples.length  {
    const disp = call.disposition || 'null';
    dispositions[disp] = (dispositions[disp] || 0) + 1;
  });
  Object.entries(dispositions).sort((a,b) => b[1] - a[1]).forEach(([disp, count]) => {
    console.log(`  ${disp}: ${count} (${(count/calls.length*100).toFixed(1)}%)`);
  });

  // Connected flag analysis
  const connectedCount = calls.filter(c => c.connected).length;
  console.log(`\nConnected Flag:`);
  console.log(`  True: ${connectedCount} (${(connectedCount/calls.length*100).toFixed(1)}%)`);
  console.log(`  False: ${calls.length - connectedCount} (${((calls.length - connectedCount)/calls.length*100).toFixed(1)}%)`);

  // Voicemail detected analysis
  const vmDetectedCount = calls.filter(c => c.voicemailDetected).length;
  console.log(`\nVoicemail Detected Flag:`);
  console.log(`  True: ${vmDetectedCount} (${(vmDetectedCount/calls.length*100).toFixed(1)}%)`);
  console.log(`  False: ${calls.length - vmDetectedCount} (${((calls.length - vmDetectedCount)/calls.length*100).toFixed(1)}%)`);

  // Show potential conversation samples
  if (conversationSamples.length > 0) {
    console.log('\n========================================');
    console.log('POTENTIAL ACTUAL CONVERSATIONS');
    console.log('========================================\n');

    conversationSamples.forEach((sample, i) => {
      console.log(`${i + 1}. ${sample.name} @ ${sample.company || 'N/A'}`);
      console.log(`   Duration: ${sample.duration}s | Disposition: ${sample.disposition}`);
      console.log(`   Unique ratio: ${sample.uniqueRatio}`);
      console.log(`   Transcript (first 500 chars):`);
      console.log(`   ${sample.transcript}...`);
      console.log('');
    });
  }

  // Check calls with "connected" or specific dispositions
  console.log('\n========================================');
  console.log('CHECKING SPECIFIC PATTERNS');
  console.log('========================================\n');

  // Calls marked as "interested" or positive dispositions
  const positiveDispositions = ['interested', 'callback', 'qualified', 'hot_lead', 'warm_lead'];
  const positiveCalls = calls.filter(c => positiveDispositions.includes(c.disposition || ''));
  console.log(`Calls with positive dispositions: ${positiveCalls.length}`);
  if (positiveCalls.length > 0) {
    positiveCalls.slice(0, 3).forEach(call => {
      console.log(`\n  - ${call.name} @ ${call.company}`);
      console.log(`    Disposition: ${call.disposition}`);
      console.log(`    Duration: ${call.duration}s`);
      console.log(`    Transcript: ${call.transcript?.substring(0, 200)}...`);
    });
  }

  // Calls > 120 seconds (likely conversations)
  const longCalls = calls.filter(c => c.duration > 120);
  console.log(`\nCalls > 120 seconds: ${longCalls.length}`);
  if (longCalls.length > 0) {
    longCalls.slice(0, 3).forEach(call => {
      console.log(`\n  - ${call.name} @ ${call.company}`);
      console.log(`    Duration: ${call.duration}s`);
      console.log(`    Disposition: ${call.disposition}`);
      console.log(`    Transcript: ${call.transcript?.substring(0, 200)}...`);
    });
  }

  console.log('\n========================================');
  console.log('CONCLUSION');
  console.log('========================================\n');

  if (hasTwoWayConversation > 0) {
    console.log(`✅ Found ${hasTwoWayConversation} potential real conversations!`);
    console.log('   These should be reviewed manually to extract qualified leads.\n');
  } else {
    console.log('❌ No clear two-way conversations found.');
    console.log('   Possible reasons:');
    console.log('   1. Transcription quality issues');
    console.log('   2. All calls actually were voicemails');
    console.log('   3. AI agent disconnecting before prospect responds');
    console.log('   4. Phone numbers were invalid/disconnected\n');
  }

  console.log('System Issues Confirmed:');
  console.log(`  - Voicemail detection: ${vmDetectedCount}/${hasVoicemailGreeting} detected (${(vmDetectedCount/Math.max(hasVoicemailGreeting,1)*100).toFixed(1)}% accuracy)`);
  console.log(`  - Connected flag: ${connectedCount}/${calls.length} set (${(connectedCount/calls.length*100).toFixed(1)}%)`);
  console.log(`  - Disposition accuracy: ${(dispositions.no_answer || 0)}/${calls.length} marked "no_answer" (${((dispositions.no_answer || 0)/calls.length*100).toFixed(1)}%)`);

  process.exit(0);
}

deepDiveAnalysis().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});