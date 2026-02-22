/**
 * Smart Disposition Analyzer
 * 
 * Analyzes call transcripts and determines disposition based on campaign-specific
 * success indicators and qualification criteria.
 * 
 * This service addresses the issue where AI calls are incorrectly marked as
 * "no_answer" or "voicemail" despite having real conversations with positive signals.
 */

import { db } from "../db";
import { campaigns, callSessions } from "@shared/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import OpenAI from "openai";

const LOG_PREFIX = "[SmartDisposition]";

// ==================== TYPES ====================

export interface CampaignQualificationContext {
  campaignId: string;
  campaignName: string;
  successIndicators: {
    primarySuccess?: string;
    secondarySuccess?: string[];
    qualifiedLeadDefinition?: string;
    meetingCriteria?: {
      minimumSeniority?: string;
      requiredAuthority?: string[];
      timeframeRequirement?: string;
    };
  };
  qualificationCriteria?: {
    qualifyingConditions?: Array<{
      field: string;
      operator: string;
      value: any;
      weight?: number;
      required?: boolean;
    }>;
    disqualifyingConditions?: Array<{
      field: string;
      operator: string;
      value: any;
      reason: string;
    }>;
    customRules?: string;
  };
  positiveKeywords: string[];
  negativeKeywords: string[];
}

export interface DispositionAnalysisResult {
  suggestedDisposition: "qualified_lead" | "not_interested" | "voicemail" | "no_answer" | "needs_review" | "callback_requested";
  confidence: number;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  shouldOverride: boolean;
  metSuccessIndicators: string[];
  missedIndicators: string[];
}

// ==================== CAMPAIGN CONTEXT LOADER ====================

/**
 * Load campaign-specific qualification context
 */
export async function loadCampaignQualificationContext(campaignId: string): Promise<CampaignQualificationContext | null> {
  try {
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        successCriteria: campaigns.successCriteria,
        qaParameters: campaigns.qaParameters,
        aiAgentSettings: campaigns.aiAgentSettings,
        campaignObjective: campaigns.campaignObjective,
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      console.warn(`${LOG_PREFIX} Campaign ${campaignId} not found`);
      return null;
    }

    // Build positive/negative keywords from QA parameters and AI settings
    const qaParams = (campaign.qaParameters as Record<string, any>) || {};
    const aiSettings = (campaign.aiAgentSettings as Record<string, any>) || {};

    const positiveKeywords = [
      'interested',
      'tell me more',
      'send me',
      'email me',
      'call me back',
      'callback',
      'sounds good',
      'yes please',
      'schedule',
      'meeting',
      'book',
      'demo',
      ...(qaParams.positive_keywords || []),
      ...(aiSettings.positiveKeywords || []),
    ];

    const negativeKeywords = [
      'not interested',
      'don\'t call',
      'stop calling',
      'remove me',
      'no thanks',
      'no thank you',
      'unsubscribe',
      ...(qaParams.negative_keywords || []),
      ...(aiSettings.negativeKeywords || []),
    ];

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      successIndicators: {
        primarySuccess: campaign.successCriteria || campaign.campaignObjective || undefined,
        secondarySuccess: [],
        qualifiedLeadDefinition: campaign.successCriteria || undefined,
        meetingCriteria: undefined,
      },
      qualificationCriteria: qaParams.qualification_criteria || {},
      positiveKeywords,
      negativeKeywords,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Error loading campaign context:`, error);
    return null;
  }
}

// ==================== TRANSCRIPT ANALYSIS ====================

/**
 * Parse and analyze transcript for user engagement signals
 */
function analyzeTranscriptForQualification(
  transcript: any,
  context: CampaignQualificationContext
): {
  hasUserResponse: boolean;
  userTurns: number;
  positiveSignals: string[];
  negativeSignals: string[];
  isVoicemail: boolean;
  isIVR: boolean;
  isGatekeeper: boolean;
  hasRealConversation: boolean;
  userText: string;
  fullText: string;
} {
  const normalizeText = (value: string | null | undefined): string =>
    String(value || '').replace(/\s+/g, ' ').trim();

  const extractSummaryAndTranscript = (raw: string): { summaryText: string; transcriptText: string } => {
    const text = String(raw || '');
    const summaryMarker = '[Call Summary]';
    const transcriptMarker = '[Call Transcript]';

    if (!text.includes(summaryMarker)) {
      return { summaryText: '', transcriptText: text };
    }

    const summaryStart = text.indexOf(summaryMarker) + summaryMarker.length;
    const transcriptStart = text.indexOf(transcriptMarker);

    if (transcriptStart > -1) {
      return {
        summaryText: normalizeText(text.slice(summaryStart, transcriptStart)),
        transcriptText: normalizeText(text.slice(transcriptStart + transcriptMarker.length)),
      };
    }

    return {
      summaryText: normalizeText(text.slice(summaryStart)),
      transcriptText: text,
    };
  };

  let parsedTranscript: any[] = [];
  let summaryText = '';
  
  if (typeof transcript === 'string') {
    const extracted = extractSummaryAndTranscript(transcript);
    summaryText = extracted.summaryText;

    try {
      parsedTranscript = JSON.parse(extracted.transcriptText);
    } catch (e) {
      // Plain text transcript
      const fullText = normalizeText(`${summaryText} ${extracted.transcriptText}`).toLowerCase();
      const summaryLower = summaryText.toLowerCase();
      const summaryHasContactSignals =
        /contact response|contact signaled|contact showed|contact indicated|contact response included/.test(summaryLower);

      const summaryTurnMatch = summaryLower.match(/\((\d+)\s*agent,\s*(\d+)\s*contact\)/);
      const summaryContactTurns = summaryTurnMatch ? Number(summaryTurnMatch[2]) || 0 : 0;

      return {
        hasUserResponse: fullText.includes('user:') || fullText.includes('contact:') || summaryHasContactSignals || summaryContactTurns > 0,
        userTurns: summaryContactTurns,
        positiveSignals: context.positiveKeywords.filter(k => fullText.includes(k.toLowerCase())),
        negativeSignals: context.negativeKeywords.filter(k => fullText.includes(k.toLowerCase())),
        isVoicemail: fullText.includes('voicemail') || fullText.includes('leave a message'),
        isIVR: fullText.includes('press 1') || fullText.includes('press 2'),
        isGatekeeper: false,
        hasRealConversation: false,
        userText: '',
        fullText,
      };
    }
  } else if (Array.isArray(transcript)) {
    parsedTranscript = transcript;
  } else {
    return {
      hasUserResponse: false,
      userTurns: 0,
      positiveSignals: [],
      negativeSignals: [],
      isVoicemail: false,
      isIVR: false,
      isGatekeeper: false,
      hasRealConversation: false,
      userText: '',
      fullText: '',
    };
  }

  // Extract user messages
  const userMessages = parsedTranscript.filter(t => t.role === 'user');
  const userText = normalizeText(userMessages.map(m => (m.message || m.text || '')).join(' ')).toLowerCase();
  const fullText = normalizeText(`${summaryText} ${parsedTranscript.map(t => (t.message || t.text || '')).join(' ')}`).toLowerCase();
  const summaryLower = summaryText.toLowerCase();

  // Detect voicemail/IVR — comprehensive list aligned with isVoicemailTranscript() in voice-dialer.ts
  const voicemailPatterns = [
    'leave a message', 'leave your message', 'after the beep', 'after the tone',
    'not available', 'cannot take your call', 'can\'t take your call',
    'please leave', 'record your message', 'voicemail', 'voice mail',
    'mailbox', 'answering machine', 'reached the voicemail',
    'no one is available', 'press pound when finished',
    'we didn\'t get your message', 'we did not get your message',
    'you were not speaking', 'because of a bad connection',
    'maximum time permitted', 'is not available',
    'your call has been forwarded', 'automatic voice message system',
    'i\'ll get back to you', 'i will get back to you',
    'return your call', 'come to the phone',
    'away from my phone', 'away from the phone',
    'i\'m unable to', 'unable to take your call',
    'nach dem signalton',
  ];
  
  const ivrPatterns = [
    'press 1',
    'press 2',
    'press 3',
    'main menu',
    'for sales press',
    'for support press',
    'please stay on the line',
    'please hold',
    'transferring your call',
    'your call is being transferred',
    'one moment please',
    'putting you through',
    'all our operators',
    'all agents are busy',
    'extension number',
    'dial by name',
  ];

  // Gatekeeper phrases that should NOT count as user engagement
  const gatekeeperPatterns = [
    'who is calling',
    'who\'s calling',
    'what is this regarding',
    'what\'s this regarding',
    'what company are you from',
    'they\'re not available',
    'they\'re in a meeting',
    'can i take a message',
    'i\'ll pass on the message',
    'send an email',
    'try again later',
    'not in the office',
    'not at their desk',
  ];

  const isVoicemail = voicemailPatterns.some(p => fullText.includes(p));
  const isIVR = ivrPatterns.some(p => fullText.includes(p));
  const isGatekeeper = gatekeeperPatterns.some(p => fullText.includes(p));

  // Find positive signals
  const positiveSignals: string[] = [];
  for (const keyword of context.positiveKeywords) {
    if (userText.includes(keyword.toLowerCase()) || summaryLower.includes(keyword.toLowerCase())) {
      positiveSignals.push(keyword);
    }
  }

  // Find negative signals
  const negativeSignals: string[] = [];
  for (const keyword of context.negativeKeywords) {
    if (userText.includes(keyword.toLowerCase()) || summaryLower.includes(keyword.toLowerCase())) {
      negativeSignals.push(keyword);
    }
  }

  // Count meaningful user turns (more than just "..." or short filler)
  const meaningfulUserTurns = userMessages.filter(m => {
    const text = (m.message || m.text || '').trim();
    return text.length > 5 && text !== '...' && text !== 'hmm' && text !== 'uh';
  });

  // Determine if there's a real conversation
  const summaryTurnMatch = summaryLower.match(/\((\d+)\s*agent,\s*(\d+)\s*contact\)/);
  const summaryContactTurns = summaryTurnMatch ? Number(summaryTurnMatch[2]) || 0 : 0;
  const effectiveUserTurns = Math.max(meaningfulUserTurns.length, summaryContactTurns);
  const hasRealConversation = effectiveUserTurns >= 2 && !isVoicemail && !isIVR && !isGatekeeper;

  return {
    hasUserResponse: userMessages.length > 0 || summaryContactTurns > 0,
    userTurns: effectiveUserTurns,
    positiveSignals,
    negativeSignals,
    isVoicemail,
    isIVR,
    isGatekeeper,
    hasRealConversation,
    userText,
    fullText,
  };
}

// ==================== SMART DISPOSITION LOGIC ====================

/**
 * Determine the correct disposition based on transcript analysis and campaign context
 */
export function determineSmartDisposition(
  currentDisposition: string | null,
  transcript: any,
  context: CampaignQualificationContext,
  callDurationSeconds: number = 0
): DispositionAnalysisResult {
  const analysis = analyzeTranscriptForQualification(transcript, context);

  // Start with default result
  const result: DispositionAnalysisResult = {
    suggestedDisposition: 'no_answer',
    confidence: 0.5,
    reasoning: '',
    positiveSignals: analysis.positiveSignals,
    negativeSignals: analysis.negativeSignals,
    shouldOverride: false,
    metSuccessIndicators: [],
    missedIndicators: [],
  };

  // Log the initial state and analysis
  console.log(`${LOG_PREFIX} Analyzing call. Current Disposition: ${currentDisposition}, Duration: ${callDurationSeconds}s, User Turns: ${analysis.userTurns}`);
  console.log(`${LOG_PREFIX} Signals - Positive: [${analysis.positiveSignals.join(', ')}], Negative: [${analysis.negativeSignals.join(', ')}]`);
  console.log(`${LOG_PREFIX} Flags - Voicemail: ${analysis.isVoicemail}, IVR: ${analysis.isIVR}, Gatekeeper: ${analysis.isGatekeeper}, Real Conversation: ${analysis.hasRealConversation}`);


  // HARD GATE: Very short calls (<30s) with no user turns can NEVER be qualified
  const isMinimalCall = callDurationSeconds < 30 && analysis.userTurns < 1;

  // 1. Voicemail detection takes priority
  if (analysis.isVoicemail && !analysis.hasRealConversation) {
    result.suggestedDisposition = 'voicemail';
    result.confidence = 0.9;
    result.reasoning = 'Voicemail or answering machine detected in transcript';

    if (currentDisposition !== 'voicemail') {
      result.shouldOverride = true;
    }
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 2. STRONG positive signals with real conversation → qualified_lead
  // When multiple positive signals exist AND there's a real multi-turn conversation,
  // the call is likely qualified. Trust the evidence in the transcript.
  const strongPositiveCount = analysis.positiveSignals.length;
  const hasStrongEvidence = strongPositiveCount >= 2 && analysis.hasRealConversation && analysis.userTurns >= 3 && callDurationSeconds >= 45;

  if (hasStrongEvidence && analysis.negativeSignals.length === 0) {
    result.suggestedDisposition = 'qualified_lead';
    result.confidence = 0.80 + (strongPositiveCount * 0.03);
    result.reasoning = `Strong qualification evidence: ${analysis.positiveSignals.join(', ')} with ${analysis.userTurns} user turns in ${callDurationSeconds}s call`;
    result.metSuccessIndicators = analysis.positiveSignals;
    // Upgrade from any under-classified disposition
    result.shouldOverride = currentDisposition !== 'qualified_lead' && currentDisposition !== 'do_not_call';
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 3. Check for MIXED signals (both positive and negative)
  if (analysis.positiveSignals.length > 0 && analysis.negativeSignals.length > 0) {
    // If positive signals strongly outweigh negative, lean toward qualified
    if (analysis.positiveSignals.length >= analysis.negativeSignals.length * 2 && analysis.hasRealConversation) {
      result.suggestedDisposition = 'qualified_lead';
      result.confidence = 0.65;
      result.reasoning = `Positive signals (${analysis.positiveSignals.length}) strongly outweigh negative (${analysis.negativeSignals.length}) with real conversation`;
      result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === 'needs_review' || currentDisposition === null;
    } else {
      result.suggestedDisposition = 'callback_requested';
      result.confidence = 0.6;
      result.reasoning = `Mixed signals: Positive(${analysis.positiveSignals.length}) vs Negative(${analysis.negativeSignals.length}) - treat as callback opportunity`;
      result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === null;
    }
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 4. Positive signals with real conversation → qualified_lead (single signal)
  if (analysis.positiveSignals.length > 0 && analysis.hasUserResponse && analysis.hasRealConversation && callDurationSeconds >= 30) {
    if (isMinimalCall) {
      result.suggestedDisposition = 'callback_requested';
      result.confidence = 0.62;
      result.reasoning = `Positive keywords in short call (${callDurationSeconds}s, ${analysis.userTurns} turns) - treat as callback`;
      result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === null;
      console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
      return result;
    }

    result.suggestedDisposition = 'qualified_lead';
    result.confidence = 0.72 + (analysis.positiveSignals.length * 0.05);
    result.reasoning = `Positive signals with real conversation: ${analysis.positiveSignals.join(', ')} (${analysis.userTurns} turns, ${callDurationSeconds}s)`;
    result.metSuccessIndicators = analysis.positiveSignals;
    result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === 'not_interested' || currentDisposition === 'needs_review' || currentDisposition === null;
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 5. Positive signals but minimal conversation → callback_requested
  if (analysis.positiveSignals.length > 0 && analysis.hasUserResponse) {
    result.suggestedDisposition = 'callback_requested';
    result.confidence = 0.65;
    result.reasoning = `Positive signals detected but limited conversation: ${analysis.positiveSignals.join(', ')}`;
    result.metSuccessIndicators = analysis.positiveSignals;
    result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === null;
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 6. Check for explicit negative signals
  if (analysis.negativeSignals.length > 0) {
    result.suggestedDisposition = 'not_interested';
    result.confidence = 0.85;
    result.reasoning = `User expressed disinterest: ${analysis.negativeSignals.join(', ')}`;
    result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === 'voicemail' || currentDisposition === null;
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 7. Real conversation with engagement but no explicit signals → callback_requested
  // If someone had a real back-and-forth, they're at least a callback opportunity
  if (analysis.hasRealConversation && analysis.userTurns >= 2) {
    result.suggestedDisposition = 'callback_requested';
    result.confidence = 0.65;
    result.reasoning = `Real conversation with ${analysis.userTurns} user turns but no explicit interest/disinterest signals - treat as callback`;
    result.shouldOverride = currentDisposition === 'no_answer';
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 8. Has some user response but minimal engagement
  if (analysis.hasUserResponse && analysis.userTurns >= 1 && !analysis.isIVR) {
    if (currentDisposition === 'no_answer') {
      result.suggestedDisposition = 'callback_requested';
      result.confidence = 0.55;
      result.reasoning = 'User responded (not no_answer) - treat as callback opportunity';
      result.shouldOverride = true;
    } else {
      result.suggestedDisposition = currentDisposition as any || 'no_answer';
      result.reasoning = 'Minimal user engagement - keeping current disposition';
    }
    console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
    return result;
  }

  // 9. No user response or IVR only
  result.suggestedDisposition = 'no_answer';
  result.confidence = 0.8;
  result.reasoning = analysis.isIVR ? 'Only IVR interaction detected' : 'No meaningful user response detected';

  console.log(`${LOG_PREFIX} Final Decision: ${result.suggestedDisposition}. Reason: ${result.reasoning}`);
  return result;
}

// ==================== BATCH REANALYSIS ====================

/**
 * Reanalyze dispositions for a campaign's call sessions
 */
export async function reanalyzeDispositions(
  campaignId: string,
  options: {
    dryRun?: boolean;
    limit?: number;
    dispositionsToCheck?: (string | null)[];
  } = {}
): Promise<{
  analyzed: number;
  shouldUpdate: number;
  updated: number;
  errors: number;
  details: Array<{
    sessionId: string;
    currentDisposition: string;
    suggestedDisposition: string;
    reasoning: string;
    updated: boolean;
  }>;
}> {
  const { dryRun = true, limit = 100, dispositionsToCheck = ['no_answer', 'voicemail', null] } = options;

  console.log(`${LOG_PREFIX} Starting disposition reanalysis for campaign ${campaignId}`);
  console.log(`${LOG_PREFIX} Options: dryRun=${dryRun}, limit=${limit}, dispositions=${dispositionsToCheck.join(',')}`);

  // Load campaign context
  const context = await loadCampaignQualificationContext(campaignId);
  if (!context) {
    throw new Error(`Campaign ${campaignId} not found or has no qualification context`);
  }

  console.log(`${LOG_PREFIX} Campaign: ${context.campaignName}`);
  console.log(`${LOG_PREFIX} Success criteria: ${context.successIndicators.primarySuccess || 'default'}`);

  // Get call sessions to analyze
  const sessions = await db
    .select({
      id: callSessions.id,
      aiDisposition: callSessions.aiDisposition,
      aiTranscript: callSessions.aiTranscript,
      durationSec: callSessions.durationSec,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.campaignId, campaignId),
        isNotNull(callSessions.aiTranscript)
      )
    )
    .limit(limit);

  const results = {
    analyzed: 0,
    shouldUpdate: 0,
    updated: 0,
    errors: 0,
    details: [] as Array<{
      sessionId: string;
      currentDisposition: string;
      suggestedDisposition: string;
      reasoning: string;
      updated: boolean;
    }>,
  };

  for (const session of sessions) {
    try {
      // Check if this disposition should be analyzed
      const currentDisp = session.aiDisposition || null;
      if (!dispositionsToCheck.includes(currentDisp)) {
        continue;
      }

      results.analyzed++;

      // Analyze the transcript
      const analysis = determineSmartDisposition(
        currentDisp,
        session.aiTranscript,
        context,
        session.durationSec || 0
      );

      const detail = {
        sessionId: session.id,
        currentDisposition: currentDisp || 'NULL',
        suggestedDisposition: analysis.suggestedDisposition,
        reasoning: analysis.reasoning,
        updated: false,
      };

      if (analysis.shouldOverride) {
        results.shouldUpdate++;
        
        if (!dryRun) {
          // Actually update the disposition
          await db
            .update(callSessions)
            .set({ 
              aiDisposition: analysis.suggestedDisposition,
            })
            .where(eq(callSessions.id, session.id));
          
          detail.updated = true;
          results.updated++;
          console.log(`${LOG_PREFIX} ✅ Updated ${session.id}: ${currentDisp} → ${analysis.suggestedDisposition}`);
        } else {
          console.log(`${LOG_PREFIX} [DRY RUN] Would update ${session.id}: ${currentDisp} → ${analysis.suggestedDisposition}`);
        }
      }

      results.details.push(detail);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error analyzing session ${session.id}:`, error);
      results.errors++;
    }
  }

  console.log(`${LOG_PREFIX} Reanalysis complete:`);
  console.log(`${LOG_PREFIX}   Analyzed: ${results.analyzed}`);
  console.log(`${LOG_PREFIX}   Should update: ${results.shouldUpdate}`);
  console.log(`${LOG_PREFIX}   Updated: ${results.updated}`);
  console.log(`${LOG_PREFIX}   Errors: ${results.errors}`);

  return results;
}

// ==================== EXPORTS ====================

export {
  analyzeTranscriptForQualification,
};
