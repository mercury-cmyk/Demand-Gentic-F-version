/**
 * Pending Review QA Analysis
 * 
 * Analyzes all calls with 'needs_review' disposition to identify:
 * - Calls with genuine interest & engagement → upgrade to qualified_lead
 * - Calls with callback requests → upgrade to callback_requested
 * - Calls with clear declines → downgrade to not_interested
 * - Calls with DNC requests → downgrade to do_not_call
 * - Calls with no real engagement → downgrade to no_answer/voicemail
 * - Calls that truly need human review → keep as needs_review
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

// ===== IVR / AGENT SPEECH FILTERS =====
const IVR_LINE_PATTERNS = [
  /press \d/i, /extension/i, /menu/i, /recording/i,
  /mailbox/i, /forwarded/i, /not available/i, /voice\s*mail/i,
  /leave.*message/i, /after the (?:tone|beep)/i, /please hold/i,
  /transferring/i, /record your/i, /hang up/i, /press.*(?:star|hash|pound)/i,
  /for (?:sales|service|support|accounts|hr|human resources|payable|any)/i,
  /thank you for calling/i, /your call (?:has been|will be)/i,
  /to help.*direct/i, /if you know/i, /dial (?:it |by )/i,
  /(?:product |customer )?(?:support|service) (?:representative|inquir)/i,
  /main menu/i, /company directory/i, /further assistance/i,
  /investor relations/i, /payroll hotline/i, /hear these options/i,
  /to speak with/i, /return your call/i, /general delivery/i,
  /at the tone/i, /after the tone/i, /we are sorry.*no one available/i,
  /name and reason for calling/i, /stay on the line/i,
];

const AGENT_SPEECH_PATTERNS = [
  /am I speaking with/i, /may I speak with/i, /this is .*calling/i,
  /I'm calling/i, /on behalf of/i, /I was just (?:saying|calling|mentioning)/i,
  /we help (?:help )?companies/i, /we've been helping/i,
  /(?:my name is|this is) (?:onyx|jordan|alex|sarah|mike|david|olivia|achird|akired|laomedeia)/i,
  /regarding some of the services/i, /it's regarding/i,
  /RingCentral|Harver|DemandGenic|demand genic|UK Export|Proton/i,
  /consolidating communication/i, /improve productivity/i,
  /streamline.*(?:hiring|processes)/i, /I'm sorry.*having trouble/i,
  /could you connect me/i, /we've put together/i, /white paper/i,
  /predictive assessments/i, /candidate matching/i,
  /speed up hiring/i, /quality of hire/i,
  /save money by consolidating/i, /current setup look like/i,
];

function isIVRLine(text: string): boolean {
  return IVR_LINE_PATTERNS.some(p => p.test(text));
}
function isAgentSpeechMislabeled(text: string): boolean {
  return AGENT_SPEECH_PATTERNS.some(p => p.test(text));
}

// ===== ENGAGEMENT ANALYSIS =====
interface CallAnalysis {
  id: string;
  contactName: string;
  company: string;
  campaignName: string;
  campaignType: string;
  successCriteria: string | null;
  duration: number;
  realContactTurns: number;
  rawContactTurns: number;
  agentTurns: number;
  contactText: string;
  positiveSignals: string[];
  negativeSignals: string[];
  engagementLevel: 'high' | 'medium' | 'low' | 'none';
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
  contactSnippets: string[];
}

const POSITIVE_KEYWORDS = [
  'interested', 'tell me more', 'send me', 'email me', 'call me back',
  'sounds good', 'yes please', 'schedule', 'meeting', 'book a', 'demo',
  'that would be great', 'let me know', 'send it over', 'sure',
  'i\'d like to', 'when can we', 'what time', 'how much', 'pricing',
  'can you send', 'send details', 'follow up', 'reach out',
  'that sounds interesting', 'i\'m open to', 'happy to', 'available',
  'set up a time', 'let\'s do it', 'go ahead', 'sounds great',
  'i\'d be interested', 'we\'re looking for', 'we need', 'we\'re exploring',
  'can you tell me more', 'what does that involve', 'how does that work',
  'love to learn more', 'want to learn more', 'curious about',
  'give me a call', 'call back', 'email address is', 'my email',
  'yes i am', 'yeah sure', 'absolutely', 'definitely', 'of course',
  'what\'s available', 'more information', 'brochure', 'whitepaper',
  'yes speaking', 'speaking yes', 'this is he', 'this is she',
  'yes that\'s me', 'yes it is', 'yes i\'m',
];

const NEGATIVE_KEYWORDS = [
  'not interested', 'don\'t call', 'stop calling', 'remove me',
  'no thanks', 'no thank you', 'unsubscribe', 'we\'re not looking',
  'not for us', 'don\'t need', 'already have', 'go away',
  'do not call', 'take me off', 'leave me alone', 'not a good time',
  'waste of time', 'not buying', 'not purchasing', 'wrong number',
  'who is this', 'how did you get my number', 'never heard of you',
  'i\'m hanging up', 'goodbye', 'please don\'t call again',
  'remove this number', 'off this list', 'off your list', 'remove from',
  'take off your', 'remove from your', 'we\'re good', 'we\'re fine',
  'we\'re set', 'we\'re covered', 'pass', 'no no no',
];

const VOICEMAIL_KEYWORDS = [
  'leave a message', 'after the beep', 'voicemail', 'voice mail',
  'cannot take your call', 'mailbox', 'reached the voicemail',
  'answering machine', 'please leave', 'record your message',
  'away from', 'return your call', 'at the tone', 'after the tone',
  'when you have finished recording', 'leave your message', 'not available',
];

function analyzeCall(transcript: string, successCriteria: string | null, campaignType: string): {
  realContactTurns: number;
  rawContactTurns: number;
  agentTurns: number;
  contactText: string;
  contactSnippets: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  engagementLevel: 'high' | 'medium' | 'low' | 'none';
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
} {
  const text = transcript.toLowerCase();

  // Check for summary section
  const hasSummary = text.includes('[call summary]');
  const summaryMatch = text.match(/(\d+)\s*total turns\s*\((\d+)\s*agent,\s*(\d+)\s*contact\)/);
  let summaryContactTurns = -1;
  if (summaryMatch) {
    summaryContactTurns = parseInt(summaryMatch[3]);
  }

  // Extract transcript section
  const transcriptSection = transcript.includes('[Call Transcript]')
    ? transcript.split('[Call Transcript]')[1] || transcript
    : transcript;

  const agentLines: string[] = [];
  const rawContactLines: string[] = [];
  const realContactLines: string[] = [];

  for (const line of transcriptSection.split('\n')) {
    const agentMatch = line.match(/^Agent:\s*(.+)/i);
    const contactMatch = line.match(/^Contact:\s*(.+)/i);

    if (agentMatch) {
      agentLines.push(agentMatch[1].trim());
    } else if (contactMatch) {
      const content = contactMatch[1].trim();
      rawContactLines.push(content);
      if (content.length > 3 && !isIVRLine(content) && !isAgentSpeechMislabeled(content)) {
        const isGarbled = /^[^a-zA-Z]*$/.test(content) || content.split(' ').length  contactText.includes(s));
  const negativeSignals = NEGATIVE_KEYWORDS.filter(s => contactText.includes(s));
  const isVoicemail = VOICEMAIL_KEYWORDS.some(s => text.includes(s)) && realContactTurns  isIVRLine(l));

  // Deep engagement checks
  const identityConfirmed = /yes.*(?:speaking|this is|that's me|it's me|i am)|speaking.*how can/i.test(contactText);
  const askedQuestions = realContactLines.some(l => /\?/.test(l)) ||
    /(?:what|how|when|where|why|can you|could you|tell me|explain)/i.test(contactText);
  const expressedInterest = /(?:interested|sounds? good|tell me more|like to know|curious|open to|exploring|send.*(?:info|details|email|over))/i.test(contactText);
  const requestedCallback = /(?:call (?:me )?back|callback|better time|busy (?:right )?now|try (?:me )?(?:later|again|tomorrow|next week))/i.test(contactText);
  const requestedInfo = /(?:send (?:me |it |that )?(?:over|info|details|email|brochure|whitepaper)|email (?:me|it|that|address)|my email)/i.test(contactText);
  const agreedToMeeting = /(?:schedule|book|set up|let's do|i'm free|available|sounds great|perfect|confirmed|booked)/i.test(contactText);
  const declined = /(?:not interested|no thanks|don't (?:call|need|want)|we're (?:good|fine|set|covered)|already have|pass)/i.test(contactText);
  const requestedDNC = /(?:do not call|don't call|stop calling|remove (?:me|us|this number|from)|take (?:me|us) off|unsubscribe|off (?:this|your|the) list|remove.*(?:number|list|mailing)|stop.*contact)/i.test(contactText);

  // Engagement level
  let engagementLevel: 'high' | 'medium' | 'low' | 'none' = 'none';
  if (realContactTurns >= 4 && (expressedInterest || agreedToMeeting || requestedInfo)) {
    engagementLevel = 'high';
  } else if (realContactTurns >= 2 && (identityConfirmed || askedQuestions || positiveSignals.length > 0)) {
    engagementLevel = 'medium';
  } else if (realContactTurns >= 1) {
    engagementLevel = 'low';
  }

  // Disposition logic
  let suggestedDisposition = 'needs_review';
  let confidence = 0.5;
  let reasoning = '';

  // Campaign type awareness
  const isAppointmentCampaign = ['appointment_setting', 'appointment_generation', 'demo_request', 'sql', 'bant_qualification', 'bant_leads', 'lead_qualification'].includes(campaignType);
  const isContentCampaign = ['content_syndication', 'high_quality_leads'].includes(campaignType);
  const isEventCampaign = ['webinar_invite', 'event_registration_digital_ungated', 'event_registration_digital_gated', 'in_person_event'].includes(campaignType);

  if (requestedDNC) {
    suggestedDisposition = 'do_not_call';
    confidence = 0.95;
    reasoning = 'Contact explicitly requested DNC';
    engagementLevel = 'low';
  } else if (isVoicemail && realContactTurns  0) {
    suggestedDisposition = 'not_interested';
    confidence = 0.85;
    reasoning = `Contact declined: ${negativeSignals.slice(0, 3).join(', ')}`;
    engagementLevel = 'low';
  } else if (requestedCallback) {
    suggestedDisposition = 'callback_requested';
    confidence = 0.85;
    reasoning = 'Contact requested a callback';
    engagementLevel = 'medium';
  } else if (engagementLevel === 'high') {
    // Check against campaign success criteria
    if (isAppointmentCampaign && agreedToMeeting) {
      suggestedDisposition = 'qualified_lead';
      confidence = 0.85;
      reasoning = `Appointment campaign: meeting agreed. Signals: ${positiveSignals.slice(0, 3).join(', ')}`;
    } else if (isContentCampaign && (requestedInfo || expressedInterest)) {
      suggestedDisposition = 'qualified_lead';
      confidence = 0.85;
      reasoning = `Content campaign: info requested/interest expressed. Signals: ${positiveSignals.slice(0, 3).join(', ')}`;
    } else if (expressedInterest || requestedInfo || agreedToMeeting) {
      suggestedDisposition = 'qualified_lead';
      confidence = 0.8;
      reasoning = `High engagement (${realContactTurns} turns): ${positiveSignals.slice(0, 4).join(', ')}`;
    } else {
      suggestedDisposition = 'needs_review';
      confidence = 0.65;
      reasoning = `High engagement (${realContactTurns} turns) but unclear outcome — needs human review`;
    }
  } else if (engagementLevel === 'medium') {
    if (expressedInterest && positiveSignals.length >= 2) {
      suggestedDisposition = 'qualified_lead';
      confidence = 0.7;
      reasoning = `Medium engagement with interest: ${positiveSignals.slice(0, 3).join(', ')}`;
    } else if (identityConfirmed && askedQuestions) {
      suggestedDisposition = 'needs_review';
      confidence = 0.65;
      reasoning = `Identity confirmed + questions asked (${realContactTurns} turns) — promising, needs review`;
    } else {
      suggestedDisposition = 'needs_review';
      confidence = 0.55;
      reasoning = `Medium engagement (${realContactTurns} turns, ${positiveSignals.length} pos signals). Contact: "${contactSnippets[0]?.substring(0, 80) || 'N/A'}"`;
    }
  } else if (engagementLevel === 'low') {
    if (negativeSignals.length > 0 && positiveSignals.length === 0) {
      suggestedDisposition = 'not_interested';
      confidence = 0.75;
      reasoning = `Low engagement with negative signals: ${negativeSignals.slice(0, 2).join(', ')}`;
    } else {
      suggestedDisposition = 'needs_review';
      confidence = 0.5;
      reasoning = `Low engagement (${realContactTurns} turn). Contact: "${contactSnippets[0]?.substring(0, 80) || 'N/A'}"`;
    }
  }

  // Success criteria bonus
  if (successCriteria && contactText.length > 10) {
    const criteriaWords = successCriteria.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    const criteriaMatches = criteriaWords.filter(w => contactText.includes(w));
    if (criteriaMatches.length >= 2) {
      confidence = Math.min(confidence + 0.1, 0.95);
      reasoning += ` | Matches campaign criteria keywords: ${criteriaMatches.join(', ')}`;
    }
  }

  return {
    realContactTurns,
    rawContactTurns: rawContactLines.length,
    agentTurns: agentLines.length,
    contactText,
    contactSnippets,
    positiveSignals,
    negativeSignals,
    engagementLevel,
    suggestedDisposition,
    confidence,
    reasoning,
  };
}

// ===== MAIN =====
async function main() {
  const APPLY = process.argv.includes('--apply');

  console.log('='.repeat(80));
  console.log('  PENDING REVIEW QA ANALYSIS');
  console.log(`  Mode: ${APPLY ? 'LIVE UPDATE' : 'DRY RUN (use --apply to update)'}`);
  console.log('='.repeat(80));

  // Query all needs_review calls
  const results = await db.execute(sql`
    SELECT 
      dca.id, dca.disposition::text as disposition, dca.call_duration_seconds,
      dca.full_transcript, dca.connected,
      c.first_name, c.last_name,
      a.name as company,
      camp.name as campaign_name, camp.id as campaign_id,
      camp.type as campaign_type, camp.success_criteria
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN accounts a ON c.account_id = a.id
    LEFT JOIN campaigns camp ON dca.campaign_id = camp.id
    WHERE dca.disposition = 'needs_review'
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`\nTotal pending review calls: ${results.rows.length}\n`);

  // Analyze each call
  const analyses: CallAnalysis[] = [];

  for (const row of results.rows as any[]) {
    const transcript = row.full_transcript || '';
    const analysis = analyzeCall(transcript, row.success_criteria, row.campaign_type || 'call');

    analyses.push({
      id: row.id,
      contactName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
      company: row.company || 'Unknown',
      campaignName: row.campaign_name || 'Unknown',
      campaignType: row.campaign_type || 'call',
      successCriteria: row.success_criteria,
      duration: row.call_duration_seconds || 0,
      ...analysis,
    });
  }

  // ===== CATEGORIZE =====
  const highEngagement = analyses.filter(a => a.engagementLevel === 'high');
  const mediumEngagement = analyses.filter(a => a.engagementLevel === 'medium');
  const lowEngagement = analyses.filter(a => a.engagementLevel === 'low');
  const noEngagement = analyses.filter(a => a.engagementLevel === 'none');

  const wouldUpgrade = analyses.filter(a => ['qualified_lead', 'callback_requested'].includes(a.suggestedDisposition));
  const wouldDowngrade = analyses.filter(a => ['no_answer', 'voicemail', 'not_interested', 'do_not_call'].includes(a.suggestedDisposition));
  const stayReview = analyses.filter(a => a.suggestedDisposition === 'needs_review');

  // ===== REPORT =====
  console.log('=== ENGAGEMENT BREAKDOWN ===');
  console.log(`  HIGH engagement:    ${highEngagement.length} calls`);
  console.log(`  MEDIUM engagement:  ${mediumEngagement.length} calls`);
  console.log(`  LOW engagement:     ${lowEngagement.length} calls`);
  console.log(`  NO engagement:      ${noEngagement.length} calls`);

  console.log('\n=== RECOMMENDED ACTIONS ===');
  console.log(`  Upgrade to qualified_lead/callback:  ${wouldUpgrade.length}`);
  console.log(`  Downgrade to no_answer/VM/NI/DNC:    ${wouldDowngrade.length}`);
  console.log(`  Keep as needs_review:                ${stayReview.length}`);

  // HIGH ENGAGEMENT — these are the interesting ones
  if (highEngagement.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('  HIGH ENGAGEMENT — Interest & Real Conversation Detected');
    console.log('='.repeat(80));
    for (const a of highEngagement) {
      console.log(`\n  [${a.duration}s] ${a.contactName} @ ${a.company}`);
      console.log(`  Campaign: ${a.campaignName} (${a.campaignType})`);
      console.log(`  Turns: ${a.realContactTurns} real / ${a.rawContactTurns} raw | Positive: ${a.positiveSignals.length} | Negative: ${a.negativeSignals.length}`);
      console.log(`  → ${a.suggestedDisposition} (${Math.round(a.confidence * 100)}%)`);
      console.log(`  Reason: ${a.reasoning}`);
      console.log(`  Contact said:`);
      for (const s of a.contactSnippets) {
        console.log(`    > "${s.substring(0, 120)}"`);
      }
    }
  }

  // MEDIUM ENGAGEMENT
  if (mediumEngagement.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('  MEDIUM ENGAGEMENT — Some Real Interaction');
    console.log('='.repeat(80));
    for (const a of mediumEngagement) {
      console.log(`\n  [${a.duration}s] ${a.contactName} @ ${a.company}`);
      console.log(`  Campaign: ${a.campaignName} (${a.campaignType})`);
      console.log(`  Turns: ${a.realContactTurns} real | Positive: ${a.positiveSignals.length} | Negative: ${a.negativeSignals.length}`);
      console.log(`  → ${a.suggestedDisposition} (${Math.round(a.confidence * 100)}%)`);
      console.log(`  Reason: ${a.reasoning}`);
      if (a.contactSnippets.length > 0) {
        console.log(`  Contact said: "${a.contactSnippets[0]?.substring(0, 120)}"`);
      }
    }
  }

  // DOWNGRADE candidates
  if (wouldDowngrade.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('  DOWNGRADE CANDIDATES — No Real Engagement');
    console.log('='.repeat(80));
    const byDisp: Record = {};
    for (const a of wouldDowngrade) {
      (byDisp[a.suggestedDisposition] ??= []).push(a);
    }
    for (const [disp, items] of Object.entries(byDisp)) {
      console.log(`\n  --- ${disp.toUpperCase()} (${items.length}) ---`);
      for (const a of items.slice(0, 15)) {
        console.log(`    [${a.duration}s] ${a.contactName} @ ${a.campaignName} — ${a.reasoning.substring(0, 100)}`);
      }
      if (items.length > 15) console.log(`    ... +${items.length - 15} more`);
    }
  }

  // LOW ENGAGEMENT staying as review
  const lowStayingReview = stayReview.filter(a => a.engagementLevel === 'low');
  if (lowStayingReview.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`  LOW ENGAGEMENT — Staying as needs_review (${lowStayingReview.length})`);
    console.log('='.repeat(80));
    for (const a of lowStayingReview.slice(0, 10)) {
      console.log(`  [${a.duration}s] ${a.contactName} @ ${a.campaignName} — ${a.reasoning.substring(0, 100)}`);
    }
    if (lowStayingReview.length > 10) console.log(`  ... +${lowStayingReview.length - 10} more`);
  }

  // ===== APPLY =====
  if (APPLY) {
    console.log('\n' + '='.repeat(80));
    console.log('  APPLYING UPDATES');
    console.log('='.repeat(80));

    let applied = 0, skipped = 0, errors = 0;

    for (const a of analyses) {
      if (a.suggestedDisposition === 'needs_review') continue; // No change
      if (a.confidence  a.engagementLevel !== 'none').length}`);
  console.log(`  HIGH engagement (interest):  ${highEngagement.length}`);
  console.log(`  MEDIUM engagement:           ${mediumEngagement.length}`);
  console.log(`  Recommended upgrades:        ${wouldUpgrade.length}`);
  console.log(`  Recommended downgrades:      ${wouldDowngrade.length}`);
  console.log(`  True needs_review:           ${stayReview.length}`);

  if (!APPLY && (wouldUpgrade.length > 0 || wouldDowngrade.length > 0)) {
    console.log(`\n  Run with --apply to update ${wouldUpgrade.length + wouldDowngrade.length} dispositions.`);
  }

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });