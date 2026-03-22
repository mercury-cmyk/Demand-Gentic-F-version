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
- ICP Score Range: 0-100 (80+ = high quality, 50-79 = medium, 10 days)

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
-  ({
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
      modelPreference: 'gemini-2.5-flash-native-audio-latest',
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

  async execute(input: AgentExecutionInput): Promise {
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