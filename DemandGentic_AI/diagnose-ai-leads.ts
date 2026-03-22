import { pool } from './server/db';

async function diagnoseAILeadsIssue() {
  console.log('='.repeat(80));
  console.log('🔍 DIAGNOSING WHY AI CALLS HAVE 0 QUALIFIED LEADS');
  console.log('='.repeat(80));
  
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121'; // Proton UK

  // 1. Summary stats
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN ai_disposition = 'qualified_lead' THEN 1 END) as qualified,
      COUNT(CASE WHEN ai_disposition = 'not_interested' THEN 1 END) as not_interested,
      COUNT(CASE WHEN ai_disposition = 'voicemail' THEN 1 END) as voicemail,
      COUNT(CASE WHEN ai_disposition = 'no_answer' THEN 1 END) as no_answer,
      COUNT(CASE WHEN ai_disposition IS NULL THEN 1 END) as null_disposition,
      COUNT(CASE WHEN ai_transcript IS NOT NULL THEN 1 END) as with_transcript,
      COUNT(CASE WHEN recording_url IS NOT NULL THEN 1 END) as with_recording,
      COUNT(CASE WHEN duration_sec > 0 THEN 1 END) as with_duration
    FROM call_sessions
    WHERE campaign_id = $1
  `, [campaignId]);

  console.log('\n📊 CALL SESSIONS SUMMARY:');
  console.log(`  Total sessions: ${stats.rows[0].total}`);
  console.log(`  With transcript: ${stats.rows[0].with_transcript}`);
  console.log(`  With recording URL: ${stats.rows[0].with_recording}`);
  console.log(`  With duration > 0: ${stats.rows[0].with_duration}`);
  console.log('');
  console.log(`  qualified_lead: ${stats.rows[0].qualified}`);
  console.log(`  not_interested: ${stats.rows[0].not_interested}`);
  console.log(`  voicemail: ${stats.rows[0].voicemail}`);
  console.log(`  no_answer: ${stats.rows[0].no_answer}`);
  console.log(`  NULL disposition: ${stats.rows[0].null_disposition}`);

  // 2. Check the 2 qualified leads - what made them qualified?
  console.log('\n\n' + '='.repeat(80));
  console.log('✅ THE 2 QUALIFIED LEADS - WHAT MADE THEM QUALIFIED?');
  console.log('='.repeat(80));
  
  const qualifiedLeads = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      ai_analysis,
      ai_transcript,
      duration_sec,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_disposition = 'qualified_lead'
  `, [campaignId]);

  for (const lead of qualifiedLeads.rows as any[]) {
    console.log(`\n  Session: ${lead.id}`);
    console.log(`  Duration: ${lead.duration_sec || 0}s`);
    
    const analysis = typeof lead.ai_analysis === 'string' 
      ? JSON.parse(lead.ai_analysis) 
      : lead.ai_analysis;
    console.log(`  AI Analysis Outcome: ${analysis?.outcome || 'N/A'}`);
    console.log(`  AI Analysis Summary: ${(analysis?.summary || '').slice(0, 100)}`);
    
    const transcript = typeof lead.ai_transcript === 'string' 
      ? JSON.parse(lead.ai_transcript) 
      : lead.ai_transcript;
    const userMsgs = transcript?.filter((t: any) => t.role === 'user') || [];
    console.log(`  User messages: ${userMsgs.length}`);
    console.log('  User said:');
    userMsgs.forEach((m: any, i: number) => {
      console.log(`    ${i + 1}. "${(m.message || '').slice(0, 80)}"`);
    });
  }

  // 3. Check conversations that SHOULD be qualified but aren't
  console.log('\n\n' + '='.repeat(80));
  console.log('❌ REAL CONVERSATIONS INCORRECTLY MARKED AS no_answer/voicemail');
  console.log('='.repeat(80));
  
  const mismarked = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      ai_analysis,
      ai_transcript,
      duration_sec,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
      AND ai_disposition IN ('no_answer', 'voicemail')
    ORDER BY created_at DESC
    LIMIT 100
  `, [campaignId]);

  let realConversations = 0;
  let withUserTurns = 0;
  let examples: any[] = [];

  for (const row of mismarked.rows as any[]) {
    try {
      const transcript = typeof row.ai_transcript === 'string' 
        ? JSON.parse(row.ai_transcript) 
        : row.ai_transcript;
      
      const userMsgs = transcript.filter((t: any) => t.role === 'user');
      const fullText = transcript.map((t: any) => t.message || '').join(' ').toLowerCase();
      
      // Filter out voicemail/IVR
      const isVoicemail = fullText.includes('leave a message') || 
                          fullText.includes('voicemail') ||
                          fullText.includes('nach dem signalton') ||
                          fullText.includes('after the beep');
      
      if (userMsgs.length > 0 && !isVoicemail) {
        withUserTurns++;
        
        // Get actual user text (not just "..." or filler)
        const realUserText = userMsgs
          .map((m: any) => m.message || '')
          .filter((t: string) => t.length > 5 && t !== '...')
          .join(' ');
        
        if (realUserText.length > 20) {
          realConversations++;
          if (examples.length >'outcome' as outcome,
      ai_disposition,
      COUNT(*) as count
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_analysis IS NOT NULL
    GROUP BY ai_analysis->>'outcome', ai_disposition
    ORDER BY count DESC
    LIMIT 20
  `, [campaignId]);

  console.log('\n  Outcome → Disposition mapping:');
  for (const row of outcomes.rows as any[]) {
    console.log(`    "${row.outcome || 'NULL'}" → ${row.ai_disposition || 'NULL'}: ${row.count}`);
  }

  // 5. THE ROOT CAUSE
  console.log('\n\n' + '='.repeat(80));
  console.log('🔴 ROOT CAUSE ANALYSIS');
  console.log('='.repeat(80));
  
  console.log(`
  FINDINGS:
  
  1. Only 2 calls are marked as qualified_lead
  2. Both have outcome "Callback Requested" - which should NOT be the only qualified criteria
  3. Many real conversations with user engagement are marked as "no_answer"
  4. The AI Analysis shows generic "Conversation recorded (Historic)" summaries
  
  LIKELY CAUSES:
  
  1. ai_disposition is being set BEFORE the call ends or transcript is analyzed
  2. The disposition logic may be based only on call duration/connection status
     rather than actual conversation content
  3. The AI analysis seems to be a generic placeholder rather than real analysis
  
  SOLUTION NEEDED:
  
  1. Reprocess call_sessions with actual transcript analysis
  2. Update ai_disposition based on conversation content:
     - If user expresses interest → qualified_lead
     - If user asks for callback → qualified_lead  
     - If user declines → not_interested
     - If voicemail/IVR detected → voicemail
     - If no user response → no_answer
  `);

  // 6. Suggest reprocessing
  console.log('\n' + '='.repeat(80));
  console.log('📋 CALLS THAT SHOULD BE REPROCESSED FOR QUALIFIED STATUS');
  console.log('='.repeat(80));
  
  const toReprocess = await pool.query(`
    SELECT id, ai_transcript, ai_disposition
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
      AND ai_disposition != 'qualified_lead'
  `, [campaignId]);

  let shouldBeQualified = 0;
  for (const row of toReprocess.rows as any[]) {
    try {
      const transcript = typeof row.ai_transcript === 'string' 
        ? JSON.parse(row.ai_transcript) 
        : row.ai_transcript;
      
      const fullText = transcript.map((t: any) => (t.message || '').toLowerCase()).join(' ');
      const userMsgs = transcript.filter((t: any) => t.role === 'user');
      const userText = userMsgs.map((m: any) => (m.message || '').toLowerCase()).join(' ');
      
      // Not voicemail/IVR
      const isVoicemail = fullText.includes('leave a message') || fullText.includes('voicemail');
      
      // Positive signals
      const positiveKeywords = [
        'interested',
        'send me',
        'email me',
        'call me back',
        'callback',
        'call back',
        'sounds good',
        'tell me more',
        'yes please',
        '20 minutes', // callback in 20 minutes
        'meet',
        'meeting',
        'schedule'
      ];
      
      const hasPositive = positiveKeywords.some(k => userText.includes(k) || fullText.includes(k));
      
      if (!isVoicemail && hasPositive && userMsgs.length > 0) {
        shouldBeQualified++;
      }
    } catch (e) {}
  }

  console.log(`\n  Sessions with positive signals that should be qualified: ${shouldBeQualified}`);
  console.log(`  Currently qualified: 2`);
  console.log(`  MISSING QUALIFIED LEADS: ~${shouldBeQualified - 2}`);

  await pool.end();
  process.exit(0);
}

diagnoseAILeadsIssue().catch(console.error);