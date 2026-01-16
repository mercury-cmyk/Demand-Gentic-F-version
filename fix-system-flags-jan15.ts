import { db } from './server/db';
import { sql } from 'drizzle-orm';

/**
 * Fix System Flags for January 15 Calls
 * - Set connected=true for real conversations
 * - Set voicemail_detected=true for voicemails
 * - Update dispositions appropriately
 */

const TRANSCRIPT_MARKER = '[Call Transcript]';

function extractTranscript(notes: string | null): string | null {
  if (!notes) return null;
  const markerIndex = notes.indexOf(TRANSCRIPT_MARKER);
  if (markerIndex === -1) return null;
  return notes.substring(markerIndex + TRANSCRIPT_MARKER.length).trim();
}

function isRealConversation(transcript: string): boolean {
  let score = 0;

  // Voicemail indicators (negative)
  const vmPatterns = [
    /leave a message/i,
    /after the tone/i,
    /press.*for/i,
    /mailbox is full/i,
    /not available/i,
  ];

  // Conversation indicators (positive)
  const conversationPatterns = [
    /\b(who is this|who are you)\b/i,
    /\b(why.*calling|stop calling|quit calling)\b/i,
    /\b(yes|yeah|yep|sure|okay)\b.*\b(interested|send|email|tell me)\b/i,
    /\b(no thanks|not interested|remove.*list)\b/i,
    /\b(i'?m|we'?re).*\b(busy|meeting|call back)\b/i,
    /\bwhat.*about\b/i,
    /\bhello\?+\b/i,
  ];

  vmPatterns.forEach(pattern => {
    if (pattern.test(transcript)) score -= 50;
  });

  conversationPatterns.forEach(pattern => {
    if (pattern.test(transcript)) score += 50;
  });

  // Check repetition
  const lines = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  if (lines.length > 5) {
    const firstLine = lines[0];
    const repetitions = lines.filter(l => l === firstLine).length;
    if (repetitions > lines.length * 0.4) score -= 60;
  }

  // Unique word ratio
  const words = transcript.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / Math.max(words.length, 1);
  if (uniqueRatio < 0.25) score -= 40;
  else if (uniqueRatio > 0.6) score += 30;

  return score > 0;
}

function isVoicemail(transcript: string): boolean {
  const vmIndicators = [
    /leave a message/i,
    /after the tone/i,
    /voicemail service/i,
    /press.*for/i,
    /mailbox is full/i,
    /not available/i,
    /can'?t take your call/i,
    /away from (my|the) (phone|desk)/i,
  ];

  return vmIndicators.some(pattern => pattern.test(transcript));
}

async function fixSystemFlags() {
  console.log('========================================');
  console.log('FIX SYSTEM FLAGS FOR JANUARY 15');
  console.log('========================================\n');

  const args = process.argv.slice(2);
  const EXECUTE = args.includes('--execute');

  if (!EXECUTE) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('Run with --execute to actually update flags\n');
  } else {
    console.log('⚡ EXECUTE MODE - Flags WILL be updated\n');
  }

  // Fetch all calls
  const result = await db.execute(sql`
    SELECT
      id,
      call_duration_seconds,
      connected,
      voicemail_detected,
      disposition,
      notes
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND call_duration_seconds >= 20
      AND notes LIKE '%[Call Transcript]%'
  `);

  console.log(`Analyzing ${result.rows.length} calls...\n`);

  let conversationsToFix = 0;
  let voicemailsToFix = 0;
  let alreadyCorrect = 0;

  const updates: any[] = [];

  result.rows.forEach((row: any) => {
    const transcript = extractTranscript(row.notes);
    if (!transcript) return;

    const isConversation = isRealConversation(transcript);
    const isVM = isVoicemail(transcript);

    const shouldBeConnected = isConversation;
    const shouldBeVoicemail = isVM && !isConversation;

    const needsUpdate = (
      row.connected !== shouldBeConnected ||
      row.voicemail_detected !== shouldBeVoicemail
    );

    if (needsUpdate) {
      updates.push({
        id: row.id,
        currentConnected: row.connected,
        newConnected: shouldBeConnected,
        currentVoicemail: row.voicemail_detected,
        newVoicemail: shouldBeVoicemail,
        disposition: row.disposition,
        newDisposition: shouldBeConnected ? 'answered' : (shouldBeVoicemail ? 'voicemail' : 'no_answer'),
      });

      if (shouldBeConnected) conversationsToFix++;
      if (shouldBeVoicemail) voicemailsToFix++;
    } else {
      alreadyCorrect++;
    }
  });

  console.log('Analysis Results:');
  console.log(`  Conversations to mark as connected: ${conversationsToFix}`);
  console.log(`  Voicemails to mark as detected: ${voicemailsToFix}`);
  console.log(`  Already correct: ${alreadyCorrect}`);
  console.log(`  Total updates needed: ${updates.length}\n`);

  if (!EXECUTE) {
    console.log('Preview of first 10 updates:\n');
    updates.slice(0, 10).forEach((u, i) => {
      console.log(`${i + 1}. Call ID: ${u.id}`);
      console.log(`   Connected: ${u.currentConnected} → ${u.newConnected}`);
      console.log(`   Voicemail: ${u.currentVoicemail} → ${u.newVoicemail}`);
      console.log(`   Disposition: ${u.disposition} → ${u.newDisposition}`);
      console.log('');
    });

    if (updates.length > 10) {
      console.log(`   ... and ${updates.length - 10} more updates\n`);
    }

    console.log('To execute these updates:');
    console.log('  npx tsx fix-system-flags-jan15.ts --execute\n');
    process.exit(0);
  }

  // EXECUTE MODE
  console.log('Updating flags...\n');

  let updated = 0;
  let errors = 0;

  for (const update of updates) {
    try {
      await db.execute(sql`
        UPDATE dialer_call_attempts
        SET
          connected = ${update.newConnected},
          voicemail_detected = ${update.newVoicemail},
          disposition = ${update.newDisposition}
        WHERE id = ${update.id}
      `);

      updated++;

      if (updated % 50 === 0) {
        console.log(`  Updated ${updated}/${updates.length} calls...`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error updating call ${update.id}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Updated ${updated} calls`);
  if (errors > 0) {
    console.log(`❌ Errors: ${errors}`);
  }

  console.log('\n========================================');
  console.log('VERIFICATION');
  console.log('========================================\n');

  const verification = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN connected = true THEN 1 END) as connected,
      COUNT(CASE WHEN voicemail_detected = true THEN 1 END) as voicemail,
      COUNT(CASE WHEN disposition = 'answered' THEN 1 END) as answered_disp,
      COUNT(CASE WHEN disposition = 'voicemail' THEN 1 END) as voicemail_disp,
      COUNT(CASE WHEN disposition = 'no_answer' THEN 1 END) as no_answer_disp
    FROM dialer_call_attempts
    WHERE created_at::date = '2026-01-15'
      AND call_duration_seconds >= 20
  `);

  const stats = verification.rows[0] as any;
  console.log('Updated Statistics:');
  console.log(`  Total calls (>=20s): ${stats.total}`);
  console.log(`  Connected: ${stats.connected} (${(stats.connected/stats.total*100).toFixed(1)}%)`);
  console.log(`  Voicemail detected: ${stats.voicemail} (${(stats.voicemail/stats.total*100).toFixed(1)}%)`);
  console.log(`  Disposition - answered: ${stats.answered_disp}`);
  console.log(`  Disposition - voicemail: ${stats.voicemail_disp}`);
  console.log(`  Disposition - no_answer: ${stats.no_answer_disp}\n`);

  console.log('✅ System flags have been corrected!');
  console.log('\nThese flags should now accurately reflect:');
  console.log('  - connected=true for real conversations');
  console.log('  - voicemail_detected=true for voicemails');
  console.log('  - Proper dispositions\n');

  process.exit(0);
}

fixSystemFlags().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
