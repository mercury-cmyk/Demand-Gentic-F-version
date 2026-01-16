/**
 * Backfill Script for January 15, 2026 Calls
 *
 * This script retroactively fixes calls that were improperly dispositioned as 'no_answer'
 * despite having actual conversations.
 *
 * It will:
 * 1. Analyze transcripts to identify real human conversations
 * 2. Create call sessions where missing
 * 3. Create leads for qualified calls
 * 4. Update dispositions appropriately
 */

import { db } from './server/db';
import { sql, eq } from 'drizzle-orm';
import { leads, callSessions, qcWorkQueue, dialerCallAttempts, campaignQueue, contacts, accounts } from '@shared/schema';
import * as fs from 'fs';

// IVR detection patterns
const IVR_PATTERNS = [
  'press 1', 'press 2', 'press 3', 'press 4', 'press 5',
  'press 6', 'press 7', 'press 8', 'press 9', 'press 0',
  'press one', 'press two', 'press three',
  'main menu', 'dial by name', 'extension',
  'you have reached', 'office hours', 'please hold',
];

// Voicemail detection patterns
const VOICEMAIL_PATTERNS = [
  'leave a message', 'after the tone', 'after the beep',
  'not available', 'mailbox', 'record your message',
  'voicemail', 'voice mail',
];

// Human conversation indicators
const HUMAN_RESPONSE_INDICATORS = [
  'speaking', 'this is', 'yes', 'hello', 'hi',
  'sure', 'okay', "i'm", 'we are', "we're",
  'actually', 'busy', 'send', 'email',
  'interested', 'not interested', 'tell me more',
];

function analyzeTranscript(notes: string): {
  hasHumanConversation: boolean;
  isVoicemail: boolean;
  isIVR: boolean;
  hasAISummary: boolean;
  hasEngagement: boolean;
  userTurns: number;
  suggestedDisposition: 'qualified_lead' | 'not_interested' | 'voicemail' | 'no_answer';
  confidence: number;
  reason: string;
} {
  const lower = notes.toLowerCase();

  // Check for AI-generated summary (indicates AI analyzed the call)
  const hasAISummary = lower.includes('[ai call summary]') || lower.includes('summary:');

  // Check for voicemail patterns
  const isVoicemail = VOICEMAIL_PATTERNS.some(p => lower.includes(p));

  // Check for IVR patterns
  const isIVR = IVR_PATTERNS.some(p => lower.includes(p));

  // Count user turns
  const userTurns = (lower.match(/user:/g) || []).length;

  // Extract user responses
  const userResponses = notes.split('\n')
    .filter(line => line.trim().toLowerCase().startsWith('user:'))
    .map(line => line.replace(/^user:\s*/i, '').trim());

  // Check if any user response looks human (not IVR)
  const humanResponses = userResponses.filter(response => {
    const lowerResponse = response.toLowerCase();
    // Not human if it's clearly IVR
    if (IVR_PATTERNS.some(p => lowerResponse.includes(p))) return false;
    if (VOICEMAIL_PATTERNS.some(p => lowerResponse.includes(p))) return false;
    // Human if it contains human indicators or is conversational
    return HUMAN_RESPONSE_INDICATORS.some(i => lowerResponse.includes(i)) ||
           (response.length > 5 && response.length < 200 && !lowerResponse.match(/press|menu|option/));
  });

  const hasHumanConversation = humanResponses.length > 0 || hasAISummary;

  // Check for engagement signals
  const hasEngagement =
    lower.includes('engagement: high') ||
    lower.includes('engagement: medium') ||
    lower.includes('follow-up consent: yes') ||
    lower.includes('interested') ||
    lower.includes('send') ||
    lower.includes('email');

  // Determine disposition
  let suggestedDisposition: 'qualified_lead' | 'not_interested' | 'voicemail' | 'no_answer' = 'no_answer';
  let confidence = 0.5;
  let reason = '';

  if (hasAISummary && hasEngagement) {
    suggestedDisposition = 'qualified_lead';
    confidence = 0.9;
    reason = 'AI generated summary with engagement signals';
  } else if (hasAISummary) {
    suggestedDisposition = 'qualified_lead';
    confidence = 0.7;
    reason = 'AI generated summary indicating conversation';
  } else if (lower.includes('not interested') || lower.includes('no thank you')) {
    suggestedDisposition = 'not_interested';
    confidence = 0.8;
    reason = 'Explicit not interested response';
  } else if (isVoicemail && !hasHumanConversation) {
    suggestedDisposition = 'voicemail';
    confidence = 0.85;
    reason = 'Voicemail system detected';
  } else if (isIVR && !hasHumanConversation) {
    suggestedDisposition = 'no_answer';
    confidence = 0.7;
    reason = 'IVR system without human contact';
  } else if (hasHumanConversation && userTurns >= 2) {
    suggestedDisposition = 'qualified_lead';
    confidence = 0.6;
    reason = 'Human conversation detected';
  }

  return {
    hasHumanConversation,
    isVoicemail,
    isIVR,
    hasAISummary,
    hasEngagement,
    userTurns,
    suggestedDisposition,
    confidence,
    reason,
  };
}

async function backfillCalls() {
  console.log('========================================');
  console.log('BACKFILLING JANUARY 15+ CALLS');
  console.log('========================================\n');

  // Get all calls from Jan 15+ that have notes and no_answer disposition
  const calls = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.campaign_id,
      dca.queue_item_id,
      dca.dialer_run_id,
      dca.call_session_id,
      dca.call_duration_seconds,
      dca.notes,
      dca.disposition,
      dca.phone_dialed,
      dca.recording_url,
      dca.created_at,
      dca.call_started_at,
      dca.call_ended_at,
      dca.telnyx_call_id,
      c.first_name,
      c.last_name,
      c.email,
      c.full_name,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.call_duration_seconds > 90
      AND dca.notes IS NOT NULL
      AND LENGTH(dca.notes) > 100
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${calls.rows.length} calls to analyze\n`);

  const stats = {
    total: calls.rows.length,
    analyzed: 0,
    qualifiedLeads: 0,
    notInterested: 0,
    voicemails: 0,
    noAnswer: 0,
    leadsCreated: 0,
    sessionsCreated: 0,
    errors: 0,
  };

  const leadsToCreate: any[] = [];

  for (const row of calls.rows) {
    const r = row as any;
    stats.analyzed++;

    const analysis = analyzeTranscript(r.notes || '');
    const contactName = r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown';

    console.log(`\n[${stats.analyzed}/${calls.rows.length}] ${contactName} @ ${r.company_name || 'Unknown'}`);
    console.log(`  Duration: ${r.call_duration_seconds}s, Current: ${r.disposition}, Suggested: ${analysis.suggestedDisposition}`);
    console.log(`  Human: ${analysis.hasHumanConversation}, AI Summary: ${analysis.hasAISummary}, Reason: ${analysis.reason}`);

    // Track stats
    switch (analysis.suggestedDisposition) {
      case 'qualified_lead':
        stats.qualifiedLeads++;
        break;
      case 'not_interested':
        stats.notInterested++;
        break;
      case 'voicemail':
        stats.voicemails++;
        break;
      case 'no_answer':
        stats.noAnswer++;
        break;
    }

    // If it should be a qualified_lead and confidence is high enough, prepare lead creation
    if (analysis.suggestedDisposition === 'qualified_lead' && analysis.confidence >= 0.7) {
      leadsToCreate.push({
        callAttemptId: r.id,
        contactId: r.contact_id,
        campaignId: r.campaign_id,
        contactName,
        contactEmail: r.email,
        companyName: r.company_name,
        dialedNumber: r.phone_dialed,
        recordingUrl: r.recording_url,
        callDuration: r.call_duration_seconds,
        telnyxCallId: r.telnyx_call_id,
        queueItemId: r.queue_item_id,
        notes: r.notes,
        analysis,
        createdAt: r.created_at,
      });
      console.log(`  ✅ ADDING TO LEADS QUEUE (confidence: ${analysis.confidence.toFixed(2)})`);
    }
  }

  console.log('\n========================================');
  console.log('ANALYSIS SUMMARY');
  console.log('========================================\n');

  console.log(`Total analyzed: ${stats.analyzed}`);
  console.log(`Qualified leads: ${stats.qualifiedLeads}`);
  console.log(`Not interested: ${stats.notInterested}`);
  console.log(`Voicemails: ${stats.voicemails}`);
  console.log(`No answer: ${stats.noAnswer}`);
  console.log(`\nLeads to create: ${leadsToCreate.length}`);

  if (leadsToCreate.length > 0) {
    console.log('\n========================================');
    console.log('CREATING LEADS');
    console.log('========================================\n');

    for (const lead of leadsToCreate) {
      try {
        // Check if lead already exists
        const existingLead = await db.execute(sql`
          SELECT id FROM leads WHERE contact_id = ${lead.contactId} AND campaign_id = ${lead.campaignId}
        `);

        if (existingLead.rows.length > 0) {
          console.log(`Lead already exists for ${lead.contactName} - skipping`);
          continue;
        }

        // Create call session if missing
        let callSessionId = null;
        try {
          const [newSession] = await db.insert(callSessions).values({
            campaignId: lead.campaignId,
            contactId: lead.contactId,
            queueItemId: lead.queueItemId,
            telnyxCallId: lead.telnyxCallId,
            status: 'completed',
            agentType: 'ai',
            aiAgentId: 'openai-realtime',
            aiDisposition: 'qualified_lead',
            aiTranscript: lead.notes,
            durationSec: lead.callDuration,
            startedAt: new Date(lead.createdAt),
            endedAt: new Date(new Date(lead.createdAt).getTime() + lead.callDuration * 1000),
          }).returning();
          callSessionId = newSession.id;
          stats.sessionsCreated++;
          console.log(`  Created call session: ${callSessionId}`);
        } catch (err) {
          console.warn(`  Failed to create call session: ${err}`);
        }

        // Create lead
        const [newLead] = await db.insert(leads).values({
          campaignId: lead.campaignId,
          contactId: lead.contactId,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          companyName: lead.companyName,
          dialedNumber: lead.dialedNumber,
          recordingUrl: lead.recordingUrl,
          callDuration: lead.callDuration,
          qaStatus: 'new',
          source: 'backfill_script',
          transcript: lead.notes,
        }).returning();

        stats.leadsCreated++;
        console.log(`  ✅ Created lead: ${newLead.id} for ${lead.contactName}`);

        // Add to QC queue
        await db.insert(qcWorkQueue).values({
          leadId: newLead.id,
          campaignId: lead.campaignId,
          callSessionId: callSessionId,
          producerType: 'ai',
          status: 'pending',
          priority: 0,
        });
        console.log(`  ✅ Added to QC queue`);

        // Update call attempt
        await db.update(dialerCallAttempts).set({
          disposition: 'qualified_lead',
          dispositionProcessed: true,
          dispositionProcessedAt: new Date(),
          callSessionId: callSessionId,
          updatedAt: new Date(),
        }).where(eq(dialerCallAttempts.id, lead.callAttemptId));
        console.log(`  ✅ Updated call attempt disposition`);

        // Update campaign queue
        if (lead.queueItemId) {
          await db.update(campaignQueue).set({
            status: 'done',
            updatedAt: new Date(),
          }).where(eq(campaignQueue.id, lead.queueItemId));
          console.log(`  ✅ Updated campaign queue item`);
        }

      } catch (err) {
        stats.errors++;
        console.error(`  ❌ Error creating lead for ${lead.contactName}:`, err);
      }
    }
  }

  console.log('\n========================================');
  console.log('FINAL RESULTS');
  console.log('========================================\n');

  console.log(`Leads created: ${stats.leadsCreated}`);
  console.log(`Call sessions created: ${stats.sessionsCreated}`);
  console.log(`Errors: ${stats.errors}`);

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    stats,
    leadsCreated: leadsToCreate.map(l => ({
      contactName: l.contactName,
      companyName: l.companyName,
      email: l.contactEmail,
      phone: l.dialedNumber,
      duration: l.callDuration,
      confidence: l.analysis.confidence,
      reason: l.analysis.reason,
    })),
  };

  fs.writeFileSync('backfill-report.json', JSON.stringify(report, null, 2));
  console.log('\nReport saved to: backfill-report.json');

  process.exit(0);
}

backfillCalls().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
