import { createHash } from "crypto";
import { db } from "../db";
import {
  accounts,
  accountIntelligenceRecords,
  accountMessagingBriefs,
  callAttempts,
  campaigns,
  contacts,
  emailEvents,
  pipelineOpportunities,
  type AccountIntelligenceRecord,
  type AccountMessagingBrief,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";

const ACCOUNT_INTELLIGENCE_TTL_DAYS = 14;
const ACCOUNT_MESSAGING_BRIEF_TTL_DAYS = 30;
const ACCOUNT_CONFIDENCE_THRESHOLD = 0.7;
const PROVIDER_AUTH_COOLDOWN_MS = 15 * 60 * 1000;

const providerAuthCooldownUntil: Record = {
  deepseek: 0,
  gemini: 0,
  openai: 0,
};

export type AccountIntelligencePayload = {
  account_id: string;
  problem_hypothesis: string;
  recommended_angle: string;
  do_not_use: string[];
  tone: string;
  confidence: number;
};

export type AccountMessagingBriefPayload = {
  account_id: string;
  problem: string;
  insight: string;
  posture: string;
  outcome: string;
  confidence: number;
  meta: {
    campaign_fingerprint: string;
    intelligence_version: number;
    intelligence_confidence: number;
  };
};

type AccountSignalContext = {
  account: {
    id: string;
    name: string;
    domain: string | null;
    websiteDomain: string | null;
    industry: string | null;
    industryRaw: string | null;
    industryAiSuggested: string | null;
    description: string | null;
    tags: string[] | null;
    intentTopics: string[] | null;
    techStack: string[] | null;
    aiEnrichmentData: any;
    updatedAt: Date | null;
  };
  contactStats: {
    total: number;
    lastUpdatedAt: Date | null;
  };
  pipelineStatus: {
    status: string | null;
    updatedAt: Date | null;
  };
  lastTouchAt: Date | null;
};

type CampaignIntent = {
  id: string;
  type: string | null;
  campaignObjective: string | null;
  targetAudienceDescription: string | null;
  successCriteria: string | null;
  campaignContextBrief: string | null;
  talkingPoints: string[] | null;
};

export type AccountProfileData = {
  name: string;
  domain?: string | null;
  industry?: string | null;
  description?: string | null;
  employeeCount?: number | string | null;
  revenue?: string | null;
};

export function buildAccountContextSection(
  intelligence: AccountIntelligencePayload,
  brief: AccountMessagingBriefPayload,
  accountProfile?: AccountProfileData | null
): string {
  const sections: string[] = [];

  // Add account profile if provided
  if (accountProfile) {
    const profileParts: string[] = [];
    profileParts.push(`Company: ${accountProfile.name}`);
    if (accountProfile.domain) profileParts.push(`Domain: ${accountProfile.domain}`);
    if (accountProfile.industry) profileParts.push(`Industry: ${accountProfile.industry}`);
    if (accountProfile.description) profileParts.push(`Description: ${accountProfile.description}`);
    if (accountProfile.employeeCount) profileParts.push(`Employee Count: ${accountProfile.employeeCount}`);
    if (accountProfile.revenue) profileParts.push(`Revenue: ${accountProfile.revenue}`);

    sections.push("# Account Profile");
    sections.push(profileParts.join("\n"));
    sections.push("");
  }

  sections.push("# Account Intelligence (Required)");
  sections.push(JSON.stringify(intelligence, null, 2));
  sections.push("");
  sections.push("# Account Messaging Brief (Required)");
  sections.push(JSON.stringify(brief, null, 2));
  sections.push("");
  sections.push("Rules:");
  sections.push("- Do not introduce ideas beyond the Account Messaging Brief.");
  sections.push("- Avoid sales language, promotion, or assumptive pain statements.");
  sections.push(`- If confidence  {
  const [latest] = await db
    .select()
    .from(accountIntelligenceRecords)
    .where(eq(accountIntelligenceRecords.accountId, accountId))
    .orderBy(desc(accountIntelligenceRecords.version))
    .limit(1);

  const signals = await loadAccountSignals(accountId);
  const sourceFingerprint = buildSourceFingerprint(signals);

  const shouldRegenerate =
    !latest ||
    isTtlExpired(latest.createdAt, ACCOUNT_INTELLIGENCE_TTL_DAYS) ||
    latest.sourceFingerprint !== sourceFingerprint;

  if (!shouldRegenerate) {
    return latest;
  }

  const payload = await generateAccountIntelligencePayload(signals);
  const version = latest ? latest.version + 1 : 1;

  try {
    const [inserted] = await db
      .insert(accountIntelligenceRecords)
      .values({
        accountId,
        version,
        sourceFingerprint,
        confidence: payload.confidence,
        payloadJson: payload,
      })
      .returning();

    return inserted;
  } catch (error: any) {
    // Handle duplicate key constraint - another request might have inserted this version
    if (error?.code === '23505') {
      // Query for the existing record with this version
      const [existing] = await db
        .select()
        .from(accountIntelligenceRecords)
        .where(
          and(
            eq(accountIntelligenceRecords.accountId, accountId),
            eq(accountIntelligenceRecords.version, version)
          )
        )
        .limit(1);
      
      if (existing) {
        return existing;
      }
    }
    
    // Re-throw if it's a different error or we couldn't find the record
    throw error;
  }
}

export async function getOrBuildAccountMessagingBrief(params: {
  accountId: string;
  campaignId?: string | null;
  intelligenceRecord?: AccountIntelligenceRecord;
}): Promise {
  const { accountId, campaignId } = params;
  const intelligenceRecord =
    params.intelligenceRecord || (await getOrBuildAccountIntelligence(accountId));

  const [latest] = await db
    .select()
    .from(accountMessagingBriefs)
    .where(
      and(
        eq(accountMessagingBriefs.accountId, accountId),
        campaignId
          ? eq(accountMessagingBriefs.campaignId, campaignId)
          : sql`${accountMessagingBriefs.campaignId} IS NULL`
      )
    )
    .orderBy(desc(accountMessagingBriefs.createdAt))
    .limit(1);

  const campaignIntent = await loadCampaignIntent(campaignId || null);
  const campaignFingerprint = buildCampaignFingerprint(campaignIntent);
  const existingFingerprint = extractCampaignFingerprint(latest?.payloadJson);

  const shouldRegenerate =
    !latest ||
    isTtlExpired(latest.createdAt, ACCOUNT_MESSAGING_BRIEF_TTL_DAYS) ||
    latest.intelligenceVersion !== intelligenceRecord.version ||
    existingFingerprint !== campaignFingerprint;

  if (!shouldRegenerate) {
    return latest;
  }

  const intelligencePayload = intelligenceRecord.payloadJson as AccountIntelligencePayload;
  const briefPayload = await generateAccountMessagingBriefPayload({
    accountId,
    intelligence: intelligencePayload,
    intelligenceVersion: intelligenceRecord.version,
    campaignFingerprint,
    campaignIntent,
  });

  const [inserted] = await db
    .insert(accountMessagingBriefs)
    .values({
      accountId,
      campaignId: campaignId || null,
      intelligenceVersion: intelligenceRecord.version,
      payloadJson: briefPayload,
    })
    .returning();

  return inserted;
}

async function loadAccountSignals(accountId: string): Promise {
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      websiteDomain: accounts.websiteDomain,
      industry: accounts.industryStandardized,
      industryRaw: accounts.industryRaw,
      industryAiSuggested: accounts.industryAiSuggested,
      description: accounts.description,
      tags: accounts.tags,
      intentTopics: accounts.intentTopics,
      techStack: accounts.techStack,
      aiEnrichmentData: accounts.aiEnrichmentData,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    throw new Error(`Account intelligence blocked: account ${accountId} not found.`);
  }

  const [contactStats] = await db
    .select({
      total: sql`count(*)`,
      lastUpdatedAt: sql`max(${contacts.updatedAt})`,
    })
    .from(contacts)
    .where(eq(contacts.accountId, accountId));

  const [emailStats] = await db
    .select({
      lastEmailAt: sql`max(${emailEvents.createdAt})`,
    })
    .from(emailEvents)
    .innerJoin(contacts, eq(emailEvents.contactId, contacts.id))
    .where(eq(contacts.accountId, accountId));

  const [callStats] = await db
    .select({
      lastCallAt: sql`max(${callAttempts.createdAt})`,
    })
    .from(callAttempts)
    .innerJoin(contacts, eq(callAttempts.contactId, contacts.id))
    .where(eq(contacts.accountId, accountId));

  const [pipeline] = await db
    .select({
      status: pipelineOpportunities.status,
      updatedAt: pipelineOpportunities.updatedAt,
    })
    .from(pipelineOpportunities)
    .where(eq(pipelineOpportunities.accountId, accountId))
    .orderBy(desc(pipelineOpportunities.updatedAt))
    .limit(1);

  const lastTouchAt = maxDate(emailStats?.lastEmailAt || null, callStats?.lastCallAt || null);

  return {
    account,
    contactStats: {
      total: Number(contactStats?.total || 0),
      lastUpdatedAt: contactStats?.lastUpdatedAt || null,
    },
    pipelineStatus: {
      status: pipeline?.status || null,
      updatedAt: pipeline?.updatedAt || null,
    },
    lastTouchAt,
  };
}

async function loadCampaignIntent(campaignId: string | null): Promise {
  if (!campaignId) return null;

  const [campaign] = await db
    .select({
      id: campaigns.id,
      type: campaigns.type,
      campaignObjective: campaigns.campaignObjective,
      targetAudienceDescription: campaigns.targetAudienceDescription,
      successCriteria: campaigns.successCriteria,
      campaignContextBrief: campaigns.campaignContextBrief,
      talkingPoints: campaigns.talkingPoints,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return null;

  return {
    id: campaign.id,
    type: campaign.type,
    campaignObjective: campaign.campaignObjective,
    targetAudienceDescription: campaign.targetAudienceDescription,
    successCriteria: campaign.successCriteria,
    campaignContextBrief: campaign.campaignContextBrief,
    talkingPoints: (campaign.talkingPoints as string[] | null) ?? null,
  };
}

function buildSourceFingerprint(signals: AccountSignalContext): string {
  const payload = {
    domain: signals.account.domain || signals.account.websiteDomain,
    industry:
      signals.account.industry ||
      signals.account.industryRaw ||
      signals.account.industryAiSuggested,
    tags: signals.account.tags || [],
    intentTopics: signals.account.intentTopics || [],
    techStack: signals.account.techStack || [],
    accountUpdatedAt: toIso(signals.account.updatedAt),
    contactCount: signals.contactStats.total,
    contactUpdatedAt: toIso(signals.contactStats.lastUpdatedAt),
    pipelineStatus: signals.pipelineStatus.status,
    pipelineUpdatedAt: toIso(signals.pipelineStatus.updatedAt),
    lastTouchAt: toIso(signals.lastTouchAt),
  };

  return hashObject(payload);
}

function buildCampaignFingerprint(campaignIntent: CampaignIntent | null): string {
  if (!campaignIntent) {
    return hashObject({ campaign: null });
  }

  return hashObject({
    id: campaignIntent.id,
    type: campaignIntent.type,
    objective: campaignIntent.campaignObjective,
    targetAudience: campaignIntent.targetAudienceDescription,
    successCriteria: campaignIntent.successCriteria,
    contextBrief: campaignIntent.campaignContextBrief,
    talkingPoints: campaignIntent.talkingPoints || [],
  });
}

function extractCampaignFingerprint(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (payload.meta && typeof payload.meta.campaign_fingerprint === "string") {
    return payload.meta.campaign_fingerprint;
  }
  return null;
}

async function generateAccountIntelligencePayload(
  signals: AccountSignalContext
): Promise {
  // Use DeepSeek for account intelligence (cost-effective, no quota issues)
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    console.warn("[AccountIntelligence] DeepSeek API key not configured, using fallback");
    return buildFallbackAccountIntelligence(signals);
  }

  const systemPrompt = await buildAgentSystemPrompt(`
You are a senior autonomous campaign intelligence engine.
Generate Account Intelligence before any participant messaging.
Avoid sales language, promotion, or assumptive pain statements.
Include industry, business model, demand-generation challenges, observable signals, and messaging angles.
Return JSON only in this strict format:
{
  "account_id": "",
  "problem_hypothesis": "",
  "recommended_angle": "",
  "do_not_use": [],
  "tone": "",
  "confidence": 0.0
}`);

  const recentSignals: string[] = [];
  const enrichment = signals.account.aiEnrichmentData as any;
  if (enrichment?.recentNews) recentSignals.push(`Recent news: ${enrichment.recentNews}`);
  if (signals.account.intentTopics?.length) {
    recentSignals.push(`Intent topics: ${signals.account.intentTopics.join(", ")}`);
  }
  if (signals.account.tags?.length) {
    recentSignals.push(`Tags: ${signals.account.tags.join(", ")}`);
  }
  if (signals.account.techStack?.length) {
    recentSignals.push(`Tech stack: ${signals.account.techStack.join(", ")}`);
  }
  if (signals.pipelineStatus.status) {
    recentSignals.push(`Pipeline status: ${signals.pipelineStatus.status}`);
  }
  if (signals.lastTouchAt) {
    // Handle both Date objects and string timestamps from database
    const lastTouchDate = signals.lastTouchAt instanceof Date 
      ? signals.lastTouchAt 
      : new Date(signals.lastTouchAt);
    if (!isNaN(lastTouchDate.getTime())) {
      recentSignals.push(`Last touch: ${lastTouchDate.toISOString()}`);
    }
  }

  try {
    const OpenAI = (await import("openai")).default;
    const deepseek = new OpenAI({ 
      apiKey: deepseekKey,
      baseURL: 'https://api.deepseek.com/v1',
    });

    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Account data:
${JSON.stringify(
  {
    account_id: signals.account.id,
    name: signals.account.name,
    domain: signals.account.domain || signals.account.websiteDomain,
    description: signals.account.description,
    industry:
      signals.account.industry ||
      signals.account.industryRaw ||
      signals.account.industryAiSuggested,
  },
  null,
  2
)}

Contact summary:
${JSON.stringify(
  {
    total_contacts: signals.contactStats.total,
    last_contact_update: toIso(signals.contactStats.lastUpdatedAt),
  },
  null,
  2
)}

Signals:
${recentSignals.length > 0 ? recentSignals.join("\n") : "None observed"}

Return the Account Intelligence JSON now.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return normalizeAccountIntelligencePayload(parsed, signals.account.id);
  } catch (error) {
    console.error("[AccountIntelligence] DeepSeek generation failed:", error);
    return buildFallbackAccountIntelligence(signals);
  }
}

async function generateAccountMessagingBriefPayload(params: {
  accountId: string;
  intelligence: AccountIntelligencePayload;
  intelligenceVersion: number;
  campaignFingerprint: string;
  campaignIntent: CampaignIntent | null;
}): Promise {
  // Prefer DeepSeek, then Gemini, then OpenAI
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!deepseekKey && !geminiKey && !openaiKey) {
    return buildFallbackMessagingBrief(params);
  }

  const systemPrompt = await buildAgentSystemPrompt(`
You are a senior autonomous campaign intelligence engine.
Produce a single Account Messaging Brief derived strictly from Account Intelligence.
Do not introduce new ideas or claims outside the intelligence.
If account confidence  now;
  const geminiCoolingDown = providerAuthCooldownUntil.gemini > now;
  const openaiCoolingDown = providerAuthCooldownUntil.openai > now;

  // Try DeepSeek first
  if (deepseekKey && !deepseekCoolingDown) {
    try {
      const OpenAI = (await import("openai")).default;
      const deepseek = new OpenAI({
        apiKey: deepseekKey,
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
      });

      const response = await deepseek.chat.completions.create({
        model: process.env.DEEPSEEK_MESSAGING_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return normalizeMessagingBriefPayload(parsed, params);
    } catch (deepseekError) {
      const details = formatProviderError(deepseekError);
      const status = getErrorStatusCode(deepseekError);

      if (status === 401 || status === 403) {
        providerAuthCooldownUntil.deepseek = Date.now() + PROVIDER_AUTH_COOLDOWN_MS;
        console.warn(
          `[AccountMessagingBrief] DeepSeek auth blocked (status ${status}) - cooling down ${Math.round(
            PROVIDER_AUTH_COOLDOWN_MS / 60000
          )}m before retry.`,
          details
        );
      } else {
        console.warn("[AccountMessagingBrief] DeepSeek generation failed, trying Gemini/OpenAI:", details);
      }
    }
  } else if (deepseekKey && deepseekCoolingDown) {
    console.warn("[AccountMessagingBrief] DeepSeek temporarily skipped due to recent auth failure cooldown.");
  }

  // Try Gemini first (preferred for cost and quota reasons)
  if (geminiKey && !geminiCoolingDown) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ 
        model: process.env.GEMINI_FLASH_MODEL || "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent([
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
      ].map(m => m.parts[0].text).join("\n"));

      const content = result.response.text() || "{}";
      const parsed = JSON.parse(content);
      return normalizeMessagingBriefPayload(parsed, params);
    } catch (geminiError) {
      const details = formatProviderError(geminiError);
      const status = getErrorStatusCode(geminiError);

      if (status === 401 || status === 403) {
        providerAuthCooldownUntil.gemini = Date.now() + PROVIDER_AUTH_COOLDOWN_MS;
        console.warn(
          `[AccountMessagingBrief] Gemini auth blocked (status ${status}) - cooling down ${Math.round(
            PROVIDER_AUTH_COOLDOWN_MS / 60000
          )}m before retry.`,
          details
        );
      } else {
        console.warn("[AccountMessagingBrief] Gemini generation failed, trying OpenAI:", details);
      }
    }
  } else if (geminiKey && geminiCoolingDown) {
    console.warn("[AccountMessagingBrief] Gemini temporarily skipped due to recent auth failure cooldown.");
  }

  // Fallback to OpenAI
  if (openaiKey && !openaiCoolingDown) {
    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: openaiKey });

      const response = await openai.chat.completions.create({
        model: process.env.DEMAND_ENGAGE_MODEL || "gpt-4o",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return normalizeMessagingBriefPayload(parsed, params);
    } catch (openaiError) {
      const details = formatProviderError(openaiError);
      const status = getErrorStatusCode(openaiError);

      // If integration key failed auth, attempt direct OpenAI key once before giving up.
      const directOpenAiKey = process.env.OPENAI_API_KEY;
      const shouldTryDirectOpenAiKey =
        (status === 401 || status === 403) &&
        !!directOpenAiKey &&
        directOpenAiKey !== openaiKey;

      if (shouldTryDirectOpenAiKey) {
        try {
          const OpenAI = (await import("openai")).default;
          const directOpenAi = new OpenAI({ apiKey: directOpenAiKey });

          const response = await directOpenAi.chat.completions.create({
            model: process.env.DEMAND_ENGAGE_MODEL || "gpt-4o",
            temperature: 0.2,
            max_tokens: 700,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
          });

          const content = response.choices[0]?.message?.content || "{}";
          const parsed = JSON.parse(content);
          console.warn("[AccountMessagingBrief] OpenAI fallback key succeeded after integration key auth failure.");
          return normalizeMessagingBriefPayload(parsed, params);
        } catch (directOpenAiError) {
          const directDetails = formatProviderError(directOpenAiError);
          const directStatus = getErrorStatusCode(directOpenAiError);
          if (directStatus === 401 || directStatus === 403) {
            providerAuthCooldownUntil.openai = Date.now() + PROVIDER_AUTH_COOLDOWN_MS;
          }
          console.error("[AccountMessagingBrief] OpenAI direct key retry failed:", directDetails);
        }
      } else if (status === 401 || status === 403) {
        providerAuthCooldownUntil.openai = Date.now() + PROVIDER_AUTH_COOLDOWN_MS;
      }

      console.error("[AccountMessagingBrief] OpenAI generation failed:", details);
    }
  } else if (openaiKey && openaiCoolingDown) {
    console.warn("[AccountMessagingBrief] OpenAI temporarily skipped due to recent auth failure cooldown.");
  }

  return buildFallbackMessagingBrief(params);
}

function normalizeAccountIntelligencePayload(
  raw: any,
  accountId: string
): AccountIntelligencePayload {
  const problem = typeof raw?.problem_hypothesis === "string" ? raw.problem_hypothesis : "";
  const angle = typeof raw?.recommended_angle === "string" ? raw.recommended_angle : "";
  const tone = typeof raw?.tone === "string" ? raw.tone : "neutral, exploratory";
  const doNotUse = Array.isArray(raw?.do_not_use)
    ? raw.do_not_use.map((item: any) => String(item)).filter((item) => item.trim())
    : [];

  return {
    account_id: accountId,
    problem_hypothesis: problem || "Insufficient data to assert a specific problem. Seek clarification.",
    recommended_angle: angle || "Explore their current account engagement approach with respectful curiosity.",
    do_not_use: doNotUse.length > 0 ? doNotUse : ["assumptive pain statements", "promotional language"],
    tone,
    confidence: clampConfidence(raw?.confidence),
  };
}

function normalizeMessagingBriefPayload(
  raw: any,
  params: {
    accountId: string;
    intelligence: AccountIntelligencePayload;
    intelligenceVersion: number;
    campaignFingerprint: string;
  }
): AccountMessagingBriefPayload {
  const problem = typeof raw?.problem === "string" ? raw.problem : "";
  const insight = typeof raw?.insight === "string" ? raw.insight : "";
  const posture = typeof raw?.posture === "string" ? raw.posture : "explore";
  const outcome = typeof raw?.outcome === "string" ? raw.outcome : "conversation";
  const confidence = clampConfidence(raw?.confidence);

  return {
    account_id: params.accountId,
    problem: problem || "Validate whether their current demand approach is meeting their goals.",
    insight: insight || "Some teams are refining account engagement to reduce trust and relevance gaps.",
    posture,
    outcome,
    confidence: confidence || params.intelligence.confidence,
    meta: {
      campaign_fingerprint: params.campaignFingerprint,
      intelligence_version: params.intelligenceVersion,
      intelligence_confidence: params.intelligence.confidence,
    },
  };
}

function buildFallbackAccountIntelligence(
  signals: AccountSignalContext
): AccountIntelligencePayload {
  const industry =
    signals.account.industry ||
    signals.account.industryRaw ||
    signals.account.industryAiSuggested ||
    "their industry";
  return {
    account_id: signals.account.id,
    problem_hypothesis: `Based on limited data for ${signals.account.name}, it is unclear whether account engagement is aligned to current ${industry} expectations. This should be validated.`,
    recommended_angle: "Explore how they prioritize account relevance and trust in outbound engagement.",
    do_not_use: ["assumptive pain statements", "promotional language", "feature pitching"],
    tone: "neutral, exploratory",
    confidence: 0.3,
  };
}

function buildFallbackMessagingBrief(params: {
  accountId: string;
  intelligence: AccountIntelligencePayload;
  intelligenceVersion: number;
  campaignFingerprint: string;
}): AccountMessagingBriefPayload {
  const lowConfidence = params.intelligence.confidence  ttlMs;
}

function hashObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  
  // If already a Date object
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // If it's a string, try to parse it
  if (typeof value === 'string') {
    try {
      return new Date(value).toISOString();
    } catch {
      return null;
    }
  }
  
  return null;
}

function clampConfidence(value: any): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.4;
  return Math.min(1, Math.max(0, numeric));
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a > b ? a : b;
  return a || b || null;
}

function getErrorStatusCode(error: any): number | null {
  const status =
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    error?.cause?.status;

  const num = Number(status);
  return Number.isFinite(num) ? num : null;
}

function formatProviderError(error: any): Record {
  const message =
    error?.message ??
    error?.error?.message ??
    error?.response?.data?.error?.message ??
    "Unknown provider error";

  return {
    name: error?.name,
    message,
    status: getErrorStatusCode(error),
    statusText: error?.statusText ?? error?.response?.statusText,
    code: error?.code ?? error?.error?.code,
    type: error?.type ?? error?.error?.type,
    requestId: error?.requestID ?? error?.response?.headers?.["x-request-id"],
  };
}

/**
 * Load account profile data for including in agent prompts
 */
export async function getAccountProfileData(accountId: string): Promise {
  const [account] = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      domain: accounts.domain,
      websiteDomain: accounts.websiteDomain,
      industryStandardized: accounts.industryStandardized,
      industryRaw: accounts.industryRaw,
      industryAiSuggested: accounts.industryAiSuggested,
      description: accounts.description,
      employeeCount: accounts.staffCount,
      revenue: accounts.annualRevenue,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    return null;
  }

  const industry = account.industryStandardized || account.industryRaw || account.industryAiSuggested;

  return {
    name: account.name,
    domain: account.domain || account.websiteDomain,
    industry: industry || null,
    description: account.description,
    employeeCount: account.employeeCount,
    revenue: account.revenue,
  };
}