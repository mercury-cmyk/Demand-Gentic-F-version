import { db } from './server/db';
import { callSessions } from './shared/schema';
import { sql, and, gte, lt, eq } from 'drizzle-orm';

async function auditYesterdayCalls() {
  // Yesterday's date range (UTC)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  console.log(`\n📊 AUDIT: AI Calls from ${yesterday.toISOString()} to ${today.toISOString()}\n`);

  // Get ALL AI calls from yesterday
  const calls = await db.select({
    id: callSessions.id,
    disposition: callSessions.aiDisposition,
    duration: callSessions.durationSec,
    transcript: callSessions.aiTranscript,
    startedAt: callSessions.startedAt,
    campaignId: callSessions.campaignId,
    agentType: callSessions.agentType,
    toNumber: callSessions.toNumberE164,
  })
  .from(callSessions)
  .where(and(
    gte(callSessions.startedAt, yesterday),
    lt(callSessions.startedAt, today),
    eq(callSessions.agentType, 'ai'),
  ))
  .orderBy(callSessions.startedAt);

  console.log(`Total AI calls yesterday: ${calls.length}`);
  
  // Group by disposition
  const byDisposition: Record<string, number> = {};
  calls.forEach(c => {
    const d = c.disposition || 'null';
    byDisposition[d] = (byDisposition[d] || 0) + 1;
  });
  console.log('\nDisposition breakdown:');
  Object.entries(byDisposition).sort((a, b) => b[1] - a[1]).forEach(([d, count]) => {
    console.log(`  ${d}: ${count}`);
  });

  // Interest signal patterns
  const positivePatterns = [
    'of course', 'yes please', 'send me', 'email me', 'send it', 
    'sounds interesting', 'tell me more', 'absolutely', 'definitely',
    'that would be great', 'go ahead', 'is it free', 'whitepaper',
    'white paper', 'i would like', "i'd like", 'follow up',
    'schedule', 'calendar', 'agreed', 'accepted', 'yes of course',
    'that sounds great', 'sure', 'okay send', 'yes i would'
  ];

  // ============================================
  // CHECK 1: not_interested calls with positive engagement signals
  // ============================================
  const suspiciousCalls = calls.filter(c => {
    if (c.disposition !== 'not_interested') return false;
    if (!c.transcript) return false;
    if ((c.duration || 0) < 20) return false; // skip very short calls
    const lower = c.transcript.toLowerCase();
    return positivePatterns.some(p => lower.includes(p));
  });
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚨 SUSPICIOUS: not_interested calls WITH positive interest signals`);
  console.log(`   Count: ${suspiciousCalls.length}`);
  console.log(`${'='.repeat(70)}`);
  
  suspiciousCalls.forEach((c, i) => {
    const lower = (c.transcript || '').toLowerCase();
    const matched = positivePatterns.filter(p => lower.includes(p));
    const hasAgentLines = /Agent:/i.test(c.transcript || '');
    console.log(`\n--- Call ${i+1} ---`);
    console.log(`  ID: ${c.id}`);
    console.log(`  Duration: ${c.duration}s`);
    console.log(`  To: ${c.toNumber}`);
    console.log(`  Campaign: ${c.campaignId}`);
    console.log(`  Started: ${c.startedAt}`);
    console.log(`  Has Agent lines: ${hasAgentLines}`);
    console.log(`  Interest signals: ${matched.join(', ')}`);
    console.log(`  Transcript (first 600 chars):`);
    console.log(`  ${(c.transcript || '').substring(0, 600).replace(/\n/g, '\n  ')}`);
  });

  // ============================================
  // CHECK 2: Long calls (>30s) with NO Agent transcript lines
  // ============================================
  const noAgentTranscript = calls.filter(c => {
    if (!c.transcript) return false;
    if ((c.duration || 0) < 30) return false;
    return !/Agent:/i.test(c.transcript);
  });
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`⚠️  CALLS >30s WITH NO AGENT TRANSCRIPT (native-audio bug indicator)`);
  console.log(`   Count: ${noAgentTranscript.length}`);
  console.log(`${'='.repeat(70)}`);
  
  noAgentTranscript.forEach((c, i) => {
    console.log(`  ${i+1}. ID: ${c.id} | Duration: ${c.duration}s | Disposition: ${c.disposition} | Transcript length: ${(c.transcript || '').length} chars`);
  });

  // ============================================
  // CHECK 3: Long calls dispositioned as not_interested (potential misclass)
  // ============================================
  const longNotInterested = calls.filter(c => {
    return c.disposition === 'not_interested' && (c.duration || 0) >= 60;
  });
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 LONG CALLS (≥60s) marked not_interested — need manual review`);
  console.log(`   Count: ${longNotInterested.length}`);
  console.log(`${'='.repeat(70)}`);
  
  longNotInterested.forEach((c, i) => {
    const hasAgentLines = /Agent:/i.test(c.transcript || '');
    console.log(`\n  ${i+1}. ID: ${c.id} | Duration: ${c.duration}s | Agent lines: ${hasAgentLines}`);
    console.log(`     Campaign: ${c.campaignId} | To: ${c.toNumber}`);
    if (c.transcript) {
      console.log(`     Transcript (last 400 chars):`);
      const last400 = c.transcript.slice(-400);
      console.log(`     ...${last400.replace(/\n/g, '\n     ')}`);
    }
  });

  // ============================================
  // CHECK 4: Calls with qualified_lead that did go through (sanity check)
  // ============================================
  const qualifiedCalls = calls.filter(c => c.disposition === 'qualified_lead');
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ qualified_lead calls (worked correctly)`);
  console.log(`   Count: ${qualifiedCalls.length}`);
  console.log(`${'='.repeat(70)}`);
  
  qualifiedCalls.forEach((c, i) => {
    const hasAgentLines = /Agent:/i.test(c.transcript || '');
    console.log(`  ${i+1}. ID: ${c.id} | Duration: ${c.duration}s | Agent lines: ${hasAgentLines} | Campaign: ${c.campaignId}`);
  });

  // ============================================
  // SUMMARY
  // ============================================
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📋 AUDIT SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Total AI calls: ${calls.length}`);
  console.log(`  Suspicious (not_interested + positive signals): ${suspiciousCalls.length}`);
  console.log(`  Missing agent transcript (>30s): ${noAgentTranscript.length}`);
  console.log(`  Long not_interested (≥60s): ${longNotInterested.length}`);
  console.log(`  Successful qualified_lead: ${qualifiedCalls.length}`);
  
  if (suspiciousCalls.length > 0) {
    console.log(`\n  ⚡ ${suspiciousCalls.length} calls may need disposition correction from not_interested → qualified_lead`);
    console.log(`     Call IDs: ${suspiciousCalls.map(c => c.id).join(', ')}`);
  }

  process.exit(0);
}

auditYesterdayCalls().catch(e => { console.error(e); process.exit(1); });
