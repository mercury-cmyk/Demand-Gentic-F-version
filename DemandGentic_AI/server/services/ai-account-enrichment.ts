import OpenAI from 'openai';
import { db } from "../db";
import { accounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import { withAiConcurrency } from "../lib/ai-concurrency";

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  timeout: 120_000,
  maxRetries: 2,
});

interface AccountEnrichmentResult {
  industry: string | null;
  employeeSize: string | null;
  revenueRange: string | null;
  technologies: string[];
  businessModel: string | null;
  headquarters: string | null;
  confidence: number;
  sources: string[];
  lastEnriched: Date;
}

interface ClientCriteria {
  industries?: string[];
  company_sizes?: string[];
  revenue_ranges?: string[];
  required_technologies?: string[];
  excluded_industries?: string[];
}

interface VerificationResult {
  matches: boolean;
  confidence: number;
  mismatches: string[];
  missing_data: string[];
  enriched_fields: string[];
}

/**
 * Enrich account data using AI web research
 */
export async function enrichAccountData(accountId: string): Promise {
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) return null;

    const companyName = account.name;
    const domain = account.domain;

    // Use AI to research company information
    const researchPrompt = `Research the following company and provide accurate, current information:

Company Name: ${companyName}
Domain: ${domain || 'Unknown'}

Provide the following information in JSON format:
{
  "industry": "",
  "employeeSize": "",
  "revenueRange": "",
  "technologies": [""],
  "businessModel": "",
  "headquarters": "",
  "confidence": ,
  "sources": [""]
}

Base your research on:
1. Company website and public information
2. Industry databases and news
3. Technology stack indicators
4. Market presence and reputation

If information is not available, use null for that field. Be conservative with confidence scores.`;

    const systemPrompt = await buildAgentSystemPrompt(
      "You are a B2B company research analyst. Provide accurate, verified company information based on public sources."
    );

    const completion = await withAiConcurrency(() => openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: researchPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }), 'account-enrichment');

    const resultText = completion.choices[0]?.message?.content;
    if (!resultText) return null;

    const enrichmentData = JSON.parse(resultText);

    // Update account with enriched data
    const updateData: any = {
      aiEnrichmentData: enrichmentData,
      aiEnrichmentDate: new Date(),
    };

    // Only update fields if they're more confident than existing data
    if (enrichmentData.industry && enrichmentData.confidence > 70) {
      updateData.industryStandardized = enrichmentData.industry;
    }
    if (enrichmentData.employeeSize && enrichmentData.confidence > 70) {
      updateData.employeesSizeRange = enrichmentData.employeeSize;
    }
    if (enrichmentData.revenueRange && enrichmentData.confidence > 70) {
      updateData.revenueRange = enrichmentData.revenueRange;
    }
    if (enrichmentData.technologies?.length > 0) {
      updateData.techStack = enrichmentData.technologies;
    }

    await db.update(accounts)
      .set(updateData)
      .where(eq(accounts.id, accountId));

    console.log('[AI-Enrichment] Account enriched:', companyName, 'Confidence:', enrichmentData.confidence);

    return {
      ...enrichmentData,
      lastEnriched: new Date(),
    };

  } catch (error) {
    console.error('[AI-Enrichment] Error enriching account:', error);
    return null;
  }
}

/**
 * Verify account matches client audience criteria
 */
export async function verifyAccountAgainstCriteria(
  accountId: string,
  clientCriteria: ClientCriteria
): Promise {
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    
    if (!account) {
      return {
        matches: false,
        confidence: 0,
        mismatches: ['Account not found'],
        missing_data: [],
        enriched_fields: [],
      };
    }

    // First, try to enrich if data is missing or old
    const needsEnrichment = !account.aiEnrichmentDate || 
      (new Date().getTime() - new Date(account.aiEnrichmentDate).getTime()) > 30 * 24 * 60 * 60 * 1000; // 30 days

    if (needsEnrichment) {
      await enrichAccountData(accountId);
      // Re-fetch updated account
      const [updatedAccount] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
      Object.assign(account, updatedAccount);
    }

    const mismatches: string[] = [];
    const missing_data: string[] = [];
    const enriched_fields: string[] = [];

    // Verify industry
    if (clientCriteria.industries?.length) {
      if (!account.industryStandardized) {
        missing_data.push('industry');
      } else if (!clientCriteria.industries.includes(account.industryStandardized)) {
        mismatches.push(`Industry mismatch: ${account.industryStandardized} not in [${clientCriteria.industries.join(', ')}]`);
      }
    }

    // Verify company size
    if (clientCriteria.company_sizes?.length) {
      if (!account.employeesSizeRange) {
        missing_data.push('company_size');
      } else if (!clientCriteria.company_sizes.includes(account.employeesSizeRange)) {
        mismatches.push(`Company size mismatch: ${account.employeesSizeRange} not in [${clientCriteria.company_sizes.join(', ')}]`);
      }
    }

    // Verify revenue range
    if (clientCriteria.revenue_ranges?.length) {
      if (!account.revenueRange) {
        missing_data.push('revenue_range');
      } else if (!clientCriteria.revenue_ranges.includes(account.revenueRange)) {
        mismatches.push(`Revenue mismatch: ${account.revenueRange} not in [${clientCriteria.revenue_ranges.join(', ')}]`);
      }
    }

    // Verify required technologies
    if (clientCriteria.required_technologies?.length) {
      const accountTechs = account.techStack || [];
      const matchingTechs = clientCriteria.required_technologies.filter(tech =>
        accountTechs.some((accountTech: string) => 
          accountTech.toLowerCase().includes(tech.toLowerCase()) ||
          tech.toLowerCase().includes(accountTech.toLowerCase())
        )
      );

      if (matchingTechs.length === 0) {
        mismatches.push(`Required technologies not found: ${clientCriteria.required_technologies.join(', ')}`);
      }
    }

    // Check excluded industries
    if (clientCriteria.excluded_industries?.length && account.industryStandardized) {
      if (clientCriteria.excluded_industries.includes(account.industryStandardized)) {
        mismatches.push(`Industry excluded: ${account.industryStandardized}`);
      }
    }

    // Track enriched fields
    if (account.aiEnrichmentData) {
      enriched_fields.push('AI-enriched data available');
    }

    // Calculate confidence
    const totalChecks = 
      (clientCriteria.industries?.length ? 1 : 0) +
      (clientCriteria.company_sizes?.length ? 1 : 0) +
      (clientCriteria.revenue_ranges?.length ? 1 : 0) +
      (clientCriteria.required_technologies?.length ? 1 : 0);

    const passedChecks = totalChecks - mismatches.length - missing_data.length;
    const confidence = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;

    return {
      matches: mismatches.length === 0 && missing_data.length === 0,
      confidence,
      mismatches,
      missing_data,
      enriched_fields,
    };

  } catch (error) {
    console.error('[AI-Enrichment] Error verifying account:', error);
    return {
      matches: false,
      confidence: 0,
      mismatches: ['Verification error'],
      missing_data: [],
      enriched_fields: [],
    };
  }
}

/**
 * Batch enrich accounts for a campaign
 */
/**
 * Generate AI Account Brief with deep insights
 */
export async function generateAccountBrief(accountId: string): Promise {
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) return null;

    const briefPrompt = `Analyze this B2B account and provide strategic insights:

Company: ${account.name}
Domain: ${account.domain || 'Unknown'}
Industry: ${account.industryStandardized || 'Unknown'}
Size: ${account.employeesSizeRange || 'Unknown'}

Generate a comprehensive AccountBrief with:
1. Main products/services they offer
2. Target markets (industries & geographies they serve)
3. Buyer personas (typical decision-maker titles)
4. Key pain points we could address
5. Tailored outreach angles

Return JSON format:
{
  "accountId": "${accountId}",
  "mainProducts": [{"name": "...", "desc": "..."}],
  "targetMarkets": [{"segment": "...", "geo": "..."}],
  "buyerTitles": ["..."],
  "industries": ["..."],
  "painHypotheses": [{"pain": "...", "proof": "..."}],
  "tailoredAngles": {
    "openingHook": "...",
    "tailoredOffer": "...",
    "caseStudy": "..."
  },
  "confidence": 0-100
}`;

    const systemPrompt = await buildAgentSystemPrompt(
      "You are a B2B sales intelligence analyst. Provide strategic account insights based on available data."
    );

    const completion = await withAiConcurrency(() => openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: briefPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }), 'account-brief');

    const resultText = completion.choices[0]?.message?.content;
    if (!resultText) return null;

    const brief = JSON.parse(resultText);

    // Store in account customFields
    await db.update(accounts)
      .set({
        customFields: {
          ...(account.customFields as any || {}),
          aiAccountBrief: brief,
          briefGeneratedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId));

    console.log('[AI-Brief] Generated account brief for:', account.name, 'Confidence:', brief.confidence);

    return brief;

  } catch (error) {
    console.error('[AI-Brief] Error generating account brief:', error);
    return null;
  }
}

export async function enrichCampaignAccounts(campaignId: string): Promise {
  try {
    // Get all unique account IDs from campaign queue via contacts
    const { campaignQueue, contacts: contactsTable } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const queueItems = await db
      .select({
        contactId: campaignQueue.contactId,
        accountId: contactsTable.accountId,
      })
      .from(campaignQueue)
      .leftJoin(contactsTable, eq(campaignQueue.contactId, contactsTable.id))
      .where(eq(campaignQueue.campaignId, campaignId));

    const uniqueAccountIds = new Set();
    queueItems.forEach(item => {
      if (item.accountId) {
        uniqueAccountIds.add(item.accountId);
      }
    });

    console.log(`[AI-Enrichment] Enriching ${uniqueAccountIds.size} accounts for campaign ${campaignId}`);

    // Enrich each account (in production, use queue/background job)
    const accountIdsArray = Array.from(uniqueAccountIds);
    for (const accountId of accountIdsArray) {
      await enrichAccountData(accountId);
      // Rate limit to avoid API throttling
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error('[AI-Enrichment] Error enriching campaign accounts:', error);
  }
}