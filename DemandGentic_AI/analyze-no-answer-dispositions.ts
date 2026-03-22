import { pool } from './server/db';

async function analyzeNoAnswerDispositions() {
  console.log('=== RE-EVALUATING NO_ANSWER DISPOSITIONS (LAST 2 DAYS) ===\n');

  const result = await pool.query(`
    SELECT
      cs.id,
      cs.to_number_e164 as phone,
      cs.ai_disposition,
      cs.duration_sec,
      cs.recording_url,
      cs.ai_transcript,
      cs.ai_analysis,
      cs.status,
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
    ORDER BY cs.created_at DESC
  `);

  console.log(`Total no_answer calls in last 2 days: ${result.rows.length}\n`);

  if (result.rows.length === 0) {
    console.log('No records found.');
    await pool.end();
    return;
  }

  // Categorize the calls
  const categories = {
    trueNoAnswer: [] as any[],         // Genuinely no one answered
    hadConversation: [] as any[],       // Had human interaction — misclassified
    voicemail: [] as any[],             // Was actually voicemail
    screener: [] as any[],             // Google Voice / AI screener
    shortCall: [] as any[],            // Very short, ambiguous
    languageBarrier: [] as any[],      // Non-English
  };

  for (const row of result.rows) {
    const transcript = (row.ai_transcript || '').toLowerCase();
    const duration = row.duration_sec || 0;
    const hasTranscript = transcript.trim().length > 10;

    // Check for Google Voice / AI screener patterns
    const isScreener = transcript.includes('please stay on the line') ||
      transcript.includes('state your name') ||
      transcript.includes('i\'ll see if this person') ||
      transcript.includes('call assist') ||
      transcript.includes('screening');

    // Check for actual human conversation (contact said meaningful words)
    const contactLines = transcript.split('\n')
      .filter((l: string) => l.startsWith('contact:'))
      .map((l: string) => l.replace('contact:', '').trim());
    const contactWords = contactLines.join(' ').split(/\s+/).filter(Boolean).length;
    const hasHumanConversation = contactWords >= 5 && !isScreener;

    // Check for voicemail indicators
    const isVoicemail = transcript.includes('leave a message') ||
      transcript.includes('voicemail') ||
      transcript.includes('not available') ||
      transcript.includes('after the beep') ||
      transcript.includes('mailbox');

    // Check for non-English
    const nonEnglishPatterns = /não|oui|non|hola|bonjour|danke|gracias|si señor/i;
    const isNonEnglish = nonEnglishPatterns.test(transcript);

    if (isNonEnglish) {
      categories.languageBarrier.push(row);
    } else if (isVoicemail) {
      categories.voicemail.push(row);
    } else if (isScreener) {
      categories.screener.push(row);
    } else if (hasHumanConversation) {
      categories.hadConversation.push(row);
    } else if (duration  0) {
    console.log('🚨 MISCLASSIFIED — Had real conversation but marked no_answer:');
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

  // Detail voicemail misclassifications
  if (categories.voicemail.length > 0) {
    console.log('\n📞 Should be VOICEMAIL (not no_answer):');
    console.log('-'.repeat(60));
    for (const row of categories.voicemail) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Duration: ${row.duration_sec}s`);
      if (row.ai_transcript) {
        const snippet = row.ai_transcript.substring(0, 200);
        console.log(`Transcript snippet: ${snippet}...`);
      }
      console.log('-'.repeat(60));
    }
  }

  // Detail screener calls
  if (categories.screener.length > 0) {
    console.log('\n🤖 AI SCREENER calls (Google Voice etc):');
    console.log('-'.repeat(60));
    for (const row of categories.screener) {
      console.log(`\nID: ${row.id}`);
      console.log(`Campaign: ${row.campaign_name}`);
      console.log(`Name: ${row.first_name || 'Unknown'} ${row.last_name || ''}`);
      console.log(`Duration: ${row.duration_sec}s`);
      if (row.ai_transcript) {
        const snippet = row.ai_transcript.substring(0, 200);
        console.log(`Transcript snippet: ${snippet}...`);
      }
      console.log('-'.repeat(60));
    }
  }

  // Detail language barrier
  if (categories.languageBarrier.length > 0) {
    console.log('\n🌍 LANGUAGE BARRIER:');
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

  // Detail short/ambiguous
  if (categories.shortCall.length > 0) {
    console.log('\n❓ SHORT/AMBIGUOUS (needs review):');
    console.log('-'.repeat(60));
    for (const row of categories.shortCall) {
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

analyzeNoAnswerDispositions().catch(console.error);