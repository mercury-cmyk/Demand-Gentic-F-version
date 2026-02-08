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
  let parsedTranscript: any[] = [];
  
  if (typeof transcript === 'string') {
    try {
      parsedTranscript = JSON.parse(transcript);
    } catch (e) {
      // Plain text transcript
      const fullText = transcript.toLowerCase();
      return {
        hasUserResponse: fullText.includes('user:') || fullText.includes('contact:'),
        userTurns: 0,
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
  const userText = userMessages.map(m => (m.message || m.text || '')).join(' ').toLowerCase();
  const fullText = parsedTranscript.map(t => (t.message || t.text || '')).join(' ').toLowerCase();

  // Detect voicemail/IVR
  const voicemailPatterns = [
    'leave a message',
    'voicemail',
    'not available',
    'after the beep',
    'after the tone',
    'record your message',
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
    if (userText.includes(keyword.toLowerCase())) {
      positiveSignals.push(keyword);
    }
  }

  // Find negative signals
  const negativeSignals: string[] = [];
  for (const keyword of context.negativeKeywords) {
    if (userText.includes(keyword.toLowerCase())) {
      negativeSignals.push(keyword);
    }
  }

  // Count meaningful user turns (more than just "..." or short filler)
  const meaningfulUserTurns = userMessages.filter(m => {
    const text = (m.message || m.text || '').trim();
    return text.length > 5 && text !== '...' && text !== 'hmm' && text !== 'uh';
  });

  // Determine if there's a real conversation
  const hasRealConversation = meaningfulUserTurns.length >= 2 && !isVoicemail && !isIVR && !isGatekeeper;

  return {
    hasUserResponse: userMessages.length > 0,
    userTurns: meaningfulUserTurns.length,
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

  // HARD GATE: Very short calls (<60s) with minimal user turns (<3) can NEVER be qualified
  // This prevents IVR greetings, gatekeepers saying "please hold", etc. from being misclassified
  const isMinimalCall = callDurationSeconds < 60 && analysis.userTurns < 3;

  // 1. Voicemail detection takes priority
  if (analysis.isVoicemail) {
    result.suggestedDisposition = 'voicemail';
    result.confidence = 0.9;
    result.reasoning = 'Voicemail or answering machine detected in transcript';
    
    // Only override if current is wrong
    if (currentDisposition !== 'voicemail') {
      result.shouldOverride = true;
    }
    return result;
  }

  // CRITICAL RULE: If the AI already set a disposition via submit_disposition,
  // the smart analyzer should NOT upgrade it to qualified_lead.
  // The AI's in-call safeguards (booking flow check, agent turns, etc.) are more reliable
  // than keyword matching. Only DOWNGRADE is allowed (e.g., voicemail override above).
  // We CAN suggest needs_review for human verification.

  // 2. Check for MIXED signals (both positive and negative)
  if (analysis.positiveSignals.length > 0 && analysis.negativeSignals.length > 0) {
    result.suggestedDisposition = 'needs_review';
    result.confidence = 0.6;
    result.reasoning = `Mixed signals detected: Positive(${analysis.positiveSignals.length}) vs Negative(${analysis.negativeSignals.length}) - needs human review`;
    result.shouldOverride = currentDisposition !== 'needs_review' && currentDisposition !== 'qualified_lead';
    return result;
  }

  // 3. Positive signals detected
  // CHANGED: Never auto-upgrade to qualified_lead. Route to needs_review instead.
  // Only the AI agent's submit_disposition tool (with its booking flow validation)
  // should produce a qualified_lead disposition.
  if (analysis.positiveSignals.length > 0 && analysis.hasUserResponse) {
    // If the call is too short/minimal, it's definitely not qualified (likely IVR/gatekeeper)
    if (isMinimalCall) {
      result.suggestedDisposition = 'no_answer';
      result.confidence = 0.7;
      result.reasoning = `Positive keywords detected but call too short (${callDurationSeconds}s, ${analysis.userTurns} turns) - likely IVR/gatekeeper, not real engagement`;
      result.shouldOverride = false; // Don't override existing disposition
      return result;
    }

    result.suggestedDisposition = 'needs_review';
    result.confidence = 0.75 + (analysis.positiveSignals.length * 0.05);
    result.reasoning = `Positive signals detected: ${analysis.positiveSignals.join(', ')} - routed to QA for human verification`;
    result.metSuccessIndicators = analysis.positiveSignals;
    // Only suggest override if current disposition is no_answer/voicemail (under-classification)
    // Never override an AI-set qualified_lead or not_interested
    result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === 'voicemail' || currentDisposition === null;
    return result;
  }

  // 4. Check for explicit negative signals
  if (analysis.negativeSignals.length > 0) {
    result.suggestedDisposition = 'not_interested';
    result.confidence = 0.85;
    result.reasoning = `User expressed disinterest: ${analysis.negativeSignals.join(', ')}`;
    result.shouldOverride = currentDisposition === 'no_answer' || currentDisposition === 'voicemail' || currentDisposition === null;
    return result;
  }

  // 4. Real conversation with engagement but no explicit signals - needs review
  if (analysis.hasRealConversation && analysis.userTurns >= 2) {
    result.suggestedDisposition = 'needs_review';
    result.confidence = 0.7;
    result.reasoning = `Real conversation with ${analysis.userTurns} user turns - needs human review`;
    result.shouldOverride = currentDisposition === 'no_answer';
    return result;
  }

  // 5. Has some user response but minimal engagement
  if (analysis.hasUserResponse && analysis.userTurns >= 1 && !analysis.isIVR) {
    // If current disposition is no_answer but there was a response, it's wrong
    if (currentDisposition === 'no_answer') {
      result.suggestedDisposition = 'needs_review';
      result.confidence = 0.6;
      result.reasoning = 'User responded but engagement was minimal - needs review';
      result.shouldOverride = true;
    } else {
      result.suggestedDisposition = currentDisposition as any || 'no_answer';
      result.reasoning = 'Minimal user engagement';
    }
    return result;
  }

  // 6. No user response or IVR only
  result.suggestedDisposition = 'no_answer';
  result.confidence = 0.8;
  result.reasoning = analysis.isIVR ? 'Only IVR interaction detected' : 'No meaningful user response detected';
  
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
