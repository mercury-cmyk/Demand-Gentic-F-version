/**
 * Find REAL missed leads by analyzing actual conversation content
 *
 * Focus on calls where:
 * 1. Contact actually spoke (not just voicemail/IVR)
 * 2. Duration >= 20 seconds (real conversation)
 * 3. Looking for ACTUAL positive responses, not just pattern matching
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

interface CallRecord {
  callSessionId: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactCompany: string;
  contactTitle: string;
  campaignId: string;
  campaignName: string;
  phone: string;
  aiDisposition: string | null;
  dialerDisposition: string | null;
  aiTranscript: string | null;
  aiAnalysis: any;
  durationSec: number;
  startedAt: Date;
  leadId: string | null;
}

// Check if the contact actually spoke (not voicemail/IVR)
function hasContactSpeaking(transcript: string): boolean {
  if (!transcript) return false;

  const lines = transcript.split('\n');
  let contactLines = 0;

  for (const line of lines) {
    if (line.trim().startsWith('Contact:')) {
      const content = line.replace('Contact:', '').trim();
      // Real responses are usually more than just "Hello" or single words
      if (content.length > 10 && !content.toLowerCase().includes('voicemail') &&
          !content.toLowerCase().includes('leave a message') &&
          !content.toLowerCase().includes('not available')) {
        contactLines++;
      }
    }
  }

  return contactLines >= 2; // At least 2 substantive responses from contact
}

// Extract key phrases that indicate interest
function extractPositiveSignals(transcript: string): string[] {
  const signals: string[] = [];
  const lower = transcript.toLowerCase();

  // Direct positive responses
  if (/\byeah[,.]?\s*(yeah[,.]?\s*)+/i.test(transcript)) signals.push('Multiple "yeah" responses');
  if (/\bsure\b/i.test(transcript)) signals.push('Said "sure"');
  if (/\bgo ahead\b/i.test(transcript)) signals.push('Said "go ahead"');
  if (/\bokay\b.*\btell me\b/i.test(transcript)) signals.push('Said "okay, tell me"');
  if (/\bsounds? (good|interesting|great)\b/i.test(transcript)) signals.push('Positive reaction');

  // Interest in learning more
  if (/\btell me more\b/i.test(transcript)) signals.push('Asked to hear more');
  if (/\bwhat (is|does|can)\b/i.test(transcript)) signals.push('Asked questions');
  if (/\bhow (does|do|can)\b/i.test(transcript)) signals.push('Asked "how" questions');

  // Follow-up requests
  if (/\bsend (me|it|that|some|an email|info)\b/i.test(transcript)) signals.push('Requested info sent');
  if (/\bemail (me|it|that)\b/i.test(transcript)) signals.push('Requested email');
  if (/\bcall (me )?back\b/i.test(transcript)) signals.push('Requested callback');
  if (/\bgive me a call\b/i.test(transcript)) signals.push('Requested call');

  // Scheduling interest
  if (/\bschedule\b/i.test(transcript) && !/can't schedule|don't schedule/i.test(transcript)) signals.push('Mentioned scheduling');
  if (/\bmeeting\b/i.test(transcript) && !/no meeting|don't need/i.test(transcript)) signals.push('Mentioned meeting');
  if (/\bdemo\b/i.test(transcript) && !/no demo|don't need/i.test(transcript)) signals.push('Mentioned demo');

  // Contact gave details
  if (/\bmy email\b/i.test(transcript)) signals.push('Shared email');
  if (/\bmy number\b/i.test(transcript)) signals.push('Shared number');
  if (/\bbetter time\b/i.test(transcript)) signals.push('Suggested better time');

  return signals;
}

// Extract negative signals (to filter out false positives)
function extractNegativeSignals(transcript: string): string[] {
  const signals: string[] = [];

  if (/\bnot interested\b/i.test(transcript)) signals.push('Said "not interested"');
  if (/\bno thanks\b/i.test(transcript)) signals.push('Said "no thanks"');
  if (/\bdon'?t call\b/i.test(transcript)) signals.push('Said "don\'t call"');
  if (/\bremove me\b/i.test(transcript)) signals.push('Requested removal');
  if (/\bstop calling\b/i.test(transcript)) signals.push('Said "stop calling"');
  if (/\btake me off\b/i.test(transcript)) signals.push('Requested list removal');
  if (/\bwe'?re (all )?set\b/i.test(transcript)) signals.push('Said "we\'re set"');
  if (/\bwe (don'?t|do not) need\b/i.test(transcript)) signals.push('Said "we don\'t need"');
  if (/\bnot (a )?good time\b/i.test(transcript)) signals.push('Not a good time');
  if (/\bbusy\b/i.test(transcript)) signals.push('Said busy');
  if (/\bhang(ing)? up\b/i.test(transcript)) signals.push('Mentioned hanging up');

  return signals;
}

async function findRealMissedLeads(): Promise<void> {
  console.log('='.repeat(140));
  console.log('FINDING REAL MISSED LEADS - MANUAL REVIEW OF ACTUAL CONVERSATIONS');
  console.log('='.repeat(140));
  console.log();

  const startDate = new Date('2026-01-14T00:00:00.000Z');
  const endDate = new Date('2026-01-21T00:00:00.000Z');

  // Get all calls with transcripts
  const result = await db.execute(sql`
    SELECT
      cs.id as "callSessionId",
      cs.contact_id as "contactId",
      COALESCE(c.full_name, c.first_name || ' ' || c.last_name, 'Unknown') as "contactName",
      c.email as "contactEmail",
      COALESCE(c.company_norm, 'Unknown') as "contactCompany",
      COALESCE(c.job_title, 'Unknown') as "contactTitle",
      cs.campaign_id as "campaignId",
      COALESCE(camp.name, 'Unknown') as "campaignName",
      cs.to_number_e164 as "phone",
      cs.ai_disposition as "aiDisposition",
      dca.disposition::text as "dialerDisposition",
      cs.ai_transcript as "aiTranscript",
      cs.ai_analysis as "aiAnalysis",
      cs.duration_sec as "durationSec",
      cs.started_at as "startedAt",
      l.id as "leadId"
    FROM call_sessions cs
    LEFT JOIN dialer_call_attempts dca ON dca.call_session_id = cs.id
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id OR l.id LIKE 'ai-' || cs.id || '%'
    WHERE cs.started_at >= ${startDate.toISOString()}::timestamp
      AND cs.started_at < ${endDate.toISOString()}::timestamp
      AND cs.ai_transcript IS NOT NULL
      AND LENGTH(cs.ai_transcript) > 100
      AND cs.duration_sec >= 20
    ORDER BY cs.duration_sec DESC
  `);

  const calls: CallRecord[] = (result as any).rows || [];
  console.log(`Total calls with transcripts (20+ sec): ${calls.length}\n`);

  // Categorize calls
  const realConversations: Array<CallRecord & { positiveSignals: string[]; negativeSignals: string[] }> = [];
  const definiteLeads: Array<CallRecord & { positiveSignals: string[]; negativeSignals: string[] }> = [];
  const potentialLeads: Array<CallRecord & { positiveSignals: string[]; negativeSignals: string[] }> = [];

  for (const call of calls) {
    if (!call.aiTranscript) continue;

    // Check if contact actually spoke
    if (!hasContactSpeaking(call.aiTranscript)) continue;

    const positiveSignals = extractPositiveSignals(call.aiTranscript);
    const negativeSignals = extractNegativeSignals(call.aiTranscript);

    const callWithSignals = { ...call, positiveSignals, negativeSignals };
    realConversations.push(callWithSignals);

    // Categorize based on signals
    const netScore = positiveSignals.length - negativeSignals.length;

    if (positiveSignals.length >= 2 && negativeSignals.length === 0 && !call.leadId) {
      definiteLeads.push(callWithSignals);
    } else if (positiveSignals.length >= 1 && netScore > 0 && !call.leadId) {
      potentialLeads.push(callWithSignals);
    }
  }

  // Print DEFINITE missed leads
  console.log('='.repeat(140));
  console.log('🚨 DEFINITE MISSED LEADS - CLEAR POSITIVE SIGNALS, NO LEAD CREATED');
  console.log('='.repeat(140));
  console.log(`Found ${definiteLeads.length} definite missed leads:\n`);

  for (const lead of definiteLeads) {
    console.log('-'.repeat(140));
    console.log(`📞 CALL: ${lead.callSessionId}`);
    console.log(`   👤 Contact:     ${lead.contactName}`);
    console.log(`   💼 Title:       ${lead.contactTitle}`);
    console.log(`   🏢 Company:     ${lead.contactCompany}`);
    console.log(`   📧 Email:       ${lead.contactEmail || 'N/A'}`);
    console.log(`   📱 Phone:       ${lead.phone}`);
    console.log(`   🎯 Campaign:    ${lead.campaignName}`);
    console.log(`   ⏱️  Duration:    ${lead.durationSec}s`);
    console.log(`   📅 Date:        ${new Date(lead.startedAt).toLocaleString()}`);
    console.log(`   🏷️  Disposition: ${lead.aiDisposition || lead.dialerDisposition || 'none'}`);
    console.log(`   ✅ POSITIVE:    ${lead.positiveSignals.join(', ')}`);
    if (lead.negativeSignals.length > 0) {
      console.log(`   ❌ NEGATIVE:    ${lead.negativeSignals.join(', ')}`);
    }

    console.log(`\n   📝 TRANSCRIPT:`);
    console.log('   ' + '-'.repeat(134));
    const lines = lead.aiTranscript!.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Agent:')) {
        console.log(`      🤖 ${trimmed}`);
      } else if (trimmed.startsWith('Contact:')) {
        console.log(`      👤 ${trimmed}`);
      } else {
        console.log(`         ${trimmed}`);
      }
    }
    console.log('   ' + '-'.repeat(134));
    console.log();
  }

  // Print POTENTIAL missed leads
  console.log('\n' + '='.repeat(140));
  console.log('⚠️  POTENTIAL MISSED LEADS - SOME POSITIVE SIGNALS');
  console.log('='.repeat(140));
  console.log(`Found ${potentialLeads.length} potential missed leads:\n`);

  for (const lead of potentialLeads.slice(0, 15)) {
    console.log('-'.repeat(140));
    console.log(`📞 CALL: ${lead.callSessionId}`);
    console.log(`   👤 Contact:     ${lead.contactName} (${lead.contactTitle})`);
    console.log(`   🏢 Company:     ${lead.contactCompany}`);
    console.log(`   📧 Email:       ${lead.contactEmail || 'N/A'}`);
    console.log(`   📱 Phone:       ${lead.phone}`);
    console.log(`   ⏱️  Duration:    ${lead.durationSec}s`);
    console.log(`   🏷️  Disposition: ${lead.aiDisposition || lead.dialerDisposition || 'none'}`);
    console.log(`   ✅ POSITIVE:    ${lead.positiveSignals.join(', ')}`);
    console.log(`   ❌ NEGATIVE:    ${lead.negativeSignals.join(', ')}`);

    console.log(`\n   📝 TRANSCRIPT:`);
    console.log('   ' + '-'.repeat(134));
    const lines = lead.aiTranscript!.split('\n').filter(l => l.trim()).slice(0, 20);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Agent:')) {
        console.log(`      🤖 ${trimmed}`);
      } else if (trimmed.startsWith('Contact:')) {
        console.log(`      👤 ${trimmed}`);
      } else {
        console.log(`         ${trimmed}`);
      }
    }
    if (lead.aiTranscript!.split('\n').length > 20) {
      console.log(`      ... (${lead.aiTranscript!.split('\n').length - 20} more lines)`);
    }
    console.log('   ' + '-'.repeat(134));
    console.log();
  }

  if (potentialLeads.length > 15) {
    console.log(`\n... and ${potentialLeads.length - 15} more potential leads\n`);
  }

  // Summary
  console.log('\n' + '='.repeat(140));
  console.log('📊 SUMMARY');
  console.log('='.repeat(140));

  const existingLeads = calls.filter(c => c.leadId);

  console.log(`
📈 CALL STATISTICS:
   Total calls (20+ sec with transcript):  ${calls.length}
   With real contact conversation:         ${realConversations.length}
   Already have leads:                     ${existingLeads.length}

🚨 MISSED LEADS:
   DEFINITE (clear positive signals):      ${definiteLeads.length}
   POTENTIAL (some positive signals):      ${potentialLeads.length}
   TOTAL MISSED:                           ${definiteLeads.length + potentialLeads.length}
  `);

  // CSV Export
  console.log('\n' + '='.repeat(140));
  console.log('📋 CSV EXPORT - DEFINITE MISSED LEADS');
  console.log('='.repeat(140));
  console.log();
  console.log('Priority,Contact Name,Title,Company,Phone,Email,Duration,Positive Signals,Call Session ID');

  for (const lead of definiteLeads) {
    console.log([
      'DEFINITE',
      `"${lead.contactName}"`,
      `"${lead.contactTitle}"`,
      `"${lead.contactCompany}"`,
      lead.phone || '',
      lead.contactEmail || '',
      lead.durationSec,
      `"${lead.positiveSignals.join('; ')}"`,
      lead.callSessionId
    ].join(','));
  }

  for (const lead of potentialLeads) {
    console.log([
      'POTENTIAL',
      `"${lead.contactName}"`,
      `"${lead.contactTitle}"`,
      `"${lead.contactCompany}"`,
      lead.phone || '',
      lead.contactEmail || '',
      lead.durationSec,
      `"${lead.positiveSignals.join('; ')}"`,
      lead.callSessionId
    ].join(','));
  }

  process.exit(0);
}

findRealMissedLeads().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
