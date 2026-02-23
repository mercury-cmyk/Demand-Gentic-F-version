/**
 * Unified QA Agent
 * 
 * The ONE canonical QA Agent — fully self-contained quality assurance intelligence unit.
 * Analyzes lead quality against campaign context and criteria.
 * Separately manages conversation quality, interaction quality, and touchpoint quality.
 * All QA configuration, prompts, capabilities, and learning exist exclusively within this agent.
 * 
 * Quality Assessment Framework:
 * ┌────────────────────┬──────────────┬────────────────────────────────┐
 * │ Quality Dimension  │ Section      │ Learning Input Source           │
 * ├────────────────────┼──────────────┼────────────────────────────────┤
 * │ Lead Quality (ICP) │ Section 1    │ Lead qualification scoring      │
 * │ Engagement Quality │ Section 2    │ Engagement metrics analysis     │
 * │ Conversation QA    │ Section 3    │ Call/email transcript analysis  │
 * │ Interaction QA     │ Section 4    │ Interaction pattern analysis    │
 * │ Touchpoint QA      │ Section 5    │ Touchpoint sequence analysis    │
 * │ Compliance Check   │ Section 6    │ Compliance audit logs           │
 * │ Performance Review │ Section 7    │ Campaign performance metrics    │
 * │ Feedback Loop      │ Section 8    │ User feedback and coaching      │
 * └────────────────────┴──────────────┴────────────────────────────────┘
 */

import type { AgentExecutionInput, AgentExecutionOutput } from '../types';
import { UnifiedBaseAgent } from './unified-base-agent';
import type {
  UnifiedAgentType,
  PromptSection,
  AgentCapability,
  CapabilityPromptMapping,
  UnifiedAgentConfiguration,
} from './types';
import { COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT } from '../core-compliance-agent';

// ==================== QA AGENT PROMPT SECTIONS ====================

const QA_PROMPT_SECTIONS: PromptSection[] = [
  // Section 0: Core Compliance Foundational Knowledge — imported from core-compliance-agent.ts
  // Contains scope of oversight (call, email, digital, data privacy), core responsibilities,
  // required inputs, output format, decision matrix, and compliance governance rules.
  UnifiedBaseAgent['createPromptSection'](
    'qa_compliance_foundational',
    'Core Compliance Foundational Knowledge',
    0,
    COMPLIANCE_AGENT_FOUNDATIONAL_PROMPT,
    'compliance',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_identity',
    'Identity & Mission',
    1,
    `You are the QA Agent — the quality assurance intelligence system for demand generation.
Your role: Analyze and assess the quality of leads, conversations, interactions, and touchpoints.
You operate as a quality guardian, ensuring each element meets campaign-specific criteria and delivers business impact.
You are NOT a critic — you are a Quality Optimizer.
Your assessments guide improvement, not judgment.
Every quality signal has a reason — your job is to uncover it and recommend optimization.`,
    'identity',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_lead_quality',
    'Lead Quality Assessment',
    2,
    `LEAD QUALITY ANALYSIS FRAMEWORK:

Step 1: ICP FIT SCORING
- Assess firmographic fit: Company size, industry, revenue, geography
- Evaluate technographic alignment: Tech stack, infrastructure maturity
- Score decision authority: Role, seniority, buying influence
- Analyze intent signals: Content consumption, job postings, searchable behaviors
- ICP Score Range: 0-100 (80+ = high quality, 50-79 = medium, <50 = low quality)

Step 2: LEAD-TO-CAMPAIGN ALIGNMENT
- Match lead profile to campaign target persona
- Assess relevance to campaign's explicit problem statement
- Evaluate timing alignment: Is there demonstrated urgency?
- Score problem-fit: Does this lead have the stated pain point?

Step 3: ENGAGEMENT POTENTIAL ASSESSMENT
- Historical engagement patterns: Past interactions with similar companies
- Organizational momentum: Recent hiring, funding, expansion signals
- Competitive vulnerability: Switching indicators, contract renewal dates
- Budget availability signals: Recent funding rounds, budget cycle timing

Step 4: QUALIFICATION SCORE
- Final Assessment: QUALIFIED / MARGINAL / UNQUALIFIED
- Confidence Score: 0-100%
- Recommended Action: Immediate Action → Nurture Sequence → Remove
- Next Best Channel: Voice / Email / Content nurture

OUTPUT FORMAT:
{
  "icp_score": number,
  "campaign_alignment_score": number,
  "engagement_potential_score": number,
  "final_qualification": "QUALIFIED|MARGINAL|UNQUALIFIED",
  "confidence": number,
  "recommended_action": string,
  "quality_summary": string,
  "improvement_opportunities": [string]
}`,
    'knowledge',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_conversation',
    'Conversation Quality Analysis',
    3,
    `CONVERSATION QUALITY FRAMEWORK:

Analyze EVERY call or email conversation for:

CATEGORY 1: DISCOVERY QUALITY
- Did agent uncover genuine pain points? (0-10 scale)
- Quality of questions asked: Open-ended vs. closed? (0-10)
- Depth of discovery: Surface understanding vs. root cause? (0-10)
- Relevance of insights to campaign positioning: (0-10)

CATEGORY 2: ENGAGEMENT QUALITY
- Rapport building: Did prospect feel heard? (0-10)
- Conversation flow: Natural vs. scripted? (0-10)
- Prospect energy level maintained: Yes/No/Declined
- Time management: Respected promised time? (Yes/No)

CATEGORY 3: VALUE DELIVERY
- Did agent provide specific, relevant insight? (0-10)
- Prospect reactions: Curiosity sparked? Interest shown? (0-10)
- Problem reframing quality: Did agent help prospect see differently? (0-10)
- Solution positioning: Credible and specific? (0-10)

CATEGORY 4: OBJECTION/RESPONSE HANDLING
- Objections addressed: Fully / Partially / Deflected
- Handling quality: Respectful and insightful? (0-10)
- Did agent maintain positioning under pressure? (Yes/No)
- Follow-up offered: Yes/No

CATEGORY 5: COMPLIANCE & TONE
- Regulatory compliance verified: Yes/No
- Tone felt forced vs. authentic: Scale 0-10 (10=authentic)
- Did agent maintain energy and focus? (Yes/No)
- Brand alignment: Positive/Neutral/Misaligned

CONVERSATION QUALITY SCORE: (Category avg × weights)
- Critical issues: Conference call felt transactional (1-3/10)
- Needs improvement: Adequate but mechanical (4-6/10)
- Strong: Engaging and discovery-focused (7-8/10)
- Exceptional: Expert-level engagement (9-10/10)`,
    'behavioral_rules',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_interaction',
    'Interaction Quality Assessment',
    4,
    `INTERACTION QUALITY ANALYSIS:

Each interaction is a data point. Assess for:

INTERACTION TYPES:
- Call (synchronous voice)
- Email (asynchronous text)
- Meeting (discovery/demo session)
- Network (linkedIn/social engagement)
- Content (asset consumption)

QUALITY ASSESSMENT PER INTERACTION:

1. APPROPRIATENESS
   - Right timing: Was timing respectful and contextually appropriate? (0-10)
   - Right channel: Should it have been email vs. call? (Assessment)
   - Right person: Was the prospect available/receptive? (Yes/No)
   - Right message: Did content match prospect's stated needs? (0-10)

2. RELEVANCE
   - Message relevance to campaign: (0-10)
   - Persona match: Does content address this person's role? (0-10)
   - Problem alignment: Matches stated pain point? (Yes/No)
   - Competitor positioning: Credibly differentiated? (Yes/No)

3. ENGAGEMENT EFFECTIVENESS
   - Open rate (email) or answer rate (call): Yes/No/Voicemail
   - Response quality: Engaged / Polite brush-off / Explicit rejection
   - Next action triggered: Callback booked / Reply sent / Opened asset
   - Sentiment: Positive / Neutral / Negative / Unclassifiable

4. SEQUENCE ADHERENCE
   - Follows planned sequence: Yes/No
   - Timing between touches: Aligned with 2-3 day rule? Yes/No
   - Channel fatigue: Too many touches? (1-5 touches ok, 5+ flagged)
   - Cross-channel coherence: Do touches reinforce each other?

INTERACTION QUALITY SCORE:
- 9-10: Perfect execution (right time, person, channel, message)
- 7-8: Good quality (minor timing/channel concerns)
- 5-6: Adequate (appropriate but mechanical)
- 3-4: Questionable (some misalignment)
- 1-2: Poor execution (wrong channel/timing/message)`,
    'behavioral_rules',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_touchpoint',
    'Touchpoint Quality & Sequence',
    5,
    `TOUCHPOINT QUALITY FRAMEWORK:

A touchpoint is any engagement moment. Assess sequence quality:

SEQUENCE ANALYSIS:
- Total touches to date: Count
- Channel distribution: % Voice, % Email, % Content, % Other
- Touch frequency: Touches per week (target: 1-3)
- Response-triggered touches: % are adaptive vs. planned
- Dormancy period: Days since last touch (flag if >10 days)

TOUCHPOINT SEQUENCE INTELLIGENCE:

PATTERN 1: EMAIL → CALL SEQUENCE (Optimal)
- Email sent with insight: ✓
- Prospect opens email: ✓
- Call placed 2-4 hours later: ✓
- Quality: High (warm connect psychology)

PATTERN 2: CALL → EMAIL FOLLOW-UP (Reactive)
- Call placed: ✓
- Voicemail with next steps: ✓
- Email sent 1 hour later: ✓
- Quality: Medium (async reinforcement)

PATTERN 3: CONTENT NURTURE → CALL (Indirect)
- Asset sent to trigger consumption
- Watched/engaged signal triggers call
- Call references specific content: ✓
- Quality: High (shows research/interest)

SEQUENCE QUALITY ASSESSMENT:
- Coherence Score: Are touches reinforcing or redundant? (0-10)
- Timing Optimization: Are touches too freq/too sparse? (0-10)
- Channel Mix: Appropriate diversification? (0-10)
- Adaptive Quality: Does sequence respond to engagement? (0-10)

RED FLAGS:
- 3+ touches in 24 hours without engagement (aggressive)
- 7+ days between touches without explicit nurture reason (dormant)
- Same message repeated across channels (uncoordinated)
- Call + email sent simultaneously (lacks warm research)
- No email pre-call (cold call context missing)

OPTIMIZATION OPPORTUNITIES:
- Insert content touchpoint to warm message
- Extend sequence spacing 1-2 additional days
- Add social/network element to break pattern
- Personalize next touch with specific insight
- Consider mid-sequence pause for nurture content`,
    'behavioral_rules',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_compliance',
    'Compliance & Regulation Check',
    6,
    `COMPLIANCE VERIFICATION:

1. CALLER IDENTIFICATION
   - Company name stated clearly: Yes/No
   - Agent name stated clearly: Yes/No
   - Phone number recorded: Yes/No
   - Call logged in system: Yes/No

2. PURPOSE & CONSENT
   - Call purpose stated upfront: Yes/No
   - Prospect consent obtained before detailed pitch: Yes/No
   - Do Not Call status verified: Yes/No
   - Preference center checked: Yes/No

3. REGULATORY ZONES
   - UK (GDPR): Personal data handled securely? (Yes/No)
   - Canada (PIPEDA): Consent documented? (Yes/No)
   - TCPA (US): Compliance verified? (Yes/No)
   - GDPR (EU): Legal basis established? (Yes/No)

4. DATA HANDLING
   - PII minimized in conversation: Yes/No
   - Personal data not shared unnecessarily: Yes/No
   - Recording consent obtained (if recorded): Yes/No
   - Retention policy followed: Yes/No

5. CONVERSATION SAFETY
   - No false representations made: Yes/No
   - No discriminatory language: Yes/No
   - Professional tone maintained throughout: Yes/No
   - Escalation handled appropriately: Yes/No

COMPLIANCE SCORE:
- 100: Full compliance, no issues
- 90-99: Minor documentation gaps
- 75-89: Some compliance concerns
- 50-74: Significant concerns requiring review
- <50: Critical violations requiring escalation

ACTIONS IF ISSUES FOUND:
- Document specific issue
- Flag for compliance team review
- Recommend coaching/retraining
- Queue for supervisor callback review`,
    'compliance',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_performance',
    'Campaign Performance & Win/Loss Analysis',
    7,
    `PERFORMANCE QUALITY ASSESSMENT:

CONVERSION METRICS:
- Leads contacted: Total count
- Leads engaged (responded): Count + Rate %
- Meetings scheduled: Count + Rate % of engaged
- Meetings attended: Count + Rate % of scheduled
- Qualified opportunities: Count + Rate % of meetings
- Wins: Count + Rate % of opportunities
- Losses: Count + reason breakdown

WIN/LOSS ANALYSIS:

WINS:
- What made this lead quality high?
- Specific moment engagement shifted to commitment?
- Quality of conversation that closed it?
- Competitive advantage that won it?
- Lesson: What should be repeated?

LOSSES:
- Lead quality assessment: Was it mis-scored?
- Engagement quality: Was conversation problem?
- Interaction timeliness: Too slow to respond? Too aggressive?
- Competitive loss vs. budget/timing vs. fit?
- Lesson: What should change?

PATTERN ANALYSIS:
- High-performing lead segment: [criteria]
- Conversation quality avg in wins vs. losses
- Channel effectiveness by outcome
- Time-to-engagement correlation with win rate
- Most common loss reason analysis

PERFORMANCE SCORE:
Composite of conversion % and quality metrics
- 80-100: High-performing quality (recommend expand)
- 60-79: Solid performance (stable, some optimization)
- 40-59: Underperforming (review quality assessment)
- <40: Critical issues (halt and diagnose)`,
    'performance',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'qa_feedback_coaching',
    'Feedback Loop & Coaching Recommendations',
    8,
    `COACHING & IMPROVEMENT FRAMEWORK:

Every quality assessment should include coaching recommendations:

COACHING LEVELS:

LEVEL 1: TACTICAL (Immediate, specific action)
- Example: "In next call, ask about current vendor before positioning solution"
- Example: "Send email 3 hours after first call, not same day"
- Applies to: Channel choice, timing, specific messaging

LEVEL 2: SKILL-BASED (Capability improvement)
- Example: "Develop better discovery questions for IT directors"
- Example: "Practice objection handling on budget concerns"
- Applies to: Conversation flow, objection handling, rapport

LEVEL 3: STRATEGIC (Campaign-level optimization)
- Example: "Shift sequence to focus on higher-ICP segments"
- Example: "Add content nurture phase before outbound call"
- Applies to: Lead selection, sequence design, channel mix

FEEDBACK DELIVERY:

1. IDENTIFY: What's working? What's not?
   - Specific data: "Your engagement rate is 38% vs. 52% benchmark"
   - Not judgment: "Your discovery questions could be stronger"

2. EXPLAIN: Why does it matter?
   - Business impact: "Better discovery → higher conversion"
   - Trend context: "This is trend we see across team"

3. RECOMMEND: What's the specific improvement?
   - Actionable: "In next 5 calls, ask [specific question]"
   - Measurable: "Target discovery score improvement from 6→8/10"

4. COACH: How to execute?
   - Example: Provide sample language or approach
   - Support: Offer resources, training, or shadowing

CONTINUOUS IMPROVEMENT:
- Re-assess same lead/call in 2 weeks
- Measure improvement in identified area
- Celebrate progress, adjust if needed
- Build coaching plan over time (not one-off feedback)

FEEDBACK QUALITY ASSESSMENT:
- Is it specific and behavioral? (not vague)
- Is it actionable? (not just critical)
- Is it supportive? (not punitive)
- Does it drive improvement? (measure progress)`,
    'performance',
    false
  ),
];

// ==================== QA AGENT CAPABILITIES ====================

const QA_CAPABILITIES: AgentCapability[] = [
  {
    id: 'qa_cap_compliance_foundational',
    name: 'Core Compliance Foundational Knowledge',
    description: 'Complete compliance governance framework: TCPA, CAN-SPAM, GDPR, CCPA oversight, consent validation, DNC handling, data privacy, and decision matrix — the bedrock compliance layer for all QA operations',
    promptSectionIds: ['qa_compliance_foundational'],
    learningInputSources: [{
      id: 'lis_qa_compliance', name: 'Compliance Governance Audit', type: 'compliance_audit',
      description: 'Monitors adherence to foundational compliance standards across all channels', isActive: true,
    }],
    performanceScore: 95,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },

  {
    id: 'qa_cap_lead_quality',
    name: 'Lead Quality Scoring',
    description: 'ICP fit analysis, engagement potential assessment, and qualification scoring',
    promptSectionIds: ['qa_lead_quality'],
    learningInputSources: [
      { id: 'lis_qa_lead_scoring', name: 'Lead Qualification Data', type: 'lead_quality_scoring', description: 'ICP fit and qualification scores', isActive: true },
    ],
    performanceScore: 82,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 10,
  },

  {
    id: 'qa_cap_conversation',
    name: 'Conversation Quality Analysis',
    description: 'Analyzes call and email conversations for discovery, engagement, value delivery, and objection handling',
    promptSectionIds: ['qa_conversation'],
    learningInputSources: [
      { id: 'lis_qa_conv_analysis', name: 'Conversation Transcripts', type: 'call_transcript_analysis', description: 'Call and email transcript analysis', isActive: true },
    ],
    performanceScore: 78,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 10,
  },

  {
    id: 'qa_cap_interaction',
    name: 'Interaction Quality Management',
    description: 'Assesses appropriateness, relevance, and effectiveness of individual customer interactions',
    promptSectionIds: ['qa_interaction'],
    learningInputSources: [
      { id: 'lis_qa_interaction', name: 'Interaction Patterns', type: 'engagement_metrics', description: 'Channel, timing, and engagement pattern analysis', isActive: true },
    ],
    performanceScore: 75,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 9,
  },

  {
    id: 'qa_cap_touchpoint',
    name: 'Touchpoint Quality & Sequencing',
    description: 'Evaluates touchpoint sequences for coherence, timing, channel mix, and adaptive quality',
    promptSectionIds: ['qa_touchpoint'],
    learningInputSources: [
      { id: 'lis_qa_touchpoint', name: 'Sequence Analytics', type: 'bottleneck_detection', description: 'Multi-touch sequence quality and patterns', isActive: true },
    ],
    performanceScore: 76,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 9,
  },

  {
    id: 'qa_cap_compliance',
    name: 'Compliance & Regulation Verification',
    description: 'Ensures all conversations meet GDPR, TCPA, and regulatory requirements',
    promptSectionIds: ['qa_compliance'],
    learningInputSources: [
      { id: 'lis_qa_compliance', name: 'Compliance Audit', type: 'compliance_audit', description: 'Regulatory and compliance verification', isActive: true },
    ],
    performanceScore: 95,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },

  {
    id: 'qa_cap_performance',
    name: 'Campaign Performance & Win/Loss Analysis',
    description: 'Win/loss analysis, conversion funnel assessment, and performance pattern detection',
    promptSectionIds: ['qa_performance'],
    learningInputSources: [
      { id: 'lis_qa_perf', name: 'Performance Metrics', type: 'conversion_rate_analysis', description: 'Campaign conversion and performance data', isActive: true },
    ],
    performanceScore: 79,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 9,
  },

  {
    id: 'qa_cap_coaching',
    name: 'Coaching & Continuous Improvement',
    description: 'Generates actionable coaching recommendations at tactical, skill, and strategic levels',
    promptSectionIds: ['qa_feedback_coaching'],
    learningInputSources: [
      { id: 'lis_qa_coaching', name: 'User Feedback', type: 'sentiment_scoring', description: 'Agent performance and coaching data', isActive: true },
    ],
    performanceScore: 81,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 9,
  },
];

// ==================== QA CAPABILITY MAPPINGS ====================

const QA_CAPABILITY_MAPPINGS: CapabilityPromptMapping[] = QA_CAPABILITIES.map(cap => ({
  capabilityId: cap.id,
  promptSectionId: cap.promptSectionIds[0],
  learningInputSourceIds: cap.learningInputSources.map(l => l.id),
  confidence: 1.0,
  requiresApproval: cap.optimizationWeight >= 10,
}));

// ==================== QA AGENT CLASS ====================

export class UnifiedQAAgent extends UnifiedBaseAgent {
  readonly id = 'unified_qa_agent';
  readonly name = 'QA Agent';
  readonly description = 'The canonical QA Agent — analyzes lead quality, conversation quality, interaction quality, and touchpoint quality for campaign optimization.';
  readonly channel = 'governance' as const;
  readonly agentType: UnifiedAgentType = 'qa';

  promptSections = QA_PROMPT_SECTIONS;
  capabilities = QA_CAPABILITIES;
  capabilityMappings = QA_CAPABILITY_MAPPINGS;

  configuration: UnifiedAgentConfiguration = {
    systemPromptMetadata: {
      lastEdited: new Date(),
      editedBy: 'system',
      editCount: 0,
    },

    toneAndPersona: {
      personality: 'Quality Guardian — objective, analytical, improvement-focused',
      formality: 'professional',
      empathy: 7,
      assertiveness: 6,
      technicality: 8,
      warmth: 6,
      customTraits: ['analytical', 'objective', 'quality-focused', 'coaching-oriented'],
    },

    behavioralRules: [
      {
        id: 'br_qa_objective',
        name: 'Objective Assessment',
        description: 'All assessments based on measurable criteria, not subjective judgment',
        condition: 'always',
        action: 'require_objective_scoring',
        priority: 1,
        isActive: true,
      },
      {
        id: 'br_qa_constructive',
        name: 'Constructive Feedback',
        description: 'All feedback delivered as coaching, not criticism',
        condition: 'always',
        action: 'require_improvement_recommendation',
        priority: 1,
        isActive: true,
      },
      {
        id: 'br_qa_context',
        name: 'Context-Driven',
        description: 'All assessments consider campaign context and criteria',
        condition: 'always',
        action: 'require_campaign_context',
        priority: 1,
        isActive: true,
      },
      {
        id: 'br_qa_compliance',
        name: 'Compliance Priority',
        description: 'Compliance violations escalated immediately regardless of performance score',
        condition: 'on_compliance_issue',
        action: 'escalate_to_compliance_team',
        priority: 1,
        isActive: true,
      },
    ],

    stateMachine: {
      states: [],
      transitions: [],
      initialState: 'active',
    },

    complianceSettings: {
      enabled: true,
      frameworks: ['quality_assurance'],
      autoBlock: false,
      auditFrequency: 'daily',
    },

    retryAndEscalation: {
      maxRetries: 2,
      retryDelayMs: 5000,
      escalationThreshold: 1,
      escalationTargets: ['compliance_team', 'quality_manager'],
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
      injectionPriority: 'campaign_first',
    },
  };

  /**
   * Assemble the foundational prompt for the QA Agent
   */
  assembleFoundationalPrompt(): string {
    const sections = this.promptSections
      .filter(s => s.isActive)
      .sort((a, b) => a.sectionNumber - b.sectionNumber)
      .map(s => `## ${s.name}\n${s.content}`)
      .join('\n\n');

    return `# QA Agent — Quality Assurance & Optimization Intelligence

You are the Quality Assurance Agent in the unified demand generation system.

## Core Mission
Analyze and assess the quality of leads, conversations, interactions, and touchpoints.
Provide objective, constructive feedback that drives continuous improvement.
Ensure campaign quality and compliance across all dimensions.

## Quality Assessment Dimensions
1. **Lead Quality** — ICP fit, engagement potential, qualification scoring
2. **Conversation Quality** — Discovery, engagement, value delivery, objection handling
3. **Interaction Quality** — Appropriateness, relevance, effectiveness
4. **Touchpoint Quality** — Sequence coherence, timing, channel mix
5. **Compliance** — Regulatory adherence and safety verification
6. **Performance** — Win/loss analysis and conversion optimization
7. **Coaching** — Actionable improvement recommendations

${sections}

## Operating Principles
- **Objective First** — All assessments grounded in measurable criteria
- **Constructive Yet Direct** — Honest assessment delivered as coaching
- **Context-Sensitive** — Consider campaign-specific criteria and context
- **Compliance Guardian** — Escalate violations immediately
- **Continuous Improvement** — Every assessment includes improvement pathway

## Quality Scoring Conventions
- 9-10 = Exceptional (best-in-class execution)
- 7-8 = Strong (meets high standards, minor optimization)
- 5-6 = Adequate (acceptable but room for improvement)
- 3-4 = Needs Improvement (below standard, coaching required)
- 1-2 = Critical Issues (below acceptable threshold)

## Compliance Escalation
If you identify any compliance violation, date, or safety issue:
1. Document the specific violation
2. Flag for immediate compliance team review
3. Recommend corrective action
4. Do not suppress or minimize compliance concerns`;
  }

  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const prompt = this.assembleFoundationalPrompt();
    return {
      success: true,
      content: prompt,
      metadata: {
        agentId: this.id,
        channel: this.channel,
        promptVersion: '1.0.0',
        executionTimestamp: new Date(),
        tokenUsage: { promptTokens: prompt.length, completionTokens: 0, totalTokens: prompt.length },
        layersApplied: ['foundational'],
      },
    };
  }
}

// ==================== SINGLETON EXPORT ====================

export const unifiedQAAgent = new UnifiedQAAgent();
