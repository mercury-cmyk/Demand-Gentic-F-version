import { db } from './server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

interface CallData {
  id: string;
  contactName: string;
  company: string;
  email: string | null;
  phone: string;
  duration: number;
  transcript: string;
  createdAt: string;
  campaignId: string;
  queueItemId: string | null;
  contactId: string;
}

// Keywords that indicate qualification interest
const POSITIVE_KEYWORDS = [
  'interested',
  'tell me more',
  'how much',
  'pricing',
  'demo',
  'meeting',
  'schedule',
  'callback',
  'call back',
  'send me',
  'email me',
  'sounds good',
  'sounds interesting',
  'yes please',
  'go ahead',
  'absolutely',
  "i'd like",
  'would like',
  'definitely',
  'perfect',
  'great',
];

// Keywords that indicate not interested
const NEGATIVE_KEYWORDS = [
  'not interested',
  'no thank you',
  "don't call",
  'remove me',
  'stop calling',
  'not looking',
  'already have',
  "we're good",
  "we're set",
  'no thanks',
  'not right now',
  'not a good time',
  'hang up',
];

// Keywords indicating voicemail
const VOICEMAIL_KEYWORDS = [
  'voicemail',
  'leave a message',
  'after the tone',
  'after the beep',
  'not available',
  "can't take your call",
  'record your message',
];

function analyzeTranscript(transcript: string): {
  likelyDisposition: string;
  confidence: number;
  positiveMatches: string[];
  negativeMatches: string[];
  isVoicemail: boolean;
} {
  const lowerTranscript = transcript.toLowerCase();

  // Check for voicemail
  const isVoicemail = VOICEMAIL_KEYWORDS.some(kw => lowerTranscript.includes(kw));

  // Find matches
  const positiveMatches = POSITIVE_KEYWORDS.filter(kw => lowerTranscript.includes(kw));
  const negativeMatches = NEGATIVE_KEYWORDS.filter(kw => lowerTranscript.includes(kw));

  // Calculate confidence and disposition
  let likelyDisposition = 'unknown';
  let confidence = 0;

  if (isVoicemail) {
    likelyDisposition = 'voicemail';
    confidence = 0.9;
  } else if (negativeMatches.length > positiveMatches.length) {
    likelyDisposition = 'not_interested';
    confidence = 0.5 + (negativeMatches.length * 0.1);
  } else if (positiveMatches.length > 0) {
    likelyDisposition = 'qualified_lead';
    confidence = 0.5 + (positiveMatches.length * 0.1);
  } else {
    // Check if there's substantial back-and-forth conversation
    const userTurns = (lowerTranscript.match(/user:/g) || []).length;
    if (userTurns > 3) {
      likelyDisposition = 'engaged_conversation';
      confidence = 0.5;
    } else {
      likelyDisposition = 'unclear';
      confidence = 0.3;
    }
  }

  return {
    likelyDisposition,
    confidence: Math.min(confidence, 1),
    positiveMatches,
    negativeMatches,
    isVoicemail,
  };
}

async function analyzeTranscriptsManually() {
  console.log('========================================');
  console.log('MANUAL TRANSCRIPT ANALYSIS');
  console.log('Since January 15, 2026');
  console.log('========================================\n');

  // Find all calls with duration > 90 seconds since Jan 15 with transcripts
  const callsWithTranscripts = await db.execute(sql`
    SELECT
      dca.id,
      dca.contact_id,
      dca.campaign_id,
      dca.call_duration_seconds,
      dca.notes,
      dca.disposition,
      dca.phone_dialed,
      dca.queue_item_id,
      dca.created_at,
      c.first_name,
      c.last_name,
      c.email,
      a.name as company_name
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON c.id = dca.contact_id
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE dca.created_at >= '2026-01-15'
      AND dca.call_duration_seconds > 90
      AND (dca.disposition = 'no_answer' OR dca.disposition IS NULL)
      AND dca.notes IS NOT NULL
      AND LENGTH(dca.notes) > 50
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${callsWithTranscripts.rows.length} calls with transcripts\n`);

  const allCalls: CallData[] = [];
  const potentialLeads: CallData[] = [];
  const notInterested: CallData[] = [];
  const voicemails: CallData[] = [];
  const unclear: CallData[] = [];

  for (const row of callsWithTranscripts.rows) {
    const r = row as any;
    const contactName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown';

    let transcript = r.notes || '';
    if (transcript.startsWith('[Transcript]')) {
      transcript = transcript.replace('[Transcript]', '').trim();
    }

    const callData: CallData = {
      id: r.id,
      contactName,
      company: r.company_name || 'Unknown Company',
      email: r.email,
      phone: r.phone_dialed,
      duration: r.call_duration_seconds,
      transcript,
      createdAt: r.created_at,
      campaignId: r.campaign_id,
      queueItemId: r.queue_item_id,
      contactId: r.contact_id,
    };

    allCalls.push(callData);

    // Analyze transcript
    const analysis = analyzeTranscript(transcript);

    switch (analysis.likelyDisposition) {
      case 'qualified_lead':
      case 'engaged_conversation':
        potentialLeads.push(callData);
        break;
      case 'not_interested':
        notInterested.push(callData);
        break;
      case 'voicemail':
        voicemails.push(callData);
        break;
      default:
        unclear.push(callData);
    }
  }

  // Print summary
  console.log('========================================');
  console.log('KEYWORD-BASED ANALYSIS RESULTS');
  console.log('========================================\n');

  console.log(`Total calls with transcripts: ${allCalls.length}`);
  console.log(`Potential qualified leads: ${potentialLeads.length}`);
  console.log(`Not interested: ${notInterested.length}`);
  console.log(`Voicemails: ${voicemails.length}`);
  console.log(`Unclear/needs review: ${unclear.length}`);

  // Show potential leads
  if (potentialLeads.length > 0) {
    console.log('\n========================================');
    console.log('POTENTIAL QUALIFIED LEADS');
    console.log('========================================\n');

    for (let i = 0; i  1000 ? '...' : ''));
      console.log('\n' + '='.repeat(60));
    }
  }

  // Save full data to JSON for detailed review
  const outputData = {
    summary: {
      totalCalls: allCalls.length,
      potentialLeads: potentialLeads.length,
      notInterested: notInterested.length,
      voicemails: voicemails.length,
      unclear: unclear.length,
    },
    potentialLeads: potentialLeads.map(l => ({
      ...l,
      analysis: analyzeTranscript(l.transcript),
    })),
    notInterested: notInterested.map(l => ({
      ...l,
      analysis: analyzeTranscript(l.transcript),
    })),
    voicemails: voicemails.map(l => ({
      ...l,
      analysis: analyzeTranscript(l.transcript),
    })),
    unclear: unclear.map(l => ({
      ...l,
      analysis: analyzeTranscript(l.transcript),
    })),
  };

  fs.writeFileSync('transcript-analysis-results.json', JSON.stringify(outputData, null, 2));
  console.log('\n\nFull analysis saved to: transcript-analysis-results.json');

  // Also create a CSV summary
  const csvLines = ['ID,Contact,Company,Email,Phone,Duration,Analysis,PositiveSignals'];
  for (const lead of potentialLeads) {
    const analysis = analyzeTranscript(lead.transcript);
    csvLines.push(`"${lead.id}","${lead.contactName}","${lead.company}","${lead.email || ''}","${lead.phone}",${lead.duration},"${analysis.likelyDisposition}","${analysis.positiveMatches.join('; ')}"`);
  }
  fs.writeFileSync('potential-leads.csv', csvLines.join('\n'));
  console.log('Potential leads CSV saved to: potential-leads.csv');

  process.exit(0);
}

analyzeTranscriptsManually().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});