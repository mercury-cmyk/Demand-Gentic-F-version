import { pool } from './server/db';

async function analyzeQualifiedPotential() {
  console.log('=== ANALYZING CALLS FOR QUALIFIED LEAD POTENTIAL ===\n');
  
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121'; // Proton UK

  // Get all sessions with transcripts
  console.log('📊 Getting all sessions with transcripts...\n');

  const result = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      duration_sec,
      recording_url,
      ai_transcript,
      ai_analysis,
      status,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
    ORDER BY created_at DESC
  `, [campaignId]);

  console.log(`Total sessions with transcripts: ${result.rows.length}\n`);

  let stats = {
    withUserResponse: 0,
    withMultipleUserTurns: 0,
    withPositiveSignals: 0,
    potentialQualified: 0,
    voicemail: 0,
    ivr: 0,
    noAnswer: 0
  };

  const potentialLeads: any[] = [];
  const byDisposition: Record<string, number> = {};

  for (const row of result.rows as any[]) {
    const disposition = (row.ai_disposition || 'NULL').toString();
    byDisposition[disposition] = (byDisposition[disposition] || 0) + 1;

    if (!row.ai_transcript) continue;
    
    try {
      const transcript = typeof row.ai_transcript === 'string' 
        ? JSON.parse(row.ai_transcript) 
        : row.ai_transcript;
      
      // Check for user messages
      const userMessages = transcript.filter((t: any) => t.role === 'user');
      const agentMessages = transcript.filter((t: any) => t.role === 'agent' || t.role === 'assistant');
      
      if (userMessages.length > 0) {
        stats.withUserResponse++;
      }
      if (userMessages.length >= 2) {
        stats.withMultipleUserTurns++;
      }

      // Build full text for analysis
      const fullText = transcript.map((t: any) => t.message || t.text || '').join(' ').toLowerCase();
      
      // Detect voicemail/IVR
      const isVoicemail = fullText.includes('leave a message') || 
                          fullText.includes('voicemail') ||
                          fullText.includes('not available') ||
                          fullText.includes('nach dem signalton') ||
                          fullText.includes('after the beep');
      
      const isIVR = fullText.includes('press 1') || 
                    fullText.includes('press 2') ||
                    fullText.includes('main menu') ||
                    fullText.includes('drücken sie');
      
      if (isVoicemail) {
        stats.voicemail++;
        continue;
      }
      if (isIVR && userMessages.length === 0) {
        stats.ivr++;
        continue;
      }

      // Check for positive signals from user
      const userText = userMessages.map((m: any) => m.message || m.text || '').join(' ').toLowerCase();
      const positivePatterns = [
        'yes',
        'sure',
        'interested',
        'tell me more',
        'send me',
        'email me',
        'call me back',
        'sounds good',
        'ok',
        'okay',
        'that would be',
        'can you',
        'what is',
        'how does',
        'more information'
      ];
      
      const negativePatterns = [
        'not interested',
        'don\'t call',
        'remove me',
        'stop calling',
        'no thank',
        'busy',
        'wrong number',
        'no longer'
      ];
      
      const hasPositive = positivePatterns.some(p => userText.includes(p));
      const hasNegative = negativePatterns.some(p => userText.includes(p));
      
      if (hasPositive) {
        stats.withPositiveSignals++;
      }
      
      // Potential qualified lead criteria:
      // - Has user responses
      // - Has positive signals OR multiple turns of conversation
      // - No strong negative signals
      if (userMessages.length >= 1 && !hasNegative && (hasPositive || userMessages.length >= 3)) {
        stats.potentialQualified++;
        potentialLeads.push({
          id: row.id,
          disposition: disposition,
          duration: row.duration_sec,
          userTurns: userMessages.length,
          hasPositive,
          userSample: userMessages.slice(0, 2).map((m: any) => (m.message || m.text || '').slice(0, 100)),
          created: row.created_at
        });
      }
      
    } catch (e) {
      // skip unparseable
    }
  }

  console.log('📈 DISPOSITION BREAKDOWN:');
  for (const [disp, count] of Object.entries(byDisposition).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${disp}: ${count}`);
  }

  console.log('\n📊 CONVERSATION QUALITY STATS:');
  console.log(`  Sessions with any user response: ${stats.withUserResponse}`);
  console.log(`  Sessions with 2+ user turns: ${stats.withMultipleUserTurns}`);
  console.log(`  Sessions with positive signals: ${stats.withPositiveSignals}`);
  console.log(`  Voicemail detected: ${stats.voicemail}`);
  console.log(`  IVR detected: ${stats.ivr}`);
  console.log(`  POTENTIAL QUALIFIED LEADS: ${stats.potentialQualified}`);

  console.log('\n\n🏆 POTENTIAL QUALIFIED LEADS (should NOT be voicemail/no_answer):');
  console.log('=' .repeat(80));
  
  for (const lead of potentialLeads.slice(0, 15)) {
    console.log(`\n  Session: ${lead.id}`);
    console.log(`    Current Disposition: ${lead.disposition}`);
    console.log(`    Duration: ${lead.duration || 0}s`);
    console.log(`    User turns: ${lead.userTurns}`);
    console.log(`    Has positive signals: ${lead.hasPositive ? 'YES' : 'NO'}`);
    console.log(`    User said:`);
    lead.userSample.forEach((s: string, i: number) => {
      console.log(`      ${i + 1}. "${s}"`);
    });
  }

  // Check the 2 qualified leads to understand what made them qualified
  console.log('\n\n✅ EXAMINING THE 2 EXISTING QUALIFIED LEADS:');
  console.log('=' .repeat(80));
  
  const qualifiedLeads = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      duration_sec,
      recording_url,
      ai_transcript,
      ai_analysis,
      status,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_disposition = 'qualified_lead'
  `, [campaignId]);

  for (const row of qualifiedLeads.rows as any[]) {
    console.log(`\n  Session: ${row.id}`);
    console.log(`    Duration: ${row.duration_sec || 0}s`);
    console.log(`    Status: ${row.status}`);
    console.log(`    Created: ${new Date(row.created_at).toLocaleString()}`);
    
    if (row.ai_analysis) {
      try {
        const analysis = typeof row.ai_analysis === 'string' 
          ? JSON.parse(row.ai_analysis) 
          : row.ai_analysis;
        console.log(`    AI Analysis:`);
        console.log(`      - Outcome: ${analysis.outcome || 'N/A'}`);
        console.log(`      - Summary: ${(analysis.summary || '').slice(0, 200)}`);
      } catch(e) {}
    }
    
    if (row.ai_transcript) {
      try {
        const transcript = typeof row.ai_transcript === 'string' 
          ? JSON.parse(row.ai_transcript) 
          : row.ai_transcript;
        console.log(`    Conversation turns: ${transcript.length}`);
        const userMsgs = transcript.filter((t: any) => t.role === 'user');
        console.log(`    User messages: ${userMsgs.length}`);
        if (userMsgs.length > 0) {
          console.log(`    Sample user message: "${(userMsgs[0].message || userMsgs[0].text || '').slice(0, 150)}"`);
        }
      } catch(e) {}
    }
  }

  process.exit(0);
}

analyzeQualifiedPotential().catch(console.error);
