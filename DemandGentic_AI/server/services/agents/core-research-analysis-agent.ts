/**
 * Core Research & Analysis Agent
 *
 * Foundational intelligence layer for all quality control, scoring,
 * and analysis operations across the platform.
 *
 * This agent provides:
 * - Lead Quality Control
 * - Email Quality Control
 * - Call Quality Control
 * - Communication Quality Control
 * - Engagement Analysis
 * - Account Health Scoring
 * - Next-Best-Action Recommendations
 */

import OpenAI from 'openai';
import { BaseAgent } from './base-agent';
import {
  RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT,
  RESEARCH_ANALYSIS_KNOWLEDGE_SECTIONS,
} from './prompts/research-analysis-prompt';
import type {
  AgentKnowledgeSection,
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentChannel,
  AnalysisType,
  AnalysisOutput,
  AnalysisScores,
  AnalysisFinding,
  AnalysisRecommendation,
  AnalysisEvidence,
  AnalysisMetadata,
  LeadAnalysisOptions,
  LeadQualityResult,
  EmailContent,
  EmailAnalysisOptions,
  EmailQualityResult,
  CallAnalysisOptions,
  CallQualityResult,
  EngagementAnalysisOptions,
  EngagementAnalysisResult,
  AccountScoringOptions,
  AccountHealthScore,
  NextBestActionContext,
  NextBestActionRecommendations,
  NextBestAction,
  CommunicationAnalysisOptions,
  CommunicationQualityResult,
  ScoreTier,
  ScoringModelConfiguration,
} from './types';
import { db } from '../../db';
import {
  leads,
  contacts,
  accounts,
  campaigns,
  callSessions,
  dialerCallAttempts,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

// ==================== AI CLIENT ====================

let aiClient: OpenAI | null = null;

function getAIClient(): OpenAI {
  if (!aiClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No AI API key configured (DEEPSEEK_API_KEY or OPENAI_API_KEY)');
    }

    if (process.env.DEEPSEEK_API_KEY) {
      aiClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      });
    } else {
      aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }
  return aiClient;
}

// ==================== HELPER FUNCTIONS ====================

function clampScore(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function determineScoreTier(score: number): ScoreTier {
  if (score >= 90) return 'exceptional';
  if (score >= 70) return 'good';
  if (score >= 50) return 'acceptable';
  if (score >= 30) return 'below_standard';
  return 'critical';
}

function ensureArray(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function parseJSONResponse(content: string): T {
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  return JSON.parse(jsonStr.trim());
}

// ==================== DEFAULT SCORING CONFIGURATION ====================

const DEFAULT_SCORING_CONFIG: ScoringModelConfiguration = {
  weights: {
    icpFit: 0.3,
    dataAccuracy: 0.2,
    compliance: 0.2,
    relevance: 0.3,
  },
  thresholds: {
    exceptional: 90,
    good: 70,
    acceptable: 50,
    below_standard: 30,
  },
  normalization: 'linear',
};

// ==================== CORE RESEARCH ANALYSIS AGENT CLASS ====================

export class CoreResearchAnalysisAgent extends BaseAgent {
  readonly id = 'core_research_analysis_agent';
  readonly name = 'Core Research & Analysis Agent';
  readonly description = 'Single source of truth for all quality control, scoring, and analysis operations';
  readonly channel: AgentChannel = 'research';

  private scoringConfigs: Map = new Map();

  constructor() {
    super();
    this.scoringConfigs.set('default', DEFAULT_SCORING_CONFIG);
  }

  getFoundationalPrompt(): string {
    return RESEARCH_ANALYSIS_FOUNDATIONAL_PROMPT;
  }

  getKnowledgeSections(): AgentKnowledgeSection[] {
    return RESEARCH_ANALYSIS_KNOWLEDGE_SECTIONS;
  }

  /**
   * Execute the research agent (builds complete prompt)
   */
  async execute(input: AgentExecutionInput): Promise {
    const layersApplied: string[] = ['foundational_prompt'];

    try {
      const systemPrompt = await this.buildCompletePrompt(input);

      for (const section of this.getKnowledgeSections()) {
        layersApplied.push(section.id);
      }
      if (input.organizationIntelligence) layersApplied.push('organization_intelligence');
      if (input.problemIntelligence) layersApplied.push('problem_intelligence');
      if (input.campaignContext) layersApplied.push('campaign_context');
      if (input.contactContext) layersApplied.push('contact_context');

      return {
        success: true,
        content: systemPrompt,
        metadata: this.buildMetadata(layersApplied),
      };
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Execution error:', error);
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error during research prompt assembly',
        metadata: this.buildMetadata(layersApplied),
      };
    }
  }

  // ==================== LEAD QUALITY ANALYSIS ====================

  /**
   * Analyze lead quality for ICP fit, data accuracy, compliance, and relevance
   */
  async analyzeLeadQuality(
    leadId: string,
    options?: LeadAnalysisOptions
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      // Fetch lead data with related contact and account
      const [leadData] = await db
        .select({
          lead: leads,
          contact: contacts,
          account: accounts,
        })
        .from(leads)
        .leftJoin(contacts, eq(leads.contactId, contacts.id))
        .leftJoin(accounts, eq(contacts.accountId, accounts.id))
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!leadData) {
        return this.buildErrorResult(
          'lead_quality',
          `Lead not found: ${leadId}`,
          startTime
        );
      }

      // Fetch campaign context if provided
      let campaignData = null;
      if (options?.campaignId) {
        [campaignData] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, options.campaignId))
          .limit(1);
      }

      // Build analysis prompt
      const analysisPrompt = this.buildLeadAnalysisPrompt(leadData, campaignData, options);

      // Call AI for analysis
      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.buildErrorResult(
          'lead_quality',
          'AI returned empty response',
          startTime
        );
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeLeadQualityResult(rawResult, startTime, model);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Lead analysis error:', error);
      return this.buildErrorResult(
        'lead_quality',
        error.message,
        startTime
      );
    }
  }

  private buildLeadAnalysisPrompt(
    leadData: any,
    campaignData: any,
    options?: LeadAnalysisOptions
  ): string {
    const lines: string[] = [
      '## Lead Quality Analysis Request',
      '',
      '### Lead Information:',
    ];

    if (leadData.contact) {
      lines.push(`- Name: ${leadData.contact.fullName || 'Unknown'}`);
      lines.push(`- Title: ${leadData.contact.jobTitle || 'Unknown'}`);
      lines.push(`- Email: ${leadData.contact.email || 'Unknown'}`);
      lines.push(`- Phone: ${leadData.contact.directPhone || 'Unknown'}`);
      lines.push(`- Seniority: ${leadData.contact.seniorityLevel || 'Unknown'}`);
      lines.push(`- Department: ${leadData.contact.department || 'Unknown'}`);
    }

    if (leadData.account) {
      lines.push('', '### Account Information:');
      lines.push(`- Company: ${leadData.account.name || 'Unknown'}`);
      lines.push(`- Industry: ${leadData.account.industryStandardized || 'Unknown'}`);
      lines.push(`- Employee Count: ${leadData.account.staffCount || 'Unknown'}`);
      lines.push(`- Revenue: ${leadData.account.annualRevenue || 'Unknown'}`);
      lines.push(`- Location: ${leadData.account.hqCity}, ${leadData.account.hqState}, ${leadData.account.hqCountry}`);
    }

    if (campaignData) {
      lines.push('', '### Campaign Context:');
      lines.push(`- Campaign: ${campaignData.name}`);
      lines.push(`- Objective: ${campaignData.campaignObjective || 'N/A'}`);
      lines.push(`- Target Audience: ${campaignData.targetAudienceDescription || 'N/A'}`);
    }

    if (options?.icpCriteria) {
      lines.push('', '### ICP Criteria:');
      if (options.icpCriteria.industries?.length) {
        lines.push(`- Target Industries: ${options.icpCriteria.industries.join(', ')}`);
      }
      if (options.icpCriteria.jobTitles?.length) {
        lines.push(`- Target Titles: ${options.icpCriteria.jobTitles.join(', ')}`);
      }
      if (options.icpCriteria.seniorityLevels?.length) {
        lines.push(`- Target Seniority: ${options.icpCriteria.seniorityLevels.join(', ')}`);
      }
      if (options.icpCriteria.companySizeRange) {
        lines.push(`- Company Size Range: ${options.icpCriteria.companySizeRange[0]} - ${options.icpCriteria.companySizeRange[1]}`);
      }
    }

    lines.push('', '### Analysis Required:');
    lines.push('Analyze this lead for:');
    lines.push('1. ICP Fit Score (0-100)');
    lines.push('2. Data Accuracy Score (0-100)');
    lines.push('3. Compliance Score (0-100)');
    lines.push('4. Relevance Score (0-100)');
    lines.push('5. Overall Quality Score (weighted average)');
    lines.push('6. Qualification Status (qualified, not_qualified, needs_review)');
    lines.push('7. Findings and Recommendations');
    lines.push('');
    lines.push('Return JSON with the analysis results.');

    return lines.join('\n');
  }

  private normalizeLeadQualityResult(
    raw: any,
    startTime: number,
    model: string
  ): LeadQualityResult {
    const icpFitScore = clampScore(raw.icpFitScore, 50);
    const dataAccuracyScore = clampScore(raw.dataAccuracyScore, 50);
    const complianceScore = clampScore(raw.complianceScore, 50);
    const relevanceScore = clampScore(raw.relevanceScore, 50);

    const weights = DEFAULT_SCORING_CONFIG.weights;
    const overallScore = Math.round(
      icpFitScore * weights.icpFit +
        dataAccuracyScore * weights.dataAccuracy +
        complianceScore * weights.compliance +
        relevanceScore * weights.relevance
    );

    return {
      success: true,
      moduleId: 'lead_quality_v1',
      analysisType: 'lead_quality',
      qualificationStatus: raw.qualificationStatus || this.determineQualificationStatus(overallScore),
      icpFitScore,
      dataAccuracyScore,
      complianceScore,
      relevanceScore,
      scores: {
        overall: overallScore,
        tier: determineScoreTier(overallScore),
        components: [
          { name: 'ICP Fit', score: icpFitScore, weight: weights.icpFit, contribution: icpFitScore * weights.icpFit },
          { name: 'Data Accuracy', score: dataAccuracyScore, weight: weights.dataAccuracy, contribution: dataAccuracyScore * weights.dataAccuracy },
          { name: 'Compliance', score: complianceScore, weight: weights.compliance, contribution: complianceScore * weights.compliance },
          { name: 'Relevance', score: relevanceScore, weight: weights.relevance, contribution: relevanceScore * weights.relevance },
        ],
        confidence: clampScore(raw.confidence, 70),
      },
      findings: this.normalizeFindings(raw.findings),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      evidence: this.normalizeEvidence(raw.evidence),
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: model,
        dataSourcesUsed: ['leads', 'contacts', 'accounts'],
        configurationApplied: DEFAULT_SCORING_CONFIG,
      },
    };
  }

  private determineQualificationStatus(score: number): 'qualified' | 'not_qualified' | 'needs_review' {
    if (score >= 70) return 'qualified';
    if (score >= 50) return 'needs_review';
    return 'not_qualified';
  }

  // ==================== EMAIL QUALITY ANALYSIS ====================

  /**
   * Analyze email quality for content, personalization, compliance, and deliverability
   */
  async analyzeEmailQuality(
    emailContent: EmailContent,
    options?: EmailAnalysisOptions
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      const analysisPrompt = this.buildEmailAnalysisPrompt(emailContent, options);

      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.buildErrorResult(
          'email_quality',
          'AI returned empty response',
          startTime
        );
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeEmailQualityResult(rawResult, startTime, model);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Email analysis error:', error);
      return this.buildErrorResult(
        'email_quality',
        error.message,
        startTime
      );
    }
  }

  private buildEmailAnalysisPrompt(
    emailContent: EmailContent,
    options?: EmailAnalysisOptions
  ): string {
    const lines: string[] = [
      '## Email Quality Analysis Request',
      '',
      '### Email Content:',
      `- Subject: ${emailContent.subject}`,
    ];

    if (emailContent.preheader) {
      lines.push(`- Preheader: ${emailContent.preheader}`);
    }
    if (emailContent.senderName) {
      lines.push(`- Sender Name: ${emailContent.senderName}`);
    }
    if (emailContent.senderEmail) {
      lines.push(`- Sender Email: ${emailContent.senderEmail}`);
    }

    if (emailContent.htmlContent) {
      lines.push('', '### HTML Body:');
      lines.push(emailContent.htmlContent.substring(0, 3000));
    }

    if (emailContent.textContent) {
      lines.push('', '### Plain Text Body:');
      lines.push(emailContent.textContent.substring(0, 2000));
    }

    if (options?.targetAudience) {
      lines.push('', `### Target Audience: ${options.targetAudience}`);
    }

    lines.push('', '### Analysis Required:');
    lines.push('Analyze this email for:');
    lines.push('1. Content Score (0-100) - clarity, structure, tone');
    lines.push('2. Personalization Score (0-100) - merge fields, context');
    lines.push('3. Compliance Score (0-100) - CAN-SPAM, GDPR requirements');
    lines.push('4. Deliverability Score (0-100) - spam risk, technical factors');
    lines.push('5. Overall Quality Score');
    lines.push('6. Spam Risk Level (low, medium, high)');
    lines.push('7. Spam Triggers identified');
    lines.push('8. Findings and Recommendations');
    lines.push('');
    lines.push('Return JSON with the analysis results.');

    return lines.join('\n');
  }

  private normalizeEmailQualityResult(
    raw: any,
    startTime: number,
    model: string
  ): EmailQualityResult {
    const contentScore = clampScore(raw.contentScore, 50);
    const personalizationScore = clampScore(raw.personalizationScore, 50);
    const complianceScore = clampScore(raw.complianceScore, 50);
    const deliverabilityScore = clampScore(raw.deliverabilityScore, 50);

    const overallScore = Math.round(
      (contentScore + personalizationScore + complianceScore + deliverabilityScore) / 4
    );

    return {
      success: true,
      moduleId: 'email_quality_v1',
      analysisType: 'email_quality',
      contentScore,
      personalizationScore,
      complianceScore,
      deliverabilityScore,
      spamRiskLevel: raw.spamRiskLevel || this.determineSpamRiskLevel(deliverabilityScore),
      spamTriggers: ensureArray(raw.spamTriggers),
      scores: {
        overall: overallScore,
        tier: determineScoreTier(overallScore),
        components: [
          { name: 'Content', score: contentScore, weight: 0.25, contribution: contentScore * 0.25 },
          { name: 'Personalization', score: personalizationScore, weight: 0.25, contribution: personalizationScore * 0.25 },
          { name: 'Compliance', score: complianceScore, weight: 0.25, contribution: complianceScore * 0.25 },
          { name: 'Deliverability', score: deliverabilityScore, weight: 0.25, contribution: deliverabilityScore * 0.25 },
        ],
        confidence: clampScore(raw.confidence, 70),
      },
      findings: this.normalizeFindings(raw.findings),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      evidence: this.normalizeEvidence(raw.evidence),
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: model,
        dataSourcesUsed: ['email_content'],
        configurationApplied: {},
      },
    };
  }

  private determineSpamRiskLevel(deliverabilityScore: number): 'low' | 'medium' | 'high' {
    if (deliverabilityScore >= 70) return 'low';
    if (deliverabilityScore >= 50) return 'medium';
    return 'high';
  }

  // ==================== CALL QUALITY ANALYSIS ====================

  /**
   * Analyze call quality based on transcript and call data
   */
  async analyzeCallQuality(
    callId: string,
    options?: CallAnalysisOptions
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      // Fetch call data
      const [callData] = await db
        .select({
          session: callSessions,
          attempt: dialerCallAttempts,
        })
        .from(callSessions)
        .leftJoin(dialerCallAttempts, eq(callSessions.id, dialerCallAttempts.callSessionId))
        .where(eq(callSessions.id, callId))
        .limit(1);

      if (!callData) {
        return this.buildErrorResult(
          'call_quality',
          `Call not found: ${callId}`,
          startTime
        );
      }

      const transcript = (callData.session as any)?.aiTranscript || '';
      if (!transcript) {
        return this.buildErrorResult(
          'call_quality',
          'No transcript available for analysis',
          startTime
        );
      }

      // Fetch campaign context if available
      let campaignData = null;
      const campaignId = options?.campaignId || (callData.session as any)?.campaignId;
      if (campaignId) {
        [campaignData] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, campaignId))
          .limit(1);
      }

      const analysisPrompt = this.buildCallAnalysisPrompt(callData, transcript, campaignData, options);

      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.buildErrorResult(
          'call_quality',
          'AI returned empty response',
          startTime
        );
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeCallQualityResult(rawResult, callData, startTime, model);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Call analysis error:', error);
      return this.buildErrorResult(
        'call_quality',
        error.message,
        startTime
      );
    }
  }

  private buildCallAnalysisPrompt(
    callData: any,
    transcript: string,
    campaignData: any,
    options?: CallAnalysisOptions
  ): string {
    const lines: string[] = [
      '## Call Quality Analysis Request',
      '',
      '### Call Information:',
      `- Duration: ${(callData.session as any)?.durationSec || 'Unknown'} seconds`,
      `- Disposition: ${(callData.attempt as any)?.disposition || 'Unknown'}`,
    ];

    if (campaignData) {
      lines.push('', '### Campaign Context:');
      lines.push(`- Campaign: ${campaignData.name}`);
      lines.push(`- Objective: ${campaignData.campaignObjective || 'N/A'}`);
      if (campaignData.talkingPoints) {
        lines.push(`- Talking Points: ${JSON.stringify(campaignData.talkingPoints)}`);
      }
    }

    lines.push('', '### Transcript:');
    lines.push(transcript.substring(0, 8000));

    lines.push('', '### Analysis Required:');
    lines.push('Analyze this call for:');
    lines.push('1. Engagement Score (0-100)');
    lines.push('2. Clarity Score (0-100)');
    lines.push('3. Empathy Score (0-100)');
    lines.push('4. Objection Handling Score (0-100)');
    lines.push('5. Qualification Score (0-100)');
    lines.push('6. Closing Score (0-100)');
    lines.push('7. Script Adherence Score (0-100)');
    lines.push('8. Disposition Accuracy (true/false)');
    lines.push('9. Expected Disposition (if different)');
    lines.push('10. Findings and Recommendations');
    lines.push('');
    lines.push('Return JSON with the analysis results.');

    return lines.join('\n');
  }

  private normalizeCallQualityResult(
    raw: any,
    callData: any,
    startTime: number,
    model: string
  ): CallQualityResult {
    const engagementScore = clampScore(raw.engagementScore, 50);
    const clarityScore = clampScore(raw.clarityScore, 50);
    const empathyScore = clampScore(raw.empathyScore, 50);
    const objectionHandlingScore = clampScore(raw.objectionHandlingScore, 50);
    const qualificationScore = clampScore(raw.qualificationScore, 50);
    const closingScore = clampScore(raw.closingScore, 50);
    const scriptAdherenceScore = clampScore(raw.scriptAdherenceScore, 50);

    const overallScore = Math.round(
      (engagementScore + clarityScore + empathyScore + objectionHandlingScore +
        qualificationScore + closingScore + scriptAdherenceScore) / 7
    );

    return {
      success: true,
      moduleId: 'call_quality_v1',
      analysisType: 'call_quality',
      engagementScore,
      clarityScore,
      empathyScore,
      objectionHandlingScore,
      qualificationScore,
      closingScore,
      scriptAdherenceScore,
      dispositionAccuracy: raw.dispositionAccuracy ?? true,
      expectedDisposition: raw.expectedDisposition,
      scores: {
        overall: overallScore,
        tier: determineScoreTier(overallScore),
        components: [
          { name: 'Engagement', score: engagementScore, weight: 0.15, contribution: engagementScore * 0.15 },
          { name: 'Clarity', score: clarityScore, weight: 0.15, contribution: clarityScore * 0.15 },
          { name: 'Empathy', score: empathyScore, weight: 0.1, contribution: empathyScore * 0.1 },
          { name: 'Objection Handling', score: objectionHandlingScore, weight: 0.15, contribution: objectionHandlingScore * 0.15 },
          { name: 'Qualification', score: qualificationScore, weight: 0.2, contribution: qualificationScore * 0.2 },
          { name: 'Closing', score: closingScore, weight: 0.15, contribution: closingScore * 0.15 },
          { name: 'Script Adherence', score: scriptAdherenceScore, weight: 0.1, contribution: scriptAdherenceScore * 0.1 },
        ],
        confidence: clampScore(raw.confidence, 70),
      },
      findings: this.normalizeFindings(raw.findings),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      evidence: this.normalizeEvidence(raw.evidence),
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: model,
        dataSourcesUsed: ['call_sessions', 'dialer_call_attempts', 'transcript'],
        configurationApplied: {},
      },
    };
  }

  // ==================== ENGAGEMENT ANALYSIS ====================

  /**
   * Analyze engagement patterns for a contact
   */
  async analyzeEngagement(
    contactId: string,
    options?: EngagementAnalysisOptions
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      // Fetch contact and engagement data
      const [contactData] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (!contactData) {
        return this.buildErrorResult(
          'engagement',
          `Contact not found: ${contactId}`,
          startTime
        );
      }

      const analysisPrompt = this.buildEngagementAnalysisPrompt(contactData, options);

      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.buildErrorResult(
          'engagement',
          'AI returned empty response',
          startTime
        );
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeEngagementResult(rawResult, startTime, model);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Engagement analysis error:', error);
      return this.buildErrorResult(
        'engagement',
        error.message,
        startTime
      );
    }
  }

  private buildEngagementAnalysisPrompt(
    contactData: any,
    options?: EngagementAnalysisOptions
  ): string {
    const lines: string[] = [
      '## Engagement Analysis Request',
      '',
      '### Contact Information:',
      `- Name: ${contactData.fullName || 'Unknown'}`,
      `- Title: ${contactData.jobTitle || 'Unknown'}`,
      `- Last Call Attempt: ${contactData.lastCallAttemptAt || 'Never'}`,
      `- Last Call Outcome: ${contactData.lastCallOutcome || 'N/A'}`,
    ];

    lines.push('', '### Analysis Required:');
    lines.push('Analyze engagement patterns for:');
    lines.push('1. Overall Engagement Score (0-100)');
    lines.push('2. Sentiment (positive, neutral, negative, mixed)');
    lines.push('3. Sentiment Score (-1.0 to 1.0)');
    lines.push('4. Intent Score (0-100)');
    lines.push('5. Intent Signals identified');
    lines.push('6. Momentum Score (0-100)');
    lines.push('7. Momentum Direction (accelerating, steady, decelerating, stalled)');
    lines.push('8. Channel Engagement breakdown');
    lines.push('9. Findings and Recommendations');
    lines.push('');
    lines.push('Return JSON with the analysis results.');

    return lines.join('\n');
  }

  private normalizeEngagementResult(
    raw: any,
    startTime: number,
    model: string
  ): EngagementAnalysisResult {
    const overallEngagementScore = clampScore(raw.overallEngagementScore, 50);
    const intentScore = clampScore(raw.intentScore, 50);
    const momentumScore = clampScore(raw.momentumScore, 50);

    return {
      success: true,
      moduleId: 'engagement_analysis_v1',
      analysisType: 'engagement',
      overallEngagementScore,
      sentiment: raw.sentiment || 'neutral',
      sentimentScore: typeof raw.sentimentScore === 'number' ? Math.max(-1, Math.min(1, raw.sentimentScore)) : 0,
      intentScore,
      intentSignals: ensureArray(raw.intentSignals),
      momentumScore,
      momentumDirection: raw.momentumDirection || 'steady',
      channelEngagement: raw.channelEngagement || {},
      scores: {
        overall: overallEngagementScore,
        tier: determineScoreTier(overallEngagementScore),
        components: [
          { name: 'Engagement', score: overallEngagementScore, weight: 0.4, contribution: overallEngagementScore * 0.4 },
          { name: 'Intent', score: intentScore, weight: 0.35, contribution: intentScore * 0.35 },
          { name: 'Momentum', score: momentumScore, weight: 0.25, contribution: momentumScore * 0.25 },
        ],
        confidence: clampScore(raw.confidence, 60),
      },
      findings: this.normalizeFindings(raw.findings),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      evidence: this.normalizeEvidence(raw.evidence),
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: model,
        dataSourcesUsed: ['contacts', 'activity_log'],
        configurationApplied: {},
      },
    };
  }

  // ==================== ACCOUNT HEALTH SCORING ====================

  /**
   * Score account health based on fit, engagement, intent, and risk factors
   */
  async scoreAccountHealth(
    accountId: string,
    options?: AccountScoringOptions
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      // Fetch account data
      const [accountData] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

      if (!accountData) {
        return this.buildErrorResult(
          'account_health',
          `Account not found: ${accountId}`,
          startTime
        );
      }

      const analysisPrompt = this.buildAccountHealthPrompt(accountData, options);

      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.buildErrorResult(
          'account_health',
          'AI returned empty response',
          startTime
        );
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeAccountHealthResult(rawResult, startTime, model);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Account health error:', error);
      return this.buildErrorResult(
        'account_health',
        error.message,
        startTime
      );
    }
  }

  private buildAccountHealthPrompt(
    accountData: any,
    options?: AccountScoringOptions
  ): string {
    const lines: string[] = [
      '## Account Health Analysis Request',
      '',
      '### Account Information:',
      `- Company: ${accountData.name}`,
      `- Industry: ${accountData.industryStandardized || 'Unknown'}`,
      `- Employee Count: ${accountData.staffCount || 'Unknown'}`,
      `- Revenue: ${accountData.annualRevenue || 'Unknown'}`,
      `- Location: ${accountData.hqCity}, ${accountData.hqState}, ${accountData.hqCountry}`,
      `- Domain: ${accountData.domain || 'Unknown'}`,
    ];

    lines.push('', '### Analysis Required:');
    lines.push('Score this account for:');
    lines.push('1. Overall Health Score (0-100)');
    lines.push('2. Fit Score (0-100) - ICP alignment');
    lines.push('3. Engagement Score (0-100) - activity level');
    lines.push('4. Intent Score (0-100) - buying signals');
    lines.push('5. Relationship Score (0-100) - connection strength');
    lines.push('6. Risk Score (0-100) - churn/loss risk');
    lines.push('7. Health Status (thriving, healthy, at_risk, critical)');
    lines.push('8. Trend (improving, stable, declining)');
    lines.push('9. Risk Factors identified');
    lines.push('10. Opportunities identified');
    lines.push('');
    lines.push('Return JSON with the analysis results.');

    return lines.join('\n');
  }

  private normalizeAccountHealthResult(
    raw: any,
    startTime: number,
    model: string
  ): AccountHealthScore {
    const overallHealthScore = clampScore(raw.overallHealthScore, 50);
    const fitScore = clampScore(raw.fitScore, 50);
    const engagementScore = clampScore(raw.engagementScore, 50);
    const intentScore = clampScore(raw.intentScore, 50);
    const relationshipScore = clampScore(raw.relationshipScore, 50);
    const riskScore = clampScore(raw.riskScore, 30);

    return {
      success: true,
      moduleId: 'account_health_v1',
      analysisType: 'account_health',
      overallHealthScore,
      fitScore,
      engagementScore,
      intentScore,
      relationshipScore,
      riskScore,
      healthStatus: raw.healthStatus || this.determineHealthStatus(overallHealthScore),
      trend: raw.trend || 'stable',
      trendVelocity: raw.trendVelocity || 0,
      riskFactors: ensureArray(raw.riskFactors),
      opportunities: ensureArray(raw.opportunities),
      scores: {
        overall: overallHealthScore,
        tier: determineScoreTier(overallHealthScore),
        components: [
          { name: 'Fit', score: fitScore, weight: 0.25, contribution: fitScore * 0.25 },
          { name: 'Engagement', score: engagementScore, weight: 0.25, contribution: engagementScore * 0.25 },
          { name: 'Intent', score: intentScore, weight: 0.25, contribution: intentScore * 0.25 },
          { name: 'Relationship', score: relationshipScore, weight: 0.15, contribution: relationshipScore * 0.15 },
          { name: 'Risk (inverted)', score: 100 - riskScore, weight: 0.1, contribution: (100 - riskScore) * 0.1 },
        ],
        confidence: clampScore(raw.confidence, 65),
      },
      findings: this.normalizeFindings(raw.findings),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      evidence: this.normalizeEvidence(raw.evidence),
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: model,
        dataSourcesUsed: ['accounts'],
        configurationApplied: {},
      },
    };
  }

  private determineHealthStatus(score: number): 'thriving' | 'healthy' | 'at_risk' | 'critical' {
    if (score >= 80) return 'thriving';
    if (score >= 60) return 'healthy';
    if (score >= 40) return 'at_risk';
    return 'critical';
  }

  // ==================== NEXT BEST ACTION ====================

  /**
   * Generate next best action recommendations
   */
  async generateNextBestActions(
    context: NextBestActionContext
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      let contactData = null;
      let accountData = null;
      let campaignData = null;

      if (context.contactId) {
        [contactData] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, context.contactId))
          .limit(1);
      }

      if (context.accountId) {
        [accountData] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, context.accountId))
          .limit(1);
      }

      if (context.campaignId) {
        [campaignData] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, context.campaignId))
          .limit(1);
      }

      const analysisPrompt = this.buildNBAPrompt(contactData, accountData, campaignData, context);

      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          success: false,
          actions: [],
          context: {
            contactId: context.contactId,
            accountId: context.accountId,
            campaignId: context.campaignId,
            analysisTimestamp: new Date(),
          },
          summary: 'AI returned empty response',
        };
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeNBAResult(rawResult, context);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] NBA generation error:', error);
      return {
        success: false,
        actions: [],
        context: {
          contactId: context.contactId,
          accountId: context.accountId,
          campaignId: context.campaignId,
          analysisTimestamp: new Date(),
        },
        summary: error.message,
      };
    }
  }

  private buildNBAPrompt(
    contactData: any,
    accountData: any,
    campaignData: any,
    context: NextBestActionContext
  ): string {
    const lines: string[] = [
      '## Next Best Action Generation Request',
      '',
    ];

    if (contactData) {
      lines.push('### Contact Information:');
      lines.push(`- Name: ${contactData.fullName || 'Unknown'}`);
      lines.push(`- Title: ${contactData.jobTitle || 'Unknown'}`);
      lines.push(`- Last Contact: ${contactData.lastCallAttemptAt || 'Never'}`);
      lines.push('');
    }

    if (accountData) {
      lines.push('### Account Information:');
      lines.push(`- Company: ${accountData.name}`);
      lines.push(`- Industry: ${accountData.industryStandardized || 'Unknown'}`);
      lines.push('');
    }

    if (campaignData) {
      lines.push('### Campaign Context:');
      lines.push(`- Campaign: ${campaignData.name}`);
      lines.push(`- Objective: ${campaignData.campaignObjective || 'N/A'}`);
      lines.push('');
    }

    lines.push('### Generation Requirements:');
    lines.push(`Generate up to ${context.limit || 5} next best actions with:`);
    lines.push('1. Action Type (contact, message, offer, follow_up, escalate)');
    lines.push('2. Channel (email, call, sms, linkedin) if applicable');
    lines.push('3. Description of the action');
    lines.push('4. Priority (immediate, high, medium, low)');
    lines.push('5. Expected Impact');
    lines.push('6. Effort Level (low, medium, high)');
    lines.push('7. Success Probability (0-1)');
    lines.push('8. Contributing Factors');
    lines.push('');
    lines.push('Return JSON with actions array and summary.');

    return lines.join('\n');
  }

  private normalizeNBAResult(
    raw: any,
    context: NextBestActionContext
  ): NextBestActionRecommendations {
    const actions: NextBestAction[] = ensureArray(raw.actions).map((action: any, index: number) => ({
      id: `nba_${Date.now()}_${index}`,
      actionType: action.actionType || 'follow_up',
      channel: action.channel,
      description: action.description || 'No description provided',
      details: action.details,
      priority: action.priority || 'medium',
      expectedImpact: action.expectedImpact || 'Unknown impact',
      effort: action.effort || 'medium',
      successProbability: typeof action.successProbability === 'number'
        ? Math.max(0, Math.min(1, action.successProbability))
        : 0.5,
      validUntil: action.validUntil ? new Date(action.validUntil) : undefined,
      contributingFactors: ensureArray(action.contributingFactors),
    }));

    return {
      success: true,
      actions,
      context: {
        contactId: context.contactId,
        accountId: context.accountId,
        campaignId: context.campaignId,
        analysisTimestamp: new Date(),
      },
      summary: raw.summary || `Generated ${actions.length} recommended actions`,
    };
  }

  // ==================== COMMUNICATION QUALITY ANALYSIS ====================

  /**
   * Analyze cross-channel communication quality
   */
  async analyzeCommunicationQuality(
    contactId: string,
    options?: CommunicationAnalysisOptions
  ): Promise {
    const startTime = Date.now();
    const model = process.env.RESEARCH_ANALYSIS_MODEL || 'deepseek-chat';

    try {
      const [contactData] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (!contactData) {
        return this.buildErrorResult(
          'communication_quality',
          `Contact not found: ${contactId}`,
          startTime
        );
      }

      const analysisPrompt = this.buildCommunicationAnalysisPrompt(contactData, options);

      const response = await getAIClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: this.getFoundationalPrompt() },
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.buildErrorResult(
          'communication_quality',
          'AI returned empty response',
          startTime
        );
      }

      const rawResult = parseJSONResponse(content);
      return this.normalizeCommunicationResult(rawResult, startTime, model);
    } catch (error: any) {
      console.error('[CoreResearchAnalysisAgent] Communication analysis error:', error);
      return this.buildErrorResult(
        'communication_quality',
        error.message,
        startTime
      );
    }
  }

  private buildCommunicationAnalysisPrompt(
    contactData: any,
    options?: CommunicationAnalysisOptions
  ): string {
    const lines: string[] = [
      '## Communication Quality Analysis Request',
      '',
      '### Contact Information:',
      `- Name: ${contactData.fullName || 'Unknown'}`,
      `- Title: ${contactData.jobTitle || 'Unknown'}`,
    ];

    lines.push('', '### Analysis Required:');
    lines.push('Analyze communication quality across channels:');
    lines.push('1. Overall Quality Score (0-100)');
    lines.push('2. Consistency Score (0-100)');
    lines.push('3. Channel-specific Scores');
    lines.push('4. Issues Identified');
    lines.push('5. Risk Areas');
    lines.push('6. Recommendations');
    lines.push('');
    lines.push('Return JSON with the analysis results.');

    return lines.join('\n');
  }

  private normalizeCommunicationResult(
    raw: any,
    startTime: number,
    model: string
  ): CommunicationQualityResult {
    const overallQualityScore = clampScore(raw.overallQualityScore, 50);
    const consistencyScore = clampScore(raw.consistencyScore, 50);

    return {
      success: true,
      moduleId: 'communication_quality_v1',
      analysisType: 'communication_quality',
      overallQualityScore,
      consistencyScore,
      channelScores: raw.channelScores || {},
      issuesIdentified: ensureArray(raw.issuesIdentified),
      riskAreas: ensureArray(raw.riskAreas),
      scores: {
        overall: overallQualityScore,
        tier: determineScoreTier(overallQualityScore),
        components: [
          { name: 'Quality', score: overallQualityScore, weight: 0.6, contribution: overallQualityScore * 0.6 },
          { name: 'Consistency', score: consistencyScore, weight: 0.4, contribution: consistencyScore * 0.4 },
        ],
        confidence: clampScore(raw.confidence, 60),
      },
      findings: this.normalizeFindings(raw.findings),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      evidence: this.normalizeEvidence(raw.evidence),
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: model,
        dataSourcesUsed: ['contacts', 'communications'],
        configurationApplied: {},
      },
    };
  }

  // ==================== HELPER METHODS ====================

  private normalizeFindings(raw: unknown): AnalysisFinding[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => ({
        type: item.type || 'neutral',
        category: item.category || 'general',
        description: item.description || '',
        severity: item.severity || 'medium',
        evidence: item.evidence,
        recommendation: item.recommendation,
      }))
      .filter((f) => f.description);
  }

  private normalizeRecommendations(raw: unknown): AnalysisRecommendation[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => ({
        action: item.action || item.suggestedChange || '',
        priority: item.priority || 'medium',
        expectedImpact: item.expectedImpact || '',
        effort: item.effort || 'medium',
        category: item.category || 'general',
      }))
      .filter((r) => r.action);
  }

  private normalizeEvidence(raw: unknown): AnalysisEvidence[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: any) => ({
        source: item.source || 'unknown',
        excerpt: item.excerpt || '',
        relevance: item.relevance || '',
        timestamp: item.timestamp ? new Date(item.timestamp) : undefined,
      }))
      .filter((e) => e.excerpt);
  }

  private buildErrorResult(
    analysisType: AnalysisType,
    errorMessage: string,
    startTime: number
  ): T {
    const baseResult = {
      success: false,
      moduleId: `${analysisType}_v1`,
      analysisType,
      error: errorMessage,
      scores: {
        overall: 0,
        tier: 'critical' as ScoreTier,
        components: [],
        confidence: 0,
      },
      findings: [
        {
          type: 'critical' as const,
          category: 'error',
          description: errorMessage,
          severity: 'critical' as const,
        },
      ],
      recommendations: [],
      evidence: [],
      metadata: {
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        modelUsed: 'none',
        dataSourcesUsed: [],
        configurationApplied: {},
      },
    };

    // Add type-specific default fields
    switch (analysisType) {
      case 'lead_quality':
        return {
          ...baseResult,
          qualificationStatus: 'needs_review',
          icpFitScore: 0,
          dataAccuracyScore: 0,
          complianceScore: 0,
          relevanceScore: 0,
        } as T;
      case 'email_quality':
        return {
          ...baseResult,
          contentScore: 0,
          personalizationScore: 0,
          complianceScore: 0,
          deliverabilityScore: 0,
          spamRiskLevel: 'high',
          spamTriggers: [],
        } as T;
      case 'call_quality':
        return {
          ...baseResult,
          engagementScore: 0,
          clarityScore: 0,
          empathyScore: 0,
          objectionHandlingScore: 0,
          qualificationScore: 0,
          closingScore: 0,
          scriptAdherenceScore: 0,
          dispositionAccuracy: false,
        } as T;
      case 'engagement':
        return {
          ...baseResult,
          overallEngagementScore: 0,
          sentiment: 'neutral',
          sentimentScore: 0,
          intentScore: 0,
          intentSignals: [],
          momentumScore: 0,
          momentumDirection: 'stalled',
          channelEngagement: {},
        } as T;
      case 'account_health':
        return {
          ...baseResult,
          overallHealthScore: 0,
          fitScore: 0,
          engagementScore: 0,
          intentScore: 0,
          relationshipScore: 0,
          riskScore: 100,
          healthStatus: 'critical',
          trend: 'declining',
          trendVelocity: 0,
          riskFactors: [errorMessage],
          opportunities: [],
        } as T;
      case 'communication_quality':
        return {
          ...baseResult,
          overallQualityScore: 0,
          consistencyScore: 0,
          channelScores: {},
          issuesIdentified: [errorMessage],
          riskAreas: [],
        } as T;
      default:
        return baseResult as T;
    }
  }

  // ==================== SCORING MODEL MANAGEMENT ====================

  /**
   * Register a custom scoring configuration
   */
  registerScoringConfig(id: string, config: ScoringModelConfiguration): void {
    this.scoringConfigs.set(id, config);
  }

  /**
   * Get a scoring configuration by ID
   */
  getScoringConfig(id: string): ScoringModelConfiguration | undefined {
    return this.scoringConfigs.get(id);
  }

  /**
   * List all registered scoring configurations
   */
  listScoringConfigs(): string[] {
    return Array.from(this.scoringConfigs.keys());
  }
}

// Export singleton instance
export const coreResearchAnalysisAgent = new CoreResearchAnalysisAgent();