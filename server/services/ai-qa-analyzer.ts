import OpenAI from 'openai';
import { workerDb as db, withRetry } from "../db";
import { leads, campaigns, contacts, accounts, activityLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { parseNaturalLanguageRules, generateDynamicEvaluationPrompt } from "./natural-language-rule-parser";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

// Lazy OpenAI client – instantiate only when needed and when credentials exist
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY.");
    }
    _openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

interface QAParameters {
  required_info: string[];
  scoring_weights: {
    content_interest: number;
    permission_given: number;
    compliance_consent: number;
    qualification_answers: number;
    data_accuracy: number;
    email_deliverable: number;
  };
  min_score: number;
  client_criteria: {
    industry?: string[];
    industries?: string[];
    company_size?: string[];
    revenue_range?: string[];
    technologies?: string[];
    job_titles?: string[];
    seniority_levels?: string[];
  };
  qualification_questions?: Array<{
    question: string;
    required: boolean;
    acceptable_responses: string[];
  }>;
}

interface AIAnalysisResult {
  score: number;
  qualification_status: 'qualified' | 'not_qualified' | 'needs_review';
  analysis: {
    content_interest: { score: number; evidence: string };
    permission_given: { score: number; evidence: string };
    compliance_consent: { score: number; evidence: string };
    qualification_answers: { score: number; evidence: string };
    data_accuracy: { score: number; evidence: string };
    email_deliverable: { score: number; evidence: string };
  };
  missing_info: string[];
  recommendations: string[];
  account_verification: {
    industry_match: boolean;
    size_match: boolean;
    revenue_match: boolean;
    technology_match: boolean;
    confidence: number;
  };
}

/**
 * Normalize client criteria to use consistent field names
 * Maps legacy 'industry' to 'industries' for backward compatibility
 */
function normalizeClientCriteria(clientCriteria: QAParameters['client_criteria']): QAParameters['client_criteria'] {
  const normalized = { ...clientCriteria };
  
  // If legacy 'industry' exists but 'industries' doesn't, copy it over
  if (normalized.industry && normalized.industry.length > 0 && (!normalized.industries || normalized.industries.length === 0)) {
    normalized.industries = [...normalized.industry];
  }
  
  // Remove legacy field after normalization
  delete normalized.industry;
  
  return normalized;
}

/**
 * Analyze lead using AI based on transcript, contact data, account data, and QA parameters
 */
export async function analyzeLeadQualification(leadId: string): Promise<AIAnalysisResult | null> {
  try {
    // Fetch lead with all related data
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return null;

    const [contact] = lead.contactId 
      ? await db.select().from(contacts).where(eq(contacts.id, lead.contactId)).limit(1)
      : [];

    const [account] = contact?.accountId
      ? await db.select().from(accounts).where(eq(accounts.id, contact.accountId)).limit(1)
      : [];

    const [campaign] = lead.campaignId
      ? await db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).limit(1)
      : [];

    if (!lead.transcript) {
      console.log('[AI-QA] No transcript available for lead:', leadId);
      
      // Update lead with clear reason for needing review
      await db.update(leads)
        .set({
          qaStatus: 'under_review',
          qaDecision: 'Needs review: No call transcript available for AI analysis',
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));
      
      return null;
    }

    // Get QA parameters from campaign and normalize client criteria
    const rawQaParams = (campaign?.qaParameters as QAParameters) || getDefaultQAParameters();
    const qaParams: QAParameters = {
      ...rawQaParams,
      client_criteria: normalizeClientCriteria(rawQaParams.client_criteria || {}),
    };

    // Check if campaign has custom QA rules or fields
    const customQaFields = (campaign?.customQaFields as any[]) || [];
    const hasCustomFields = customQaFields.length > 0;
    
    // Use cached parsed rules (generated once on campaign save) for performance
    const parsedRules = (campaign?.parsedQaRules as any) || { criteria: [], evaluation_instructions: "" };
    const hasCustomRules = parsedRules.criteria && parsedRules.criteria.length > 0;

    // Preserve existing qaData to avoid overwriting Companies House validation data
    const existingQaData = (lead.qaData as Record<string, any>) || {};
    
    let analysisPrompt: string;
    let customFieldsData: Record<string, any> = {};
    
    // Use dynamic evaluation if custom rules or fields are defined
    if (hasCustomRules || hasCustomFields) {
      console.log('[AI-QA] Using dynamic evaluation with custom rules/fields for lead:', leadId);

      // Build contact/account data for verification (including Companies House)
      const contactData = {
        contact: {
          fullName: contact?.fullName,
          email: contact?.email,
          phone: contact?.directPhone,
          title: contact?.jobTitle,
          emailVerificationStatus: contact?.emailVerificationStatus,
        },
        account: {
          name: account?.name,
          industry: account?.industryStandardized,
          companySize: account?.employeesSizeRange,
          revenue: account?.revenueRange,
          technologies: account?.webTechnologies,
          domain: account?.domain,
        },
        companiesHouse: existingQaData.ch_validation_status === 'validated' ? {
          legalName: existingQaData.ch_legal_name,
          companyNumber: existingQaData.ch_company_number,
          status: existingQaData.ch_status,
          isActive: existingQaData.ch_is_active,
          dateOfCreation: existingQaData.ch_date_of_creation,
          address: existingQaData.ch_address,
          validationStatus: 'VERIFIED via Companies House UK API'
        } : null
      };

      // Generate dynamic evaluation prompt
      analysisPrompt = generateDynamicEvaluationPrompt(
        parsedRules,
        customQaFields,
        lead.transcript,
        contactData
      );
    } else {
      // Use standard evaluation (pass existingQaData for CH info)
      analysisPrompt = buildAnalysisPrompt(lead, contact, account, campaign, qaParams, existingQaData);
    }

    // Call OpenAI for analysis using GPT-4.1-mini (cost-effective)
    const openai = getOpenAI();
    const systemPrompt = await buildAgentSystemPrompt(
      "You are an expert B2B lead qualification analyst. Analyze call transcripts and data to determine if leads meet qualification criteria. Return structured JSON analysis."
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const analysisText = completion.choices[0]?.message?.content;
    if (!analysisText) return null;

    let rawAnalysis: any = JSON.parse(analysisText);

    // Normalize response format (dynamic prompts return ai_score/ai_qualification_status, legacy returns score/qualification_status)
    const normalizedAnalysis: AIAnalysisResult = {
      score: rawAnalysis.score ?? rawAnalysis.ai_score ?? 0,
      qualification_status: rawAnalysis.qualification_status ?? rawAnalysis.ai_qualification_status ?? 'needs_review',
      analysis: rawAnalysis.analysis ?? {},
      missing_info: rawAnalysis.missing_info ?? [],
      recommendations: rawAnalysis.recommendations ?? [],
      account_verification: rawAnalysis.account_verification ?? {
        industry_match: false,
        size_match: false,
        revenue_match: false,
        technology_match: false,
        confidence: 0
      }
    };

    // Extract custom QA field data from analysis if custom fields were used
    if (hasCustomFields || hasCustomRules) {
      customFieldsData = rawAnalysis.qa_data || {};
    }

    // Merge AI analysis details into qaData (preserving existing data like Companies House validation)
    const updatedQaData = {
      ...existingQaData, // Preserve existing data (e.g., Companies House validation)
      ...customFieldsData, // Add custom QA field data if any
      // Store detailed AI insights for "needs review" cases
      ai_analysis: {
        score: normalizedAnalysis.score,
        qualification_status: normalizedAnalysis.qualification_status,
        analysis: normalizedAnalysis.analysis, // Per-criterion evidence
        missing_info: normalizedAnalysis.missing_info, // What's missing
        recommendations: normalizedAnalysis.recommendations, // Action items
        account_verification: normalizedAnalysis.account_verification,
      }
    };

    // Determine qaStatus based on AI qualification status and score
    type QAStatusType = 'new' | 'under_review' | 'approved' | 'rejected' | 'returned' | 'published';
    let qaStatus: QAStatusType = (lead.qaStatus as QAStatusType) || 'under_review';
    let qaDecisionComment: string | null = null;
    
    const minScore = qaParams.min_score || 70;
    const autoRejectThreshold = 30; // Balanced threshold - not too aggressive, not too permissive
    
    // QUALITY GATE: Check call duration - short calls require manual review
    const MINIMUM_QUALIFIED_DURATION = 30; // seconds
    const callDuration = lead.callDuration || 0;
    const isShortDurationCall = callDuration < MINIMUM_QUALIFIED_DURATION && callDuration > 0;
    
    if (isShortDurationCall) {
      console.warn(`[AI-QA] ⚠️ SHORT DURATION: Lead ${leadId} has call duration ${callDuration}s (min: ${MINIMUM_QUALIFIED_DURATION}s). Forcing manual review.`);
    }
    
    // Check for EXPLICIT callback/interest signals using conservative patterns
    // These must be prospect-initiated phrases, not common AI agent script lines
    const transcriptLower = (lead.transcript || '').toLowerCase();
    
    // Very explicit callback requests from prospect
    const hasCallbackSignal = /call me back|ring me back|phone me back|call me tomorrow|try me again later|can you call me/i.test(transcriptLower);
    
    // Very explicit interest expressions from prospect
    const hasInterestSignal = /tell me more|sounds interesting|sounds good|i am interested|i'm interested|we are interested|we're interested|yes.*(send|please)/i.test(transcriptLower);
    
    // Negative signals that override positive ones
    const hasNegativeSignal = /not interested|no thank|declined|don't need|remove me|stop calling|do not call|unsubscribe/i.test(transcriptLower);
    
    const hasPositiveEngagement = (hasCallbackSignal || hasInterestSignal) && !hasNegativeSignal;
    
    // SHORT DURATION CALLS: Always require manual review regardless of AI score
    if (isShortDurationCall) {
      qaStatus = 'under_review';
      qaDecisionComment = `⚠️ SHORT DURATION REVIEW: Call was only ${callDuration}s (minimum: ${MINIMUM_QUALIFIED_DURATION}s). AI Score: ${normalizedAnalysis.score}/100. Requires manual verification of qualification.`;
      console.log(`[AI-QA] Lead ${leadId} FORCED REVIEW (short duration ${callDuration}s): ${qaDecisionComment}`);
    } else if (normalizedAnalysis.qualification_status === 'qualified' && normalizedAnalysis.score >= minScore) {
      // Auto-approve high-scoring qualified leads (only if not short duration)
      qaStatus = 'approved';
      qaDecisionComment = `Auto-approved: AI score ${normalizedAnalysis.score}/100 (threshold: ${minScore})`;
      console.log(`[AI-QA] Lead ${leadId} AUTO-APPROVED with score ${normalizedAnalysis.score}`);
    } else if (hasPositiveEngagement) {
      // Leads with callback/interest signals ALWAYS go to manual review regardless of score
      qaStatus = 'under_review';
      const signals = [];
      if (hasCallbackSignal) signals.push('callback request');
      if (hasInterestSignal) signals.push('expressed interest/challenges');
      qaDecisionComment = `Manual review: ${signals.join(', ')} detected (Score: ${normalizedAnalysis.score}/100)`;
      console.log(`[AI-QA] Lead ${leadId} NEEDS REVIEW (positive engagement): ${qaDecisionComment}`);
    } else if (normalizedAnalysis.qualification_status === 'not_qualified' && normalizedAnalysis.score < autoRejectThreshold) {
      // Only auto-reject very low scoring leads without positive engagement
      qaStatus = 'rejected';
      const reasons = normalizedAnalysis.missing_info.length > 0 
        ? normalizedAnalysis.missing_info.join(', ')
        : 'Failed qualification criteria';
      qaDecisionComment = `Auto-rejected: ${reasons} (Score: ${normalizedAnalysis.score}/100)`;
      console.log(`[AI-QA] Lead ${leadId} AUTO-REJECTED with score ${normalizedAnalysis.score}`);
    } else {
      // Borderline cases need manual review
      qaStatus = 'under_review';
      const reviewReasons: string[] = [];
      
      if (normalizedAnalysis.missing_info.length > 0) {
        reviewReasons.push(`Missing: ${normalizedAnalysis.missing_info.join(', ')}`);
      }
      if (normalizedAnalysis.score >= 40 && normalizedAnalysis.score < minScore) {
        reviewReasons.push(`Score ${normalizedAnalysis.score} below threshold ${minScore}`);
      }
      if (normalizedAnalysis.recommendations.length > 0) {
        reviewReasons.push(normalizedAnalysis.recommendations[0]); // Add first recommendation
      }
      
      qaDecisionComment = reviewReasons.length > 0 
        ? `Needs review: ${reviewReasons.join(' | ')}`
        : `Manual review required (Score: ${normalizedAnalysis.score}/100)`;
      
      console.log(`[AI-QA] Lead ${leadId} NEEDS REVIEW: ${qaDecisionComment}`);
    }

    // Save AI analysis to database with normalized values AND decision
    await db.update(leads)
      .set({
        aiScore: String(normalizedAnalysis.score), // numeric column expects string
        aiAnalysis: rawAnalysis as any, // Keep raw analysis for full context
        aiQualificationStatus: normalizedAnalysis.qualification_status,
        qaStatus: qaStatus,
        qaDecision: qaDecisionComment,
        qaData: updatedQaData, // Merged data preserving all fields
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    console.log('[AI-QA] Analysis completed for lead:', leadId, 'Score:', normalizedAnalysis.score, 'Status:', normalizedAnalysis.qualification_status, 'QA Status:', qaStatus);

    // Determine the specific QA event type for activity logging
    let qaEventType: 'qa_auto_approved' | 'qa_auto_rejected' | 'qa_needs_review' | 'qa_analysis_completed';
    if (qaStatus === 'approved') {
      qaEventType = 'qa_auto_approved';
    } else if (qaStatus === 'rejected') {
      qaEventType = 'qa_auto_rejected';
    } else {
      qaEventType = 'qa_needs_review';
    }

    // Insert activity log for QA decision
    try {
      await db.insert(activityLog).values({
        entityType: 'lead',
        entityId: leadId,
        eventType: qaEventType as any,
        payload: {
          score: normalizedAnalysis.score,
          qualificationStatus: normalizedAnalysis.qualification_status,
          qaStatus: qaStatus,
          qaDecision: qaDecisionComment,
          callDuration: callDuration,
          isShortDuration: isShortDurationCall,
          hasPositiveEngagement: hasPositiveEngagement,
          campaignId: lead.campaignId,
          contactId: lead.contactId,
          analysisHighlights: {
            contentInterest: normalizedAnalysis.analysis?.content_interest?.score,
            permissionGiven: normalizedAnalysis.analysis?.permission_given?.score,
            complianceConsent: normalizedAnalysis.analysis?.compliance_consent?.score,
          },
          missingInfo: normalizedAnalysis.missing_info,
        },
        createdBy: null,
      });
    } catch (logErr) {
      console.error('[AI-QA] Failed to log QA decision activity:', logErr);
    }

    return normalizedAnalysis;

  } catch (error) {
    console.error('[AI-QA] Error analyzing lead:', error);
    return null;
  }
}

/**
 * Build comprehensive analysis prompt
 */
function buildAnalysisPrompt(
  lead: any,
  contact: any,
  account: any,
  campaign: any,
  qaParams: QAParameters,
  existingQaData?: Record<string, any>
): string {
  // Extract Companies House data if available
  const chData = existingQaData || {};
  const hasCompaniesHouseData = chData.ch_validation_status === 'validated';
  
  return `Analyze this B2B telemarketing lead for qualification:

## CALL TRANSCRIPT:
${lead.transcript}

## CONTACT DATA (VERIFIED - ALREADY IN SYSTEM):
- Full Name: ${contact?.fullName || 'Not provided'}
- Email: ${contact?.email || 'Not provided'}
- Phone: ${contact?.directPhone || 'Not provided'}
- Job Title: ${contact?.jobTitle || 'Not provided'}
- Email Verification: ${contact?.emailVerificationStatus || 'Pending validation'}

## COMPANY/ACCOUNT DATA (VERIFIED - ALREADY IN SYSTEM):
- Company Name: ${account?.name || 'Not provided'}
- Industry: ${account?.industryStandardized || 'Not provided'}
- Company Size: ${account?.employeesSizeRange || 'Not provided'}
- Annual Revenue: ${account?.revenueRange || 'Not provided'}
- Technologies: ${account?.webTechnologies?.join(', ') || 'Not provided'}
- Domain: ${account?.domain || 'Not provided'}

${hasCompaniesHouseData ? `
## COMPANIES HOUSE VALIDATION (OFFICIAL UK REGISTRY - ALREADY VERIFIED):
- Legal Company Name: ${chData.ch_legal_name || 'N/A'}
- Company Registration Number: ${chData.ch_company_number || 'N/A'}
- Company Status: ${chData.ch_status || 'N/A'} ${chData.ch_is_active ? '(ACTIVE)' : '(INACTIVE)'}
- Date of Creation: ${chData.ch_date_of_creation || 'N/A'}
- Registered Address: ${chData.ch_address || 'N/A'}
- Validation Status: ✓ VERIFIED via Companies House UK API

**IMPORTANT: This company has been officially verified through the UK Companies House registry. Do NOT mark "Company Registration Number", "Company Status", or "Legal Name" as missing - they are already validated and available above.**
` : ''}

## CAMPAIGN OFFER:
${campaign?.name || 'Content offer'}
Call Script Context: ${campaign?.callScript?.substring(0, 500) || 'Marketing campaign'}

## QUALIFICATION CRITERIA:
${JSON.stringify(qaParams, null, 2)}

## YOUR TASK:
Evaluate this lead based on the following criteria (each scored 0-100):

1. **content_interest** (${qaParams.scoring_weights.content_interest}% weight): 
   - Did prospect show genuine interest in the whitepaper/eBook/guide?
   - Did they ask questions or express enthusiasm?

2. **permission_given** (${qaParams.scoring_weights.permission_given}% weight):
   - Did they explicitly agree to receive the content?
   - Did they say "yes" or give clear affirmative consent?

3. **compliance_consent** (${qaParams.scoring_weights.compliance_consent}% weight):
   - Did they agree to compliance statements (marketing, privacy)?
   - Did they acknowledge terms or not disagree?

4. **qualification_answers** (${qaParams.scoring_weights.qualification_answers}% weight):
   - Did they answer qualification questions satisfactorily?
   - Were responses aligned with client criteria?
   - IMPORTANT: If Companies House data is provided above, the company is ALREADY VERIFIED. Score this section based on conversation quality, NOT on whether registration details were verbally confirmed.

5. **data_accuracy** (${qaParams.scoring_weights.data_accuracy}% weight):
   - Does contact/company data match client audience criteria?
   - Industry: ${qaParams.client_criteria.industries?.join(', ') || 'any'}
   - Company Size: ${qaParams.client_criteria.company_size?.join(', ') || 'any'}
   - Revenue: ${qaParams.client_criteria.revenue_range?.join(', ') || 'any'}
   - Job Title: ${qaParams.client_criteria.job_titles?.join(', ') || 'any'}
   - Seniority Level: ${qaParams.client_criteria.seniority_levels?.join(', ') || 'any'}

6. **email_deliverable** (${qaParams.scoring_weights.email_deliverable}% weight):
   - Email Status: ${contact?.emailVerificationStatus || 'unknown'}
   - IMPORTANT: Only 'invalid' emails are considered non-deliverable. All other statuses ('valid', 'acceptable', 'unknown') should be scored as deliverable.
   - Score 100 for 'valid', 80-90 for 'acceptable', 60-70 for 'unknown', and 0 for 'invalid'.

## ACCOUNT VERIFICATION:
Verify if the account data aligns with client criteria:
- Industry match: ${qaParams.client_criteria.industries?.length ? 'Required: ' + qaParams.client_criteria.industries.join(', ') : 'Any'}
- Size match: ${qaParams.client_criteria.company_size ? 'Required: ' + qaParams.client_criteria.company_size.join(', ') : 'Any'}
- Revenue match: ${qaParams.client_criteria.revenue_range ? 'Required: ' + qaParams.client_criteria.revenue_range.join(', ') : 'Any'}
- Job Title match: ${qaParams.client_criteria.job_titles ? 'Required: ' + qaParams.client_criteria.job_titles.join(', ') : 'Any'}
- Seniority Level match: ${qaParams.client_criteria.seniority_levels ? 'Required: ' + qaParams.client_criteria.seniority_levels.join(', ') : 'Any'}

Return JSON in this exact format:
{
  "score": <0-100>,
  "qualification_status": "qualified" | "not_qualified" | "needs_review",
  "analysis": {
    "content_interest": { "score": <0-100>, "evidence": "<quote or explanation>" },
    "permission_given": { "score": <0-100>, "evidence": "<quote or explanation>" },
    "compliance_consent": { "score": <0-100>, "evidence": "<quote or explanation>" },
    "qualification_answers": { "score": <0-100>, "evidence": "<quote or explanation>" },
    "data_accuracy": { "score": <0-100>, "evidence": "<explanation>" },
    "email_deliverable": { "score": <0-100>, "evidence": "<verification status>" }
  },
  "missing_info": ["<list any TRULY missing info - DO NOT list info that's already provided in Contact Data, Company Data, or Companies House Validation sections above>"],
  "recommendations": ["<action items for QA team>"],
  "account_verification": {
    "industry_match": <true/false>,
    "size_match": <true/false>,
    "revenue_match": <true/false>,
    "technology_match": <true/false>,
    "confidence": <0-100>
  }
}

Calculate final score as weighted average. If score >= ${qaParams.min_score}, status is "qualified". If score < 40, status is "not_qualified". Otherwise "needs_review".`;
}

/**
 * Default QA parameters (used if campaign doesn't have custom params)
 */
function getDefaultQAParameters(): QAParameters {
  return {
    required_info: ['permission'],
    scoring_weights: {
      content_interest: 25,
      permission_given: 30,
      compliance_consent: 15,
      qualification_answers: 15,
      data_accuracy: 10,
      email_deliverable: 5,
    },
    min_score: 70,
    client_criteria: {},
  };
}

/**
 * Background job to analyze leads with transcripts but no AI analysis
 */
export async function processUnanalyzedLeads(): Promise<void> {
  try {
    // Find leads with transcripts but no AI analysis
    const unanalyzedLeads = await db.select()
      .from(leads)
      .where(eq(leads.transcriptionStatus, 'completed'))
      .limit(10);

    for (const lead of unanalyzedLeads) {
      if (!lead.aiScore && lead.transcript) {
        await analyzeLeadQualification(lead.id);
      }
    }
  } catch (error) {
    console.error('[AI-QA] Error processing unanalyzed leads:', error);
  }
}

/**
 * Re-evaluate all QA pending leads for a campaign
 * Used when campaign AI quality criteria are updated
 */
export async function reEvaluateCampaignLeads(campaignId: string): Promise<{
  success: boolean;
  processed: number;
  updated: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    success: true,
    processed: 0,
    updated: 0,
    failed: 0,
    errors: [] as string[]
  };

  try {
    console.log(`[AI-QA] Starting bulk re-evaluation for campaign ${campaignId}`);

    // Find all QA pending leads (new or under_review) with transcripts
    const qaLeads = await db.select()
      .from(leads)
      .where(eq(leads.campaignId, campaignId))
      .limit(1000); // Process up to 1000 leads at a time

    // Filter for leads in QA with transcripts
    const pendingLeads = qaLeads.filter(lead => 
      (lead.qaStatus === 'new' || lead.qaStatus === 'under_review') && 
      lead.transcript && 
      lead.transcriptionStatus === 'completed'
    );

    console.log(`[AI-QA] Found ${pendingLeads.length} QA pending leads with transcripts`);

    if (pendingLeads.length === 0) {
      return result;
    }

    // Re-analyze each lead
    for (const lead of pendingLeads) {
      try {
        result.processed++;
        console.log(`[AI-QA] Re-evaluating lead ${lead.id} (${result.processed}/${pendingLeads.length})`);
        
        const analysis = await analyzeLeadQualification(lead.id);
        
        if (analysis) {
          result.updated++;
        } else {
          result.failed++;
          result.errors.push(`Lead ${lead.id}: Analysis returned null`);
        }
      } catch (error) {
        result.failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Lead ${lead.id}: ${errorMsg}`);
        console.error(`[AI-QA] Error re-evaluating lead ${lead.id}:`, error);
      }
    }

    console.log(`[AI-QA] Re-evaluation complete. Processed: ${result.processed}, Updated: ${result.updated}, Failed: ${result.failed}`);
    
  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Campaign-level error: ${errorMsg}`);
    console.error('[AI-QA] Error in bulk re-evaluation:', error);
  }

  return result;
}
