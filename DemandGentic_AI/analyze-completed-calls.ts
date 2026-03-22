import { pool } from './server/db';

async function analyzeCompletedCalls() {
  console.log('='.repeat(80));
  console.log('🔍 ANALYZING "COMPLETED" OUTCOME CALLS - THESE MIGHT BE REAL CONVERSATIONS');
  console.log('='.repeat(80));
  
  const campaignId = 'ae5b353d-64a9-44d8-92cf-69d4726ca121'; // Proton UK

  // Get all "Completed" outcome calls
  const completed = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      ai_analysis,
      ai_transcript,
      duration_sec,
      created_at
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_analysis->>'outcome' = 'Completed'
    ORDER BY created_at DESC
  `, [campaignId]);

  console.log(`\nTotal "Completed" outcome calls: ${completed.rows.length}\n`);

  let categories = {
    realConversation: 0,
    gatekeeper: 0,
    transferred: 0,
    interested: 0,
    notInterested: 0,
    other: 0
  };

  const realConversations: any[] = [];

  for (const row of completed.rows as any[]) {
    try {
      const transcript = typeof row.ai_transcript === 'string' 
        ? JSON.parse(row.ai_transcript) 
        : row.ai_transcript;
      
      if (!transcript) continue;
      
      const userMsgs = transcript.filter((t: any) => t.role === 'user');
      const fullText = transcript.map((t: any) => (t.message || '').toLowerCase()).join(' ');
      const userText = userMsgs.map((m: any) => (m.message || '').toLowerCase()).join(' ');
      
      // Skip voicemail
      if (fullText.includes('leave a message') || fullText.includes('voicemail')) continue;
      
      // Check for different scenarios
      const isTransfer = fullText.includes('please stay on the line') || 
                         fullText.includes('transferring') ||
                         fullText.includes('put you through') ||
                         userText.includes('available');
      
      const isGatekeeper = fullText.includes('who\'s calling') || 
                           fullText.includes('what company') ||
                           fullText.includes('what is this regarding');
      
      const hasInterest = userText.includes('interested') ||
                          userText.includes('tell me more') ||
                          userText.includes('send me') ||
                          userText.includes('what is') ||
                          userText.includes('how does');
      
      const hasRejection = userText.includes('not interested') ||
                           userText.includes('don\'t call') ||
                           userText.includes('no thank');
      
      // Count real user engagement
      const realUserMessages = userMsgs.filter((m: any) => {
        const msg = (m.message || '').trim();
        return msg.length > 3 && msg !== '...' && !msg.includes('available');
      });
      
      if (realUserMessages.length >= 2 && !hasRejection) {
        categories.realConversation++;
        realConversations.push({
          id: row.id,
          disposition: row.ai_disposition,
          userMsgCount: realUserMessages.length,
          isTransfer,
          isGatekeeper,
          hasInterest,
          userMessages: realUserMessages.slice(0, 4).map((m: any) => (m.message || '').slice(0, 100)),
          created: row.created_at
        });
      } else if (isTransfer) {
        categories.transferred++;
      } else if (isGatekeeper) {
        categories.gatekeeper++;
      } else if (hasInterest) {
        categories.interested++;
      } else if (hasRejection) {
        categories.notInterested++;
      } else {
        categories.other++;
      }
      
    } catch (e) {}
  }

  console.log('📊 BREAKDOWN OF "COMPLETED" CALLS:');
  console.log(`  Real conversations (2+ meaningful user msgs): ${categories.realConversation}`);
  console.log(`  Transfer/hold messages: ${categories.transferred}`);
  console.log(`  Gatekeeper interactions: ${categories.gatekeeper}`);
  console.log(`  Shows interest: ${categories.interested}`);
  console.log(`  Not interested: ${categories.notInterested}`);
  console.log(`  Other: ${categories.other}`);

  console.log('\n\n🏆 REAL CONVERSATIONS THAT SHOULD POTENTIALLY BE LEADS:');
  console.log('='.repeat(80));

  for (const conv of realConversations.slice(0, 20)) {
    console.log(`\n  Session: ${conv.id}`);
    console.log(`  Current Disposition: ${conv.disposition}`);
    console.log(`  User message count: ${conv.userMsgCount}`);
    console.log(`  Transfer call: ${conv.isTransfer ? 'YES' : 'NO'}`);
    console.log(`  Gatekeeper: ${conv.isGatekeeper ? 'YES' : 'NO'}`);
    console.log(`  Shows interest: ${conv.hasInterest ? 'YES' : 'NO'}`);
    console.log('  User said:');
    conv.userMessages.forEach((msg: string, i: number) => {
      console.log(`    ${i + 1}. "${msg}"`);
    });
  }

  // Check specifically for interest signals
  console.log('\n\n' + '='.repeat(80));
  console.log('🎯 CALLS WITH EXPLICIT INTEREST/CALLBACK SIGNALS');
  console.log('='.repeat(80));

  const interestCalls = await pool.query(`
    SELECT 
      id,
      ai_disposition,
      ai_transcript,
      ai_analysis
    FROM call_sessions
    WHERE campaign_id = $1
      AND ai_transcript IS NOT NULL
      AND ai_disposition != 'qualified_lead'
  `, [campaignId]);

  let interestSignals: any[] = [];
  
  for (const row of interestCalls.rows as any[]) {
    try {
      const transcript = typeof row.ai_transcript === 'string' 
        ? JSON.parse(row.ai_transcript) 
        : row.ai_transcript;
      
      const fullText = JSON.stringify(transcript).toLowerCase();
      
      // Very strong interest signals
      const signals = [];
      if (fullText.includes('call me back') || fullText.includes('call back')) signals.push('callback');
      if (fullText.includes('send me') || fullText.includes('email me')) signals.push('send info');
      if (fullText.includes('interested')) signals.push('interested');
      if (fullText.includes('tell me more')) signals.push('tell more');
      if (fullText.includes('schedule') || fullText.includes('meeting')) signals.push('meeting');
      if (fullText.includes('sounds good') || fullText.includes('yes please')) signals.push('positive');
      
      if (signals.length > 0) {
        // Check not just voicemail
        if (!fullText.includes('leave a message') && !fullText.includes('voicemail')) {
          const userMsgs = transcript.filter((t: any) => t.role === 'user');
          const userText = userMsgs.map((m: any) => m.message || '').join(' ');
          
          // Only if user actually said these things
          if (signals.some(s => userText.toLowerCase().includes(s.split(' ')[0]))) {
            interestSignals.push({
              id: row.id,
              disposition: row.ai_disposition,
              signals,
              userSample: userText.slice(0, 200)
            });
          }
        }
      }
    } catch (e) {}
  }

  console.log(`\nFound ${interestSignals.length} calls with user interest signals:\n`);
  
  for (const call of interestSignals) {
    console.log(`  Session: ${call.id}`);
    console.log(`  Current Disposition: ${call.disposition}`);
    console.log(`  Signals found: ${call.signals.join(', ')}`);
    console.log(`  User said: "${call.userSample}"`);
    console.log('');
  }

  if (interestSignals.length === 0) {
    console.log('  No calls found with explicit user interest signals.');
    console.log('  This suggests the conversation analysis may not be capturing user intent correctly.');
  }

  await pool.end();
  process.exit(0);
}

analyzeCompletedCalls().catch(console.error);