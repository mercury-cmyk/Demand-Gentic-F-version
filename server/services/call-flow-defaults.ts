/**
 * Call Flow Layer Defaults
 * 
 * Layer 3.5 in the voice agent architecture
 * 
 * The Call Flow Layer is a deterministic orchestration layer that governs:
 * - What the voice agent must accomplish
 * - In what order
 * - Under what constraints
 * 
 * This layer is AUTHORITATIVE. The agent may not bypass, reorder, or improvise
 * beyond what the call flow explicitly allows.
 * 
 * Layer Hierarchy (in order of precedence):
 * - Layer 1 – Voice Agent Control: Behavior, compliance, turn-taking ✅ Can override
 * - Layer 2 – Org Knowledge: Standards, ethics, tone ✅ Can override
 * - Layer 3.5 – Call Flow: What to accomplish ❌ Cannot be overridden by Layer 3
 * - Layer 3 – Campaign Context: What to say/know (informational only)
 */

// ======================== TYPE DEFINITIONS ========================

export type VoiceAgentState = 
  | 'IDENTITY_CHECK'
  | 'RIGHT_PARTY_INTRO'
  | 'CONTEXT_FRAMING'
  | 'DISCOVERY'
  | 'LISTENING'
  | 'ACKNOWLEDGEMENT'
  | 'PERMISSION_REQUEST'
  | 'CLOSE'
  | 'END';

export type Intent =
  | 'request_permission'
  | 'acknowledge'
  | 'ask_question'
  | 'listen'
  | 'share_insight'
  | 'propose_meeting'
  | 'schedule_meeting'
  | 'confirm_details'
  | 'exit_call'
  | 'handle_objection'
  | 'refer_to_colleague';

export interface ExitCondition {
  signal: string;
  description: string;
  nextStep?: string;
}

export interface BranchRule {
  trigger: string;
  condition: string;
  targetStep?: string;
  capability?: string;
  description: string;
}

export interface FallbackAction {
  action: 'repeat' | 'escalate' | 'exit' | 'next' | 'clarify' | 'proceed' | 'ask' | 'confirm' | 'probe' | 'emphasize' | 'offer' | 'summarize' | 'alternative' | 'offer_callback' | 'pivot';
  maxAttempts?: number;
  message?: string;
}

export interface CallFlowStep {
  stepId: string;
  name: string;
  mappedState: VoiceAgentState;
  goal: string;
  
  // Intent Controls
  allowedIntents: Intent[];
  forbiddenIntents?: Intent[];
  
  // Turn Constraints
  allowedQuestions: number;
  maxTurnsInStep: number;
  
  // Behavioral Rules
  mustDo?: string[];
  mustNotDo?: string[];
  
  // Exit & Branch Logic
  exitCriteria: ExitCondition[];
  branches?: BranchRule[];
  fallback?: FallbackAction;
}

export interface CallFlow {
  id: string;
  name: string;
  objective: string;
  successCriteria: string;
  maxTotalTurns: number;
  steps: CallFlowStep[];
  isDefault?: boolean;
  isSystemFlow?: boolean;
  version?: number;
}

// ======================== DEFAULT B2B APPOINTMENT CALL FLOW ========================

export const DEFAULT_APPOINTMENT_CALL_FLOW: CallFlow = {
  id: 'default-b2b-appointment',
  name: 'B2B Appointment Setting',
  objective: 'Book a qualified meeting with decision makers in target accounts',
  successCriteria: 'Calendar invite sent with confirmed date/time and attendees',
  maxTotalTurns: 20,
  isDefault: true,
  isSystemFlow: true,
  version: 1,
  steps: [
    // ========== STEP 1: Permission & Presence ==========
    {
      stepId: 'step-1-permission',
      name: 'Permission & Presence',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Secure permission to proceed with the conversation.',
      
      allowedIntents: ['request_permission', 'acknowledge'],
      forbiddenIntents: ['share_insight', 'propose_meeting', 'schedule_meeting'],
      
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      
      mustDo: [
        'Use one sentence maximum',
        'Ask only one question',
        'Wait for explicit response before continuing'
      ],
      mustNotDo: [
        'Pitch any product or service',
        'Mention specific offerings',
        'Share company details beyond name',
        'Ask multiple questions'
      ],
      
      exitCriteria: [
        { signal: 'prospect_agrees', description: 'Prospect agrees to continue ("yes", "sure", "go ahead")', nextStep: 'step-2-role' },
        { signal: 'prospect_asks_context', description: 'Prospect asks "what\'s this about?"', nextStep: 'step-2-role' },
      ],
      
      branches: [
        { trigger: 'busy_signal', condition: 'Prospect says "I\'m busy" or "not a good time"', targetStep: 'step-8-exit', capability: 'objection_handling', description: 'Offer callback or graceful exit' },
        { trigger: 'immediate_decline', condition: 'Prospect immediately declines', targetStep: 'step-8-exit', description: 'Thank and exit gracefully' }
      ],
      
      fallback: { action: 'repeat', maxAttempts: 2, message: 'Rephrase permission request' }
    },
    
    // ========== STEP 2: Role Confirmation ==========
    {
      stepId: 'step-2-role',
      name: 'Role Confirmation',
      mappedState: 'DISCOVERY',
      goal: 'Confirm responsibility or route to correct owner.',
      
      allowedIntents: ['ask_question', 'acknowledge'],
      forbiddenIntents: ['share_insight', 'propose_meeting'],
      
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      
      mustDo: [
        'Ask exactly one role-related question',
        'Confirm they handle the relevant area',
        'Listen for job function indicators'
      ],
      mustNotDo: [
        'Make assumptions about their role',
        'Skip role verification',
        'Pitch before role confirmation'
      ],
      
      exitCriteria: [
        { signal: 'role_confirmed', description: 'Prospect confirms relevant responsibility', nextStep: 'step-3-curiosity' },
        { signal: 'role_unclear', description: 'Need more information about role', nextStep: 'step-3-curiosity' }
      ],
      
      branches: [
        { trigger: 'wrong_person', condition: 'Prospect says they don\'t handle this area', capability: 'refer_to_colleague', description: 'Ask for referral to correct person' },
        { trigger: 'gatekeeper', condition: 'Speaking with assistant or gatekeeper', capability: 'gatekeeper_handling', description: 'Navigate through gatekeeper' }
      ],
      
      fallback: { action: 'next', message: 'Proceed with curiosity trigger if role remains unclear' }
    },
    
    // ========== STEP 3: Curiosity Trigger ==========
    {
      stepId: 'step-3-curiosity',
      name: 'Curiosity Trigger',
      mappedState: 'DISCOVERY',
      goal: 'Create engagement and dialogue through curiosity.',
      
      allowedIntents: ['ask_question'],
      forbiddenIntents: ['share_insight', 'propose_meeting', 'schedule_meeting'],
      
      allowedQuestions: 1,
      maxTurnsInStep: 2,
      
      mustDo: [
        'Ask a forced-choice OR open curiosity question',
        'Make the question market- or role-relevant',
        'Create genuine interest in their response'
      ],
      mustNotDo: [
        'Pitch product or company',
        'Mention specific features or benefits',
        'Ask yes/no questions',
        'Lead with your solution'
      ],
      
      exitCriteria: [
        { signal: 'engagement_achieved', description: 'Prospect answers with opinion or explanation', nextStep: 'step-4-discovery' },
        { signal: 'interest_shown', description: 'Prospect asks follow-up question', nextStep: 'step-4-discovery' }
      ],
      
      branches: [
        { trigger: 'time_pressure', condition: 'Prospect indicates limited time', targetStep: 'step-6-meeting-ask', description: 'Skip to meeting ask' },
        { trigger: 'objection', condition: 'Prospect objects', capability: 'objection_handling', description: 'Handle objection then return' }
      ],
      
      fallback: { action: 'next', message: 'Move to discovery lite' }
    },
    
    // ========== STEP 4: Discovery Lite ==========
    {
      stepId: 'step-4-discovery',
      name: 'Discovery Lite',
      mappedState: 'LISTENING',
      goal: 'Capture exactly one qualifying signal.',
      
      allowedIntents: ['ask_question', 'acknowledge', 'listen'],
      forbiddenIntents: ['share_insight', 'propose_meeting'],
      
      allowedQuestions: 1,
      maxTurnsInStep: 4,
      
      mustDo: [
        'Ask ONE question only',
        'Let prospect speak uninterrupted',
        'Listen for pain, priority, timing, or ownership signals',
        'Acknowledge their response thoughtfully'
      ],
      mustNotDo: [
        'Interrupt the prospect',
        'Ask multiple questions',
        'Jump to solution before hearing their situation',
        'Dismiss or minimize their concerns'
      ],
      
      exitCriteria: [
        { signal: 'pain_detected', description: 'Prospect mentions a pain point or challenge', nextStep: 'step-5-insight' },
        { signal: 'priority_detected', description: 'Prospect mentions it\'s a priority/focus area', nextStep: 'step-5-insight' },
        { signal: 'timing_detected', description: 'Prospect mentions timing or urgency', nextStep: 'step-5-insight' },
        { signal: 'ownership_detected', description: 'Prospect confirms decision-making role', nextStep: 'step-5-insight' }
      ],
      
      branches: [
        { trigger: 'no_interest', condition: 'Prospect shows no interest in topic', capability: 'objection_handling', description: 'Attempt one pivot' },
        { trigger: 'strong_interest', condition: 'Prospect shows strong interest', targetStep: 'step-6-meeting-ask', description: 'Skip to meeting ask' }
      ],
      
      fallback: { action: 'next', message: 'Proceed to insight with available information' }
    },
    
    // ========== STEP 5: Insight Drop (Controlled) ==========
    {
      stepId: 'step-5-insight',
      name: 'Insight Drop',
      mappedState: 'ACKNOWLEDGEMENT',
      goal: 'Create a compelling reason for a follow-up meeting.',
      
      allowedIntents: ['share_insight', 'ask_question'],
      forbiddenIntents: ['schedule_meeting'],
      
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      
      mustDo: [
        'Share ONLY ONE insight per call',
        'Reference a market pattern or industry trend',
        'Connect insight to their situation',
        'End with a question to gauge interest'
      ],
      mustNotDo: [
        'Accuse or criticize their current approach',
        'Share multiple insights',
        'Make the insight about your product',
        'Deliver a sales pitch',
        'Use fear-based messaging'
      ],
      
      exitCriteria: [
        { signal: 'interest_confirmed', description: 'Prospect shows interest in learning more', nextStep: 'step-6-meeting-ask' },
        { signal: 'question_asked', description: 'Prospect asks about the insight', nextStep: 'step-6-meeting-ask' }
      ],
      
      branches: [
        { trigger: 'pushback', condition: 'Prospect pushes back on insight', capability: 'objection_handling', description: 'Acknowledge and pivot' },
        { trigger: 'request_info', condition: 'Prospect asks for more information', targetStep: 'step-6-meeting-ask', description: 'Offer to share more in meeting' }
      ],
      
      fallback: { action: 'next', message: 'Proceed to soft meeting ask' }
    },
    
    // ========== STEP 6: Soft Meeting Ask ==========
    {
      stepId: 'step-6-meeting-ask',
      name: 'Soft Meeting Ask',
      mappedState: 'PERMISSION_REQUEST',
      goal: 'Propose a short, low-pressure meeting.',
      
      allowedIntents: ['propose_meeting'],
      forbiddenIntents: ['share_insight'],
      
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      
      mustDo: [
        'Use low-pressure language: "quick", "short", "15 minutes"',
        'Frame meeting as exploration, not sales',
        'Provide clear value proposition for the meeting',
        'Make it easy to say yes'
      ],
      mustNotDo: [
        'Ask twice in the same turn',
        'Use high-pressure tactics',
        'Promise deliverables you cannot guarantee',
        'Make the meeting sound like a sales pitch'
      ],
      
      exitCriteria: [
        { signal: 'meeting_accepted', description: 'Prospect agrees to a meeting', nextStep: 'step-7-calendar' },
        { signal: 'soft_yes', description: 'Prospect shows openness ("maybe", "could be interesting")', nextStep: 'step-7-calendar' }
      ],
      
      branches: [
        { trigger: 'objection', condition: 'Prospect objects to meeting', capability: 'objection_handling', description: 'Handle objection with one attempt' },
        { trigger: 'send_email', condition: 'Prospect asks for email instead', targetStep: 'step-8-exit', description: 'Agree to email and soft hold' },
        { trigger: 'not_now', condition: 'Prospect says "not now" or "later"', targetStep: 'step-8-exit', description: 'Schedule callback' }
      ],
      
      fallback: { action: 'escalate', maxAttempts: 1, message: 'If declined, exit gracefully' }
    },
    
    // ========== STEP 7: Calendar Lock ==========
    {
      stepId: 'step-7-calendar',
      name: 'Calendar Lock',
      mappedState: 'CLOSE',
      goal: 'Secure specific date/time or clean disengagement.',
      
      allowedIntents: ['schedule_meeting', 'confirm_details'],
      forbiddenIntents: ['share_insight', 'ask_question'],
      
      allowedQuestions: 2,
      maxTurnsInStep: 5,
      
      mustDo: [
        'Offer two time options maximum',
        'Confirm time zone explicitly',
        'Confirm who should attend',
        'Send calendar invite immediately',
        'Summarize what will be discussed'
      ],
      mustNotDo: [
        'Offer too many options (decision paralysis)',
        'Skip time zone confirmation',
        'Leave attendees ambiguous',
        'End without confirming details'
      ],
      
      exitCriteria: [
        { signal: 'meeting_scheduled', description: 'Date, time, and attendees confirmed', nextStep: 'step-8-exit' },
        { signal: 'calendar_sent', description: 'Calendar invite sent successfully', nextStep: 'step-8-exit' }
      ],
      
      branches: [
        { trigger: 'schedule_conflict', condition: 'Proposed times don\'t work', targetStep: 'step-7-calendar', description: 'Offer alternative times' },
        { trigger: 'need_approval', condition: 'Prospect needs to check with someone', targetStep: 'step-8-exit', description: 'Schedule follow-up' }
      ],
      
      fallback: { action: 'exit', message: 'Thank and exit if scheduling fails' }
    },
    
    // ========== STEP 8: Exit with Goodwill ==========
    {
      stepId: 'step-8-exit',
      name: 'Exit with Goodwill',
      mappedState: 'END',
      goal: 'Leave a positive impression regardless of outcome.',
      
      allowedIntents: ['exit_call', 'acknowledge', 'confirm_details'],
      forbiddenIntents: ['ask_question', 'propose_meeting', 'share_insight'],
      
      allowedQuestions: 0,
      maxTurnsInStep: 2,
      
      mustDo: [
        'Thank them for their time',
        'Reconfirm any next steps if applicable',
        'End cleanly and professionally',
        'Leave door open for future contact'
      ],
      mustNotDo: [
        'Make one last pitch',
        'Ask more questions',
        'Express disappointment',
        'Be passive-aggressive if declined'
      ],
      
      exitCriteria: [
        { signal: 'call_ended', description: 'Graceful farewell exchanged', nextStep: undefined }
      ],
      
      fallback: { action: 'exit', message: 'End call politely' }
    }
  ]
};

// ======================== WEBINAR REGISTRATION CALL FLOW ========================

export const DEFAULT_WEBINAR_CALL_FLOW: CallFlow = {
  id: 'default-webinar-registration',
  name: 'Webinar Registration',
  objective: 'Register qualified prospects for an upcoming webinar or on-demand content',
  successCriteria: 'Registration confirmed with valid email and calendar hold sent',
  maxTotalTurns: 15,
  isDefault: true,
  isSystemFlow: true,
  version: 1,
  steps: [
    {
      stepId: 'step-1-intro',
      name: 'Introduction & Value Prop',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Introduce the webinar and establish relevance.',
      allowedIntents: ['request_permission', 'acknowledge'],
      forbiddenIntents: ['schedule_meeting', 'propose_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'Mention webinar topic clearly',
        'State the key benefit in one sentence',
        'Ask if this topic is relevant to them'
      ],
      mustNotDo: [
        'Pitch products',
        'Go into detailed content',
        'Assume they know about the webinar'
      ],
      exitCriteria: [
        { signal: 'interest_shown', description: 'Prospect shows interest in topic', nextStep: 'step-2-qualify' },
        { signal: 'already_registered', description: 'Already registered', nextStep: 'step-5-close' }
      ],
      fallback: { action: 'clarify', message: 'Ask if the topic resonates with their current priorities' }
    },
    {
      stepId: 'step-2-qualify',
      name: 'Quick Qualification',
      mappedState: 'DISCOVERY',
      goal: 'Confirm relevance and role fit.',
      allowedIntents: ['ask_question', 'acknowledge'],
      forbiddenIntents: ['share_insight'],
      allowedQuestions: 2,
      maxTurnsInStep: 3,
      mustDo: [
        'Confirm their role relates to webinar topic',
        'Ask about their current challenges in this area'
      ],
      mustNotDo: [
        'Deep discovery questioning',
        'Pitch solutions'
      ],
      exitCriteria: [
        { signal: 'qualified', description: 'Role and interest confirmed', nextStep: 'step-3-details' }
      ],
      fallback: { action: 'proceed', message: 'Move to webinar details' }
    },
    {
      stepId: 'step-3-details',
      name: 'Webinar Details',
      mappedState: 'ACKNOWLEDGEMENT',
      goal: 'Share key webinar details and speakers.',
      allowedIntents: ['share_insight', 'ask_question'],
      forbiddenIntents: ['schedule_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'Share date/time of webinar',
        'Mention key speaker or expert',
        'Highlight one key takeaway'
      ],
      mustNotDo: [
        'Overwhelm with details',
        'Read the full agenda'
      ],
      exitCriteria: [
        { signal: 'ready_to_register', description: 'Prospect ready to register', nextStep: 'step-4-register' }
      ],
      fallback: { action: 'ask', message: 'Ask if the timing works for them' }
    },
    {
      stepId: 'step-4-register',
      name: 'Registration',
      mappedState: 'CLOSE',
      goal: 'Capture registration details.',
      allowedIntents: ['confirm_details', 'acknowledge'],
      forbiddenIntents: [],
      allowedQuestions: 3,
      maxTurnsInStep: 4,
      mustDo: [
        'Confirm email address for registration',
        'Offer to send calendar invite',
        'Mention recording availability if they cant attend live'
      ],
      mustNotDo: [
        'Ask for unnecessary information',
        'Push for sales meeting at this point'
      ],
      exitCriteria: [
        { signal: 'registered', description: 'Email captured and confirmed', nextStep: 'step-5-close' }
      ],
      fallback: { action: 'confirm', message: 'Confirm email one more time' }
    },
    {
      stepId: 'step-5-close',
      name: 'Wrap-up',
      mappedState: 'END',
      goal: 'Confirm next steps and end professionally.',
      allowedIntents: ['confirm_details', 'exit_call'],
      forbiddenIntents: [],
      allowedQuestions: 1,
      maxTurnsInStep: 2,
      mustDo: [
        'Confirm they will receive email confirmation',
        'Thank them for their time',
        'Mention they can reply to email with questions'
      ],
      mustNotDo: [
        'Try to schedule additional meetings',
        'Make last-minute pitches'
      ],
      exitCriteria: [
        { signal: 'call_ended', description: 'Graceful farewell', nextStep: undefined }
      ],
      fallback: { action: 'exit', message: 'End call professionally' }
    }
  ]
};

// ======================== LEAD QUALIFICATION CALL FLOW ========================

export const DEFAULT_LEAD_QUALIFICATION_CALL_FLOW: CallFlow = {
  id: 'default-lead-qualification',
  name: 'Lead Qualification (HQL/SQL)',
  objective: 'Qualify inbound leads and determine sales-readiness',
  successCriteria: 'Lead scored and categorized with next action defined',
  maxTotalTurns: 18,
  isDefault: true,
  isSystemFlow: true,
  version: 1,
  steps: [
    {
      stepId: 'step-1-context',
      name: 'Context & Permission',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Understand how they found us and get permission to ask questions.',
      allowedIntents: ['request_permission', 'ask_question', 'acknowledge'],
      forbiddenIntents: ['propose_meeting', 'share_insight'],
      allowedQuestions: 2,
      maxTurnsInStep: 3,
      mustDo: [
        'Reference their inquiry or download',
        'Ask what prompted their interest',
        'Get permission to ask a few questions'
      ],
      mustNotDo: [
        'Jump into qualification without context',
        'Assume their needs'
      ],
      exitCriteria: [
        { signal: 'permission_granted', description: 'Agreed to answer questions', nextStep: 'step-2-need' }
      ],
      fallback: { action: 'clarify', message: 'Reference their specific action that generated the lead' }
    },
    {
      stepId: 'step-2-need',
      name: 'Need Discovery',
      mappedState: 'DISCOVERY',
      goal: 'Understand the core problem or need.',
      allowedIntents: ['ask_question', 'listen', 'acknowledge'],
      forbiddenIntents: ['propose_meeting'],
      allowedQuestions: 2,
      maxTurnsInStep: 4,
      mustDo: [
        'Ask about their current challenge',
        'Understand what success looks like',
        'Listen for urgency signals'
      ],
      mustNotDo: [
        'Offer solutions yet',
        'Ask more than 2 questions'
      ],
      exitCriteria: [
        { signal: 'need_identified', description: 'Clear need articulated', nextStep: 'step-3-authority' }
      ],
      fallback: { action: 'probe', message: 'Ask what triggered them to look for solutions now' }
    },
    {
      stepId: 'step-3-authority',
      name: 'Authority & Stakeholders',
      mappedState: 'DISCOVERY',
      goal: 'Understand decision-making process.',
      allowedIntents: ['ask_question', 'acknowledge'],
      forbiddenIntents: ['propose_meeting'],
      allowedQuestions: 2,
      maxTurnsInStep: 3,
      mustDo: [
        'Ask about their role in the decision',
        'Understand who else is involved',
        'Identify the ultimate decision maker'
      ],
      mustNotDo: [
        'Make them feel unimportant if not the decision maker',
        'Skip this step'
      ],
      exitCriteria: [
        { signal: 'authority_clear', description: 'Decision process understood', nextStep: 'step-4-timeline' }
      ],
      fallback: { action: 'ask', message: 'Ask who else would need to be involved' }
    },
    {
      stepId: 'step-4-timeline',
      name: 'Timeline & Budget',
      mappedState: 'DISCOVERY',
      goal: 'Assess urgency and budget alignment.',
      allowedIntents: ['ask_question', 'acknowledge'],
      forbiddenIntents: [],
      allowedQuestions: 2,
      maxTurnsInStep: 3,
      mustDo: [
        'Ask about their timeline for solving this',
        'Gently explore budget expectations',
        'Note any constraints'
      ],
      mustNotDo: [
        'Push on budget if uncomfortable',
        'Make assumptions about timeline'
      ],
      exitCriteria: [
        { signal: 'timing_understood', description: 'Timeline and budget context gathered', nextStep: 'step-5-score' }
      ],
      fallback: { action: 'proceed', message: 'Move to scoring if budget is sensitive topic' }
    },
    {
      stepId: 'step-5-score',
      name: 'Summary & Score',
      mappedState: 'ACKNOWLEDGEMENT',
      goal: 'Summarize findings and determine next action.',
      allowedIntents: ['acknowledge', 'share_insight', 'propose_meeting'],
      forbiddenIntents: [],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'Summarize what you learned briefly',
        'Confirm accuracy',
        'Propose appropriate next step based on score'
      ],
      mustNotDo: [
        'Misrepresent what they said',
        'Force a next step if not qualified'
      ],
      exitCriteria: [
        { signal: 'sql_qualified', description: 'Sales-ready, book meeting', nextStep: 'step-6-next' },
        { signal: 'hql_qualified', description: 'High quality but needs nurture', nextStep: 'step-6-next' },
        { signal: 'not_qualified', description: 'Not a fit', nextStep: 'step-7-close' }
      ],
      fallback: { action: 'clarify', message: 'Confirm understanding before proposing next steps' }
    },
    {
      stepId: 'step-6-next',
      name: 'Next Steps',
      mappedState: 'CLOSE',
      goal: 'Lock in appropriate next action.',
      allowedIntents: ['schedule_meeting', 'propose_meeting', 'confirm_details'],
      forbiddenIntents: [],
      allowedQuestions: 2,
      maxTurnsInStep: 4,
      mustDo: [
        'For SQL: Schedule meeting with sales',
        'For HQL: Offer relevant content or nurture path',
        'Confirm their email for follow-up'
      ],
      mustNotDo: [
        'Over-promise on next steps',
        'Leave next steps ambiguous'
      ],
      exitCriteria: [
        { signal: 'next_step_confirmed', description: 'Clear next action agreed', nextStep: 'step-7-close' }
      ],
      fallback: { action: 'confirm', message: 'Reconfirm the agreed next step' }
    },
    {
      stepId: 'step-7-close',
      name: 'Close',
      mappedState: 'END',
      goal: 'End professionally with clear expectations.',
      allowedIntents: ['confirm_details', 'exit_call'],
      forbiddenIntents: [],
      allowedQuestions: 0,
      maxTurnsInStep: 2,
      mustDo: [
        'Thank them for their time',
        'Confirm what they can expect next',
        'End professionally'
      ],
      mustNotDo: [
        'Add new topics',
        'Make additional asks'
      ],
      exitCriteria: [
        { signal: 'call_ended', description: 'Call ended', nextStep: undefined }
      ],
      fallback: { action: 'exit', message: 'End call' }
    }
  ]
};

// ======================== EVENT INVITATION CALL FLOW ========================

export const DEFAULT_EVENT_INVITATION_CALL_FLOW: CallFlow = {
  id: 'default-event-invitation',
  name: 'Event Invitation (Dinner/Forum/Conference)',
  objective: 'Secure RSVP for exclusive executive event',
  successCriteria: 'Confirmed attendance with dietary preferences and logistics',
  maxTotalTurns: 15,
  isDefault: true,
  isSystemFlow: true,
  version: 1,
  steps: [
    {
      stepId: 'step-1-exclusive-intro',
      name: 'Exclusive Introduction',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Convey exclusivity and relevance of invitation.',
      allowedIntents: ['request_permission', 'acknowledge'],
      forbiddenIntents: ['propose_meeting', 'schedule_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'Emphasize curated/exclusive nature',
        'Mention they were specifically selected',
        'State the event theme briefly'
      ],
      mustNotDo: [
        'Sound like a mass invitation',
        'Downplay the exclusivity'
      ],
      exitCriteria: [
        { signal: 'interest', description: 'Shows interest in hearing more', nextStep: 'step-2-details' }
      ],
      fallback: { action: 'emphasize', message: 'Highlight the unique value of attending' }
    },
    {
      stepId: 'step-2-details',
      name: 'Event Details',
      mappedState: 'ACKNOWLEDGEMENT',
      goal: 'Share key event details.',
      allowedIntents: ['share_insight', 'acknowledge'],
      forbiddenIntents: [],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'State date, time, location',
        'Mention notable speakers or attendees',
        'Describe the format (dinner, panel, networking)'
      ],
      mustNotDo: [
        'Overwhelm with logistics',
        'Read a full agenda'
      ],
      exitCriteria: [
        { signal: 'timing_check', description: 'Prospect checking availability', nextStep: 'step-3-rsvp' }
      ],
      fallback: { action: 'ask', message: 'Ask if the date works for their schedule' }
    },
    {
      stepId: 'step-3-rsvp',
      name: 'RSVP Capture',
      mappedState: 'CLOSE',
      goal: 'Secure confirmed attendance.',
      allowedIntents: ['confirm_details', 'acknowledge'],
      forbiddenIntents: [],
      allowedQuestions: 3,
      maxTurnsInStep: 4,
      mustDo: [
        'Ask for confirmation of attendance',
        'Capture dietary restrictions if meal involved',
        'Confirm best email for invite'
      ],
      mustNotDo: [
        'Pressure if genuinely unavailable',
        'Skip dietary question for dinner events'
      ],
      exitCriteria: [
        { signal: 'confirmed', description: 'RSVP confirmed', nextStep: 'step-4-close' },
        { signal: 'tentative', description: 'Needs to check calendar', nextStep: 'step-4-close' }
      ],
      fallback: { action: 'offer', message: 'Offer to send details so they can confirm later' }
    },
    {
      stepId: 'step-4-close',
      name: 'Confirmation & Close',
      mappedState: 'END',
      goal: 'Confirm next steps and end.',
      allowedIntents: ['confirm_details', 'exit_call'],
      forbiddenIntents: [],
      allowedQuestions: 1,
      maxTurnsInStep: 2,
      mustDo: [
        'Confirm they will receive email confirmation',
        'Mention any prep materials or logistics',
        'Thank them and express looking forward to seeing them'
      ],
      mustNotDo: [
        'Add sales pitches',
        'Request additional commitments'
      ],
      exitCriteria: [
        { signal: 'call_ended', description: 'Call ended', nextStep: undefined }
      ],
      fallback: { action: 'exit', message: 'End professionally' }
    }
  ]
};

// ======================== CONTENT SYNDICATION CALL FLOW ========================

export const DEFAULT_CONTENT_SYNDICATION_CALL_FLOW: CallFlow = {
  id: 'default-content-syndication',
  name: 'Content Syndication Follow-up',
  objective: 'Qualify content download leads and advance to next stage',
  successCriteria: 'Lead qualified with clear interest level and next action defined',
  maxTotalTurns: 12,
  isDefault: true,
  isSystemFlow: true,
  version: 1,
  steps: [
    {
      stepId: 'step-1-reference',
      name: 'Content Reference',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Connect the call to their content download.',
      allowedIntents: ['request_permission', 'acknowledge'],
      forbiddenIntents: ['propose_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'Reference the specific content they downloaded',
        'Ask if they had a chance to review it',
        'Get permission to ask a few questions'
      ],
      mustNotDo: [
        'Assume they read the full content',
        'Jump straight into sales questions'
      ],
      exitCriteria: [
        { signal: 'engaged', description: 'Prospect engages on content topic', nextStep: 'step-2-value' }
      ],
      fallback: { action: 'summarize', message: 'Offer a quick summary of key points' }
    },
    {
      stepId: 'step-2-value',
      name: 'Value Discussion',
      mappedState: 'DISCOVERY',
      goal: 'Understand what resonated and current challenges.',
      allowedIntents: ['ask_question', 'listen', 'acknowledge'],
      forbiddenIntents: ['propose_meeting'],
      allowedQuestions: 2,
      maxTurnsInStep: 4,
      mustDo: [
        'Ask what prompted their interest in this topic',
        'Explore current challenges in this area',
        'Listen for buying signals'
      ],
      mustNotDo: [
        'Pitch products immediately',
        'Ignore what they share'
      ],
      exitCriteria: [
        { signal: 'challenge_shared', description: 'Specific challenge identified', nextStep: 'step-3-qualify' }
      ],
      fallback: { action: 'probe', message: 'Ask about their top priorities this quarter' }
    },
    {
      stepId: 'step-3-qualify',
      name: 'Quick Qualify',
      mappedState: 'DISCOVERY',
      goal: 'Determine if further engagement is warranted.',
      allowedIntents: ['ask_question', 'acknowledge'],
      forbiddenIntents: [],
      allowedQuestions: 2,
      maxTurnsInStep: 3,
      mustDo: [
        'Confirm their role and responsibility',
        'Understand timeline for addressing challenge',
        'Gauge urgency level'
      ],
      mustNotDo: [
        'Interrogate them',
        'Ask too many questions'
      ],
      exitCriteria: [
        { signal: 'qualified', description: 'Good fit identified', nextStep: 'step-4-next' },
        { signal: 'not_ready', description: 'Not ready now', nextStep: 'step-5-nurture' }
      ],
      fallback: { action: 'proceed', message: 'Move based on signals gathered' }
    },
    {
      stepId: 'step-4-next',
      name: 'Next Step Proposal',
      mappedState: 'CLOSE',
      goal: 'Propose appropriate next action.',
      allowedIntents: ['propose_meeting', 'schedule_meeting', 'confirm_details'],
      forbiddenIntents: [],
      allowedQuestions: 2,
      maxTurnsInStep: 4,
      mustDo: [
        'Propose meeting with specialist or demo',
        'Offer flexible scheduling options',
        'Confirm email for calendar invite'
      ],
      mustNotDo: [
        'Be pushy if hesitant',
        'Oversell the meeting'
      ],
      exitCriteria: [
        { signal: 'meeting_booked', description: 'Meeting scheduled', nextStep: 'step-6-close' }
      ],
      branches: [
        { trigger: 'hesitation', condition: 'Hesitant to meet', targetStep: 'step-5-nurture', description: 'Offer nurture content instead' }
      ],
      fallback: { action: 'alternative', message: 'Offer alternative like email follow-up' }
    },
    {
      stepId: 'step-5-nurture',
      name: 'Nurture Path',
      mappedState: 'ACKNOWLEDGEMENT',
      goal: 'Set up appropriate nurture for not-ready leads.',
      allowedIntents: ['share_insight', 'confirm_details'],
      forbiddenIntents: ['schedule_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 2,
      mustDo: [
        'Offer additional relevant content',
        'Ask permission to follow up in future',
        'Confirm email for resources'
      ],
      mustNotDo: [
        'Make them feel rejected',
        'Push for meeting anyway'
      ],
      exitCriteria: [
        { signal: 'nurture_set', description: 'Follow-up path agreed', nextStep: 'step-6-close' }
      ],
      fallback: { action: 'proceed', message: 'Move to close' }
    },
    {
      stepId: 'step-6-close',
      name: 'Close',
      mappedState: 'END',
      goal: 'End with clear next steps.',
      allowedIntents: ['confirm_details', 'exit_call'],
      forbiddenIntents: [],
      allowedQuestions: 0,
      maxTurnsInStep: 2,
      mustDo: [
        'Summarize agreed next steps',
        'Thank them for their time',
        'End professionally'
      ],
      mustNotDo: [
        'Add new topics',
        'Make additional requests'
      ],
      exitCriteria: [
        { signal: 'call_ended', description: 'Call ended', nextStep: undefined }
      ],
      fallback: { action: 'exit', message: 'End call' }
    }
  ]
};

// ======================== GENERIC OUTBOUND CALL FLOW ========================

export const DEFAULT_GENERIC_CALL_FLOW: CallFlow = {
  id: 'default-generic-outbound',
  name: 'Generic Outbound',
  objective: 'Engage prospect and advance to next stage based on interest',
  successCriteria: 'Clear next action defined with prospect agreement',
  maxTotalTurns: 15,
  isDefault: true,
  isSystemFlow: true,
  version: 1,
  steps: [
    {
      stepId: 'step-1-intro',
      name: 'Introduction',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Introduce yourself and get permission to continue.',
      allowedIntents: ['request_permission', 'acknowledge'],
      forbiddenIntents: ['propose_meeting', 'share_insight'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'State your name and company clearly',
        'Ask if they have a moment',
        'Be concise and respectful'
      ],
      mustNotDo: [
        'Launch into a pitch',
        'Assume they have time'
      ],
      exitCriteria: [
        { signal: 'permission_granted', description: 'Agreed to talk', nextStep: 'step-2-reason' }
      ],
      fallback: { action: 'offer_callback', message: 'Offer to call at better time' }
    },
    {
      stepId: 'step-2-reason',
      name: 'Reason for Call',
      mappedState: 'CONTEXT_FRAMING',
      goal: 'Explain why you are calling briefly.',
      allowedIntents: ['share_insight', 'ask_question'],
      forbiddenIntents: ['propose_meeting'],
      allowedQuestions: 1,
      maxTurnsInStep: 3,
      mustDo: [
        'State reason for calling in one sentence',
        'Make it relevant to them',
        'Ask if this topic resonates'
      ],
      mustNotDo: [
        'Give a long pitch',
        'Talk about yourself too much'
      ],
      exitCriteria: [
        { signal: 'interest', description: 'Shows interest', nextStep: 'step-3-discovery' },
        { signal: 'not_interested', description: 'Not interested', nextStep: 'step-5-close' }
      ],
      fallback: { action: 'pivot', message: 'Ask what their priorities are instead' }
    },
    {
      stepId: 'step-3-discovery',
      name: 'Discovery',
      mappedState: 'DISCOVERY',
      goal: 'Understand their situation and needs.',
      allowedIntents: ['ask_question', 'listen', 'acknowledge'],
      forbiddenIntents: ['propose_meeting'],
      allowedQuestions: 2,
      maxTurnsInStep: 5,
      mustDo: [
        'Ask about their current approach',
        'Listen for challenges or pain points',
        'Acknowledge what they share'
      ],
      mustNotDo: [
        'Interrupt',
        'Jump to solutions too quickly'
      ],
      exitCriteria: [
        { signal: 'need_identified', description: 'Clear need or interest identified', nextStep: 'step-4-next-step' }
      ],
      fallback: { action: 'summarize', message: 'Summarize what you heard and check accuracy' }
    },
    {
      stepId: 'step-4-next-step',
      name: 'Next Step',
      mappedState: 'CLOSE',
      goal: 'Propose appropriate next action.',
      allowedIntents: ['propose_meeting', 'schedule_meeting', 'confirm_details'],
      forbiddenIntents: [],
      allowedQuestions: 2,
      maxTurnsInStep: 4,
      mustDo: [
        'Propose a clear next step',
        'Make it easy to say yes',
        'Confirm details if agreed'
      ],
      mustNotDo: [
        'Be pushy',
        'Leave next steps vague'
      ],
      exitCriteria: [
        { signal: 'agreed', description: 'Next step agreed', nextStep: 'step-5-close' }
      ],
      fallback: { action: 'alternative', message: 'Offer alternative next step' }
    },
    {
      stepId: 'step-5-close',
      name: 'Close',
      mappedState: 'END',
      goal: 'End professionally.',
      allowedIntents: ['confirm_details', 'exit_call'],
      forbiddenIntents: [],
      allowedQuestions: 0,
      maxTurnsInStep: 2,
      mustDo: [
        'Confirm any agreed actions',
        'Thank them',
        'End professionally'
      ],
      mustNotDo: [
        'Add new topics',
        'Prolong unnecessarily'
      ],
      exitCriteria: [
        { signal: 'call_ended', description: 'Call ended', nextStep: undefined }
      ],
      fallback: { action: 'exit', message: 'End call' }
    }
  ]
};

// ======================== CAMPAIGN TYPE TO CALL FLOW MAPPING ========================

/**
 * Maps campaign types to their default call flows
 */
export const CAMPAIGN_TYPE_CALL_FLOWS: Record<string, CallFlow> = {
  // Appointment-focused campaigns
  'appointment_generation': DEFAULT_APPOINTMENT_CALL_FLOW,
  'sql': DEFAULT_APPOINTMENT_CALL_FLOW,
  'telemarketing': DEFAULT_APPOINTMENT_CALL_FLOW,

  // Lead qualification campaigns
  'high_quality_leads': DEFAULT_LEAD_QUALIFICATION_CALL_FLOW,

  // Webinar and content campaigns
  'live_webinar': DEFAULT_WEBINAR_CALL_FLOW,
  'on_demand_webinar': DEFAULT_WEBINAR_CALL_FLOW,
  'content_syndication': DEFAULT_CONTENT_SYNDICATION_CALL_FLOW,

  // Event-based campaigns
  'executive_dinner': DEFAULT_EVENT_INVITATION_CALL_FLOW,
  'leadership_forum': DEFAULT_EVENT_INVITATION_CALL_FLOW,
  'conference': DEFAULT_EVENT_INVITATION_CALL_FLOW,

  // Generic/default
  'call': DEFAULT_GENERIC_CALL_FLOW,
  'combo': DEFAULT_GENERIC_CALL_FLOW,
  'email': DEFAULT_GENERIC_CALL_FLOW, // For combo campaigns with voice component
};

/**
 * Gets the appropriate default call flow for a campaign type
 */
export function getDefaultCallFlowForCampaignType(campaignType: string): CallFlow {
  return CAMPAIGN_TYPE_CALL_FLOWS[campaignType] || DEFAULT_GENERIC_CALL_FLOW;
}

/**
 * Gets all available default call flows
 */
export function getAllDefaultCallFlows(): CallFlow[] {
  const flows = [
    DEFAULT_APPOINTMENT_CALL_FLOW,
    DEFAULT_WEBINAR_CALL_FLOW,
    DEFAULT_LEAD_QUALIFICATION_CALL_FLOW,
    DEFAULT_EVENT_INVITATION_CALL_FLOW,
    DEFAULT_CONTENT_SYNDICATION_CALL_FLOW,
    DEFAULT_GENERIC_CALL_FLOW,
  ];
  console.log(`[CALL FLOW DEFAULTS] getAllDefaultCallFlows returning ${flows.length} system flows`);
  return flows;
}

// ======================== CALL FLOW RUNTIME INJECTION ========================

/**
 * Builds the call flow prompt section for injection into the voice agent prompt.
 * This provides step-by-step instructions that the agent must follow.
 */
export function buildCallFlowPromptSection(
  callFlow: CallFlow,
  currentStepIndex: number = 0
): string {
  const currentStep = callFlow.steps[currentStepIndex];
  if (!currentStep) return '';

  const stepNumbers = callFlow.steps.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
  
  return `
## CALL FLOW REFERENCE (Suggested Conversation Structure)

**NOTE: This is a REFERENCE GUIDE for conversation flow, not strict rules.**
**Your primary instructions come from the Campaign Context and Agent Knowledge above.**
**Use this as a helpful framework, but prioritize natural conversation and prospect engagement.**

### Campaign Objective (Reference)
${callFlow.objective}

### Success Criteria (Reference)
${callFlow.successCriteria}

### Suggested Conversation Phases
${stepNumbers}

---

## CURRENT PHASE REFERENCE: ${currentStep.name}
**Phase ${currentStepIndex + 1} of ${callFlow.steps.length}**

### Phase Goal (Suggested)
${currentStep.goal}

### Suggested Actions for This Phase
${currentStep.allowedIntents.map(i => `• ${formatIntent(i)}`).join('\n')}

${currentStep.mustDo?.length ? `### Tips for This Phase
${currentStep.mustDo.map(m => `• ${m}`).join('\n')}` : ''}

### Natural Transition Signals
${currentStep.exitCriteria.map(e => `• ${e.description}`).join('\n')}

---

**IMPORTANT: This call flow is a REFERENCE only. Your campaign context and natural conversation skills take priority. Focus on building rapport and having a genuine conversation - don't rigidly follow steps if the prospect takes the conversation in a different direction.**
`;
}

/**
 * Formats an intent into human-readable text
 */
function formatIntent(intent: Intent): string {
  const intentMap: Record<Intent, string> = {
    'request_permission': 'Request Permission to Continue',
    'acknowledge': 'Acknowledge/Confirm',
    'ask_question': 'Ask a Question',
    'listen': 'Active Listening',
    'share_insight': 'Share Market/Industry Insight',
    'propose_meeting': 'Propose a Meeting',
    'schedule_meeting': 'Schedule/Confirm Meeting Details',
    'confirm_details': 'Confirm Details',
    'exit_call': 'Exit/End Call',
    'handle_objection': 'Handle Objection',
    'refer_to_colleague': 'Ask for Referral'
  };
  return intentMap[intent] || intent;
}

/**
 * Gets the default call flow for campaigns that don't specify one
 */
export function getDefaultCallFlow(): CallFlow {
  return DEFAULT_APPOINTMENT_CALL_FLOW;
}

/**
 * Validates a call flow structure
 */
export function validateCallFlow(callFlow: CallFlow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!callFlow.id) errors.push('Call flow must have an ID');
  if (!callFlow.name) errors.push('Call flow must have a name');
  if (!callFlow.objective) errors.push('Call flow must have an objective');
  if (!callFlow.steps?.length) errors.push('Call flow must have at least one step');
  
  if (callFlow.maxTotalTurns < 1) {
    errors.push('maxTotalTurns must be at least 1');
  }
  
  callFlow.steps?.forEach((step, i) => {
    if (!step.stepId) errors.push(`Step ${i + 1} must have a stepId`);
    if (!step.name) errors.push(`Step ${i + 1} must have a name`);
    if (!step.goal) errors.push(`Step ${i + 1} must have a goal`);
    if (!step.allowedIntents?.length) errors.push(`Step ${i + 1} must have allowed intents`);
    if (step.allowedQuestions < 0) errors.push(`Step ${i + 1} allowedQuestions cannot be negative`);
    if (step.maxTurnsInStep < 1) errors.push(`Step ${i + 1} maxTurnsInStep must be at least 1`);
  });
  
  return { valid: errors.length === 0, errors };
}

/**
 * Merges a custom call flow with the default, preserving required system steps
 */
export function mergeWithDefaultCallFlow(customFlow: Partial<CallFlow>): CallFlow {
  const defaultFlow = getDefaultCallFlow();
  
  return {
    ...defaultFlow,
    ...customFlow,
    id: customFlow.id || `custom-${Date.now()}`,
    isDefault: false,
    isSystemFlow: false,
    steps: customFlow.steps?.length ? customFlow.steps : defaultFlow.steps,
  };
}

