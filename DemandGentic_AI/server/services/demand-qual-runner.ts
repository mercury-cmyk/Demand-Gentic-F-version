/**
 * Demand Qual Runner Service
 *
 * Processes voice call transcripts and performs BANT qualification.
 * Integrates with the voice dialer and disposition system.
 *
 * Core Capabilities:
 * - BANT scoring (Budget, Authority, Need, Timeframe)
 * - Objection detection and classification
 * - Escalation trigger identification
 * - Qualification level determination
 * - Sales handoff note generation
 */

import { db } from "../db";
import { leads, dialerCallAttempts, contacts, accounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
// DEMAND_QUAL_KNOWLEDGE moved to unified knowledge hub - accessed via buildAgentSystemPrompt

// ==================== INTERFACES ====================

export interface BANTScore {
  budget: number;      // 0-100
  authority: number;   // 0-100
  need: number;        // 0-100
  timeframe: number;   // 0-100
  overall: number;     // Weighted average
}

export interface BANTEvidence {
  budget: string[];
  authority: string[];
  need: string[];
  timeframe: string[];
}

export interface QualificationConfig {
  bantWeights: {
    budget: number;
    authority: number;
    need: number;
    timeframe: number;
  };
  escalationThreshold: number; // 0-100, score above this triggers escalation
  autoEscalateOnTriggers: string[];
}

export interface ObjectionDetected {
  objection: string;
  category: 'not_interested' | 'bad_timing' | 'send_info' | 'already_have' | 'wrong_person' | 'price' | 'other';
  handled: boolean;
  handlingUsed?: string;
}

export interface EscalationTrigger {
  trigger: string;
  detected: boolean;
  evidence?: string;
}

export interface QualificationResult {
  bantScore: BANTScore;
  bantEvidence: BANTEvidence;
  qualificationLevel: 'hot' | 'warm' | 'nurture' | 'disqualified';
  objectionsDetected: ObjectionDetected[];
  escalationTriggers: EscalationTrigger[];
  keyFindings: {
    budgetIndicators: string[];
    decisionMakers: string[];
    painPoints: string[];
    timeline: string;
    currentSolution: string;
  };
  nextSteps: string[];
  escalationTriggered: boolean;
  handoffNotes: string;
  confidence: number;
}

export interface TranscriptAnalysisRequest {
  callAttemptId?: string;
  transcript: string;
  contactId?: string;
  accountId?: string;
  agentId?: string;
  config?: Partial;
}

// ==================== DEFAULT CONFIGURATION ====================

export function getDefaultQualificationConfig(): QualificationConfig {
  return {
    bantWeights: {
      budget: 0.25,
      authority: 0.25,
      need: 0.30,
      timeframe: 0.20,
    },
    escalationThreshold: 70,
    autoEscalateOnTriggers: [
      'decision_maker_engaged',
      'timeline_under_30_days',
      'competitor_displacement',
      'demo_request',
      'pricing_discussion',
      'trial_request',
    ],
  };
}

// ==================== MAIN QUALIFICATION FUNCTION ====================

/**
 * Process a call transcript and generate qualification result
 */
export async function processQualificationFromCall(
  request: TranscriptAnalysisRequest
): Promise {
  const { transcript, config: customConfig } = request;
  const config = { ...getDefaultQualificationConfig(), ...customConfig };

  console.log(`[Demand Qual] Processing transcript (${transcript.length} chars)`);

  // Step 1: Analyze transcript with AI for BANT signals
  const analysis = await analyzeTranscriptForBANT(transcript, config);

  // Step 2: Calculate weighted BANT score
  const overallScore =
    (analysis.bantScore.budget * config.bantWeights.budget) +
    (analysis.bantScore.authority * config.bantWeights.authority) +
    (analysis.bantScore.need * config.bantWeights.need) +
    (analysis.bantScore.timeframe * config.bantWeights.timeframe);

  const bantScore: BANTScore = {
    ...analysis.bantScore,
    overall: Math.round(overallScore),
  };

  // Step 3: Determine qualification level
  const qualificationLevel = determineQualificationLevel(bantScore.overall, analysis);

  // Step 4: Check for escalation triggers
  const escalationTriggered =
    bantScore.overall >= config.escalationThreshold ||
    checkEscalationTriggers(analysis.escalationTriggers, config.autoEscalateOnTriggers);

  // Step 5: Generate handoff notes
  const handoffNotes = generateHandoffNotes(analysis, bantScore, qualificationLevel);

  // Step 6: If qualified, create or update lead
  if (qualificationLevel === 'hot' || qualificationLevel === 'warm') {
    if (request.callAttemptId && request.contactId) {
      await createOrUpdateLead(request, analysis, bantScore, qualificationLevel);
    }
  }

  console.log(`[Demand Qual] Qualification complete: ${qualificationLevel} (score: ${bantScore.overall})`);

  return {
    bantScore,
    bantEvidence: analysis.bantEvidence,
    qualificationLevel,
    objectionsDetected: analysis.objectionsDetected,
    escalationTriggers: analysis.escalationTriggers,
    keyFindings: analysis.keyFindings,
    nextSteps: analysis.nextSteps,
    escalationTriggered,
    handoffNotes,
    confidence: analysis.confidence,
  };
}

// ==================== ANALYSIS FUNCTIONS ====================

/**
 * Analyze transcript using AI for BANT signals
 */
async function analyzeTranscriptForBANT(
  transcript: string,
  config: QualificationConfig
): Promise;
  bantEvidence: BANTEvidence;
  objectionsDetected: ObjectionDetected[];
  escalationTriggers: EscalationTrigger[];
  keyFindings: QualificationResult['keyFindings'];
  nextSteps: string[];
  confidence: number;
}> {
  const systemPrompt = await buildAgentSystemPrompt(`
You are a B2B sales qualification analyst. Analyze call transcripts and extract BANT qualification signals.

## BANT Framework (Budget, Authority, Need, Timeframe)
- Budget: Look for budget discussions, price sensitivity, funding mentions
- Authority: Identify decision-maker signals, approval processes mentioned
- Need: Detect pain points, challenges, requirements expressed
- Timeframe: Note urgency indicators, timeline mentions, project deadlines

Analyze the transcript and provide:
1. BANT scores (0-100 for each dimension)
2. Evidence for each score
3. Objections detected and how they were handled
4. Escalation triggers detected
5. Key findings and recommended next steps

Return structured JSON.
`);

  // Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!deepseekKey && !kimiKey && !openaiKey) {
    return generateBasicAnalysis(transcript);
  }

  const userContent = `Analyze this call transcript for BANT qualification:

---TRANSCRIPT START---
${transcript}
---TRANSCRIPT END---

Return JSON with this structure:
{
  "bantScore": {
    "budget": 0-100,
    "authority": 0-100,
    "need": 0-100,
    "timeframe": 0-100
  },
  "bantEvidence": {
    "budget": ["evidence strings"],
    "authority": ["evidence strings"],
    "need": ["evidence strings"],
    "timeframe": ["evidence strings"]
  },
  "objectionsDetected": [
    {
      "objection": "what they said",
      "category": "not_interested|bad_timing|send_info|already_have|wrong_person|price|other",
      "handled": true/false,
      "handlingUsed": "how it was handled"
    }
  ],
  "escalationTriggers": [
    {
      "trigger": "trigger name",
      "detected": true/false,
      "evidence": "what indicated this"
    }
  ],
  "keyFindings": {
    "budgetIndicators": ["findings"],
    "decisionMakers": ["titles/names mentioned"],
    "painPoints": ["pain points validated"],
    "timeline": "timeline mentioned or implied",
    "currentSolution": "what they currently use"
  },
  "nextSteps": ["recommended actions"],
  "confidence": 0.0-1.0
}`;

  const messages: Array = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  // Try DeepSeek first (primary provider — cost-effective, high quality)
  if (deepseekKey) {
    try {
      const OpenAI = (await import("openai")).default;
      const deepseek = new OpenAI({ apiKey: deepseekKey, baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
      const response = await deepseek.chat.completions.create({
        model: process.env.DEMAND_QUAL_MODEL || "deepseek-chat",
        temperature: 0.2,
        max_tokens: 3000,
        messages,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      return JSON.parse(content);
    } catch (err) {
      console.warn("[Demand Qual] DeepSeek failed, trying fallback:", (err as Error).message);
    }
  }

  // Try Kimi fallback (strong analysis, 128k context)
  if (kimiKey) {
    try {
      const OpenAI = (await import("openai")).default;
      const kimi = new OpenAI({ apiKey: kimiKey, baseURL: process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1" });
      const response = await kimi.chat.completions.create({
        model: process.env.KIMI_STANDARD_MODEL || "moonshot-v1-32k",
        temperature: 0.2,
        max_tokens: 3000,
        messages,
      });
      const content = response.choices[0]?.message?.content || "{}";
      let cleaned = content.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      return JSON.parse(cleaned.trim());
    } catch (err) {
      console.warn("[Demand Qual] Kimi failed, trying OpenAI:", (err as Error).message);
    }
  }

  // OpenAI last resort
  if (openaiKey) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 3000,
        messages,
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content || "{}";
      return JSON.parse(content);
    } catch (error) {
      console.error("[Demand Qual] OpenAI fallback error:", error);
    }
  }

  console.error("[Demand Qual] All AI providers failed, using basic analysis");
  return generateBasicAnalysis(transcript);
}

/**
 * Generate basic analysis without AI
 */
function generateBasicAnalysis(transcript: string): any {
  const lowerTranscript = transcript.toLowerCase();

  // Basic keyword detection
  const hasBudgetMention = /budget|spend|invest|cost|price|afford/i.test(transcript);
  const hasAuthorityMention = /decide|approve|authority|manager|director|vp|ceo|cto/i.test(transcript);
  const hasNeedMention = /need|problem|challenge|issue|pain|struggle/i.test(transcript);
  const hasTimeframeMention = /when|timeline|quarter|month|week|urgent|asap|soon/i.test(transcript);

  const hasNotInterested = /not interested|no thanks|don't need/i.test(transcript);
  const hasBadTiming = /bad time|call back|busy|later/i.test(transcript);

  return {
    bantScore: {
      budget: hasBudgetMention ? 50 : 20,
      authority: hasAuthorityMention ? 50 : 20,
      need: hasNeedMention ? 50 : 20,
      timeframe: hasTimeframeMention ? 50 : 20,
    },
    bantEvidence: {
      budget: hasBudgetMention ? ['Budget mentioned in conversation'] : [],
      authority: hasAuthorityMention ? ['Authority/decision maker mentioned'] : [],
      need: hasNeedMention ? ['Need or pain point mentioned'] : [],
      timeframe: hasTimeframeMention ? ['Timeline mentioned'] : [],
    },
    objectionsDetected: [
      ...(hasNotInterested ? [{ objection: 'Not interested', category: 'not_interested', handled: false }] : []),
      ...(hasBadTiming ? [{ objection: 'Bad timing', category: 'bad_timing', handled: false }] : []),
    ],
    escalationTriggers: [],
    keyFindings: {
      budgetIndicators: [],
      decisionMakers: [],
      painPoints: [],
      timeline: 'Unknown',
      currentSolution: 'Unknown',
    },
    nextSteps: ['Follow up required', 'Needs further qualification'],
    confidence: 0.3,
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Determine qualification level based on score and analysis
 */
function determineQualificationLevel(
  overallScore: number,
  analysis: any
): 'hot' | 'warm' | 'nurture' | 'disqualified' {
  // Check for explicit disqualification signals
  const hasDisqualifyingObjection = analysis.objectionsDetected?.some(
    (obj: ObjectionDetected) =>
      (obj.category === 'not_interested' || obj.category === 'wrong_person') && !obj.handled
  );

  if (hasDisqualifyingObjection) {
    return 'disqualified';
  }

  // Check for hot signals
  const hasHotTrigger = analysis.escalationTriggers?.some(
    (trigger: EscalationTrigger) =>
      trigger.detected &&
      ['demo_request', 'pricing_discussion', 'trial_request'].includes(trigger.trigger)
  );

  if (overallScore >= 80 || hasHotTrigger) {
    return 'hot';
  }

  if (overallScore >= 60) {
    return 'warm';
  }

  if (overallScore >= 30) {
    return 'nurture';
  }

  return 'disqualified';
}

/**
 * Check if any auto-escalation triggers are present
 */
function checkEscalationTriggers(
  detectedTriggers: EscalationTrigger[],
  autoEscalateTriggers: string[]
): boolean {
  return detectedTriggers.some(
    trigger => trigger.detected && autoEscalateTriggers.includes(trigger.trigger)
  );
}

/**
 * Generate handoff notes for sales team
 */
function generateHandoffNotes(
  analysis: any,
  bantScore: BANTScore,
  qualificationLevel: string
): string {
  const sections: string[] = [];

  sections.push(`## Qualification Summary`);
  sections.push(`**Level:** ${qualificationLevel.toUpperCase()}`);
  sections.push(`**BANT Score:** ${bantScore.overall}/100`);
  sections.push(`- Budget: ${bantScore.budget}/100`);
  sections.push(`- Authority: ${bantScore.authority}/100`);
  sections.push(`- Need: ${bantScore.need}/100`);
  sections.push(`- Timeframe: ${bantScore.timeframe}/100`);
  sections.push('');

  if (analysis.keyFindings?.painPoints?.length > 0) {
    sections.push(`## Pain Points Validated`);
    analysis.keyFindings.painPoints.forEach((pain: string) => {
      sections.push(`- ${pain}`);
    });
    sections.push('');
  }

  if (analysis.keyFindings?.decisionMakers?.length > 0) {
    sections.push(`## Decision Makers Identified`);
    analysis.keyFindings.decisionMakers.forEach((dm: string) => {
      sections.push(`- ${dm}`);
    });
    sections.push('');
  }

  if (analysis.keyFindings?.timeline) {
    sections.push(`## Timeline`);
    sections.push(analysis.keyFindings.timeline);
    sections.push('');
  }

  if (analysis.keyFindings?.currentSolution && analysis.keyFindings.currentSolution !== 'Unknown') {
    sections.push(`## Current Solution`);
    sections.push(analysis.keyFindings.currentSolution);
    sections.push('');
  }

  if (analysis.objectionsDetected?.length > 0) {
    sections.push(`## Objections Raised`);
    analysis.objectionsDetected.forEach((obj: ObjectionDetected) => {
      sections.push(`- ${obj.objection} (${obj.handled ? 'Handled' : 'Unhandled'})`);
    });
    sections.push('');
  }

  if (analysis.nextSteps?.length > 0) {
    sections.push(`## Recommended Next Steps`);
    analysis.nextSteps.forEach((step: string) => {
      sections.push(`- ${step}`);
    });
  }

  return sections.join('\n');
}

/**
 * Create or update lead based on qualification
 */
async function createOrUpdateLead(
  request: TranscriptAnalysisRequest,
  analysis: any,
  bantScore: BANTScore,
  qualificationLevel: string
): Promise {
  try {
    // This would integrate with your lead creation system
    console.log(`[Demand Qual] Lead qualification: ${qualificationLevel}, score: ${bantScore.overall}`);

    // You could create a lead record here or update existing disposition
    // await db.insert(leads).values({...})
  } catch (error) {
    console.error("[Demand Qual] Error creating/updating lead:", error);
  }
}

// ==================== UTILITY EXPORTS ====================

/**
 * Quick BANT score for a transcript (without full analysis)
 */
export async function quickBANTScore(transcript: string): Promise {
  const result = await processQualificationFromCall({
    transcript,
  });

  return result.bantScore;
}

/**
 * Check if transcript contains escalation triggers
 */
export async function hasEscalationTriggers(transcript: string): Promise {
  const result = await processQualificationFromCall({
    transcript,
  });

  return result.escalationTriggered;
}

/**
 * Get objections from transcript
 */
export async function extractObjections(transcript: string): Promise {
  const result = await processQualificationFromCall({
    transcript,
  });

  return result.objectionsDetected;
}