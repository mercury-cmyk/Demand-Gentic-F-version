import { pool } from './server/db';
import { transcribeCallSession } from './server/services/google-transcription';

/**
 * Batch-transcribe all no_answer calls from the last 2 days
 * that are longer than 10 seconds and have no transcript.
 * After transcription, re-classifies them based on the new transcript.
 */
async function transcribeNoAnswerCalls() {
  console.log('=== BATCH TRANSCRIBE NO_ANSWER CALLS (>10s, LAST 2 DAYS) ===\n');

  // Find all no_answer calls >10s with missing or empty transcripts
  const result = await pool.query(`
    SELECT
      cs.id,
      cs.to_number_e164 as phone,
      cs.duration_sec,
      cs.recording_url,
      cs.recording_s3_key,
      cs.ai_transcript,
      cs.ai_disposition,
      cs.created_at,
      c.first_name,
      c.last_name,
      c.company_norm as company_name,
      camp.name as campaign_name,
      camp.id as campaign_id
    FROM call_sessions cs
    LEFT JOIN contacts c ON cs.contact_id = c.id
    LEFT JOIN campaigns camp ON cs.campaign_id = camp.id
    WHERE cs.ai_disposition = 'no_answer'
      AND cs.created_at >= NOW() - INTERVAL '2 days'
      AND cs.duration_sec > 10
    ORDER BY cs.duration_sec DESC
  `);

  console.log(`Total no_answer calls >10s in last 2 days: ${result.rows.length}\n`);

  if (result.rows.length === 0) {
    console.log('No records found.');
    await pool.end();
    return;
  }

  // Split into: needs transcription vs already has transcript
  const needsTranscription: any[] = [];
  const alreadyHasTranscript: any[] = [];

  for (const row of result.rows) {
    const transcript = (row.ai_transcript || '').trim();
    if (transcript.length  r.recording_url || r.recording_s3_key).length}`);
  console.log(`  No recording at all:    ${needsTranscription.filter(r => !r.recording_url && !r.recording_s3_key).length}`);
  console.log('');

  // Transcribe calls that need it
  const transcriptionResults = {
    success: 0,
    failed: 0,
    noRecording: 0,
  };

  if (needsTranscription.length > 0) {
    console.log('='.repeat(60));
    console.log('TRANSCRIBING CALLS WITHOUT TRANSCRIPTS');
    console.log('='.repeat(60));

    for (let i = 0; i  SKIP: No recording available');
        transcriptionResults.noRecording++;
        continue;
      }

      try {
        const success = await transcribeCallSession(row.id);
        if (success) {
          console.log('  -> SUCCESS: Transcribed');
          transcriptionResults.success++;
        } else {
          console.log('  -> FAILED: Transcription returned false');
          transcriptionResults.failed++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  -> ERROR: ${msg}`);
        transcriptionResults.failed++;
      }

      // Small delay between calls to avoid rate limiting
      if (i  setTimeout(resolve, 1000));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('TRANSCRIPTION RESULTS');
    console.log('='.repeat(60));
    console.log(`  Successful:    ${transcriptionResults.success}`);
    console.log(`  Failed:        ${transcriptionResults.failed}`);
    console.log(`  No recording:  ${transcriptionResults.noRecording}`);
    console.log('='.repeat(60));
  }

  // Now re-read all the calls with fresh transcripts and classify
  console.log('\n\n=== RE-CLASSIFYING ALL NO_ANSWER CALLS >10s WITH TRANSCRIPTS ===\n');

  const freshResult = await pool.query(`
    SELECT
      cs.id,
      cs.to_number_e164 as phone,
      cs.duration_sec,
      cs.ai_transcript,
      cs.ai_disposition,
      cs.created_at,
      c.first_name,
      c.last_name,
      c.company_norm as company_name,
      camp.name as campaign_name
    FROM call_sessions cs
    LEFT JOIN contacts c ON cs.contact_id = c.id
    LEFT JOIN campaigns camp ON cs.campaign_id = camp.id
    WHERE cs.ai_disposition = 'no_answer'
      AND cs.created_at >= NOW() - INTERVAL '2 days'
      AND cs.duration_sec > 10
    ORDER BY cs.duration_sec DESC
  `);

  const categories = {
    correctNoAnswer: [] as any[],
    hadConversation: [] as any[],
    voicemail: [] as any[],
    screener: [] as any[],
    ivr: [] as any[],
    languageBarrier: [] as any[],
    noTranscript: [] as any[],
  };

  for (const row of freshResult.rows) {
    const transcript = (row.ai_transcript || '').toLowerCase();
    const hasTranscript = transcript.trim().length > 10;

    if (!hasTranscript) {
      categories.noTranscript.push(row);
      continue;
    }

    // IVR / phone menu detection
    const isIVR = transcript.includes('press 1') ||
      transcript.includes('press 2') ||
      transcript.includes('press 0') ||
      transcript.includes('for sales') ||
      transcript.includes('for support') ||
      transcript.includes('for billing') ||
      transcript.includes('main menu') ||
      transcript.includes('dial by name') ||
      transcript.includes('extension') ||
      transcript.includes('please hold') ||
      transcript.includes('your call is important') ||
      transcript.includes('office hours') ||
      transcript.includes('currently closed') ||
      transcript.includes('business hours') ||
      transcript.includes('thank you for calling');

    // Google Voice / AI screener
    const isScreener = transcript.includes('please stay on the line') ||
      transcript.includes('state your name') ||
      transcript.includes('i\'ll see if this person') ||
      transcript.includes('call assist') ||
      transcript.includes('screening') ||
      transcript.includes('record your name');

    // Voicemail
    const isVoicemail = transcript.includes('leave a message') ||
      transcript.includes('voicemail') ||
      transcript.includes('not available') ||
      transcript.includes('after the beep') ||
      transcript.includes('mailbox') ||
      transcript.includes('can\'t pick up') ||
      transcript.includes('leave your name') ||
      transcript.includes('i\'ll get back to you');

    // Non-English
    const nonEnglishPatterns = /não|oui|non|hola|bonjour|danke|gracias|si señor|que|como|habla/i;
    const isNonEnglish = nonEnglishPatterns.test(transcript);

    // Actual human conversation
    const contactLines = transcript.split('\n')
      .filter((l: string) => l.match(/^(contact|prospect|speaker\s*2|caller):/i))
      .map((l: string) => l.replace(/^(contact|prospect|speaker\s*2|caller):\s*/i, '').trim());
    const contactWords = contactLines.join(' ').split(/\s+/).filter(Boolean).length;
    const hasHumanConversation = contactWords >= 5 && !isScreener && !isIVR;

    if (isNonEnglish) {
      categories.languageBarrier.push(row);
    } else if (isVoicemail) {
      categories.voicemail.push(row);
    } else if (isScreener) {
      categories.screener.push(row);
    } else if (isIVR) {
      categories.ivr.push(row);
    } else if (hasHumanConversation) {
      categories.hadConversation.push(row);
    } else {
      categories.correctNoAnswer.push(row);
    }
  }

  // Print classification summary
  console.log('='.repeat(60));
  console.log('RE-CLASSIFICATION SUMMARY (calls >10s)');
  console.log('='.repeat(60));
  console.log(`  Correct no_answer:                ${categories.correctNoAnswer.length}`);
  console.log(`  HAD CONVERSATION (misclassified):  ${categories.hadConversation.length}`);
  console.log(`  Should be VOICEMAIL:               ${categories.voicemail.length}`);
  console.log(`  AI Screener (Google Voice):         ${categories.screener.length}`);
  console.log(`  IVR / Phone Menu:                  ${categories.ivr.length}`);
  console.log(`  Language Barrier:                  ${categories.languageBarrier.length}`);
  console.log(`  Still no transcript:               ${categories.noTranscript.length}`);
  console.log('='.repeat(60));

  // Detail the important ones
  if (categories.hadConversation.length > 0) {
    console.log('\n\n*** MISCLASSIFIED — Had real conversation but marked no_answer: ***');
    console.log('-'.repeat(60));
    for (const row of categories.hadConversation) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Phone: ${row.phone}`);
      console.log(`Duration: ${row.duration_sec}s`);
      console.log(`Date: ${new Date(row.created_at).toLocaleString()}`);
      if (row.ai_transcript) {
        console.log('Transcript:');
        console.log(row.ai_transcript);
      }
      console.log('-'.repeat(60));
    }
  }

  if (categories.voicemail.length > 0) {
    console.log('\n\nShould be VOICEMAIL:');
    console.log('-'.repeat(60));
    for (const row of categories.voicemail) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Duration: ${row.duration_sec}s`);
      if (row.ai_transcript) {
        const snippet = row.ai_transcript.substring(0, 300);
        console.log(`Transcript: ${snippet}${row.ai_transcript.length > 300 ? '...' : ''}`);
      }
      console.log('-'.repeat(60));
    }
  }

  if (categories.screener.length > 0) {
    console.log('\n\nAI SCREENER calls:');
    console.log('-'.repeat(60));
    for (const row of categories.screener) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Duration: ${row.duration_sec}s`);
      if (row.ai_transcript) {
        const snippet = row.ai_transcript.substring(0, 300);
        console.log(`Transcript: ${snippet}${row.ai_transcript.length > 300 ? '...' : ''}`);
      }
      console.log('-'.repeat(60));
    }
  }

  if (categories.ivr.length > 0) {
    console.log('\n\nIVR / Phone Menu:');
    console.log('-'.repeat(60));
    for (const row of categories.ivr) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Duration: ${row.duration_sec}s`);
      if (row.ai_transcript) {
        const snippet = row.ai_transcript.substring(0, 300);
        console.log(`Transcript: ${snippet}${row.ai_transcript.length > 300 ? '...' : ''}`);
      }
      console.log('-'.repeat(60));
    }
  }

  if (categories.languageBarrier.length > 0) {
    console.log('\n\nLANGUAGE BARRIER:');
    console.log('-'.repeat(60));
    for (const row of categories.languageBarrier) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Duration: ${row.duration_sec}s`);
      if (row.ai_transcript) {
        console.log('Transcript:');
        console.log(row.ai_transcript);
      }
      console.log('-'.repeat(60));
    }
  }

  await pool.end();
}

transcribeNoAnswerCalls().catch(console.error);