import { pool } from './server/db';

async function checkUnderReviewLeads() {
  console.log('=== CHECKING UNDER_REVIEW LEADS FOR AI CALL AUTHENTICITY ===\n');
  
  // Get all under_review leads from both campaigns
  const leads = await pool.query(`
    SELECT 
      l.id,
      l.contact_name,
      l.contact_email,
      l.campaign_id,
      l.call_attempt_id,
      l.recording_url,
      l.call_duration,
      l.transcript,
      l.ai_score,
      l.ai_analysis,
      l.qa_status,
      l.created_at,
      l.telnyx_call_id,
      c.name as campaign_name,
      dca.disposition as call_disposition,
      dca.created_at as call_created_at
    FROM leads l
    LEFT JOIN campaigns c ON l.campaign_id = c.id
    LEFT JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
    WHERE l.qa_status = 'under_review'
      AND l.deleted_at IS NULL
      AND (c.name LIKE '%Proton%' OR c.name LIKE '%UK Export%')
    ORDER BY l.created_at DESC
  `);
  
  console.log(`Found ${leads.rows.length} leads under review\n`);
  
  // Categorize leads
  const categories = {
    hasRecordingAndTranscript: [] as any[],
    hasRecordingNoTranscript: [] as any[],
    noRecordingHasTranscript: [] as any[],
    noRecordingNoTranscript: [] as any[],
  };
  
  for (const lead of leads.rows) {
    const hasRecording = lead.recording_url && lead.recording_url.trim() !== '';
    const hasTranscript = lead.transcript && lead.transcript.trim() !== '' && lead.transcript !== '[]';
    
    if (hasRecording && hasTranscript) {
      categories.hasRecordingAndTranscript.push(lead);
    } else if (hasRecording && !hasTranscript) {
      categories.hasRecordingNoTranscript.push(lead);
    } else if (!hasRecording && hasTranscript) {
      categories.noRecordingHasTranscript.push(lead);
    } else {
      categories.noRecordingNoTranscript.push(lead);
    }
  }
  
  console.log('📊 LEAD CATEGORIES:');
  console.log('─'.repeat(60));
  console.log(`  Has Recording + Transcript: ${categories.hasRecordingAndTranscript.length}`);
  console.log(`  Has Recording, No Transcript: ${categories.hasRecordingNoTranscript.length}`);
  console.log(`  No Recording, Has Transcript: ${categories.noRecordingHasTranscript.length}`);
  console.log(`  No Recording, No Transcript: ${categories.noRecordingNoTranscript.length}`);
  
  // Analyze leads with transcripts to verify AI call authenticity
  console.log('\n\n🔍 LEADS WITH TRANSCRIPTS - ANALYZING CONTENT:');
  console.log('═'.repeat(80));
  
  const allWithTranscripts = [...categories.hasRecordingAndTranscript, ...categories.noRecordingHasTranscript];
  
  let genuineCount = 0;
  let suspiciousCount = 0;
  let voicemailCount = 0;
  let shortCallCount = 0;
  
  for (const lead of allWithTranscripts.slice(0, 30)) { // Check first 30
    let transcript = lead.transcript || '';
    
    // Parse JSON transcript if needed
    try {
      if (transcript.startsWith('[') || transcript.startsWith('{')) {
        const parsed = JSON.parse(transcript);
        if (Array.isArray(parsed)) {
          transcript = parsed.map((t: any) => `${t.role || t.speaker}: ${t.content || t.text || t.message}`).join('\n');
        }
      }
    } catch (e) {
      // Keep as-is
    }
    
    const transcriptLower = transcript.toLowerCase();
    const duration = lead.call_duration || 0;
    
    // Check for voicemail indicators
    const voicemailIndicators = [
      'leave a message',
      'leave your message',
      'voicemail',
      'not available',
      'please record',
      'after the beep',
      'after the tone',
      'mailbox',
      'greeting'
    ];
    
    // Check for genuine conversation indicators
    const conversationIndicators = [
      'how are you',
      'speaking',
      'hello',
      'yes',
      'interested',
      'tell me more',
      'send me',
      'email',
      'what is this about',
      'who is calling'
    ];
    
    const hasVoicemailIndicator = voicemailIndicators.some(v => transcriptLower.includes(v));
    const hasConversationIndicator = conversationIndicators.some(c => transcriptLower.includes(c));
    const hasUserResponse = transcript.includes('user:') || transcript.includes('human:') || transcript.includes('contact:');
    
    let classification = 'UNKNOWN';
    let reason = '';
    
    if (hasVoicemailIndicator && !hasConversationIndicator) {
      classification = 'VOICEMAIL';
      reason = 'Contains voicemail greeting patterns';
      voicemailCount++;
    } else if (duration < 15) {
      classification = 'SHORT_CALL';
      reason = `Very short duration (${duration}s)`;
      shortCallCount++;
    } else if (hasConversationIndicator && hasUserResponse) {
      classification = 'GENUINE';
      reason = 'Contains back-and-forth conversation';
      genuineCount++;
    } else if (transcript.length < 50) {
      classification = 'SUSPICIOUS';
      reason = 'Very short transcript';
      suspiciousCount++;
    } else {
      classification = 'NEEDS_REVIEW';
      reason = 'Unable to determine automatically';
      suspiciousCount++;
    }
    
    console.log(`\n  Lead: ${lead.contact_name || 'Unknown'}`);
    console.log(`  Campaign: ${lead.campaign_name}`);
    console.log(`  Duration: ${duration}s | Recording: ${lead.recording_url ? 'YES' : 'NO'}`);
    console.log(`  Classification: ${classification}`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Disposition: ${lead.call_disposition || 'N/A'}`);
    
    // Show transcript preview
    const preview = transcript.substring(0, 200).replace(/\n/g, ' ');
    console.log(`  Transcript Preview: ${preview}...`);
  }
  
  // Check leads without transcripts
  console.log('\n\n⚠️ LEADS WITHOUT TRANSCRIPTS:');
  console.log('═'.repeat(80));
  
  const noTranscript = [...categories.hasRecordingNoTranscript, ...categories.noRecordingNoTranscript];
  
  console.log(`\nTotal without transcripts: ${noTranscript.length}`);
  
  if (noTranscript.length > 0) {
    console.log('\nSample (first 10):');
    for (const lead of noTranscript.slice(0, 10)) {
      console.log(`  - ${lead.contact_name || 'Unknown'} | ${lead.campaign_name} | Duration: ${lead.call_duration || 'N/A'}s | Recording: ${lead.recording_url ? 'YES' : 'NO'}`);
    }
  }
  
  // Check call_sessions for these leads
  console.log('\n\n📞 CROSS-CHECKING WITH CALL_SESSIONS:');
  console.log('═'.repeat(80));
  
  for (const campaignId of ['ae5b353d-64a9-44d8-92cf-69d4726ca121', '70434f6e-3ab6-49e4-acf7-350b81f60ea2']) {
    const campaignName = campaignId === 'ae5b353d-64a9-44d8-92cf-69d4726ca121' ? 'Proton UK' : 'UK Export Finance';
    
    // Check call_sessions count
    const sessionCount = await pool.query(`
      SELECT COUNT(*) as total FROM call_sessions WHERE campaign_id = $1
    `, [campaignId]);
    
    console.log(`\n  ${campaignName}: ${sessionCount.rows[0]?.total || 0} call sessions`);
  }
  
  // Check if leads have linked call_attempts with recordings
  console.log('\n\n📞 CHECKING LINKED CALL ATTEMPTS FOR RECORDINGS:');
  console.log('═'.repeat(80));
  
  const linkedAttempts = await pool.query(`
    SELECT 
      l.contact_name,
      l.campaign_id,
      c.name as campaign_name,
      dca.id as attempt_id,
      dca.recording_url as attempt_recording,
      dca.disposition,
      l.recording_url as lead_recording
    FROM leads l
    LEFT JOIN campaigns c ON l.campaign_id = c.id
    LEFT JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
    WHERE l.qa_status = 'under_review'
      AND l.deleted_at IS NULL
      AND (c.name LIKE '%Proton%' OR c.name LIKE '%UK Export%')
    ORDER BY l.created_at DESC
    LIMIT 20
  `);
  
  console.log('Sample leads and their call attempt data:');
  for (const row of linkedAttempts.rows) {
    console.log(`  - ${row.contact_name} | ${row.campaign_name}`);
    console.log(`    Attempt Recording: ${row.attempt_recording || 'NONE'}`);
    console.log(`    Lead Recording: ${row.lead_recording || 'NONE'}`);
    console.log(`    Disposition: ${row.disposition || 'N/A'}`);
    console.log('');
  }
  
  // Final summary
  console.log('\n\n📋 FINAL SUMMARY:');
  console.log('═'.repeat(80));
  console.log(`Total Under Review Leads: ${leads.rows.length}`);
  console.log(`\nWith Transcripts Analyzed:`);
  console.log(`  ✅ Genuine (conversation detected): ${genuineCount}`);
  console.log(`  📞 Voicemail (misclassified): ${voicemailCount}`);
  console.log(`  ⏱️ Short Call (<15s): ${shortCallCount}`);
  console.log(`  ❓ Suspicious/Needs Manual Review: ${suspiciousCount}`);
  console.log(`\nWithout Transcripts: ${noTranscript.length}`);
  
  // Recommendation
  console.log('\n📌 RECOMMENDATION:');
  if (voicemailCount > 0 || shortCallCount > 0) {
    console.log(`  - ${voicemailCount + shortCallCount} leads may be misclassified (voicemail/short calls)`);
  }
  if (noTranscript.length > 0) {
    console.log(`  - ${noTranscript.length} leads need transcription to verify`);
  }
  
  process.exit(0);
}

checkUnderReviewLeads().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
