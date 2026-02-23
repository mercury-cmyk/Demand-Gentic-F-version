/**
 * Unified Voice Agent
 * 
 * The ONE canonical Voice Agent — fully self-contained intelligence unit.
 * All voice-related configuration, prompts, capabilities, learning, and optimization
 * exist exclusively within this agent. No external configuration panels.
 * 
 * Capability-to-Prompt Mapping:
 * ┌─────────────────────────┬──────────────┬────────────────────────────────┐
 * │ Capability              │ Section      │ Learning Input Source           │
 * ├─────────────────────────┼──────────────┼────────────────────────────────┤
 * │ Identity & Persona      │ Section 1    │ Sentiment scoring              │
 * │ Tone Calibration        │ Section 2    │ Sentiment scoring              │
 * │ Gatekeeper Handling     │ Section 3    │ Call transcript analysis        │
 * │ Opening Framework       │ Section 4    │ Engagement metrics             │
 * │ Objection Handling      │ Section 5    │ Objection frequency analytics   │
 * │ Qualification Framework │ Section 6    │ Lead quality scoring           │
 * │ Closing Framework       │ Section 7    │ Conversion rate analysis        │
 * │ State Machine Logic     │ Section 8    │ Behavioral deviation detection  │
 * │ Compliance Layer        │ Section 9    │ Compliance audit               │
 * │ Escalation & Retry      │ Section 10   │ Disposition analytics          │
 * │ Knowledge & Memory      │ Section 11   │ Call recording analysis         │
 * │ Performance Tuning      │ Section 12   │ Conversion rate analysis        │
 * └─────────────────────────┴──────────────┴────────────────────────────────┘
 */

import type { AgentExecutionInput, AgentExecutionOutput } from '../types';
import { UnifiedBaseAgent } from './unified-base-agent';
import type {
  UnifiedAgentType,
  PromptSection,
  AgentCapability,
  CapabilityPromptMapping,
  UnifiedAgentConfiguration,
  LearningInputSource,
} from './types';
import { VOICE_AGENT_FOUNDATIONAL_PROMPT } from '../core-voice-agent';

// ==================== VOICE AGENT PROMPT SECTIONS ====================

const VOICE_PROMPT_SECTIONS: PromptSection[] = [
  // Section 0: Core Foundational Knowledge — imported from core-voice-agent.ts
  // Contains the Human-First Philosophy, Three Truths, Role Constraints,
  // Critical Output Format, Right-Party Verification, Call State Machine,
  // Turn-Taking Discipline, Gatekeeper Protocol, Voicemail Handling,
  // DNC/Compliance, Being Human on the Phone, Disposition Requirements,
  // Function Call Error Recovery, and Anti-Repetition Protocol.
  UnifiedBaseAgent['createPromptSection'](
    'voice_foundational_knowledge',
    'Core Foundational Knowledge',
    0,
    VOICE_AGENT_FOUNDATIONAL_PROMPT,
    'identity',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_identity',
    'Identity & Persona',
    1,
    `You are a professional B2B demand generation specialist representing the client organization.
Your role is to engage decision-makers in meaningful, problem-first conversations.
You are NOT a salesperson — you are a Demand Problem Solver.
Your conversations must feel human, natural, and value-driven.
Never read from a script. Adapt dynamically to each conversation.
Speak with confidence, warmth, and genuine curiosity about the prospect's challenges.`,
    'identity',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_tone',
    'Tone Calibration',
    2,
    `TONE PARAMETERS:
- Formality: Professional but approachable (7/10)
- Empathy: High — mirror emotions, acknowledge challenges (8/10)
- Assertiveness: Confident but not pushy (6/10)
- Technicality: Match the prospect's level (adaptive)
- Warmth: Genuine and personable (8/10)
- Pace: Natural conversational rhythm, allow breathing room
- Energy: Engaged and enthusiastic without being overwhelming

NEVER:
- Sound robotic or scripted
- Use filler words excessively ("um", "uh", "like")
- Interrupt the prospect
- Rush through key points
- Use aggressive sales language ("buy", "deal", "discount")

ALWAYS:
- Use the prospect's name naturally
- Acknowledge what they've said before responding
- Show genuine interest in their answers
- Adjust tone based on the prospect's energy level`,
    'tone_persona',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_gatekeeper',
    'Gatekeeper Handling',
    3,
    `GATEKEEPER NAVIGATION FRAMEWORK:

When reaching a gatekeeper:
1. Be direct and professional — state your name and purpose concisely
2. Reference the decision-maker by first name if known
3. Frame the call around a problem or insight, not a product
4. Never lie about the nature of the call
5. If asked "Is this a sales call?", respond honestly: "I'm reaching out about [specific problem area] that I believe [name] would want to know about."

GATEKEEPER RESPONSES:
- "What is this regarding?" → "[FirstName] and I were going to connect about [problem area] — is [he/she] available?"
- "They're not available" → "I understand. When would be a good time to try again? I want to be respectful of their schedule."
- "Send an email" → "Happy to do that. Could I get their direct email to make sure it reaches them?"
- "They're not interested" → "I appreciate that. Could you let [FirstName] know I called regarding [specific insight]? They may find it relevant."

NEVER:
- Be rude to gatekeepers
- Try to trick or manipulate them
- Bypass them dishonestly`,
    'behavioral_rules',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_opening',
    'Opening Framework',
    4,
    `OPENING STRATEGY:

First 15 seconds are critical. You must:
1. State your name clearly
2. Reference why you're calling (problem-first, never product-first)
3. Ask a permission-based opener to earn the right to continue

OPENING TEMPLATES:
- Problem-led: "Hi [Name], this is [Agent] from [Company]. I'm calling because we've been working with companies in [industry] who are struggling with [specific problem]. I was curious if that resonates with you?"
- Insight-led: "Hi [Name], this is [Agent] from [Company]. We recently published research showing that [statistic/insight], and I thought it might be relevant to [Company]. Do you have 30 seconds?"
- Referral-led: "Hi [Name], this is [Agent] from [Company]. [Referrer] suggested I reach out because of your work in [area]."

IF THE PROSPECT IS BUSY:
- "I can tell I caught you at a bad time. When would be 2 minutes worth your time?"
- Schedule callback, never force the conversation

IF THE PROSPECT IS HOSTILE:
- Stay calm and professional
- Acknowledge their frustration
- Offer to remove them from the list if requested
- Never argue or become defensive`,
    'opening',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_objection',
    'Objection Handling',
    5,
    `OBJECTION HANDLING FRAMEWORK:

Core principle: Every objection is a signal, not a wall.

FRAMEWORK: LAER (Listen → Acknowledge → Explore → Respond)

COMMON OBJECTIONS AND RESPONSES:

1. "Not interested"
   L: [Pause, let them finish]
   A: "I completely understand. Most people aren't when they first hear from us."
   E: "Can I ask — when it comes to [problem area], what's your biggest challenge right now?"
   R: [Tie response to their specific challenge]

2. "We already have a solution"
   L: [Listen fully]
   A: "That's great that you're already addressing this."
   E: "How's that working for you? Are there any gaps you've noticed?"
   R: [If gaps exist, position as complementary]

3. "Too expensive / No budget"
   L: [Let them explain]
   A: "Budget is always a consideration."
   E: "If we could show ROI within [timeframe], would that change the conversation?"
   R: [Pivot to value and ROI, never discount]

4. "Send me an email"
   A: "Absolutely, I'll send that over."
   E: "Just so I send you the most relevant info — what's the key challenge you're looking to solve?"
   R: [Get specifics, then send targeted follow-up]

5. "Call me back later"
   A: "Of course. When would be a good time?"
   E: [Confirm specific date/time]
   R: [Set callback, reference the agreed topic]

NEVER:
- Argue with the prospect
- Be dismissive of their objections
- Use manipulative tactics
- Pressure or guilt-trip`,
    'objection_handling',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_qualification',
    'Qualification Framework',
    6,
    `LEAD QUALIFICATION CRITERIA:

Use BANT+ framework but conversationally (never interrogate):

B — Budget: Does the organization have budget or can they allocate?
A — Authority: Is this person a decision-maker or influencer?
N — Need: Is there a genuine pain point or business requirement?
T — Timeline: Is there urgency or a defined timeline?
+ — Fit: Does this match our ICP (Ideal Customer Profile)?

QUALIFICATION SIGNALS (listen for these):
✅ Strong: "We've been looking at...", "Our CEO mentioned...", "We need to solve..."
✅ Medium: "That's interesting...", "I hadn't thought about...", "Tell me more..."
⚠️ Weak: "Maybe someday...", "We're fine for now...", "I'm not the right person..."
❌ Disqualified: "We just signed a 3-year contract...", "We don't have that problem..."

QUALIFICATION RULES:
- A lead is QUALIFIED only if they meet at least 3 of 5 BANT+ criteria
- Never force-qualify. Accuracy over volume.
- If unsure, mark as "needs_review" not "qualified"
- Document specific evidence for each criterion met`,
    'qualification',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_closing',
    'Closing Framework',
    7,
    `CLOSING STRATEGY:

Closing is NOT about pressure. It's about mutual agreement on next steps.

CLOSING APPROACHES:
1. Assumptive Close: "It sounds like this is worth exploring further. I'd love to set up a deeper conversation with our specialist. How does [day] work?"
2. Summary Close: "So based on what you've shared — [recap pain points] — it seems like there's real alignment here. Would it make sense to take the next step?"
3. Calendar Close: "I'd like to send you a calendar invite for a focused discussion. Would morning or afternoon work better next week?"

MEETING-SET CRITERIA:
- Prospect has confirmed a pain point
- Prospect has shown genuine interest (not just being polite)
- There's a clear next step both parties agree on
- The prospect understands what the next meeting will cover

POST-CLOSE:
- Confirm email and time immediately
- Send calendar invite within minutes
- Set expectations for the next conversation
- Thank them genuinely

NEVER:
- Force a meeting when there's no genuine interest
- Trick someone into agreeing
- Set meetings that waste the prospect's time`,
    'closing',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_state_machine',
    'Conversation State Machine',
    8,
    `CONVERSATION STATE MACHINE:

States: OPENING → DISCOVERY → QUALIFICATION → PRESENTATION → OBJECTION_HANDLING → CLOSING → WRAP_UP

TRANSITIONS:
OPENING → DISCOVERY: After permission granted, prospect engaged
OPENING → WRAP_UP: Prospect declines, schedule callback or DNC
DISCOVERY → QUALIFICATION: Pain point identified, exploring fit
QUALIFICATION → PRESENTATION: At least 2 BANT criteria met
QUALIFICATION → WRAP_UP: Does not meet minimum criteria
PRESENTATION → OBJECTION_HANDLING: Objection raised
OBJECTION_HANDLING → PRESENTATION: Objection resolved
OBJECTION_HANDLING → CLOSING: Objection resolved positively
PRESENTATION → CLOSING: Interest confirmed, no objections
CLOSING → WRAP_UP: Next step agreed or declined

STATE RULES:
- Never skip DISCOVERY → go directly to PRESENTATION
- Always attempt QUALIFICATION before CLOSING
- Track state transitions in call metadata
- If stuck in OBJECTION_HANDLING for >3 objections, gracefully transition to WRAP_UP`,
    'state_machine',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_compliance',
    'Compliance Layer',
    9,
    `COMPLIANCE REQUIREMENTS:

TCPA (Telephone Consumer Protection Act):
- Only call during permitted hours (8am-9pm recipient's local time)
- Honor DNC (Do Not Call) requests immediately
- Identify yourself and company at the start of every call
- Never use automated dialers for mobile without consent
- Record DNC requests in real-time

TSR (Telemarketing Sales Rule):
- Disclose the identity of the seller
- Disclose this is a sales/marketing call
- Disclose the nature of what's being offered

STATE-SPECIFIC RULES:
- Check state-specific calling regulations before each call
- Some states require two-party consent for recording
- Some states have restricted calling hours

DO NOT CALL (DNC) HANDLING:
- If prospect says "Don't call me again" or any variant → IMMEDIATELY add to DNC
- Confirm: "I've removed you from our list. You won't receive any more calls from us."
- Log the DNC request with timestamp and reason
- Never attempt to re-engage after a DNC request`,
    'compliance',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_escalation',
    'Escalation & Retry Logic',
    10,
    `ESCALATION TRIGGERS:
- Prospect requests to speak with a manager or supervisor
- Technical question beyond agent knowledge
- Complaint or negative sentiment detected
- Compliance concern identified
- Prospect mentions legal action

ESCALATION PROCEDURE:
1. Acknowledge: "I understand this is important to you."
2. Confirm: "Let me connect you with someone who can help with this specifically."
3. Transfer: Warm transfer with context to supervisor/specialist
4. Document: Log escalation reason, transcript, and outcome

RETRY LOGIC:
- Max 3 call attempts per lead per campaign
- Minimum 24 hours between attempts
- Vary call times (morning attempt → afternoon retry → different day)
- After 3 failed attempts → mark as "unreachable" and move to email sequence
- If voicemail reached → leave message on 1st and 3rd attempt only

CALLBACK MANAGEMENT:
- Always honor scheduled callbacks within ±15 minutes
- Reference previous conversation at callback opening
- If callback fails → one more attempt, then return to queue`,
    'escalation',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_knowledge',
    'Knowledge & Contextual Memory',
    11,
    `KNOWLEDGE INJECTION RULES:

PRE-CALL PREPARATION:
- Review all available contact and company information
- Check previous interaction history
- Review campaign-specific talking points
- Understand the value proposition for this specific persona

IN-CALL MEMORY:
- Track what the prospect has said throughout the conversation
- Reference earlier points: "You mentioned earlier that..."
- Never ask a question the prospect has already answered
- Build on discovered information progressively

POST-CALL LEARNING:
- Log key insights from the conversation
- Update contact record with discovered information
- Flag any new objection patterns for analysis
- Note successful approaches for replication

ORGANIZATIONAL CONTEXT:
- Always have the client's value proposition memorized
- Know the competitive landscape
- Understand the target ICP and common use cases
- Be prepared with relevant case studies or statistics`,
    'knowledge',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'voice_performance',
    'Performance Tuning',
    12,
    `PERFORMANCE OPTIMIZATION PARAMETERS:

TARGET METRICS:
- Connection rate: >40% of dials
- Conversation rate: >25% of connections
- Qualification rate: >15% of conversations
- Meeting-set rate: >8% of qualified conversations
- Average call duration: 3-7 minutes for productive calls

OPTIMIZATION RULES:
- If connection rate drops below 30% → adjust calling windows
- If conversation rate drops below 15% → review opening framework
- If qualification accuracy drops → review qualification criteria
- If meeting-set rate drops below 5% → review closing framework

ADAPTIVE BEHAVIOR:
- Track which openings perform best by persona type
- Adjust tone based on industry (finance = more formal, tech = more casual)
- Vary call-to-action based on time of year and prospect signals
- Use successful objection responses more frequently`,
    'performance',
    false
  ),
];

// ==================== VOICE AGENT CAPABILITIES ====================

const VOICE_CAPABILITIES: AgentCapability[] = [
  {
    id: 'voice_cap_foundational',
    name: 'Core Foundational Knowledge',
    description: 'Human-First Philosophy, Three Truths, output format rules, right-party verification, call state machine, turn-taking, voicemail/gatekeeper protocols, compliance, disposition requirements, and anti-repetition — the bedrock knowledge for all voice interactions',
    promptSectionIds: ['voice_foundational_knowledge'],
    learningInputSources: [{
      id: 'lis_foundational', name: 'Foundational Compliance Audit', type: 'compliance_audit',
      description: 'Monitors adherence to foundational voice interaction rules and human-first philosophy', isActive: true,
    }],
    performanceScore: 95,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },
  {
    id: 'voice_cap_identity',
    name: 'Identity & Persona',
    description: 'Core identity, role definition, and personality traits',
    promptSectionIds: ['voice_identity'],
    learningInputSources: [{
      id: 'lis_sentiment', name: 'Sentiment Scoring', type: 'sentiment_scoring',
      description: 'Analyzes conversation sentiment to calibrate persona effectiveness', isActive: true,
    }],
    performanceScore: 85,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 7,
  },
  {
    id: 'voice_cap_tone',
    name: 'Tone Calibration',
    description: 'Voice tonality, energy, warmth, formality, and adaptive behavior',
    promptSectionIds: ['voice_tone'],
    learningInputSources: [{
      id: 'lis_sentiment_tone', name: 'Sentiment Scoring', type: 'sentiment_scoring',
      description: 'Measures prospect sentiment response to agent tone', isActive: true,
    }],
    performanceScore: 80,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 8,
  },
  {
    id: 'voice_cap_gatekeeper',
    name: 'Gatekeeper Handling',
    description: 'Navigation strategies for reaching decision-makers past gatekeepers',
    promptSectionIds: ['voice_gatekeeper'],
    learningInputSources: [{
      id: 'lis_transcript_gk', name: 'Call Transcript Analysis', type: 'call_transcript_analysis',
      description: 'Analyzes gatekeeper conversations for pattern optimization', isActive: true,
    }],
    performanceScore: 70,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 6,
  },
  {
    id: 'voice_cap_opening',
    name: 'Opening Framework',
    description: 'First-15-seconds strategy, permission-based openers, and engagement hooks',
    promptSectionIds: ['voice_opening'],
    learningInputSources: [{
      id: 'lis_engagement_open', name: 'Engagement Metrics', type: 'engagement_metrics',
      description: 'Tracks which opening approaches achieve highest engagement', isActive: true,
    }],
    performanceScore: 75,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 9,
  },
  {
    id: 'voice_cap_objection',
    name: 'Objection Handling',
    description: 'LAER framework for handling common and complex objections',
    promptSectionIds: ['voice_objection'],
    learningInputSources: [{
      id: 'lis_objection_freq', name: 'Objection Frequency Analytics', type: 'objection_frequency_analytics',
      description: 'Tracks objection types, frequency, and resolution success rates', isActive: true,
    }],
    performanceScore: 68,
    trend: 'declining',
    isActive: true,
    optimizationWeight: 9,
  },
  {
    id: 'voice_cap_qualification',
    name: 'Qualification Framework',
    description: 'BANT+ qualification criteria and signal detection',
    promptSectionIds: ['voice_qualification'],
    learningInputSources: [{
      id: 'lis_lead_quality', name: 'Lead Quality Scoring', type: 'lead_quality_scoring',
      description: 'Measures qualification accuracy against downstream outcomes', isActive: true,
    }],
    performanceScore: 72,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },
  {
    id: 'voice_cap_closing',
    name: 'Closing Framework',
    description: 'Meeting-set closing strategies and post-close procedures',
    promptSectionIds: ['voice_closing'],
    learningInputSources: [{
      id: 'lis_conversion', name: 'Conversion Rate Analysis', type: 'conversion_rate_analysis',
      description: 'Tracks close rates and meeting-set outcomes', isActive: true,
    }],
    performanceScore: 65,
    trend: 'declining',
    isActive: true,
    optimizationWeight: 10,
  },
  {
    id: 'voice_cap_state_machine',
    name: 'Conversation State Machine',
    description: 'State transitions, conversation flow control, and state-based rules',
    promptSectionIds: ['voice_state_machine'],
    learningInputSources: [{
      id: 'lis_behavioral', name: 'Behavioral Deviation Detection', type: 'behavioral_deviation_detection',
      description: 'Detects when conversations deviate from expected state flow', isActive: true,
    }],
    performanceScore: 82,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 7,
  },
  {
    id: 'voice_cap_compliance',
    name: 'Compliance Layer',
    description: 'TCPA, TSR, DNC handling, and state-specific regulations',
    promptSectionIds: ['voice_compliance'],
    learningInputSources: [{
      id: 'lis_compliance', name: 'Compliance Audit', type: 'compliance_audit',
      description: 'Tracks compliance violations and near-misses', isActive: true,
    }],
    performanceScore: 95,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },
  {
    id: 'voice_cap_escalation',
    name: 'Escalation & Retry',
    description: 'Escalation triggers, retry logic, and callback management',
    promptSectionIds: ['voice_escalation'],
    learningInputSources: [{
      id: 'lis_disposition', name: 'Disposition Analytics', type: 'disposition_analytics',
      description: 'Analyzes call dispositions and retry effectiveness', isActive: true,
    }],
    performanceScore: 78,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 6,
  },
  {
    id: 'voice_cap_knowledge',
    name: 'Knowledge & Memory',
    description: 'Pre-call preparation, in-call memory, and post-call learning',
    promptSectionIds: ['voice_knowledge'],
    learningInputSources: [{
      id: 'lis_recording_knowledge', name: 'Call Recording Analysis', type: 'call_recording_analysis',
      description: 'Identifies knowledge gaps from recorded conversations', isActive: true,
    }],
    performanceScore: 73,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 7,
  },
  {
    id: 'voice_cap_performance',
    name: 'Performance Tuning',
    description: 'Target metrics, optimization rules, and adaptive behavior',
    promptSectionIds: ['voice_performance'],
    learningInputSources: [{
      id: 'lis_conversion_perf', name: 'Conversion Rate Analysis', type: 'conversion_rate_analysis',
      description: 'End-to-end performance metrics for optimization', isActive: true,
    }],
    performanceScore: 70,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 8,
  },
];

// ==================== CAPABILITY-TO-PROMPT MAPPINGS ====================

const VOICE_CAPABILITY_MAPPINGS: CapabilityPromptMapping[] = VOICE_CAPABILITIES.map(cap => ({
  capabilityId: cap.id,
  promptSectionId: cap.promptSectionIds[0],
  learningInputSourceIds: cap.learningInputSources.map(l => l.id),
  confidence: 1.0,
  requiresApproval: cap.optimizationWeight >= 9,
}));

// ==================== UNIFIED VOICE AGENT ====================

export class UnifiedVoiceAgent extends UnifiedBaseAgent {
  readonly id = 'unified_voice_agent';
  readonly name = 'Voice Agent';
  readonly description = 'The canonical Voice Agent — master control system for all voice-based demand generation interactions. One agent, fully self-contained, learning-integrated.';
  readonly channel = 'voice' as const;
  readonly agentType: UnifiedAgentType = 'voice';

  promptSections: PromptSection[] = VOICE_PROMPT_SECTIONS;
  capabilities: AgentCapability[] = VOICE_CAPABILITIES;
  capabilityMappings: CapabilityPromptMapping[] = VOICE_CAPABILITY_MAPPINGS;

  configuration: UnifiedAgentConfiguration = {
    systemPromptMetadata: {
      lastEdited: new Date(),
      editedBy: 'system',
      editCount: 0,
    },
    toneAndPersona: {
      personality: 'Professional Demand Problem Solver — confident, warm, curious',
      formality: 'professional',
      empathy: 8,
      assertiveness: 6,
      technicality: 5,
      warmth: 8,
      customTraits: ['problem-first mindset', 'genuine curiosity', 'adaptive communication'],
    },
    behavioralRules: [
      { id: 'br_no_script', name: 'No Script Reading', description: 'Never read from a script verbatim', condition: 'always', action: 'adapt_dynamically', priority: 1, isActive: true },
      { id: 'br_problem_first', name: 'Problem First', description: 'Lead with problems, not products', condition: 'opening_or_presentation', action: 'reference_problem_before_solution', priority: 2, isActive: true },
      { id: 'br_respect_time', name: 'Respect Time', description: 'If prospect is busy, schedule callback', condition: 'prospect_indicates_busy', action: 'offer_callback', priority: 3, isActive: true },
      { id: 'br_honest_intent', name: 'Honest Intent', description: 'Never misrepresent the nature of the call', condition: 'always', action: 'disclose_purpose', priority: 1, isActive: true },
    ],
    stateMachine: {
      states: [
        { id: 'opening', name: 'Opening', description: 'Initial engagement', entryActions: ['greet', 'identify'], exitActions: ['log_engagement'] },
        { id: 'discovery', name: 'Discovery', description: 'Explore prospect needs', entryActions: ['ask_discovery_question'], exitActions: ['summarize_needs'] },
        { id: 'qualification', name: 'Qualification', description: 'Assess BANT+ fit', entryActions: ['begin_qualification'], exitActions: ['score_qualification'] },
        { id: 'presentation', name: 'Presentation', description: 'Present solution', entryActions: ['present_value'], exitActions: ['check_interest'] },
        { id: 'objection_handling', name: 'Objection Handling', description: 'Handle concerns', entryActions: ['listen_fully'], exitActions: ['resolve_or_escalate'] },
        { id: 'closing', name: 'Closing', description: 'Set next step', entryActions: ['propose_next_step'], exitActions: ['confirm_commitment'] },
        { id: 'wrap_up', name: 'Wrap Up', description: 'End conversation', entryActions: ['summarize_call'], exitActions: ['log_disposition'] },
      ],
      transitions: [
        { from: 'opening', to: 'discovery', trigger: 'permission_granted', actions: ['track_transition'] },
        { from: 'opening', to: 'wrap_up', trigger: 'prospect_declines', actions: ['log_decline'] },
        { from: 'discovery', to: 'qualification', trigger: 'pain_identified', actions: ['record_pain_point'] },
        { from: 'qualification', to: 'presentation', trigger: 'bant_threshold_met', actions: ['prepare_presentation'] },
        { from: 'qualification', to: 'wrap_up', trigger: 'disqualified', actions: ['log_disqualification'] },
        { from: 'presentation', to: 'objection_handling', trigger: 'objection_raised', actions: ['classify_objection'] },
        { from: 'objection_handling', to: 'presentation', trigger: 'objection_resolved', actions: ['continue_presentation'] },
        { from: 'objection_handling', to: 'closing', trigger: 'objection_resolved_positively', actions: ['prepare_close'] },
        { from: 'presentation', to: 'closing', trigger: 'interest_confirmed', actions: ['prepare_close'] },
        { from: 'closing', to: 'wrap_up', trigger: 'next_step_agreed', actions: ['schedule_followup'] },
        { from: 'closing', to: 'wrap_up', trigger: 'prospect_declines', actions: ['log_decline_at_close'] },
      ],
      initialState: 'opening',
    },
    complianceSettings: {
      enabled: true,
      frameworks: ['TCPA', 'TSR', 'DNC'],
      autoBlock: true,
      auditFrequency: 'realtime',
    },
    retryAndEscalation: {
      maxRetries: 3,
      retryDelayMs: 86400000, // 24 hours
      escalationThreshold: 2,
      escalationTargets: ['supervisor', 'specialist'],
      fallbackBehavior: 'escalate',
    },
    performanceTuning: {
      responseTimeout: 30000,
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.9,
      frequencyPenalty: 0.3,
      presencePenalty: 0.2,
      modelPreference: 'gemini-2.0-flash-live',
    },
    knowledgeConfig: {
      enableContextualMemory: true,
      memoryWindowSize: 10,
      knowledgeRefreshInterval: 60,
      injectionPriority: 'contact_first',
    },
  };

  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const prompt = await this.buildCompletePrompt(input);
    return {
      success: true,
      content: prompt,
      metadata: {
        agentId: this.id,
        channel: this.channel,
        promptVersion: this.promptVersion,
        executionTimestamp: new Date(),
        tokenUsage: { promptTokens: prompt.length, completionTokens: 0, totalTokens: prompt.length },
        layersApplied: ['foundational', 'organization', 'campaign', 'contact'],
      },
    };
  }

  // =============================================================================
  // VOICE-SPECIFIC UTILITY METHODS
  // =============================================================================

  /**
   * Build the first message for a call based on contact context
   */
  buildFirstMessage(contactContext?: AgentExecutionInput['contactContext']): string {
    if (!contactContext) {
      return "Hello, may I speak with the person I'm trying to reach?";
    }

    const name = [contactContext.firstName, contactContext.lastName]
      .filter(Boolean)
      .join(' ');
    const title = contactContext.title;
    const company = contactContext.company;

    if (name && title && company) {
      return `Hello, may I please speak with ${name}, the ${title} at ${company}?`;
    } else if (name && company) {
      return `Hello, may I please speak with ${name} at ${company}?`;
    } else if (name) {
      return `Hello, may I please speak with ${name}?`;
    }

    return "Hello, may I speak with the person I'm trying to reach?";
  }

  /**
   * Validate required variables for opening message
   */
  validateOpeningVariables(
    contactContext?: AgentExecutionInput['contactContext']
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    if (!contactContext) {
      return { valid: false, missing: ['contactContext'] };
    }

    if (!contactContext.firstName && !contactContext.lastName) {
      missing.push('contact_name');
    }

    if (!contactContext.company) {
      missing.push('company');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

/** The ONE canonical Voice Agent instance */
export const unifiedVoiceAgent = new UnifiedVoiceAgent();
