/**
 * Deep Analysis of AI Call Transcripts
 * 
 * Examines AI calls with transcripts to find:
 * 1. Qualified conversations marked as voicemail/no_answer
 * 2. Analyze why qualified leads weren't created
 * 3. Check transcript quality and AI disposition accuracy
 */

import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

// Qualification indicators (signs of real conversation with interest)
const HIGH_INTENT_SIGNALS = [
  /yes.*interested/i,
  /tell me more/i,
  /send me.*information/i,
  /send.*email/i,
  /what does.*offer/i,
  /schedule.*call/i,
  /book.*meeting/i,
  /sounds good/i,
  /perfect.*works/i,
  /that (would be|sounds) great/i,
  /i('d| would) (be|love to)/i,
  /definitely interested/i,
  /that works for me/i,
  /set up.*meeting/i,
  /i can.*meet/i,
  /we.*looking for/i,
  /we need/i,
  /can you send/i,
  /please send/i,
  /follow up/i,
  /calendar/i,
  /available.*for/i,
];

const VOICEMAIL_PATTERNS = [
  /voicemail service/i,
  /leave a message after the (tone|beep)/i,
  /the person you are calling is not available/i,
  /please leave your message/i,
  /you have reached the voicemail/i,
  /after the tone/i,
  /mailbox is full/i,
  /record your message/i,
  /your call has been forwarded/i,
  /press.*when finished/i,
  /unavailable.*leave/i,
];

const NOT_INTERESTED_PATTERNS = [
  /not interested/i,
  /no thank you/i,
  /don'?t call/i,
  /remove.*list/i,
  /we'?re not looking/i,
  /we already have/i,
  /not a good time/i,
  /too busy/i,
  /not the right person/i,
];

interface AICall {
  id: string;
  contactName: string;
  companyName: string;
  campaignName: string;
  aiDisposition: string;
  transcript: string;
  duration: number;
  leadId: string | null;
  createdAt: Date;
  analysis: any;
}

function findSignals(transcript: string, patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const p of patterns) {
    const match = transcript.match(p);
    if (match) found.push(match[0]);
  }
  return found;
}

function analyzeTranscript(transcript: string): {
  isVoicemail: boolean;
  isQualified: boolean;
  isNotInterested: boolean;
  hasRealConversation: boolean;
  highIntentSignals: string[];
  wordCount: number;
  speakerTurns: number;
} {
  if (!transcript) {
    return {
      isVoicemail: false,
      isQualified: false,
      isNotInterested: false,
      hasRealConversation: false,
      highIntentSignals: [],
      wordCount: 0,
      speakerTurns: 0,
    };
  }
  
  const voicemailSignals = findSignals(transcript, VOICEMAIL_PATTERNS);
  const highIntentSignals = findSignals(transcript, HIGH_INTENT_SIGNALS);
  const notInterestedSignals = findSignals(transcript, NOT_INTERESTED_PATTERNS);
  
  // Count words
  const wordCount = transcript.split(/\s+/).filter(w => w.length > 2).length;
  
  // Count speaker turns (Agent/Prospect pattern or back-and-forth)
  const speakerTurns = (transcript.match(/(agent|prospect|caller|rep|ai|user)[\s]*:/gi) || []).length;
  
  // Check for real conversation
  const hasQuestion = /\?/.test(transcript);
  const hasResponse = /(yes|yeah|sure|okay|alright|no|not really|maybe|hello|hi)/i.test(transcript);
  const hasRealConversation = (wordCount > 30 && (hasQuestion || hasResponse)) || speakerTurns > 4;
  
  return {
    isVoicemail: voicemailSignals.length > 0 && !hasRealConversation,
    isQualified: highIntentSignals.length >= 1 && hasRealConversation && notInterestedSignals.length === 0,
    isNotInterested: notInterestedSignals.length > 0,
    hasRealConversation,
    highIntentSignals,
    wordCount,
    speakerTurns,
  };
}

async function main() {
  console.log('='.repeat(120));
  console.log('DEEP AI CALL TRANSCRIPT ANALYSIS');
  console.log('Finding qualified conversations that may have been misclassified');
  console.log('='.repeat(120));
  console.log();
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  // Get AI calls with transcripts
  const aiCallsResult = await db.execute(sql`
    SELECT 
      cs.id,
      cs.ai_disposition as "aiDisposition",
      cs.ai_transcript as transcript,
      cs.ai_analysis as analysis,
      cs.duration_sec as duration,
      cs.created_at as "createdAt",
      c.full_name as "contactName",
      a.name as "companyName",
      camp.name as "campaignName",
      l.id as "leadId"
    FROM call_sessions cs
    LEFT JOIN contacts c ON c.id = cs.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN leads l ON l.contact_id = cs.contact_id AND l.campaign_id = cs.campaign_id
    WHERE cs.created_at >= ${startDate.toISOString()}
      AND cs.created_at <= ${endDate.toISOString()}
      AND cs.agent_type = 'ai'
      AND cs.ai_transcript IS NOT NULL
      AND LENGTH(cs.ai_transcript) > 50
    ORDER BY cs.duration_sec DESC
  `);
  
  const aiCalls = aiCallsResult.rows as unknown as AICall[];
  
  console.log(`Found ${aiCalls.length} AI calls with transcripts in last 7 days`);
  console.log();
  
  // Analyze each call
  const missedQualified: Array<{call: AICall; analysis: ReturnType<typeof analyzeTranscript>}> = [];
  const correctQualified: Array<{call: AICall; analysis: ReturnType<typeof analyzeTranscript>}> = [];
  const voicemailsWithLeads: Array<{call: AICall; analysis: ReturnType<typeof analyzeTranscript>}> = [];
  const possibleMisclassified: Array<{call: AICall; analysis: ReturnType<typeof analyzeTranscript>}> = [];
  
  for (const call of aiCalls) {
    const analysis = analyzeTranscript(call.transcript);
    
    // Find qualified calls without leads
    if (analysis.isQualified && !call.leadId) {
      missedQualified.push({ call, analysis });
    }
    
    // Find correctly qualified calls with leads
    if (analysis.isQualified && call.leadId) {
      correctQualified.push({ call, analysis });
    }
    
    // Find voicemails that somehow have leads
    if (analysis.isVoicemail && call.leadId) {
      voicemailsWithLeads.push({ call, analysis });
    }
    
    // Find conversations (30+ words) marked as voicemail/no_answer that show intent signals
    const disposition = (call.aiDisposition || '').toLowerCase();
    if ((disposition.includes('voicemail') || disposition.includes('no_answer') || disposition === 'unknown') 
        && analysis.hasRealConversation 
        && analysis.highIntentSignals.length > 0) {
      possibleMisclassified.push({ call, analysis });
    }
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total AI calls with transcripts: ${aiCalls.length}`);
  console.log(`Correctly qualified (lead created): ${correctQualified.length}`);
  console.log(`Missed qualified (no lead but should have): ${missedQualified.length}`);
  console.log(`Voicemails with leads (incorrect): ${voicemailsWithLeads.length}`);
  console.log(`Possibly misclassified (conversation with signals marked as VM/NA): ${possibleMisclassified.length}`);
  console.log();
  
  // Show missed qualified calls
  if (missedQualified.length > 0) {
    console.log('='.repeat(80));
    console.log('🔴 MISSED QUALIFIED LEADS - Real conversations with intent, no lead created');
    console.log('='.repeat(80));
    console.log();
    
    for (const { call, analysis } of missedQualified.slice(0, 15)) {
      console.log(`ID: ${call.id}`);
      console.log(`Contact: ${call.contactName} @ ${call.companyName}`);
      console.log(`Campaign: ${call.campaignName}`);
      console.log(`AI Disposition: ${call.aiDisposition}`);
      console.log(`Duration: ${call.duration}s | Words: ${analysis.wordCount} | Turns: ${analysis.speakerTurns}`);
      console.log(`Intent Signals: ${analysis.highIntentSignals.join(', ')}`);
      console.log(`Lead Created: NO ❌`);
      console.log();
      console.log('Transcript Preview:');
      console.log(call.transcript.substring(0, 500) + '...');
      console.log();
      console.log('-'.repeat(80));
    }
    
    if (missedQualified.length > 15) {
      console.log(`... and ${missedQualified.length - 15} more missed qualified calls`);
    }
    console.log();
  }
  
  // Show misclassified calls
  if (possibleMisclassified.length > 0) {
    console.log('='.repeat(80));
    console.log('⚠️ POSSIBLY MISCLASSIFIED - Conversations marked as VM/NA with intent signals');
    console.log('='.repeat(80));
    console.log();
    
    for (const { call, analysis } of possibleMisclassified.slice(0, 15)) {
      console.log(`ID: ${call.id}`);
      console.log(`Contact: ${call.contactName} @ ${call.companyName}`);
      console.log(`Campaign: ${call.campaignName}`);
      console.log(`AI Disposition: ${call.aiDisposition}`);
      console.log(`Duration: ${call.duration}s | Words: ${analysis.wordCount} | Turns: ${analysis.speakerTurns}`);
      console.log(`Intent Signals: ${analysis.highIntentSignals.join(', ')}`);
      console.log(`Has Lead: ${call.leadId ? 'YES' : 'NO'}`);
      console.log();
      console.log('Transcript Preview:');
      console.log(call.transcript.substring(0, 400) + '...');
      console.log();
      console.log('-'.repeat(80));
    }
    
    if (possibleMisclassified.length > 15) {
      console.log(`... and ${possibleMisclassified.length - 15} more possibly misclassified calls`);
    }
    console.log();
  }
  
  // Show correctly qualified for comparison
  if (correctQualified.length > 0) {
    console.log('='.repeat(80));
    console.log('✅ CORRECTLY QUALIFIED - For comparison');
    console.log('='.repeat(80));
    console.log();
    
    for (const { call, analysis } of correctQualified.slice(0, 5)) {
      console.log(`ID: ${call.id}`);
      console.log(`Contact: ${call.contactName} @ ${call.companyName}`);
      console.log(`AI Disposition: ${call.aiDisposition}`);
      console.log(`Duration: ${call.duration}s | Words: ${analysis.wordCount}`);
      console.log(`Intent Signals: ${analysis.highIntentSignals.join(', ')}`);
      console.log(`Lead Created: YES ✅`);
      console.log();
    }
  }
  
  // Now check the dialer_call_attempts with transcripts in notes
  console.log();
  console.log('='.repeat(80));
  console.log('CHECKING DIALER CALL ATTEMPTS WITH TRANSCRIPTS');
  console.log('='.repeat(80));
  console.log();
  
  const dialerResult = await db.execute(sql`
    SELECT 
      dca.id,
      dca.disposition,
      dca.notes,
      dca.call_duration_seconds as duration,
      dca.voicemail_detected as "voicemailDetected",
      dca.created_at as "createdAt",
      c.full_name as "contactName",
      a.name as "companyName",
      camp.name as "campaignName",
      l.id as "leadId"
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN campaigns camp ON camp.id = dca.campaign_id
    LEFT JOIN leads l ON l.call_attempt_id = dca.id
    WHERE dca.created_at >= ${startDate.toISOString()}
      AND dca.created_at <= ${endDate.toISOString()}
      AND dca.notes IS NOT NULL
      AND LENGTH(dca.notes) > 100
      AND (
        dca.disposition IN ('voicemail', 'no_answer', 'not_interested')
        OR dca.disposition IS NULL
      )
    ORDER BY dca.call_duration_seconds DESC
    LIMIT 100
  `);
  
  console.log(`Checking ${dialerResult.rows.length} dialer calls with notes that may have transcripts...`);
  console.log();
  
  const dialerMissed: Array<{row: any; analysis: ReturnType<typeof analyzeTranscript>}> = [];
  
  for (const row of dialerResult.rows as any[]) {
    const transcript = row.notes || '';
    const analysis = analyzeTranscript(transcript);
    
    if (analysis.isQualified && !row.leadId) {
      dialerMissed.push({ row, analysis });
    }
  }
  
  if (dialerMissed.length > 0) {
    console.log(`Found ${dialerMissed.length} dialer calls that may be missed qualified leads:`);
    console.log();
    
    for (const { row, analysis } of dialerMissed.slice(0, 10)) {
      console.log(`ID: ${row.id}`);
      console.log(`Contact: ${row.contactName} @ ${row.companyName}`);
      console.log(`Campaign: ${row.campaignName}`);
      console.log(`Disposition: ${row.disposition}`);
      console.log(`Duration: ${row.duration}s | Words: ${analysis.wordCount}`);
      console.log(`Intent Signals: ${analysis.highIntentSignals.join(', ')}`);
      console.log(`Voicemail Detected: ${row.voicemailDetected}`);
      console.log(`Lead Created: NO ❌`);
      console.log();
      console.log('Notes Preview:');
      console.log(row.notes.substring(0, 400) + '...');
      console.log();
      console.log('-'.repeat(80));
    }
  } else {
    console.log('No missed qualified leads found in dialer calls with transcripts.');
  }
  
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
