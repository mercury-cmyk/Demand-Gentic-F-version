import { workerDb as db } from "../db";
import { leads, campaigns, contacts, accounts, activityLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { parseNaturalLanguageRules, generateDynamicEvaluationPrompt } from "./natural-language-rule-parser";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { deepAnalyzeJSON, chat } from "./vertex-ai/vertex-client";

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
 * CRITICAL: Optimized to batch queries and prevent connection pool exhaustion
 */
export async function analyzeLeadQualification(leadId: string): Promise<AIAnalysisResult | null> {
  try {
    // OPTIMIZATION: Batch all SELECT queries to reduce round trips
    // Instead of 4 sequential queries (lead, contact, account, campaign), use Promise.all
    const [
      [lead],
      contactData,
      accountData,
      campaignData
    ] = await Promise.all([
      // Query 1: Lead
      db.select().from(leads).where(eq(leads.id, leadId)).limit(1),
      
      // Query 2: Contact (conditional based on lead.contactId)
      // We'll fetch based on the lead data we get, but for now just fetch empty if needed
      Promise.resolve([]),
      
      // Query 3: Account (conditional)
      Promise.resolve([]),
      
      // Query 4: Campaign (conditional)
      Promise.resolve([])
    ]);

    if (!lead) return null;

    // Now fetch related records only if they're needed
    let contact: any = null;
    let account: any = null;
    let campaign: any = null;

    // Batch fetch remaining relationships if we have IDs
    if (lead.contactId || lead.campaignId) {
      const [contactResult, campaignResult] = await Promise.all([
        lead.contactId ? db.select().from(contacts).where(eq(contacts.id, lead.contactId)).limit(1) : Promise.resolve([]),
        lead.campaignId ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).limit(1) : Promise.resolve([])
      ]);
      
      [contact] = contactResult;
      [campaign] = campaignResult;
      
      // Fetch account only if we have a contact with accountId
      if (contact?.accountId) {
        const [accountResult] = await Promise.all([
          db.select().from(accounts).where(eq(accounts.id, contact.accountId)).limit(1)
        ]);
        [account] = accountResult;
      }
    }

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

      // Generate dynamic evaluation prompt (includes campaign objective & success criteria)
      analysisPrompt = generateDynamicEvaluationPrompt(
        parsedRules,
        customQaFields,
        lead.transcript,
        contactData,
        {
          campaignName: campaign?.name,
          campaignObjective: campaign?.campaignObjective,
          successCriteria: campaign?.successCriteria,
          targetAudienceDescription: campaign?.targetAudienceDescription,
          campaignContextBrief: campaign?.campaignContextBrief,
        }
      );
    } else {
      // Use standard evaluation (pass existingQaData for CH info)
      analysisPrompt = buildAnalysisPrompt(lead, contact, account, campaign, qaParams, existingQaData);
    }

    // Use Vertex AI (Gemini) for analysis - no external API keys needed
    const systemPrompt = await buildAgentSystemPrompt(
      "You are an expert B2B lead qualification analyst. Analyze call transcripts and data to determine if leads meet qualification criteria. Return structured JSON analysis."
    );

    // Use Gemini 3 Deep Think for conversation quality analysis
    let rawAnalysis: any;
    try {
      console.log(`[AI-QA] Using Gemini 3 Deep Think for lead qualification (lead: ${leadId})`);
      const fullPrompt = `${systemPrompt}\n\n---\n\n${analysisPrompt}`;
      rawAnalysis = await deepAnalyzeJSON<any>(fullPrompt, {
        temperature: 0.3,
        maxTokens: 2000,
      });
    } catch (analysisError: any) {
      console.error('[AI-QA] Deep Think analysis failed:', analysisError.message);
      // Fallback to chat-based analysis
      console.log('[AI-QA] Falling back to chat...');
      try {
        const textResponse = await chat(systemPrompt, [{ role: "user", content: analysisPrompt + "\n\nRespond with valid JSON only." }], { temperature: 0.3, maxTokens: 2000 });
        rawAnalysis = JSON.parse(textResponse);
      } catch (chatError) {
        console.error('[AI-QA] Chat fallback also failed');
        throw chatError;
      }
    }

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

## CAMPAIGN OBJECTIVE & SUCCESS CRITERIA:
- Campaign: ${campaign?.name || 'Content offer'}
- Objective: ${campaign?.campaignObjective || 'Not specified'}
- Success Criteria: ${campaign?.successCriteria || 'Not specified'}
- Target Audience: ${campaign?.targetAudienceDescription || 'Not specified'}
- Context Brief: ${campaign?.campaignContextBrief || 'Not specified'}
- Call Script Context: ${campaign?.callScript?.substring(0, 500) || 'Marketing campaign'}

**IMPORTANT**: Score this lead against the campaign objective and success criteria above.
- The lead MUST align with the stated objective to be considered qualified.
- The success criteria define what a successful outcome looks like — verify whether the call achieved it.
- If the target audience is specified, verify that the prospect matches the described profile.

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

## SCORING GUIDANCE:
- Calculate final score as weighted average.
- If score >= ${qaParams.min_score}, status is "qualified". If score < 40, status is "not_qualified". Otherwise "needs_review".
- CRITICAL: A lead can only be "qualified" if it aligns with the Campaign Objective and meets the Success Criteria listed above. Even if individual scores are high, reject or flag for review if the call outcome does not match the campaign's stated success criteria.`;
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
 * Helper to execute a database query with retry logic for connection errors
 * Handles Neon serverless connection termination gracefully
 */
async function withConnectionRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || String(error);

      // Check if this is a connection-level error (retryable)
      const isConnectionError =
        errorMsg.includes('Connection terminated') ||
        errorMsg.includes('connection timeout') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('unexpected') ||
        errorMsg.includes('Client has encountered a connection error');

      if (!isConnectionError || attempt === maxRetries) {
        throw error;
      }

      const delay = initialDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
      console.warn(`[AI-QA] Connection error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, errorMsg);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Background job to analyze leads with transcripts but no AI analysis
 * CRITICAL: Includes connection pool management and error recovery
 */
export async function processUnanalyzedLeads(): Promise<void> {
  try {
    console.log('[AI-QA] Starting background lead analysis batch...');

    // OPTIMIZATION: Set a query timeout to prevent connection hangs
    // If a query takes >30s, release the connection immediately
    const QUERY_TIMEOUT_MS = 30000;
    const ANALYSIS_TIMEOUT_MS = 60000; // Longer for AI analysis

    // CRITICAL: Query with hard limit to prevent connection pool exhaustion
    // Process only 3 leads per cycle to keep worker pool connections available
    const BATCH_SIZE = 3;

    let unanalyzedLeads: any[] = [];
    try {
      // FIXED: Use retry wrapper for Neon connection resilience
      unanalyzedLeads = await withConnectionRetry(async () => {
        const queryPromise = db.select()
          .from(leads)
          .where(eq(leads.transcriptionStatus, 'completed'))
          .limit(BATCH_SIZE);

        // Wrap query with timeout
        return await Promise.race([
          queryPromise,
          new Promise<any[]>((_, reject) =>
            setTimeout(() => reject(new Error('Lead query timed out after 30s')), QUERY_TIMEOUT_MS)
          )
        ]);
      });
    } catch (queryError: any) {
      console.error('[AI-QA] Failed to fetch unanalyzed leads after retries:', queryError.message);
      // Return early instead of crashing to allow next iteration
      return;
    }

    console.log(`[AI-QA] Found ${unanalyzedLeads.length} leads to analyze`);

    // CRITICAL: Process leads sequentially with timeout per lead
    for (const lead of unanalyzedLeads) {
      if (!lead.aiScore && lead.transcript) {
        try {
          console.log(`[AI-QA] Analyzing lead: ${lead.id} (call duration: ${lead.callDuration}s)`);

          // Wrap analysis with retry logic for connection resilience AND timeout
          const result = await withConnectionRetry(async () => {
            const analysisPromise = analyzeLeadQualification(lead.id);
            return await Promise.race([
              analysisPromise,
              new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error(`Analysis timeout for lead ${lead.id}`)), ANALYSIS_TIMEOUT_MS)
              )
            ]);
          }, 2, 2000); // 2 retries with 2s initial delay for analysis

          if (result) {
            console.log(`[AI-QA] ✓ Lead ${lead.id} analyzed (score: ${result.score}, status: ${result.qualification_status})`);
          }
        } catch (leadError: any) {
          console.warn(`[AI-QA] ⚠️ Failed to analyze lead ${lead.id}:`, leadError.message);
          // Continue to next lead instead of failing entire batch
          continue;
        }
      }
    }

    console.log(`[AI-QA] Background batch complete (processed ${unanalyzedLeads.length} leads)`);
  } catch (error) {
    console.error('[AI-QA] Error processing unanalyzed leads:', error);
    // Don't throw - allow job scheduler to continue running
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

// ==================== QA CONTENT TYPE ANALYSIS ====================

import {
  clientSimulationSessions,
  clientMockCalls,
  clientReports,
} from "@shared/schema";

/**
 * Generic content analysis result for non-lead content types
 */
export interface ContentAnalysisResult {
  score: number;
  qualificationStatus: 'qualified' | 'not_qualified' | 'needs_review';
  highlights: string[];
  recommendations: string[];
  analysis: {
    quality: { score: number; evidence: string };
    completeness: { score: number; evidence: string };
    professionalism: { score: number; evidence: string };
    clientReadiness: { score: number; evidence: string };
  };
}

/**
 * Analyze simulation session quality for client delivery
 */
export async function analyzeSimulationQuality(sessionId: string): Promise<ContentAnalysisResult | null> {
  try {
    const [session] = await db
      .select()
      .from(clientSimulationSessions)
      .where(eq(clientSimulationSessions.id, sessionId))
      .limit(1);

    if (!session) {
      console.error(`[AI-QA] Simulation session not found: ${sessionId}`);
      return null;
    }

    // Build analysis based on session data
    let qualityScore = 50;
    let completenessScore = 50;
    let professionalismScore = 70;
    let clientReadinessScore = 50;
    const highlights: string[] = [];
    const recommendations: string[] = [];

    // Analyze transcript quality
    const transcript = session.transcript as Array<{ role: string; content: string }> | null;
    if (transcript && Array.isArray(transcript)) {
      const messageCount = transcript.length;
      const totalLength = transcript.reduce((acc, msg) => acc + (msg.content?.length || 0), 0);

      if (messageCount >= 6) {
        qualityScore += 20;
        highlights.push('Substantial conversation with multiple exchanges');
      } else if (messageCount < 3) {
        recommendations.push('Very short conversation - may not demonstrate full capabilities');
      }

      if (totalLength > 500) {
        completenessScore += 15;
        highlights.push('Detailed responses throughout conversation');
      }

      // Check for agent vs user balance
      const agentMessages = transcript.filter(m => m.role === 'assistant' || m.role === 'agent').length;
      const userMessages = transcript.filter(m => m.role === 'user' || m.role === 'prospect').length;
      if (agentMessages > 0 && userMessages > 0 && Math.abs(agentMessages - userMessages) <= 2) {
        professionalismScore += 10;
        highlights.push('Balanced conversation flow');
      }
    } else {
      recommendations.push('No transcript available for analysis');
      completenessScore -= 20;
    }

    // Analyze duration
    if (session.durationSeconds) {
      if (session.durationSeconds >= 60) {
        qualityScore += 15;
        clientReadinessScore += 15;
        highlights.push('Good conversation duration');
      } else if (session.durationSeconds < 30) {
        recommendations.push('Short duration - consider longer demonstration');
        clientReadinessScore -= 10;
      }
    }

    // Check for evaluation results
    if (session.evaluationResult) {
      const evalResult = session.evaluationResult as { score?: number; strengths?: string[]; improvements?: string[] };
      if (evalResult.strengths && evalResult.strengths.length > 0) {
        highlights.push(...evalResult.strengths.slice(0, 2));
        qualityScore += 10;
      }
      if (evalResult.improvements && evalResult.improvements.length > 0) {
        recommendations.push(...evalResult.improvements.slice(0, 2));
      }
    }

    // Check session name (indicates intentional demo)
    if (session.sessionName) {
      clientReadinessScore += 5;
      highlights.push('Named session for client reference');
    }

    // Calculate final score
    const finalScore = Math.round(
      (qualityScore * 0.35) +
      (completenessScore * 0.25) +
      (professionalismScore * 0.2) +
      (clientReadinessScore * 0.2)
    );

    const qualificationStatus = finalScore >= 70 ? 'qualified' :
      (finalScore >= 45 ? 'needs_review' : 'not_qualified');

    return {
      score: Math.min(100, finalScore),
      qualificationStatus,
      highlights,
      recommendations,
      analysis: {
        quality: { score: Math.min(100, qualityScore), evidence: 'Conversation depth and engagement' },
        completeness: { score: Math.min(100, completenessScore), evidence: 'Transcript and data completeness' },
        professionalism: { score: Math.min(100, professionalismScore), evidence: 'Conversation flow and tone' },
        clientReadiness: { score: Math.min(100, clientReadinessScore), evidence: 'Ready for client presentation' },
      },
    };
  } catch (error) {
    console.error('[AI-QA] Error analyzing simulation:', error);
    return null;
  }
}

/**
 * Analyze mock call quality for client delivery
 */
export async function analyzeMockCallQuality(callId: string): Promise<ContentAnalysisResult | null> {
  try {
    const [call] = await db
      .select()
      .from(clientMockCalls)
      .where(eq(clientMockCalls.id, callId))
      .limit(1);

    if (!call) {
      console.error(`[AI-QA] Mock call not found: ${callId}`);
      return null;
    }

    let qualityScore = 50;
    let completenessScore = 50;
    let professionalismScore = 60;
    let clientReadinessScore = 50;
    const highlights: string[] = [];
    const recommendations: string[] = [];

    // Check recording availability
    if (call.recordingUrl) {
      qualityScore += 20;
      clientReadinessScore += 15;
      highlights.push('Call recording available for playback');
    } else {
      recommendations.push('No recording available - client cannot listen to call');
      clientReadinessScore -= 15;
    }

    // Check transcript
    if (call.transcript && call.transcript.length > 100) {
      completenessScore += 20;
      highlights.push('Full transcript available');

      // Simple keyword analysis for professionalism
      const lowerTranscript = call.transcript.toLowerCase();
      if (lowerTranscript.includes('thank') || lowerTranscript.includes('appreciate')) {
        professionalismScore += 10;
      }
      if (lowerTranscript.includes('interested') || lowerTranscript.includes('tell me more')) {
        qualityScore += 10;
        highlights.push('Positive engagement detected');
      }
    } else if (call.transcript) {
      completenessScore += 10;
      recommendations.push('Transcript is brief - consider more detailed call');
    } else {
      recommendations.push('No transcript available');
      completenessScore -= 10;
    }

    // Check duration
    if (call.durationSeconds) {
      if (call.durationSeconds >= 60) {
        qualityScore += 15;
        highlights.push('Good call duration for demonstration');
      } else if (call.durationSeconds >= 30) {
        qualityScore += 10;
      } else {
        recommendations.push('Very short call - may not effectively demonstrate capabilities');
      }
    }

    // Check disposition
    if (call.disposition) {
      completenessScore += 10;
      if (['qualified', 'connected', 'callback-requested'].includes(call.disposition)) {
        qualityScore += 10;
        highlights.push(`Positive outcome: ${call.disposition}`);
      }
    }

    // Use existing AI analysis if available
    if (call.aiAnalysis) {
      const analysis = call.aiAnalysis as { highlights?: string[]; recommendations?: string[] };
      if (analysis.highlights) highlights.push(...analysis.highlights.slice(0, 2));
      if (analysis.recommendations) recommendations.push(...analysis.recommendations.slice(0, 2));
    }

    if (call.aiScore) {
      // Weight existing AI score into quality
      qualityScore = Math.round((qualityScore + call.aiScore) / 2);
    }

    // Calculate final score
    const finalScore = Math.round(
      (qualityScore * 0.4) +
      (completenessScore * 0.25) +
      (professionalismScore * 0.15) +
      (clientReadinessScore * 0.2)
    );

    const qualificationStatus = finalScore >= 70 ? 'qualified' :
      (finalScore >= 45 ? 'needs_review' : 'not_qualified');

    return {
      score: Math.min(100, finalScore),
      qualificationStatus,
      highlights,
      recommendations,
      analysis: {
        quality: { score: Math.min(100, qualityScore), evidence: 'Call quality and engagement' },
        completeness: { score: Math.min(100, completenessScore), evidence: 'Recording and transcript availability' },
        professionalism: { score: Math.min(100, professionalismScore), evidence: 'Call conduct and tone' },
        clientReadiness: { score: Math.min(100, clientReadinessScore), evidence: 'Ready for client review' },
      },
    };
  } catch (error) {
    console.error('[AI-QA] Error analyzing mock call:', error);
    return null;
  }
}

/**
 * Analyze report quality for client delivery
 */
export async function analyzeReportQuality(reportId: string): Promise<ContentAnalysisResult | null> {
  try {
    const [report] = await db
      .select()
      .from(clientReports)
      .where(eq(clientReports.id, reportId))
      .limit(1);

    if (!report) {
      console.error(`[AI-QA] Report not found: ${reportId}`);
      return null;
    }

    let qualityScore = 60;
    let completenessScore = 50;
    let professionalismScore = 70;
    let clientReadinessScore = 60;
    const highlights: string[] = [];
    const recommendations: string[] = [];

    // Check report data
    const reportData = report.reportData as Record<string, unknown> | null;
    if (reportData && Object.keys(reportData).length > 0) {
      completenessScore += 20;
      const dataPoints = Object.keys(reportData).length;
      if (dataPoints >= 5) {
        qualityScore += 15;
        highlights.push('Comprehensive data included');
      }
    } else {
      recommendations.push('Report data is empty or missing');
      completenessScore -= 20;
    }

    // Check summary
    if (report.reportSummary && report.reportSummary.length > 50) {
      qualityScore += 15;
      clientReadinessScore += 10;
      highlights.push('Executive summary provided');
    } else {
      recommendations.push('Add a summary for quick client review');
    }

    // Check date range
    if (report.reportPeriodStart && report.reportPeriodEnd) {
      completenessScore += 15;
      highlights.push('Clear reporting period defined');
    } else {
      recommendations.push('Specify the report date range');
    }

    // Check file export
    if (report.fileUrl) {
      clientReadinessScore += 15;
      highlights.push('Export file available for download');

      if (report.fileFormat === 'pdf') {
        professionalismScore += 10;
        highlights.push('Professional PDF format');
      }
    } else {
      recommendations.push('Generate a downloadable file for client');
    }

    // Check report type
    if (report.reportType) {
      completenessScore += 5;
    }

    // Calculate final score
    const finalScore = Math.round(
      (qualityScore * 0.3) +
      (completenessScore * 0.3) +
      (professionalismScore * 0.15) +
      (clientReadinessScore * 0.25)
    );

    const qualificationStatus = finalScore >= 70 ? 'qualified' :
      (finalScore >= 45 ? 'needs_review' : 'not_qualified');

    return {
      score: Math.min(100, finalScore),
      qualificationStatus,
      highlights,
      recommendations,
      analysis: {
        quality: { score: Math.min(100, qualityScore), evidence: 'Data quality and insights' },
        completeness: { score: Math.min(100, completenessScore), evidence: 'Report completeness' },
        professionalism: { score: Math.min(100, professionalismScore), evidence: 'Professional presentation' },
        clientReadiness: { score: Math.min(100, clientReadinessScore), evidence: 'Ready for client delivery' },
      },
    };
  } catch (error) {
    console.error('[AI-QA] Error analyzing report:', error);
    return null;
  }
}

/**
 * Unified content analysis entry point
 * Routes to appropriate analyzer based on content type
 */
export async function analyzeContentQualification(
  contentType: 'simulation' | 'mock_call' | 'report' | 'lead',
  contentId: string
): Promise<ContentAnalysisResult | AIAnalysisResult | null> {
  switch (contentType) {
    case 'simulation':
      return analyzeSimulationQuality(contentId);
    case 'mock_call':
      return analyzeMockCallQuality(contentId);
    case 'report':
      return analyzeReportQuality(contentId);
    case 'lead':
      return analyzeLeadQualification(contentId);
    default:
      console.error(`[AI-QA] Unknown content type: ${contentType}`);
      return null;
  }
}
