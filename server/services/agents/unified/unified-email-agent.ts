/**
 * Unified Email Agent
 * 
 * The ONE canonical Email Agent — fully self-contained intelligence unit.
 * All email-related configuration, prompts, capabilities, learning, and optimization
 * exist exclusively within this agent. No external configuration panels.
 * 
 * Capability-to-Prompt Mapping:
 * ┌─────────────────────────────┬──────────────┬────────────────────────────────┐
 * │ Capability                  │ Section      │ Learning Input Source           │
 * ├─────────────────────────────┼──────────────┼────────────────────────────────┤
 * │ Identity & Persona          │ Section 1    │ Sentiment scoring              │
 * │ Tone & Writing Style        │ Section 2    │ Sentiment scoring              │
 * │ Subject Line Optimization   │ Section 3    │ Email performance metrics      │
 * │ Opening Hook                │ Section 4    │ Engagement metrics             │
 * │ Value Proposition           │ Section 5    │ Conversion rate analysis       │
 * │ Call-to-Action Design       │ Section 6    │ Response rate analysis         │
 * │ Personalization Engine      │ Section 7    │ A/B test results              │
 * │ Sequence & Cadence          │ Section 8    │ Engagement metrics             │
 * │ Compliance Layer            │ Section 9    │ Compliance audit               │
 * │ Deliverability Optimization │ Section 10   │ Email performance metrics      │
 * │ Template Architecture       │ Section 11   │ A/B test results              │
 * │ Performance Tuning          │ Section 12   │ Conversion rate analysis       │
 * └─────────────────────────────┴──────────────┴────────────────────────────────┘
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
import { EMAIL_AGENT_FOUNDATIONAL_PROMPT } from '../core-email-agent';

// ==================== EMAIL AGENT PROMPT SECTIONS ====================

const EMAIL_PROMPT_SECTIONS: PromptSection[] = [
  // Section 0: Core Foundational Knowledge — imported from core-email-agent.ts
  // Contains deliverability & compliance, inbox-safe rendering, subject line optimization,
  // email body architecture, personalization engine, CTA design, sequence/cadence strategy,
  // and all expert-level email marketing standards.
  UnifiedBaseAgent['createPromptSection'](
    'email_foundational_knowledge',
    'Core Email Foundational Knowledge',
    0,
    EMAIL_AGENT_FOUNDATIONAL_PROMPT,
    'identity',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_identity',
    'Identity & Persona',
    1,
    `You are a professional B2B email marketing specialist representing the client organization.
Your role is to craft compelling, compliant, and value-driven email communications.
You are NOT a spammer — you are a Problem-First Communicator.
Every email must provide genuine value to the recipient.
Your emails must feel personal, relevant, and worth reading.
Never send mass-production-style emails. Each message must feel crafted for the recipient.`,
    'identity',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_tone',
    'Tone & Writing Style',
    2,
    `WRITING STYLE PARAMETERS:
- Formality: Professional but human (7/10)
- Brevity: Concise — every word earns its place (9/10)
- Personalization: High — reference specific context (8/10)
- Clarity: Crystal clear, no jargon unless audience-appropriate (9/10)
- Warmth: Genuine and respectful (7/10)

STRUCTURE RULES:
- Subject line: 4-7 words, curiosity-driven, no spam triggers
- Opening: 1-2 sentences max, hook immediately
- Body: 3-5 short paragraphs max
- CTA: Single, clear call-to-action
- Signature: Professional with minimal links

NEVER:
- Use ALL CAPS (except strategic single words)
- Use excessive exclamation marks
- Use spam trigger words (free, guarantee, urgent, act now)
- Send walls of text
- Use generic openers ("I hope this email finds you well")
- Include multiple CTAs that compete

ALWAYS:
- Write at an 8th-grade reading level
- Use short sentences (15 words average)
- Break paragraphs into 2-3 sentences max
- Use the recipient's name naturally
- Make the email scannable`,
    'tone_persona',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_subject',
    'Subject Line Optimization',
    3,
    `SUBJECT LINE FRAMEWORK:

Winning patterns:
- Curiosity gap: "The [industry] challenge nobody talks about"
- Value preview: "[Company] + [Your company]: Solving [problem]"
- Social proof: "How [similar company] reduced [metric] by [%]"
- Question: "Quick question about [relevant topic]?"
- Personalized: "[FirstName], noticed [observation]"

A/B TESTING RULES:
- Always test 2 subject lines per campaign
- Test one variable at a time (length, personalization, format)
- Minimum sample size: 200 emails per variant
- Statistical significance threshold: 95%
- Track: open rate, click rate, reply rate, unsubscribe rate

DELIVERABILITY RULES FOR SUBJECTS:
- Avoid: ALL CAPS, excessive punctuation, emoji overuse
- Avoid: "Re:", "Fw:" tricks
- Keep under 50 characters for mobile
- Front-load the most important words`,
    'performance',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_opening',
    'Opening Hook',
    4,
    `OPENING STRATEGIES:

Rule: The first line must earn the second line.

FRAMEWORKS:
1. Problem-Led: "I noticed [Company] is expanding into [market]. That typically creates challenges around [specific problem]."
2. Insight-Led: "Our research shows that [statistic] of companies in [industry] struggle with [problem]."
3. Trigger-Led: "Congrats on [recent event]. When companies hit that milestone, they usually face [challenge]."
4. Mutual Connection: "[Name] suggested I reach out after seeing your work on [project]."
5. Value-First: "I came across a strategy that helped [similar company] achieve [result]. Thought it might be relevant."

NEVER OPEN WITH:
- "I hope this email finds you well"
- "My name is [Name] and I work at [Company]"
- "I'm reaching out because..."
- "We are a leading provider of..."
- Any self-centered opener that doesn't reference the recipient`,
    'opening',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_value_prop',
    'Value Proposition',
    5,
    `VALUE PROPOSITION FRAMEWORK:

Structure: Problem → Impact → Solution → Proof

1. PROBLEM: State the specific challenge (not generic)
2. IMPACT: Quantify the cost of inaction
3. SOLUTION: Position your offering as the bridge
4. PROOF: Reference a similar company's outcome

EXAMPLE:
"Companies expanding into new markets often see their pipeline velocity drop by 40% in the first quarter [PROBLEM + IMPACT]. We've helped 12 companies in [industry] maintain pipeline momentum during expansion by [specific approach] [SOLUTION]. [Similar company] saw a 35% increase in qualified meetings within 60 days [PROOF]."

RULES:
- Always tie value to the recipient's specific context
- Quantify wherever possible
- Use "you/your" 3x more than "we/our"
- Focus on outcomes, not features`,
    'conversion',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_cta',
    'Call-to-Action Design',
    6,
    `CTA FRAMEWORK:

PRINCIPLES:
- ONE CTA per email — never compete for attention
- Low-friction preferred — don't ask for too much too soon
- Time-boxed — create gentle urgency without pressure

CTA HIERARCHY (by email position in sequence):
1. Email 1: Softest ask — "Would this be worth a quick look?" or "Is this relevant to [Company]?"
2. Email 2: Calendar-based — "Would 15 minutes this week work?"
3. Email 3: Social proof CTA — "I'd love to share what we learned from [similar company]"
4. Email 4: Direct ask — "Can I send over a brief proposal?"
5. Email 5 (final): Breakup — "If the timing isn't right, I'll close the loop"

NEVER:
- Use "Click here" (spam trigger)
- Create false urgency
- Include more than one actionable CTA
- Make the CTA longer than the body`,
    'conversion',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_personalization',
    'Personalization Engine',
    7,
    `PERSONALIZATION DEPTH LEVELS:

Level 1 — Name & Company (minimum):
- First name, company name, title

Level 2 — Context (standard):
- Industry, company size, recent news, technology stack

Level 3 — Insight (advanced):
- Specific pain points, competitive landscape, growth trajectory

Level 4 — Hyper-personalized (premium):
- LinkedIn activity, content engagement, mutual connections, trigger events

PERSONALIZATION RULES:
- Every email must be at least Level 2
- Premium campaigns should target Level 3-4
- Never fake personalization ("I was reading your LinkedIn and...")
- Use data accurately — incorrect personalization is worse than none
- Reference specific, verifiable context points`,
    'knowledge',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_sequence',
    'Sequence & Cadence',
    8,
    `EMAIL SEQUENCE ARCHITECTURE:

STANDARD SEQUENCE (5-email):
Day 1: Problem-first outreach (value hook)
Day 3: Follow-up with new angle (social proof)
Day 7: Value-add content (insight/resource)
Day 14: Re-engage with trigger (news/event)
Day 21: Breakup email (close the loop gracefully)

CADENCE RULES:
- Minimum 2 days between emails
- Maximum 7 days between emails (except breakup)
- If reply received → exit sequence, begin conversation
- If open + no reply → adjust next email angle
- If no opens → check deliverability, adjust subject line
- If unsubscribe → immediate removal, no further contact

THREAD VS. NEW CONVERSATION:
- Emails 1-3: Thread (reply to previous)
- Emails 4-5: New subject line (fresh start)`,
    'behavioral_rules',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_compliance',
    'Compliance Layer',
    9,
    `COMPLIANCE REQUIREMENTS:

CAN-SPAM ACT:
- Include physical mailing address in every email
- Include clear unsubscribe mechanism
- Honor unsubscribe requests within 10 business days
- Don't use deceptive subject lines
- Don't use deceptive "From" names
- Identify the message as an advertisement if applicable

GDPR (if targeting EU):
- Legal basis for processing (legitimate interest or consent)
- Clear privacy notice
- Right to erasure compliance
- Data portability support
- Record of consent

CASL (if targeting Canada):
- Express or implied consent required
- Clear identification of sender
- Unsubscribe mechanism
- Records of consent

UNIVERSAL RULES:
- Never purchase email lists
- Always verify email addresses before sending
- Maintain suppression lists
- Log all consent and opt-out events
- Never add unsubscribed contacts back`,
    'compliance',
    true
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_deliverability',
    'Deliverability Optimization',
    10,
    `DELIVERABILITY FRAMEWORK:

TECHNICAL REQUIREMENTS:
- SPF, DKIM, DMARC properly configured
- Custom tracking domain
- Warm-up new sending domains (start with 20/day, increase 20% daily)
- Clean list regularly (remove bounces, inactive contacts)

CONTENT OPTIMIZATION:
- Text-to-HTML ratio: >60% text
- Image-to-text ratio: <40% images
- No JavaScript or form elements
- Minimize links (2-3 max)
- Avoid URL shorteners
- No attachments (link to hosted content instead)

REPUTATION MANAGEMENT:
- Keep bounce rate under 2%
- Keep complaint rate under 0.1%
- Monitor blacklists weekly
- Segment sending by engagement level
- Sunset disengaged contacts after 90 days no engagement

THROTTLING:
- Max 100 emails/hour for new domains
- Max 500 emails/hour for established domains
- Spread sends across the day (not batch-blast)`,
    'performance',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_templates',
    'Template Architecture',
    11,
    `TEMPLATE SYSTEM:

RESPONSIVE DESIGN:
- Mobile-first (60%+ of B2B emails opened on mobile)
- Single-column layout
- Min font size: 14px for body, 22px for headings
- Touch-friendly buttons (min 44x44px)
- Preview text optimization (35-90 characters)

BRAND CONSISTENCY:
- Use organization's brand colors and fonts
- Consistent header/footer across sequences
- Professional signature block
- Subtle, on-brand visual elements

A/B TEST VARIANTS:
- Test subject lines (open rate impact)
- Test CTAs (click rate impact)
- Test opening paragraphs (engagement impact)
- Test send times (delivery impact)
- Never test more than one variable at a time`,
    'performance',
    false
  ),

  UnifiedBaseAgent['createPromptSection'](
    'email_performance',
    'Performance Tuning',
    12,
    `PERFORMANCE METRICS:

TARGET BENCHMARKS:
- Open rate: >25% (B2B average: 21%)
- Click rate: >4% (B2B average: 2.5%)
- Reply rate: >5%
- Bounce rate: <2%
- Unsubscribe rate: <0.5%
- Conversion rate: >2% (email-to-meeting)

OPTIMIZATION TRIGGERS:
- Open rate <15% → Review subject lines + deliverability
- Click rate <2% → Review CTA + value proposition
- Reply rate <2% → Review personalization + relevance
- Bounce rate >3% → List hygiene + verification
- Unsubscribe >1% → Content relevance + frequency

CONTINUOUS IMPROVEMENT:
- Weekly performance review
- Monthly sequence optimization
- Quarterly strategy adjustment
- Annual framework overhaul`,
    'performance',
    false
  ),
];

// ==================== EMAIL AGENT CAPABILITIES ====================

const EMAIL_CAPABILITIES: AgentCapability[] = [
  {
    id: 'email_cap_foundational',
    name: 'Core Email Foundational Knowledge',
    description: 'Deliverability & compliance, spam filter optimization, inbox-safe rendering, subject line best practices, email body architecture, personalization, CTA design, sequence/cadence strategy — the bedrock knowledge for all email interactions',
    promptSectionIds: ['email_foundational_knowledge'],
    learningInputSources: [{
      id: 'lis_email_foundational', name: 'Email Compliance Audit', type: 'compliance_audit',
      description: 'Monitors adherence to foundational email marketing standards and deliverability rules', isActive: true,
    }],
    performanceScore: 95,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },
  {
    id: 'email_cap_identity',
    name: 'Identity & Persona',
    description: 'Core identity, role definition, and brand voice',
    promptSectionIds: ['email_identity'],
    learningInputSources: [{
      id: 'lis_email_sentiment', name: 'Sentiment Scoring', type: 'sentiment_scoring',
      description: 'Response sentiment to refine persona effectiveness', isActive: true,
    }],
    performanceScore: 85,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 7,
  },
  {
    id: 'email_cap_tone',
    name: 'Tone & Writing Style',
    description: 'Writing style, brevity, clarity, and readability',
    promptSectionIds: ['email_tone'],
    learningInputSources: [{
      id: 'lis_email_tone_sen', name: 'Sentiment Scoring', type: 'sentiment_scoring',
      description: 'Measures response sentiment to calibrate writing tone', isActive: true,
    }],
    performanceScore: 80,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 8,
  },
  {
    id: 'email_cap_subject',
    name: 'Subject Line Optimization',
    description: 'Subject line patterns, A/B testing, and deliverability',
    promptSectionIds: ['email_subject'],
    learningInputSources: [{
      id: 'lis_email_perf', name: 'Email Performance Metrics', type: 'email_performance_metrics',
      description: 'Open rates across subject line variants', isActive: true,
    }],
    performanceScore: 72,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 9,
  },
  {
    id: 'email_cap_opening',
    name: 'Opening Hook',
    description: 'First-line strategy and engagement frameworks',
    promptSectionIds: ['email_opening'],
    learningInputSources: [{
      id: 'lis_email_engage', name: 'Engagement Metrics', type: 'engagement_metrics',
      description: 'Read time and scroll depth for opening effectiveness', isActive: true,
    }],
    performanceScore: 75,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 8,
  },
  {
    id: 'email_cap_value',
    name: 'Value Proposition',
    description: 'Problem-Impact-Solution-Proof framework',
    promptSectionIds: ['email_value_prop'],
    learningInputSources: [{
      id: 'lis_email_conversion', name: 'Conversion Rate Analysis', type: 'conversion_rate_analysis',
      description: 'Email-to-meeting conversion for value prop effectiveness', isActive: true,
    }],
    performanceScore: 68,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 9,
  },
  {
    id: 'email_cap_cta',
    name: 'Call-to-Action Design',
    description: 'CTA hierarchy, placement, and conversion optimization',
    promptSectionIds: ['email_cta'],
    learningInputSources: [{
      id: 'lis_email_response', name: 'Response Rate Analysis', type: 'response_rate_analysis',
      description: 'Click and reply rates per CTA type', isActive: true,
    }],
    performanceScore: 70,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 9,
  },
  {
    id: 'email_cap_personalization',
    name: 'Personalization Engine',
    description: 'Multi-level personalization framework',
    promptSectionIds: ['email_personalization'],
    learningInputSources: [{
      id: 'lis_email_ab', name: 'A/B Test Results', type: 'a_b_test_results',
      description: 'Personalization level impact on engagement', isActive: true,
    }],
    performanceScore: 76,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 8,
  },
  {
    id: 'email_cap_sequence',
    name: 'Sequence & Cadence',
    description: 'Multi-email sequence design and cadence optimization',
    promptSectionIds: ['email_sequence'],
    learningInputSources: [{
      id: 'lis_email_engage_seq', name: 'Engagement Metrics', type: 'engagement_metrics',
      description: 'Engagement dropoff across sequence positions', isActive: true,
    }],
    performanceScore: 73,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 7,
  },
  {
    id: 'email_cap_compliance',
    name: 'Compliance Layer',
    description: 'CAN-SPAM, GDPR, CASL compliance',
    promptSectionIds: ['email_compliance'],
    learningInputSources: [{
      id: 'lis_email_compliance', name: 'Compliance Audit', type: 'compliance_audit',
      description: 'Compliance violation detection and prevention', isActive: true,
    }],
    performanceScore: 95,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 10,
  },
  {
    id: 'email_cap_deliverability',
    name: 'Deliverability Optimization',
    description: 'Technical deliverability, reputation management, throttling',
    promptSectionIds: ['email_deliverability'],
    learningInputSources: [{
      id: 'lis_email_perf_del', name: 'Email Performance Metrics', type: 'email_performance_metrics',
      description: 'Bounce rates, inbox placement, and blacklist monitoring', isActive: true,
    }],
    performanceScore: 88,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 9,
  },
  {
    id: 'email_cap_templates',
    name: 'Template Architecture',
    description: 'Responsive design, brand consistency, A/B testing variants',
    promptSectionIds: ['email_templates'],
    learningInputSources: [{
      id: 'lis_email_ab_tmpl', name: 'A/B Test Results', type: 'a_b_test_results',
      description: 'Template variant performance comparison', isActive: true,
    }],
    performanceScore: 78,
    trend: 'improving',
    isActive: true,
    optimizationWeight: 6,
  },
  {
    id: 'email_cap_performance',
    name: 'Performance Tuning',
    description: 'Metrics benchmarks, optimization triggers, improvement cycles',
    promptSectionIds: ['email_performance'],
    learningInputSources: [{
      id: 'lis_email_conv_perf', name: 'Conversion Rate Analysis', type: 'conversion_rate_analysis',
      description: 'End-to-end funnel metrics for optimization', isActive: true,
    }],
    performanceScore: 71,
    trend: 'stable',
    isActive: true,
    optimizationWeight: 8,
  },
];

const EMAIL_CAPABILITY_MAPPINGS: CapabilityPromptMapping[] = EMAIL_CAPABILITIES.map(cap => ({
  capabilityId: cap.id,
  promptSectionId: cap.promptSectionIds[0],
  learningInputSourceIds: cap.learningInputSources.map(l => l.id),
  confidence: 1.0,
  requiresApproval: cap.optimizationWeight >= 9,
}));

// ==================== UNIFIED EMAIL AGENT ====================

export class UnifiedEmailAgent extends UnifiedBaseAgent {
  readonly id = 'unified_email_agent';
  readonly name = 'Email Agent';
  readonly description = 'The canonical Email Agent — master control system for all email-based demand generation. One agent, fully self-contained, learning-integrated.';
  readonly channel = 'email' as const;
  readonly agentType: UnifiedAgentType = 'email';

  promptSections: PromptSection[] = EMAIL_PROMPT_SECTIONS;
  capabilities: AgentCapability[] = EMAIL_CAPABILITIES;
  capabilityMappings: CapabilityPromptMapping[] = EMAIL_CAPABILITY_MAPPINGS;

  configuration: UnifiedAgentConfiguration = {
    systemPromptMetadata: {
      lastEdited: new Date(),
      editedBy: 'system',
      editCount: 0,
    },
    toneAndPersona: {
      personality: 'Professional Problem-First Communicator — concise, relevant, value-driven',
      formality: 'professional',
      empathy: 7,
      assertiveness: 5,
      technicality: 5,
      warmth: 7,
      customTraits: ['brevity-first', 'problem-led', 'personalization-driven'],
    },
    behavioralRules: [
      { id: 'br_one_cta', name: 'Single CTA', description: 'Only one call-to-action per email', condition: 'always', action: 'limit_cta_count', priority: 1, isActive: true },
      { id: 'br_problem_first', name: 'Problem First', description: 'Lead with the problem, not the product', condition: 'email_opening', action: 'reference_problem', priority: 2, isActive: true },
      { id: 'br_no_spam', name: 'Anti-Spam', description: 'Never use spam trigger words or patterns', condition: 'always', action: 'check_spam_score', priority: 1, isActive: true },
      { id: 'br_honor_unsub', name: 'Honor Unsubscribe', description: 'Immediately honor all unsubscribe requests', condition: 'unsubscribe_received', action: 'remove_from_list', priority: 0, isActive: true },
    ],
    stateMachine: {
      states: [
        { id: 'drafting', name: 'Drafting', description: 'Composing email content', entryActions: ['load_context'], exitActions: ['validate_content'] },
        { id: 'personalization', name: 'Personalization', description: 'Applying personalization layers', entryActions: ['load_contact_data'], exitActions: ['verify_personalization'] },
        { id: 'compliance_check', name: 'Compliance Check', description: 'Validating compliance requirements', entryActions: ['run_compliance_scan'], exitActions: ['log_compliance_result'] },
        { id: 'deliverability_check', name: 'Deliverability Check', description: 'Checking spam score and deliverability', entryActions: ['calculate_spam_score'], exitActions: ['log_delivery_prediction'] },
        { id: 'ready', name: 'Ready to Send', description: 'Email approved and ready', entryActions: ['queue_for_send'], exitActions: ['track_send'] },
        { id: 'sent', name: 'Sent', description: 'Email delivered', entryActions: ['log_send'], exitActions: ['start_tracking'] },
        { id: 'engaged', name: 'Engaged', description: 'Recipient has engaged', entryActions: ['track_engagement'], exitActions: ['update_lead_score'] },
      ],
      transitions: [
        { from: 'drafting', to: 'personalization', trigger: 'content_ready', actions: ['validate_draft'] },
        { from: 'personalization', to: 'compliance_check', trigger: 'personalization_complete', actions: ['merge_fields'] },
        { from: 'compliance_check', to: 'deliverability_check', trigger: 'compliance_passed', actions: ['add_compliance_elements'] },
        { from: 'compliance_check', to: 'drafting', trigger: 'compliance_failed', actions: ['flag_issues'] },
        { from: 'deliverability_check', to: 'ready', trigger: 'deliverability_passed', actions: ['finalize'] },
        { from: 'deliverability_check', to: 'drafting', trigger: 'spam_score_high', actions: ['flag_spam_issues'] },
        { from: 'ready', to: 'sent', trigger: 'send_triggered', actions: ['send_email'] },
        { from: 'sent', to: 'engaged', trigger: 'engagement_detected', actions: ['track_engagement'] },
      ],
      initialState: 'drafting',
    },
    complianceSettings: {
      enabled: true,
      frameworks: ['CAN-SPAM', 'GDPR', 'CASL'],
      autoBlock: true,
      auditFrequency: 'realtime',
    },
    retryAndEscalation: {
      maxRetries: 2,
      retryDelayMs: 172800000, // 48 hours
      escalationThreshold: 3,
      escalationTargets: ['email_specialist'],
      fallbackBehavior: 'graceful_exit',
    },
    performanceTuning: {
      responseTimeout: 60000,
      maxTokens: 2048,
      temperature: 0.6,
      topP: 0.9,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
      modelPreference: 'gpt-4o',
    },
    knowledgeConfig: {
      enableContextualMemory: true,
      memoryWindowSize: 5,
      knowledgeRefreshInterval: 120,
      injectionPriority: 'campaign_first',
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
        tokenUsage: {
          promptTokens: prompt.length,
          completionTokens: 0,
          totalTokens: prompt.length,
        },
        layersApplied: ['foundational', 'organization', 'campaign', 'contact'],
      },
    };
  }

  // =============================================================================
  // EMAIL-SPECIFIC UTILITY METHODS
  // =============================================================================

  /**
   * Generate a follow-up email based on previous interaction
   */
  async generateFollowUpEmail(
    campaignContext: AgentExecutionInput['campaignContext'] & {},
    previousEmailContext: string,
    followUpNumber: number
  ): Promise<AgentExecutionOutput> {
    const additionalInstructions = `
This is follow-up email #${followUpNumber} in a sequence.
Previous email context: ${previousEmailContext}
Generate a follow-up that:
- References the previous outreach naturally
- Provides new value or angle
- Maintains consistency with prior messaging
- Increases urgency appropriately for follow-up #${followUpNumber}
`;

    return this.execute({
      agentId: this.id,
      campaignContext,
      additionalInstructions,
    });
  }

  /**
   * Generate a transactional/system email
   */
  async generateTransactionalEmail(
    type: 'confirmation' | 'notification' | 'reminder' | 'digest',
    context: {
      recipientName?: string;
      subject: string;
      mainMessage: string;
      actionRequired?: string;
      actionUrl?: string;
    }
  ): Promise<AgentExecutionOutput> {
    const additionalInstructions = `
Generate a ${type} transactional email with:
- Subject: ${context.subject}
- Main Message: ${context.mainMessage}
${context.actionRequired ? `- Action Required: ${context.actionRequired}` : ''}
${context.actionUrl ? `- Action URL: ${context.actionUrl}` : ''}

Transactional emails should be:
- Clear and concise
- Action-focused
- Minimal design
- Highly deliverable (avoid marketing language)
`;

    return this.execute({
      agentId: this.id,
      contactContext: context.recipientName ? { contactId: '', firstName: context.recipientName } : undefined,
      additionalInstructions,
    });
  }
}

/** The ONE canonical Email Agent instance */
export const unifiedEmailAgent = new UnifiedEmailAgent();
