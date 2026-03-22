/**
 * Score All Pending Review / New Leads
 * 
 * Analyzes transcripts and scores all leads with qa_status = 'new' or 'under_review'
 * that don't yet have an ai_score. Updates:
 *   - ai_score (0-100)
 *   - ai_analysis (JSON)
 *   - ai_qualification_status (qualified / not_qualified / needs_review)
 * 
 * Uses local transcript analysis (no external AI calls) for speed and cost.
 * 
 * Usage:
 *   npx tsx score-pending-leads.ts            # Dry run
 *   npx tsx score-pending-leads.ts --apply    # Apply scores to DB
 *   npx tsx score-pending-leads.ts --all      # Re-score even already-scored leads
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

// ===== IVR / SYSTEM / AGENT MISLABEL FILTERS =====
const IVR_LINE_PATTERNS = [
  /press \d/i, /extension/i, /menu/i, /recording/i,
  /mailbox/i, /forwarded/i, /not available/i, /voice\s*mail/i,
  /leave.*message/i, /after the (?:tone|beep)/i, /please hold/i,
  /transferring/i, /record your/i, /hang up/i, /press.*(?:star|hash|pound)/i,
  /for (?:sales|service|support|accounts|hr|human resources|payable|any)/i,
  /thank you for calling/i, /your call (?:has been|will be)/i,
  /to help.*direct/i, /if you know/i, /dial (?:it |by )/i,
  /main menu/i, /company directory/i, /further assistance/i,
  /investor relations/i, /payroll hotline/i, /hear these options/i,
  /to speak with/i, /return your call/i, /general delivery/i,
  /at the tone/i, /after the tone/i, /we are sorry.*no one available/i,
  /name and reason for calling/i, /stay on the line/i,
  /call assist/i, /Google recording/i, /call screening/i,
  /before I try to connect/i, /cannot take your call/i,
  /I'll see if this person is available/i,
  /reason for call/i, /what you're calling about/i,
  /this person is available/i,
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
  /calling on behalf/i, /I'm reaching out/i,
];

function isIVRLine(text: string): boolean {
  return IVR_LINE_PATTERNS.some(p => p.test(text));
}
function isAgentMislabel(text: string): boolean {
  return AGENT_SPEECH_PATTERNS.some(p => p.test(text));
}

// ===== SIGNAL KEYWORDS =====
const POSITIVE_SIGNALS = [
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

const NEGATIVE_SIGNALS = [
  'not interested', 'don\'t call', 'stop calling', 'remove me',
  'no thanks', 'no thank you', 'unsubscribe', 'we\'re not looking',
  'not for us', 'don\'t need', 'already have', 'go away',
  'do not call', 'take me off', 'leave me alone', 'not a good time',
  'waste of time', 'not buying', 'not purchasing', 'wrong number',
  'who is this', 'how did you get my number', 'never heard of you',
  'i\'m hanging up', 'goodbye', 'please don\'t call again',
  'remove this number', 'off this list', 'off your list', 'remove from',
  'we\'re good', 'we\'re fine', 'we\'re set', 'we\'re covered',
  'pass', 'no no no', 'wrong person', 'don\'t do that kind of work',
];

const VOICEMAIL_SIGNALS = [
  'leave a message', 'after the beep', 'voicemail', 'voice mail',
  'cannot take your call', 'mailbox', 'reached the voicemail',
  'answering machine', 'please leave', 'record your message',
  'away from', 'return your call', 'at the tone', 'after the tone',
  'not available', 'when you have finished recording',
];

// ===== SCORE A SINGLE LEAD =====
interface LeadScore {
  score: number;           // 0-100
  qualificationStatus: 'qualified' | 'not_qualified' | 'needs_review';
  analysis: {
    engagementLevel: 'high' | 'medium' | 'low' | 'none';
    realContactTurns: number;
    rawContactTurns: number;
    agentTurns: number;
    positiveSignals: string[];
    negativeSignals: string[];
    identityConfirmed: boolean;
    interestExpressed: boolean;
    meetingAgreed: boolean;
    callbackRequested: boolean;
    declined: boolean;
    dncRequested: boolean;
    isVoicemail: boolean;
    isScreener: boolean;
    contactSnippets: string[];
    reasoning: string;
    scoreBreakdown: {
      engagementScore: number;     // 0-30
      interestScore: number;       // 0-25
      qualificationScore: number;  // 0-20
      durationScore: number;       // 0-15
      campaignFitScore: number;    // 0-10
    };
  };
}

function scoreLead(
  transcript: string,
  duration: number,
  campaignType: string,
  successCriteria: string | null,
  campaignObjective: string | null,
): LeadScore {
  const fullText = (transcript || '').toLowerCase();

  // Parse transcript lines
  const lines = transcript.split('\n');
  const agentLines: string[] = [];
  const rawContactLines: string[] = [];
  const realContactLines: string[] = [];

  for (const line of lines) {
    const agentMatch = line.match(/^Agent:\s*(.+)/i);
    const contactMatch = line.match(/^Contact:\s*(.+)/i);

    if (agentMatch) {
      agentLines.push(agentMatch[1].trim());
    } else if (contactMatch) {
      const content = contactMatch[1].trim();
      rawContactLines.push(content);
      // Filter out IVR/screener lines and agent speech mislabeled as contact
      if (content.length > 3 && !isIVRLine(content) && !isAgentMislabel(content)) {
        const isGarbled = /^[^a-zA-Z]*$/.test(content) || content.split(' ').length  contactText.includes(s));
  const negSignals = NEGATIVE_SIGNALS.filter(s => contactText.includes(s));
  const isVoicemail = VOICEMAIL_SIGNALS.some(s => fullText.includes(s)) && realContactTurns  isIVRLine(l)) && realContactTurns  /\?/.test(l)) ||
    /(?:what|how|when|where|why|can you|could you|tell me|explain)/i.test(contactText);
  const interestExpressed = /(?:interested|sounds? good|tell me more|like to know|curious|open to|exploring|send.*(?:info|details|email|over))/i.test(contactText);
  const callbackRequested = /(?:call (?:me )?back|callback|better time|busy (?:right )?now|try (?:me )?(?:later|again|tomorrow|next week))/i.test(contactText);
  const requestedInfo = /(?:send (?:me |it |that )?(?:over|info|details|email|brochure|whitepaper)|email (?:me|it|that|address)|my email)/i.test(contactText);
  const meetingAgreed = /(?:schedule|book|set up|let's do|i'm free|available|sounds great|perfect|confirmed|booked|put .* in my calendar|when works)/i.test(contactText);
  const declined = /(?:not interested|no thanks|don't (?:call|need|want)|we're (?:good|fine|set|covered)|already have|pass)/i.test(contactText);
  const dncRequested = /(?:do not call|don't call|stop calling|remove (?:me|us|this number|from)|take (?:me|us) off|unsubscribe|off (?:this|your|the) list)/i.test(contactText);

  // ===== SCORING BREAKDOWN (0-100) =====
  let engagementScore = 0;   // max 30
  let interestScore = 0;     // max 25  
  let qualificationScore = 0; // max 20
  let durationScore = 0;     // max 15
  let campaignFitScore = 0;  // max 10

  // --- Engagement Score (0-30) ---
  if (realContactTurns >= 6) engagementScore = 30;
  else if (realContactTurns >= 4) engagementScore = 24;
  else if (realContactTurns >= 3) engagementScore = 18;
  else if (realContactTurns >= 2) engagementScore = 12;
  else if (realContactTurns >= 1) engagementScore = 6;
  else engagementScore = 0;

  if (identityConfirmed) engagementScore = Math.min(engagementScore + 5, 30);
  if (askedQuestions) engagementScore = Math.min(engagementScore + 3, 30);

  // Penalty for voicemail/screener
  if (isVoicemail || isScreener) engagementScore = Math.min(engagementScore, 5);

  // --- Interest Score (0-25) ---
  if (meetingAgreed) interestScore = 25;
  else if (interestExpressed && requestedInfo) interestScore = 22;
  else if (interestExpressed) interestScore = 18;
  else if (requestedInfo) interestScore = 16;
  else if (callbackRequested) interestScore = 14;
  else if (posSignals.length >= 3) interestScore = 15;
  else if (posSignals.length >= 2) interestScore = 10;
  else if (posSignals.length >= 1) interestScore = 6;
  else interestScore = 0;

  // Penalties for negative signals
  if (declined) interestScore = Math.max(interestScore - 15, 0);
  if (dncRequested) interestScore = 0;
  if (negSignals.length >= 2) interestScore = Math.max(interestScore - 10, 0);

  // --- Qualification Score (0-20) ---
  const isAppointmentCampaign = ['appointment_setting', 'appointment_generation', 'demo_request', 'sql', 'bant_qualification', 'bant_leads', 'lead_qualification'].includes(campaignType);
  const isContentCampaign = ['content_syndication', 'high_quality_leads'].includes(campaignType);

  if (meetingAgreed && isAppointmentCampaign) qualificationScore = 20;
  else if (interestExpressed && requestedInfo && isContentCampaign) qualificationScore = 20;
  else if (meetingAgreed) qualificationScore = 18;
  else if (interestExpressed && askedQuestions) qualificationScore = 14;
  else if (interestExpressed) qualificationScore = 10;
  else if (askedQuestions && realContactTurns >= 3) qualificationScore = 8;
  else if (identityConfirmed && realContactTurns >= 2) qualificationScore = 5;
  else qualificationScore = 0;

  if (declined || dncRequested) qualificationScore = 0;

  // --- Duration Score (0-15) ---
  if (duration >= 120) durationScore = 15;
  else if (duration >= 90) durationScore = 13;
  else if (duration >= 60) durationScore = 11;
  else if (duration >= 45) durationScore = 9;
  else if (duration >= 30) durationScore = 7;
  else if (duration >= 20) durationScore = 4;
  else if (duration >= 10) durationScore = 2;
  else durationScore = 0;

  // Short call with no engagement = lower
  if (duration  10) {
    const criteriaWords = successCriteria.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 8);
    const matches = criteriaWords.filter(w => contactText.includes(w));
    campaignFitScore = Math.min(Math.round((matches.length / Math.max(criteriaWords.length, 1)) * 10), 10);
  }
  if (campaignObjective && contactText.length > 10) {
    const objectiveWords = campaignObjective.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    const matches = objectiveWords.filter(w => contactText.includes(w));
    if (matches.length >= 2) campaignFitScore = Math.min(campaignFitScore + 3, 10);
  }

  // Total score
  const totalScore = engagementScore + interestScore + qualificationScore + durationScore + campaignFitScore;

  // Engagement level
  let engagementLevel: 'high' | 'medium' | 'low' | 'none' = 'none';
  if (realContactTurns >= 4 && (interestExpressed || meetingAgreed || requestedInfo)) {
    engagementLevel = 'high';
  } else if (realContactTurns >= 2 && (identityConfirmed || askedQuestions || posSignals.length > 0)) {
    engagementLevel = 'medium';
  } else if (realContactTurns >= 1) {
    engagementLevel = 'low';
  }

  // Qualification status
  let qualificationStatus: 'qualified' | 'not_qualified' | 'needs_review' = 'needs_review';
  if (totalScore >= 70) qualificationStatus = 'qualified';
  else if (totalScore >= 40) qualificationStatus = 'needs_review';
  else qualificationStatus = 'not_qualified';

  // Override: DNC always not_qualified
  if (dncRequested) qualificationStatus = 'not_qualified';
  // Override: voicemail/screener with no engagement
  if ((isVoicemail || isScreener) && realContactTurns = 2) {
    reasoning = `Some engagement (${realContactTurns} turns) but no clear interest. Contact: "${contactSnippets[0]?.substring(0, 80) || 'N/A'}"`;
  } else {
    reasoning = `Minimal engagement (${realContactTurns} turn). Contact: "${contactSnippets[0]?.substring(0, 80) || 'N/A'}"`;
  }

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    qualificationStatus,
    analysis: {
      engagementLevel,
      realContactTurns,
      rawContactTurns: rawContactLines.length,
      agentTurns: agentLines.length,
      positiveSignals: posSignals,
      negativeSignals: negSignals,
      identityConfirmed,
      interestExpressed,
      meetingAgreed,
      callbackRequested,
      declined,
      dncRequested,
      isVoicemail,
      isScreener,
      contactSnippets,
      reasoning,
      scoreBreakdown: {
        engagementScore,
        interestScore,
        qualificationScore,
        durationScore,
        campaignFitScore,
      },
    },
  };
}

// ===== MAIN =====
async function main() {
  const APPLY = process.argv.includes('--apply');
  const ALL = process.argv.includes('--all');

  console.log('='.repeat(80));
  console.log('  LEAD SCORING — Pending Review & New Leads');
  console.log(`  Mode: ${APPLY ? '🔴 LIVE UPDATE' : '🟡 DRY RUN (use --apply to update)'}`);
  console.log(`  Scope: ${ALL ? 'ALL leads (re-score)' : 'Only un-scored leads'}`);
  console.log('='.repeat(80));

  // Query all pending/new leads with transcripts
  const results = await db.execute(sql`
    SELECT 
      l.id, l.contact_name, l.account_name, l.qa_status, l.ai_score,
      l.ai_qualification_status, l.call_duration, l.transcript,
      l.call_attempt_id,
      c.name as campaign_name, c.type as campaign_type,
      c.success_criteria, c.campaign_objective,
      dca.full_transcript as dca_transcript, dca.call_duration_seconds as dca_duration,
      dca.disposition as dca_disposition
    FROM leads l
    LEFT JOIN campaigns c ON l.campaign_id = c.id
    LEFT JOIN dialer_call_attempts dca ON l.call_attempt_id = dca.id
    WHERE l.deleted_at IS NULL
      AND l.qa_status IN ('new', 'under_review')
      ${ALL ? sql`` : sql`AND l.ai_score IS NULL`}
    ORDER BY l.created_at DESC
  `);

  console.log(`\nFound ${results.rows.length} leads to score\n`);

  if (results.rows.length === 0) {
    console.log('Nothing to score. All leads already have scores.');
    process.exit(0);
  }

  // Score each lead
  interface ScoredLead {
    id: string;
    contactName: string;
    company: string;
    campaign: string;
    campaignType: string;
    qaStatus: string;
    existingScore: number | null;
    existingQual: string | null;
    result: LeadScore;
    transcript: string;
    duration: number;
    dcaDisposition: string | null;
  }

  const scored: ScoredLead[] = [];

  for (const row of results.rows as any[]) {
    // Use lead transcript, fallback to dialer_call_attempts transcript
    const transcript = row.transcript || row.dca_transcript || '';
    const duration = row.call_duration || row.dca_duration || 0;
    
    if (!transcript || transcript.length  b.result.score - a.result.score);

  // ===== REPORT =====
  const qualified = scored.filter(s => s.result.qualificationStatus === 'qualified');
  const needsReview = scored.filter(s => s.result.qualificationStatus === 'needs_review');
  const notQualified = scored.filter(s => s.result.qualificationStatus === 'not_qualified');

  console.log('=== SCORE DISTRIBUTION ===');
  const ranges = [
    { label: '90-100 (Excellent)', min: 90, max: 100 },
    { label: '70-89 (Qualified)', min: 70, max: 89 },
    { label: '50-69 (Promising)', min: 50, max: 69 },
    { label: '30-49 (Low)', min: 30, max: 49 },
    { label: '10-29 (Minimal)', min: 10, max: 29 },
    { label: '0-9 (None)', min: 0, max: 9 },
  ];
  for (const r of ranges) {
    const count = scored.filter(s => s.result.score >= r.min && s.result.score  0) {
    console.log('\n' + '='.repeat(80));
    console.log('  TOP QUALIFIED LEADS (Score ≥ 70)');
    console.log('='.repeat(80));
    for (const s of qualified) {
      const bd = s.result.analysis.scoreBreakdown;
      console.log(`\n  🏆 [${s.result.score}] ${s.contactName} @ ${s.company}`);
      console.log(`  Campaign: ${s.campaign} (${s.campaignType})`);
      console.log(`  Duration: ${s.duration}s | Turns: ${s.result.analysis.realContactTurns} real`);
      console.log(`  Breakdown: eng=${bd.engagementScore}/30 int=${bd.interestScore}/25 qual=${bd.qualificationScore}/20 dur=${bd.durationScore}/15 fit=${bd.campaignFitScore}/10`);
      console.log(`  Signals: +${s.result.analysis.positiveSignals.length} -${s.result.analysis.negativeSignals.length}`);
      console.log(`  ${s.result.analysis.reasoning}`);
      for (const snippet of s.result.analysis.contactSnippets.slice(0, 3)) {
        console.log(`    > "${snippet.substring(0, 120)}"`);
      }
    }
  }

  // Show needs review (promising)
  if (needsReview.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`  NEEDS REVIEW — Promising but Unclear (Score 40-69) [${needsReview.length}]`);
    console.log('='.repeat(80));
    for (const s of needsReview.slice(0, 20)) {
      const bd = s.result.analysis.scoreBreakdown;
      console.log(`\n  🔍 [${s.result.score}] ${s.contactName} @ ${s.company}`);
      console.log(`  Campaign: ${s.campaign} | Duration: ${s.duration}s | Turns: ${s.result.analysis.realContactTurns}`);
      console.log(`  Breakdown: eng=${bd.engagementScore}/30 int=${bd.interestScore}/25 qual=${bd.qualificationScore}/20 dur=${bd.durationScore}/15 fit=${bd.campaignFitScore}/10`);
      console.log(`  ${s.result.analysis.reasoning}`);
      if (s.result.analysis.contactSnippets[0]) {
        console.log(`    > "${s.result.analysis.contactSnippets[0].substring(0, 120)}"`);
      }
    }
    if (needsReview.length > 20) console.log(`  ... +${needsReview.length - 20} more`);
  }

  // Show not qualified
  if (notQualified.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`  NOT QUALIFIED (Score  15) console.log(`  ... +${notQualified.length - 15} more`);
  }

  // ===== APPLY =====
  if (APPLY) {
    console.log('\n' + '='.repeat(80));
    console.log('  APPLYING SCORES TO DATABASE');
    console.log('='.repeat(80));

    let applied = 0, errors = 0;

    for (const s of scored) {
      try {
        await db.execute(sql`
          UPDATE leads
          SET 
            ai_score = ${String(s.result.score)},
            ai_analysis = ${JSON.stringify(s.result.analysis)}::jsonb,
            ai_qualification_status = ${s.result.qualificationStatus},
            updated_at = NOW()
          WHERE id = ${s.id}
        `);
        applied++;
      } catch (err) {
        errors++;
        console.error(`  ❌ ${s.contactName}: ${err}`);
      }
    }

    console.log(`\n  Applied: ${applied} | Errors: ${errors}`);
  } else {
    console.log(`\n  Run with --apply to write scores to DB for ${scored.length} leads.`);
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total leads scored:    ${scored.length}`);
  console.log(`  Average score:         ${Math.round(scored.reduce((sum, s) => sum + s.result.score, 0) / scored.length)}`);
  console.log(`  Qualified (≥70):       ${qualified.length}`);
  console.log(`  Needs Review (40-69):  ${needsReview.length}`);
  console.log(`  Not Qualified ( s.result.analysis.engagementLevel === 'high').length,
    medium: scored.filter(s => s.result.analysis.engagementLevel === 'medium').length,
    low: scored.filter(s => s.result.analysis.engagementLevel === 'low').length,
    none: scored.filter(s => s.result.analysis.engagementLevel === 'none').length,
  };
  console.log(`  Engagement: high=${engByLevel.high} medium=${engByLevel.medium} low=${engByLevel.low} none=${engByLevel.none}`);

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });