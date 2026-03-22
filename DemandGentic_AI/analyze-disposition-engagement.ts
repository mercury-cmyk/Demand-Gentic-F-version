/**
 * Disposition Analysis & Re-classification Script
 * 
 * Analyzes call dispositions, focusing on calls with real human engagement
 * that may be misclassified. Updates dispositions according to campaign 
 * success criteria.
 * 
 * Phase 1: Analysis (dry run) — shows what would change
 * Phase 2: Update — applies corrections based on transcript analysis
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

const LOG = '[DispositionEngagement]';

// ===== TYPES =====
interface MisclassifiedCall {
  id: string;
  disposition: string | null;
  callDurationSeconds: number;
  connected: boolean;
  firstName: string;
  lastName: string;
  company: string;
  campaignName: string;
  campaignId: string;
  campaignType: string;
  successCriteria: string | null;
  campaignObjective: string | null;
  fullTranscript: string;
}

interface TranscriptAnalysis {
  hasRealHumanEngagement: boolean;
  contactTurns: number;
  agentTurns: number;
  positiveSignals: string[];
  negativeSignals: string[];
  isVoicemail: boolean;
  isGatekeeper: boolean;
  isIVR: boolean;
  contactSaidIdentityConfirm: boolean;
  contactAskedQuestions: boolean;
  contactExpressedInterest: boolean;
  contactRequestedCallback: boolean;
  contactRequestedInfo: boolean;
  contactAgreedToMeeting: boolean;
  contactDeclined: boolean;
  contactRequestedDNC: boolean;
  suggestedDisposition: string;
  confidence: number;
  reasoning: string;
}

// ===== POSITIVE / NEGATIVE SIGNAL KEYWORDS =====
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
  'take off your', 'remove from your',
];

const VOICEMAIL_SIGNALS = [
  'leave a message', 'after the beep', 'not available', 
  'voicemail', 'voice mail', 'cannot take your call', 'mailbox',
  'reached the voicemail', 'answering machine', 'please leave',
  'record your message', 'away from', 'return your call',
  'at the tone', 'after the tone', 'please record your message',
  'when you have finished recording', 'leave your message',
];

const IVR_SIGNALS = [
  'press 1', 'press 2', 'main menu', 'for sales press',
  'transferring your call', 'please hold', 'extension number',
];

const GATEKEEPER_SIGNALS = [
  'who is calling', 'who\'s calling', 'what is this regarding',
  'can i take a message', 'they\'re not available', 'not in the office',
  'send an email instead', 'they\'re in a meeting',
];

// ===== TRANSCRIPT ANALYZER =====

// Patterns indicating a line is from IVR/voicemail system, NOT a real person
const IVR_LINE_PATTERNS = [
  /press \d/i, /extension/i, /menu/i, /option/i, /recording/i,
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
];

// Patterns indicating the line is actually agent speech mislabeled as Contact
const AGENT_SPEECH_PATTERNS = [
  /am I speaking with/i, /may I speak with/i, /this is .*calling/i,
  /I'm calling/i, /on behalf of/i, /I was just (?:saying|calling|mentioning)/i,
  /we help (?:help )?companies/i, /we've been helping/i,
  /(?:my name is|this is) (?:onyx|jordan|alex|sarah|mike|david)/i,
  /regarding some of the services/i, /it's regarding/i,
  /RingCentral|Harver|DemandGenic|demand genic|UK Export|Proton/i,
  /consolidating communication/i, /improve productivity/i,
  /streamline.*(?:hiring|processes)/i, /I'm sorry.*having trouble/i,
  /could you connect me/i,
];

function isIVRLine(text: string): boolean {
  return IVR_LINE_PATTERNS.some(p => p.test(text));
}

function isAgentSpeechMislabeled(text: string): boolean {
  return AGENT_SPEECH_PATTERNS.some(p => p.test(text));
}

function analyzeTranscript(transcript: string, successCriteria: string | null, campaignType: string): TranscriptAnalysis {
  const text = transcript.toLowerCase();
  
  // Parse [Call Summary] for turn counts first (most reliable)
  const summaryTurnMatch = text.match(/(\d+)\s*total turns\s*\((\d+)\s*agent,\s*(\d+)\s*contact\)/);
  let hasSummary = false;
  let summaryAgentTurns = 0;
  let summaryContactTurns = 0;
  if (summaryTurnMatch) {
    hasSummary = true;
    summaryAgentTurns = parseInt(summaryTurnMatch[2]);
    summaryContactTurns = parseInt(summaryTurnMatch[3]);
  }

  // Extract labeled lines from [Call Transcript] section
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
      
      // Filter: skip IVR/voicemail system lines and mislabeled agent speech
      if (content.length > 3 && !isIVRLine(content) && !isAgentSpeechMislabeled(content)) {
        // Also filter out background noise / garbled text
        const isGarbled = /^[^a-zA-Z]*$/.test(content) || content.split(' ').length  3 && !isIVRLine(c) && !isAgentSpeechMislabeled(c)) {
              realContactLines.push(c);
            }
          }
        }
      }
    } catch {
      // Not JSON
    }
  }

  // Use the most accurate turn counts
  let agentTurns = Math.max(agentLines.length, summaryAgentTurns);
  // For contact turns, trust our filtered real lines over the summary
  // because summary counts include IVR/voicemail lines labeled as Contact
  let contactTurns = realContactLines.length;
  // If summary explicitly says 0 contact, trust it absolutely
  if (hasSummary && summaryContactTurns === 0) contactTurns = 0;

  // REVERSED LABEL DETECTION:
  // If most Contact: lines are agent speech (filtered out) but Agent: lines 
  // contain short conversational responses, the labels may be swapped.
  const reversedLabels = rawContactLines.length >= 3 
    && realContactLines.length === 0 
    && agentLines.length >= 2
    && agentLines.some(l => /^(?:i'm listening|sure|tell me|who|yes|hello|okay|listening|are you|can you|still there)/i.test(l.trim()));
  
  if (reversedLabels) {
    // The "Agent:" lines are likely the real contact's words
    // Don't swap fully — just note there WAS a real person, set to needs_review
    contactTurns = agentLines.filter(l => 
      l.length > 3 && l.length  contactText.includes(s));
  const negativeSignals = NEGATIVE_SIGNALS.filter(s => contactText.includes(s));
  const isVoicemail = VOICEMAIL_SIGNALS.some(s => text.includes(s)) && contactTurns  contactText.includes(s) || text.includes(s));
  const isIVR = IVR_SIGNALS.some(s => text.includes(s)) || rawContactLines.some(l => isIVRLine(l));

  // Deep engagement analysis — ONLY on real contact text
  const contactSaidIdentityConfirm = /yes.*(?:speaking|this is|that's me|it's me|i am)/i.test(contactText);
  const contactAskedQuestions = realContactLines.some(l => /\?/.test(l)) || 
    /(?:what|how|when|where|why|can you|could you|tell me|explain)/i.test(contactText);
  const contactExpressedInterest = /(?:interested|sounds? good|tell me more|like to know|curious|open to|exploring)/i.test(contactText);
  const contactRequestedCallback = /(?:call (?:me )?back|callback|better time|busy (?:right )?now|try (?:me )?(?:later|again|tomorrow|next week))/i.test(contactText);
  const contactRequestedInfo = /(?:send (?:me |it |that )?(?:over|info|details|email|brochure|whitepaper)|email (?:me|it|that|address)|my email)/i.test(contactText);
  const contactAgreedToMeeting = /(?:schedule|book|set up|let's do|i'm free|available|sounds great|perfect|confirmed|booked)/i.test(contactText);
  const contactDeclined = /(?:not interested|no thanks|don't (?:call|need|want)|we're (?:good|fine|set|covered)|already have|pass)/i.test(contactText);
  const contactRequestedDNC = /(?:do not call|don't call|stop calling|remove (?:me|us|this number|from)|take (?:me|us) off|unsubscribe|off (?:this|your|the) list|remove.*(?:number|list|mailing)|stop.*contact)/i.test(contactText);
  
  const hasRealHumanEngagement = contactTurns >= 2 && !isVoicemail && !isIVR;

  // ===== DISPOSITION DECISION LOGIC =====
  let suggestedDisposition = 'needs_review';
  let confidence = 0.5;
  let reasoning = '';

  // DNC takes absolute priority
  if (contactRequestedDNC) {
    suggestedDisposition = 'do_not_call';
    confidence = 0.95;
    reasoning = 'Contact explicitly requested to not be called again';
  }
  // Voicemail
  else if (isVoicemail && contactTurns  0 && positiveSignals.length === 0) {
      suggestedDisposition = 'not_interested';
      confidence = 0.85;
      reasoning = `Contact explicitly declined: ${negativeSignals.join(', ')}`;
    }
    // Callback request
    else if (contactRequestedCallback) {
      suggestedDisposition = 'callback_requested';
      confidence = 0.85;
      reasoning = 'Contact requested a callback at a different time';
    }
    // Qualified lead — strict criteria
    else if (contactExpressedInterest || contactAgreedToMeeting || contactRequestedInfo) {
      const qualSignals: string[] = [];
      
      if (contactSaidIdentityConfirm) qualSignals.push('identity_confirmed');
      if (contactExpressedInterest) qualSignals.push('expressed_interest');
      if (contactAgreedToMeeting) qualSignals.push('agreed_to_meeting');
      if (contactRequestedInfo) qualSignals.push('requested_info');
      if (contactAskedQuestions) qualSignals.push('asked_questions');

      // For appointment campaigns: need agreed to meeting + identity
      if (isAppointmentCampaign) {
        if (contactAgreedToMeeting && qualSignals.length >= 3) {
          suggestedDisposition = 'qualified_lead';
          confidence = 0.8;
          reasoning = `Appointment campaign: contact agreed to meeting with ${qualSignals.length} qualifying signals: ${qualSignals.join(', ')}`;
        } else if (contactExpressedInterest || contactRequestedInfo) {
          suggestedDisposition = 'needs_review';
          confidence = 0.7;
          reasoning = `Appointment campaign: interest detected but meeting not fully confirmed. Signals: ${qualSignals.join(', ')}`;
        }
      }
      // For event campaigns: expressed interest or agreed to attend
      else if (isEventCampaign) {
        if ((contactExpressedInterest || contactAgreedToMeeting) && qualSignals.length >= 2) {
          suggestedDisposition = 'qualified_lead';
          confidence = 0.8;
          reasoning = `Event campaign: contact showed interest/agreed with ${qualSignals.length} signals: ${qualSignals.join(', ')}`;
        } else {
          suggestedDisposition = 'needs_review';
          confidence = 0.65;
          reasoning = `Event campaign: some interest but not enough qualifying signals. Signals: ${qualSignals.join(', ')}`;
        }
      }
      // For content campaigns: requested info or expressed interest + email confirmation
      else if (isContentCampaign) {
        if (contactRequestedInfo || (contactExpressedInterest && qualSignals.length >= 2)) {
          suggestedDisposition = 'qualified_lead';
          confidence = 0.8;
          reasoning = `Content campaign: contact requested info/material. Signals: ${qualSignals.join(', ')}`;
        } else {
          suggestedDisposition = 'needs_review';
          confidence = 0.65;
          reasoning = `Content campaign: partial interest. Signals: ${qualSignals.join(', ')}`;
        }
      }
      // Generic / other campaign types
      else {
        if (qualSignals.length >= 3) {
          suggestedDisposition = 'qualified_lead';
          confidence = 0.75;
          reasoning = `Multiple qualifying signals (${qualSignals.length}): ${qualSignals.join(', ')}`;
        } else if (qualSignals.length >= 2) {
          suggestedDisposition = 'needs_review';
          confidence = 0.7;
          reasoning = `Some qualifying signals (${qualSignals.length}): ${qualSignals.join(', ')} — needs human verification`;
        } else {
          suggestedDisposition = 'needs_review';
          confidence = 0.6;
          reasoning = `Weak qualifying signals: ${qualSignals.join(', ')} — needs human review`;
        }
      }

      // Campaign success criteria bonus
      if (successCriteria && text.includes(successCriteria.toLowerCase().substring(0, 20))) {
        confidence = Math.min(confidence + 0.1, 0.95);
        reasoning += ` | Matches campaign success criteria`;
      }
    }
    // Mixed signals
    else if (positiveSignals.length > 0 && negativeSignals.length > 0) {
      suggestedDisposition = 'needs_review';
      confidence = 0.6;
      reasoning = `Mixed signals: +${positiveSignals.length} / -${negativeSignals.length}`;
    }
    // Real conversation but no clear signals
    else if (contactTurns >= 3 && !contactDeclined) {
      suggestedDisposition = 'needs_review';
      confidence = 0.6;
      reasoning = `Real conversation (${contactTurns} contact turns) but no clear outcome — needs human review`;
    }
    // Contact engaged but declined softly (no explicit negative)
    else if (contactTurns >= 2 && negativeSignals.length > 0) {
      suggestedDisposition = 'not_interested';
      confidence = 0.75;
      reasoning = `Contact engaged but showed disinterest: ${negativeSignals.join(', ')}`;
    }
    // Minimal engagement
    else {
      suggestedDisposition = 'needs_review';
      confidence = 0.5;
      reasoning = `Minimal engagement (${contactTurns} real turns). Contact said: "${realContactLines.slice(0, 2).join(' | ').substring(0, 100)}"`;
    }
  }
  // No real engagement
  else if (contactTurns === 0 && !isVoicemail) {
    // Check if it's an IVR that wasn't caught
    if (isIVR || rawContactLines.some(l => isIVRLine(l))) {
      suggestedDisposition = 'no_answer';
      confidence = 0.8;
      reasoning = 'IVR system detected — agent did not reach a real person';
    } else {
      suggestedDisposition = 'no_answer';
      confidence = 0.8;
      reasoning = `No real contact engagement detected (${rawContactLines.length} raw lines, 0 after filtering IVR/agent mislabels)`;
    }
  }
  // Gatekeeper only
  else if (isGatekeeper && contactTurns = 30 THEN 1 END) as over_30,
      COUNT(CASE WHEN call_duration_seconds >= 60 THEN 1 END) as over_60,
      COUNT(CASE WHEN connected = true THEN 1 END) as connected_cnt
    FROM dialer_call_attempts
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY disposition ORDER BY cnt DESC
  `);
  
  console.log('Disposition          | Count | AvgDur | >30s | >60s | Connected');
  console.log('-'.repeat(75));
  for (const d of dispBreakdown.rows as any[]) {
    console.log(
      `${String(d.disp).padEnd(20)} | ${String(d.cnt).padEnd(5)} | ${String(d.avg_dur || 0).padEnd(6)}s | ${String(d.over_30).padEnd(4)} | ${String(d.over_60).padEnd(4)} | ${d.connected_cnt}`
    );
  }

  // 2. Get campaigns with success criteria
  console.log('\n=== ACTIVE CAMPAIGNS ===');
  const campaigns = await db.execute(sql`
    SELECT id, name, type, success_criteria, campaign_objective, status
    FROM campaigns WHERE status IN ('active', 'paused') ORDER BY name
  `);
  for (const c of campaigns.rows as any[]) {
    console.log(`  [${c.status}] ${c.name} (${c.type}) — Success: ${c.success_criteria || 'DEFAULT'}`);
  }

  // 3. Find calls with real human engagement that may be misclassified
  console.log('\n=== ANALYZING CALLS WITH HUMAN ENGAGEMENT ===');
  const callsToAnalyze = await db.execute(sql`
    SELECT 
      dca.id, dca.disposition::text as disposition, dca.call_duration_seconds, dca.connected,
      c.first_name, c.last_name, a.name as company,
      camp.name as campaign_name, camp.id as campaign_id,
      camp.success_criteria, camp.type as campaign_type,
      camp.campaign_objective,
      dca.full_transcript
    FROM dialer_call_attempts dca
    LEFT JOIN contacts c ON dca.contact_id = c.id
    LEFT JOIN accounts a ON c.account_id = a.id
    LEFT JOIN campaigns camp ON dca.campaign_id = camp.id
    WHERE dca.call_duration_seconds >= 20
      AND dca.connected = true
      AND dca.full_transcript IS NOT NULL
      AND LENGTH(dca.full_transcript) > 50
      AND dca.created_at > NOW() - INTERVAL '30 days'
    ORDER BY dca.call_duration_seconds DESC
  `);

  console.log(`Found ${callsToAnalyze.rows.length} connected calls with transcripts to analyze\n`);

  // Track changes
  const changes: Array = [];
  
  const stats = {
    total: 0,
    realEngagement: 0,
    alreadyCorrect: 0,
    wouldUpgrade: 0,
    wouldDowngrade: 0,
    wouldChange: 0,
    byNewDisp: {} as Record,
    byOldDisp: {} as Record,
  };

  for (const row of callsToAnalyze.rows as any[]) {
    stats.total++;
    const currentDisp = row.disposition || 'NULL';
    
    // Analyze the transcript
    const analysis = analyzeTranscript(
      row.full_transcript,
      row.success_criteria,
      row.campaign_type || 'call'
    );

    if (analysis.hasRealHumanEngagement) {
      stats.realEngagement++;
    }

    const newDisp = analysis.suggestedDisposition;
    
    // Track old disposition stats
    stats.byOldDisp[currentDisp] = (stats.byOldDisp[currentDisp] || 0) + 1;

    // Check if disposition should change
    if (newDisp === currentDisp) {
      stats.alreadyCorrect++;
      continue;
    }

    // Determine if this is an upgrade or downgrade
    const dispRank: Record = {
      'qualified_lead': 5,
      'callback_requested': 4,
      'needs_review': 3,
      'not_interested': 2,
      'no_answer': 1,
      'voicemail': 1,
      'do_not_call': 0,
      'invalid_data': 0,
    };

    const oldRank = dispRank[currentDisp] ?? 1;
    const newRank = dispRank[newDisp] ?? 1;

    if (newRank > oldRank) stats.wouldUpgrade++;
    else stats.wouldDowngrade++;
    stats.wouldChange++;
    stats.byNewDisp[newDisp] = (stats.byNewDisp[newDisp] || 0) + 1;

    const contactName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown';
    
    changes.push({
      id: row.id,
      contact: contactName,
      campaign: row.campaign_name || 'Unknown',
      currentDisp,
      newDisp,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      duration: row.call_duration_seconds,
    });
  }

  // 4. Report findings
  console.log('\n=== ANALYSIS RESULTS ===');
  console.log(`Total calls analyzed:        ${stats.total}`);
  console.log(`With real human engagement:  ${stats.realEngagement}`);
  console.log(`Already correctly classified: ${stats.alreadyCorrect}`);
  console.log(`Would change:                ${stats.wouldChange}`);
  console.log(`  Upgrades:                  ${stats.wouldUpgrade}`);
  console.log(`  Downgrades:                ${stats.wouldDowngrade}`);

  console.log('\n--- Changes by NEW disposition ---');
  for (const [disp, count] of Object.entries(stats.byNewDisp).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${disp.padEnd(20)} → ${count} calls`);
  }

  // 5. Show detailed changes
  if (changes.length > 0) {
    console.log(`\n=== DISPOSITION CHANGES (${changes.length} total) ===`);
    
    // Group by type of change for readability
    const upgrades = changes.filter(c => {
      const r: Record = { qualified_lead: 5, callback_requested: 4, needs_review: 3, not_interested: 2, no_answer: 1, voicemail: 1, do_not_call: 0 };
      return (r[c.newDisp] ?? 0) > (r[c.currentDisp] ?? 0);
    });
    
    if (upgrades.length > 0) {
      console.log(`\n--- UPGRADES (${upgrades.length}) — Real engagement detected ---`);
      for (const ch of upgrades) {
        console.log(`  [${ch.duration}s] ${ch.contact} @ ${ch.campaign}`);
        console.log(`    ${ch.currentDisp} → ${ch.newDisp} (${Math.round(ch.confidence * 100)}%)`);
        console.log(`    Reason: ${ch.reasoning}`);
      }
    }

    const downgrades = changes.filter(c => !upgrades.includes(c));
    if (downgrades.length > 0) {
      console.log(`\n--- DOWNGRADES / CORRECTIONS (${downgrades.length}) ---`);
      for (const ch of downgrades.slice(0, 20)) {
        console.log(`  [${ch.duration}s] ${ch.contact} @ ${ch.campaign}`);
        console.log(`    ${ch.currentDisp} → ${ch.newDisp} (${Math.round(ch.confidence * 100)}%)`);
        console.log(`    Reason: ${ch.reasoning}`);
      }
      if (downgrades.length > 20) {
        console.log(`  ... and ${downgrades.length - 20} more`);
      }
    }
  }

  // 6. Apply changes if --apply flag provided
  if (!DRY_RUN && changes.length > 0) {
    console.log(`\n=== APPLYING ${changes.length} DISPOSITION UPDATES ===`);
    
    let applied = 0;
    let errors = 0;
    
    for (const ch of changes) {
      try {
        // Only apply high-confidence changes
        if (ch.confidence  0) {
    console.log(`\n${LOG} DRY RUN complete. Run with --apply to update ${changes.length} dispositions.`);
  } else {
    console.log(`\n${LOG} No disposition changes needed.`);
  }

  // 7. Summary of calls that SHOULD be qualified but aren't
  console.log('\n=== HIGH-VALUE MISSED LEADS (qualified_lead candidates) ===');
  const qualifiedCandidates = changes.filter(c => c.newDisp === 'qualified_lead');
  if (qualifiedCandidates.length > 0) {
    for (const q of qualifiedCandidates) {
      console.log(`  ⭐ ${q.contact} @ ${q.campaign} (${q.duration}s)`);
      console.log(`     Was: ${q.currentDisp} → Should be: qualified_lead`);
      console.log(`     ${q.reasoning}`);
    }
  } else {
    console.log('  No missed qualified leads found.');
  }

  console.log('\n=== CALLBACK CANDIDATES ===');
  const callbackCandidates = changes.filter(c => c.newDisp === 'callback_requested');
  if (callbackCandidates.length > 0) {
    for (const cb of callbackCandidates) {
      console.log(`  📞 ${cb.contact} @ ${cb.campaign} (${cb.duration}s)`);
      console.log(`     Was: ${cb.currentDisp} → Should be: callback_requested`);
      console.log(`     ${cb.reasoning}`);
    }
  } else {
    console.log('  No missed callback requests found.');
  }

  process.exit(0);
}

runAnalysis().catch(err => {
  console.error(`${LOG} Fatal error:`, err);
  process.exit(1);
});