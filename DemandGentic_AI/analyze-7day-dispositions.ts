/**
 * Comprehensive 7-Day Disposition Analysis
 * 
 * Analyzes all call dispositions from the last 7 days to identify:
 * 1. Calls incorrectly marked as voicemail/no_answer that should be qualified_lead
 * 2. Voicemails incorrectly created as leads
 * 3. Missing leads that should have been created from qualified calls
 * 4. Overall disposition accuracy issues
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Voicemail detection patterns
const VOICEMAIL_PATTERNS = [
  /voicemail service/i,
  /leave a message after the (tone|beep)/i,
  /press.*for more options/i,
  /the person you are calling is not available/i,
  /please leave your message/i,
  /you have reached the voicemail/i,
  /after the tone/i,
  /press.*to page/i,
  /cannot take your call/i,
  /not available.*leave/i,
  /mailbox is full/i,
  /record your message/i,
  /your call has been forwarded to voicemail/i,
  /press.*when finished/i,
];

// Qualification indicators (signs of real conversation)
const QUALIFICATION_PATTERNS = [
  /yes.*interested/i,
  /tell me more/i,
  /send me.*information/i,
  /send.*email/i,
  /what does.*offer/i,
  /schedule.*call/i,
  /book.*meeting/i,
  /follow up/i,
  /sounds good/i,
  /perfect.*works/i,
  /let me check/i,
  /that (would be|sounds) great/i,
  /i('d| would) (be|love to)/i,
  /definitely interested/i,
  /yes.*please/i,
  /that works for me/i,
  /set up.*meeting/i,
];

// Not interested patterns
const NOT_INTERESTED_PATTERNS = [
  /not interested/i,
  /no thank you/i,
  /don'?t call/i,
  /remove.*list/i,
  /we'?re not looking/i,
  /we already have/i,
  /we use.*competitor/i,
  /not a good time/i,
  /too busy/i,
];

interface CallRecord {
  id: string;
  contactId: string | null;
  contactName: string | null;
  companyName: string | null;
  campaignName: string | null;
  campaignId: string | null;
  aiDisposition: string | null;
  dialerDisposition: string | null;
  duration: number | null;
  transcript: string | null;
  notes: string | null;
  leadId: string | null;
  leadQaStatus: string | null;
  recordingUrl: string | null;
  agentType: string | null;
  createdAt: Date;
  voicemailDetected: boolean | null;
}

interface AnalysisResult {
  callId: string;
  contactName: string;
  company: string;
  campaign: string;
  currentDisposition: string;
  suggestedDisposition: string;
  hasLead: boolean;
  shouldHaveLead: boolean;
  incorrectlyHasLead: boolean;
  confidence: number;
  reason: string;
  duration: number | null;
  agentType: string;
  transcriptPreview: string;
}

function extractTranscript(notes: string | null, aiTranscript: string | null): string | null {
  if (aiTranscript && aiTranscript.trim().length > 20) {
    return aiTranscript;
  }
  
  if (!notes) return null;
  
  const marker = '[Call Transcript]';
  const idx = notes.indexOf(marker);
  if (idx !== -1) {
    return notes.substring(idx + marker.length).trim();
  }
  
  // Check for AI Summary markers
  if (notes.includes('[AI Summary]') || notes.includes('Transcript:')) {
    return notes;
  }
  
  return notes.length > 50 ? notes : null;
}

function isVoicemailTranscript(transcript: string): boolean {
  if (!transcript || transcript.length  w.length > 2);
  if (words.length  w.length > 2).length;
  
  return (hasHello && hasQuestion && hasResponse) || 
         (hasSpeakerLabels && wordCount > 30) ||
         (wordCount > 50 && (hasQuestion || hasResponse));
}

function hasQualificationSignals(transcript: string): { isQualified: boolean; signals: string[] } {
  if (!transcript) return { isQualified: false, signals: [] };
  
  const signals: string[] = [];
  
  for (const pattern of QUALIFICATION_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      signals.push(match[0]);
    }
  }
  
  return {
    isQualified: signals.length >= 1,
    signals
  };
}

function hasNotInterestedSignals(transcript: string): boolean {
  if (!transcript) return false;
  
  for (const pattern of NOT_INTERESTED_PATTERNS) {
    if (pattern.test(transcript)) {
      return true;
    }
  }
  
  return false;
}

function analyzeCall(call: CallRecord): AnalysisResult {
  const transcript = extractTranscript(call.notes, call.transcript);
  const currentDisposition = call.aiDisposition || call.dialerDisposition || 'unknown';
  
  let suggestedDisposition = currentDisposition;
  let confidence = 0.5;
  let reason = '';
  let shouldHaveLead = false;
  let incorrectlyHasLead = false;
  
  const isVoicemail = isVoicemailTranscript(transcript || '');
  const hasConversation = hasRealConversation(transcript || '');
  const qualSignals = hasQualificationSignals(transcript || '');
  const isNotInterested = hasNotInterestedSignals(transcript || '');
  
  // Check duration
  const duration = call.duration || 0;
  const hasLongDuration = duration > 30;
  const hasShortDuration = duration  0) {
      suggestedDisposition = 'qualified_lead';
      confidence = 0.7;
      reason = `Long conversation (${duration}s) with some signals: ${qualSignals.signals.join(', ')}`;
      shouldHaveLead = true;
      
      if (!call.leadId) {
        reason += ' - NEEDS REVIEW FOR LEAD';
      }
    } else {
      suggestedDisposition = 'not_interested';
      confidence = 0.6;
      reason = `Long conversation (${duration}s) but no clear qualification signals`;
    }
  } else if (!transcript || transcript.length = ${startDate.toISOString()}
      AND cs.created_at = ${startDate.toISOString()}
      AND dca.created_at  ({
      ...r,
      aiDisposition: r.aiDisposition,
      dialerDisposition: null,
      notes: null,
    })),
    ...(dialerCallsResult.rows as any[]).map(r => ({
      ...r,
      aiDisposition: null,
      dialerDisposition: r.dialerDisposition,
      transcript: null,
    })),
  ];
  
  console.log(`Total calls in last 7 days: ${calls.length}`);
  console.log(`  - From call_sessions: ${callsResult.rows.length}`);
  console.log(`  - From dialer_call_attempts: ${dialerCallsResult.rows.length}`);
  console.log();
  
  // Analyze all calls
  const analyses: AnalysisResult[] = calls.map(analyzeCall);
  
  // Summary statistics
  const stats = {
    total: analyses.length,
    withLeads: analyses.filter(a => a.hasLead).length,
    missingLeads: analyses.filter(a => a.shouldHaveLead && !a.hasLead).length,
    incorrectLeads: analyses.filter(a => a.incorrectlyHasLead).length,
    dispositionMismatches: analyses.filter(a => 
      a.currentDisposition !== a.suggestedDisposition && a.confidence > 0.7
    ).length,
    byDisposition: {} as Record,
    bySuggestedDisposition: {} as Record,
    byAgentType: {} as Record,
  };
  
  // Count by disposition
  for (const a of analyses) {
    const disp = a.currentDisposition || 'unknown';
    stats.byDisposition[disp] = (stats.byDisposition[disp] || 0) + 1;
    stats.bySuggestedDisposition[a.suggestedDisposition] = (stats.bySuggestedDisposition[a.suggestedDisposition] || 0) + 1;
    stats.byAgentType[a.agentType] = (stats.byAgentType[a.agentType] || 0) + 1;
  }
  
  // Print summary
  console.log('='.repeat(80));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total calls analyzed: ${stats.total}`);
  console.log(`Calls with leads: ${stats.withLeads}`);
  console.log();
  console.log('🔴 CRITICAL ISSUES:');
  console.log(`   Missing leads (qualified but no lead created): ${stats.missingLeads}`);
  console.log(`   Incorrect leads (voicemail/no_answer with lead): ${stats.incorrectLeads}`);
  console.log(`   Disposition mismatches (high confidence): ${stats.dispositionMismatches}`);
  console.log();
  
  console.log('Current Disposition Distribution:');
  Object.entries(stats.byDisposition)
    .sort((a, b) => b[1] - a[1])
    .forEach(([disp, count]) => {
      console.log(`   ${disp}: ${count}`);
    });
  console.log();
  
  console.log('Suggested Disposition Distribution:');
  Object.entries(stats.bySuggestedDisposition)
    .sort((a, b) => b[1] - a[1])
    .forEach(([disp, count]) => {
      console.log(`   ${disp}: ${count}`);
    });
  console.log();
  
  console.log('By Agent Type:');
  Object.entries(stats.byAgentType).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  console.log();
  
  // Show missing leads
  const missingLeads = analyses.filter(a => a.shouldHaveLead && !a.hasLead && a.confidence > 0.7);
  if (missingLeads.length > 0) {
    console.log('='.repeat(80));
    console.log('🔴 MISSING LEADS - Qualified calls without lead records');
    console.log('='.repeat(80));
    console.log();
    
    for (const lead of missingLeads.slice(0, 20)) {
      console.log(`Call ID: ${lead.callId}`);
      console.log(`  Contact: ${lead.contactName} @ ${lead.company}`);
      console.log(`  Campaign: ${lead.campaign}`);
      console.log(`  Current Disposition: ${lead.currentDisposition}`);
      console.log(`  Suggested: ${lead.suggestedDisposition} (${(lead.confidence * 100).toFixed(0)}% confidence)`);
      console.log(`  Duration: ${lead.duration}s | Agent: ${lead.agentType}`);
      console.log(`  Reason: ${lead.reason}`);
      console.log(`  Transcript: ${lead.transcriptPreview}`);
      console.log();
    }
    
    if (missingLeads.length > 20) {
      console.log(`... and ${missingLeads.length - 20} more missing leads`);
    }
    console.log();
  }
  
  // Show incorrect leads (voicemail created as lead)
  const incorrectLeads = analyses.filter(a => a.incorrectlyHasLead);
  if (incorrectLeads.length > 0) {
    console.log('='.repeat(80));
    console.log('🔴 INCORRECT LEADS - Voicemails/No-answers incorrectly created as leads');
    console.log('='.repeat(80));
    console.log();
    
    for (const lead of incorrectLeads.slice(0, 20)) {
      console.log(`Call ID: ${lead.callId}`);
      console.log(`  Contact: ${lead.contactName} @ ${lead.company}`);
      console.log(`  Campaign: ${lead.campaign}`);
      console.log(`  Current Disposition: ${lead.currentDisposition}`);
      console.log(`  HAS LEAD: YES (SHOULD NOT)`);
      console.log(`  Duration: ${lead.duration}s | Agent: ${lead.agentType}`);
      console.log(`  Reason: ${lead.reason}`);
      console.log(`  Transcript: ${lead.transcriptPreview}`);
      console.log();
    }
    
    if (incorrectLeads.length > 20) {
      console.log(`... and ${incorrectLeads.length - 20} more incorrect leads`);
    }
    console.log();
  }
  
  // Show disposition mismatches
  const mismatches = analyses.filter(a => 
    a.currentDisposition !== a.suggestedDisposition && 
    a.confidence > 0.7 &&
    !a.shouldHaveLead && 
    !a.incorrectlyHasLead
  );
  
  if (mismatches.length > 0) {
    console.log('='.repeat(80));
    console.log('⚠️ DISPOSITION MISMATCHES - Calls that may be incorrectly classified');
    console.log('='.repeat(80));
    console.log();
    
    for (const m of mismatches.slice(0, 15)) {
      console.log(`Call ID: ${m.callId}`);
      console.log(`  Contact: ${m.contactName} @ ${m.company}`);
      console.log(`  Current: ${m.currentDisposition} → Suggested: ${m.suggestedDisposition}`);
      console.log(`  Confidence: ${(m.confidence * 100).toFixed(0)}%`);
      console.log(`  Reason: ${m.reason}`);
      console.log();
    }
    
    if (mismatches.length > 15) {
      console.log(`... and ${mismatches.length - 15} more mismatches`);
    }
    console.log();
  }
  
  // Campaign breakdown
  console.log('='.repeat(80));
  console.log('CAMPAIGN BREAKDOWN');
  console.log('='.repeat(80));
  console.log();
  
  const byCampaign: Record = {};
  for (const a of analyses) {
    const campaign = a.campaign || 'Unknown';
    if (!byCampaign[campaign]) {
      byCampaign[campaign] = { total: 0, leads: 0, missing: 0, incorrect: 0 };
    }
    byCampaign[campaign].total++;
    if (a.hasLead) byCampaign[campaign].leads++;
    if (a.shouldHaveLead && !a.hasLead) byCampaign[campaign].missing++;
    if (a.incorrectlyHasLead) byCampaign[campaign].incorrect++;
  }
  
  Object.entries(byCampaign)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .forEach(([campaign, data]) => {
      console.log(`${campaign}:`);
      console.log(`  Total: ${data.total} | Leads: ${data.leads} | Missing: ${data.missing} | Incorrect: ${data.incorrect}`);
    });
  
  console.log();
  console.log('='.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(80));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});