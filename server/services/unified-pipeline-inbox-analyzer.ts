import { extractCompanyNameFromDomain, extractRootDomain, normalizeDomain } from "@shared/domain-utils";
import {
  campaigns,
  dealConversations,
  dealMessages,
  inboxCategories,
  mailboxAccounts,
  unifiedPipelineAccounts,
  unifiedPipelineActions,
  unifiedPipelineContacts,
} from "@shared/schema";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../db";
import { categorizePrimaryOther } from "../lib/inbox-service";
import { isFreeEmailDomain, normalizeEmail } from "../normalization";
import { storage } from "../storage";
import { createPipelineAction, enrollAccountsInPipeline, getUnifiedPipeline } from "./unified-pipeline-engine";

type CampaignAlignmentRow = {
  id: string;
  name: string;
  status: string;
  campaignObjective: string | null;
  productServiceInfo: string | null;
  targetAudienceDescription: string | null;
  talkingPoints: string[] | null;
  enabledChannels: string[] | null;
};

type ThreadMessageRow = {
  message: typeof dealMessages.$inferSelect;
  conversation: typeof dealConversations.$inferSelect | null;
  category: typeof inboxCategories.$inferSelect | null;
};

type CampaignMatch = {
  id: string;
  name: string;
  score: number;
  reasons: string[];
};

type ThreadSignalAnalysis = {
  isOpportunity: boolean;
  stage: "outreach" | "engaged" | "qualifying" | "qualified" | "appointment_set";
  confidence: number;
  engagementScore: number;
  readinessScore: number;
  priorityScore: number;
  actionType: "callback" | "email" | "note";
  nextActionAt: Date;
  summary: string;
  signals: string[];
  serviceThemes: string[];
  matchedCampaigns: CampaignMatch[];
  sourceDisposition: string;
  recommendation: string;
  callbacksDetected: boolean;
};

type ResolvedContact = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  accountId: string | null;
  action: "created" | "updated" | "existing";
};

type OpportunityAccountCandidate = {
  accountId: string;
  accountName: string;
  accountDomain: string;
  accountAction: "created" | "updated";
  primaryContact: ResolvedContact;
  relatedContacts: ResolvedContact[];
  supportingConversationIds: string[];
  lastActivityAt: Date;
  latestInboundAt: Date;
  totalTouchpoints: number;
  stage: ThreadSignalAnalysis["stage"];
  confidence: number;
  engagementScore: number;
  readinessScore: number;
  priorityScore: number;
  actionType: ThreadSignalAnalysis["actionType"];
  nextActionAt: Date;
  summary: string;
  signals: string[];
  serviceThemes: string[];
  matchedCampaigns: CampaignMatch[];
  sourceDisposition: string;
  recommendation: string;
};

export interface AnalyzePipelineInboxInput {
  pipelineId: string;
  userId: string;
  lookbackMonths?: number;
  limitConversations?: number;
  createFollowUps?: boolean;
}

export interface AnalyzePipelineInboxResult {
  summary: {
    lookbackMonths: number;
    linkedCampaigns: number;
    matchedCampaigns: number;
    scannedMessages: number;
    scannedConversations: number;
    opportunityThreads: number;
    opportunityAccounts: number;
    createdAccounts: number;
    updatedAccounts: number;
    createdContacts: number;
    updatedContacts: number;
    createdPipelineAccounts: number;
    updatedPipelineAccounts: number;
    createdPipelineContacts: number;
    updatedPipelineContacts: number;
    createdActions: number;
  };
  accounts: Array<{
    accountId: string;
    accountName: string;
    accountDomain: string;
    primaryContact: {
      id: string;
      email: string;
      fullName: string;
      jobTitle: string | null;
    };
    relatedContacts: Array<{
      id: string;
      email: string;
      fullName: string;
      jobTitle: string | null;
    }>;
    funnelStage: string;
    confidence: number;
    engagementScore: number;
    readinessScore: number;
    priorityScore: number;
    nextAction: {
      type: "callback" | "email" | "note";
      scheduledAt: string;
    };
    matchedCampaigns: CampaignMatch[];
    supportingConversationIds: string[];
    signals: string[];
    serviceThemes: string[];
    summary: string;
    recommendation: string;
    lastActivityAt: string;
  }>;
}

const STAGE_RANK: Record<ThreadSignalAnalysis["stage"] | "target" | "closed_won" | "closed_lost" | "on_hold", number> = {
  target: 0,
  outreach: 1,
  engaged: 2,
  qualifying: 3,
  qualified: 4,
  appointment_set: 5,
  closed_won: 6,
  closed_lost: 6,
  on_hold: 1,
};

const STOPWORDS = new Set([
  "about",
  "again",
  "also",
  "been",
  "best",
  "both",
  "from",
  "have",
  "just",
  "more",
  "need",
  "next",
  "onto",
  "over",
  "please",
  "regards",
  "thank",
  "thanks",
  "that",
  "their",
  "there",
  "they",
  "this",
  "with",
  "your",
]);

const PROPOSAL_PHRASES = [
  "lead generation",
  "demand generation",
  "appointment setting",
  "email outreach",
  "outbound campaign",
  "business opportunity",
  "proposal",
  "pricing",
  "quote",
  "scope of work",
  "statement of work",
  "pilot program",
  "retainer",
  "campaign package",
  "services we offer",
  "service offering",
];

const INTEREST_PHRASES = [
  "interested",
  "sounds good",
  "learn more",
  "tell me more",
  "would like to",
  "can we discuss",
  "can we talk",
  "happy to chat",
  "worth exploring",
  "send details",
  "send over",
  "let's talk",
  "lets talk",
  "next steps",
];

const QUALIFICATION_PHRASES = [
  "budget",
  "timeline",
  "timing",
  "pricing",
  "requirements",
  "use case",
  "looking for",
  "pain point",
  "campaign goals",
  "target audience",
  "success criteria",
  "qualified leads",
  "book meetings",
  "outreach goals",
];

const APPOINTMENT_PHRASES = [
  "book a meeting",
  "book time",
  "calendar invite",
  "zoom",
  "google meet",
  "microsoft teams",
  "demo",
  "meeting",
  "availability",
  "speak on",
];

const CALLBACK_PHRASES = [
  "call me",
  "callback",
  "call back",
  "give me a call",
  "ring me",
  "speak by phone",
  "happy to talk",
  "talk by phone",
];

const NEGATIVE_PHRASES = [
  "not interested",
  "remove me",
  "unsubscribe",
  "wrong person",
  "stop emailing",
  "do not contact",
  "no thanks",
  "not a fit",
  "not relevant",
];

const SERVICE_THEME_PATTERNS: Array<{ label: string; phrases: string[] }> = [
  { label: "lead_generation", phrases: ["lead generation", "generate leads", "qualified leads"] },
  { label: "appointment_setting", phrases: ["appointment setting", "book meetings", "meeting generation"] },
  { label: "email_outreach", phrases: ["email outreach", "cold email", "email campaign"] },
  { label: "voice_outreach", phrases: ["cold calling", "voice outreach", "phone campaign"] },
  { label: "abm", phrases: ["account based marketing", "abm"] },
  { label: "content_services", phrases: ["content syndication", "content marketing", "landing page"] },
];

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMessageTimestamp(message: typeof dealMessages.$inferSelect): Date {
  return message.receivedAt || message.sentAt || message.createdAt || new Date();
}

function toTerms(text: string): string[] {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !STOPWORDS.has(term));
}

function countPhraseHits(text: string, phrases: string[]): number {
  const source = cleanText(text).toLowerCase();
  if (!source) return 0;
  return phrases.reduce((total, phrase) => total + (source.includes(phrase) ? 1 : 0), 0);
}

function detectServiceThemes(text: string): string[] {
  const source = cleanText(text).toLowerCase();
  return SERVICE_THEME_PATTERNS
    .filter((pattern) => pattern.phrases.some((phrase) => source.includes(phrase)))
    .map((pattern) => pattern.label);
}

function inferContactNameFromEmail(email: string): string {
  const [localPart] = email.split("@");
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .trim();

  if (!cleaned) {
    return email;
  }

  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferContactRole(jobTitle: string | null | undefined, isPrimary: boolean) {
  if (isPrimary) return "primary_contact" as const;
  const title = cleanText(jobTitle).toLowerCase();
  if (!title) return "influencer" as const;
  if (/(chief|ceo|cfo|coo|cto|president|founder|owner|vp|vice president|director|head)/.test(title)) {
    return "decision_maker" as const;
  }
  if (/(assistant|coordinator|administrator|admin|reception)/.test(title)) {
    return "gatekeeper" as const;
  }
  if (/(manager|lead|specialist|partner)/.test(title)) {
    return "influencer" as const;
  }
  return "end_user" as const;
}

function mergeUnique<T>(left: T[], right: T[]): T[] {
  return Array.from(new Set([...left, ...right]));
}

function laterDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function stageFromSignals(params: {
  proposalHits: number;
  interestHits: number;
  qualificationHits: number;
  appointmentHits: number;
  callbackHits: number;
}): ThreadSignalAnalysis["stage"] {
  if (params.appointmentHits > 0) return "appointment_set";
  if (params.qualificationHits >= 2 || (params.callbackHits > 0 && params.interestHits > 0)) {
    return params.qualificationHits >= 4 ? "qualified" : "qualifying";
  }
  if (params.interestHits > 0 || params.callbackHits > 0) return "engaged";
  return "outreach";
}

function buildCampaignText(campaign: CampaignAlignmentRow): string {
  return [
    campaign.name,
    campaign.campaignObjective,
    campaign.productServiceInfo,
    campaign.targetAudienceDescription,
    ...(campaign.talkingPoints || []),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ");
}

export function matchThreadToCampaigns(
  campaignsToMatch: CampaignAlignmentRow[],
  threadText: string,
): CampaignMatch[] {
  const threadTerms = new Set(toTerms(threadText));
  const source = cleanText(threadText).toLowerCase();

  return campaignsToMatch
    .map((campaign) => {
      const campaignText = buildCampaignText(campaign);
      const campaignTerms = Array.from(new Set(toTerms(campaignText)));
      const overlappingTerms = campaignTerms.filter((term) => threadTerms.has(term));
      const emailBonus = campaign.enabledChannels?.includes("email") ? 4 : 0;
      const objectiveHits = countPhraseHits(
        source,
        PROPOSAL_PHRASES.filter((phrase) => campaignText.toLowerCase().includes(phrase)),
      );
      const score = overlappingTerms.length * 6 + objectiveHits * 10 + emailBonus;

      return {
        id: campaign.id,
        name: campaign.name,
        score,
        reasons: overlappingTerms.slice(0, 5),
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function inferNextActionAt(params: {
  stage: ThreadSignalAnalysis["stage"];
  callbacksDetected: boolean;
  lastActivityAt: Date;
  combinedText: string;
}): Date {
  const source = params.combinedText.toLowerCase();
  const base = new Date(params.lastActivityAt);
  base.setHours(10, 0, 0, 0);

  if (source.includes("tomorrow")) {
    base.setDate(base.getDate() + 1);
    return base;
  }

  if (source.includes("next week")) {
    base.setDate(base.getDate() + 7);
    return base;
  }

  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const weekdayIndex = weekdays.findIndex((day) => source.includes(day));
  if (weekdayIndex >= 0) {
    const currentDay = base.getDay();
    const targetDay = weekdayIndex + 1;
    let delta = targetDay - currentDay;
    if (delta <= 0) delta += 7;
    base.setDate(base.getDate() + delta);
    return base;
  }

  if (params.stage === "appointment_set" || params.callbacksDetected) {
    base.setDate(base.getDate() + 1);
    return base;
  }

  const now = new Date();
  const followUp = new Date(base);
  followUp.setDate(followUp.getDate() + 2);
  return followUp.getTime() < now.getTime() ? now : followUp;
}

export function analyzeInboxThreadSignals(params: {
  inboundText: string;
  outboundText: string;
  combinedText: string;
  pipelineObjective: string;
  linkedCampaigns: CampaignAlignmentRow[];
  lastActivityAt: Date;
  messageCount: number;
  hasAttachments: boolean;
}): ThreadSignalAnalysis {
  const inboundText = cleanText(params.inboundText);
  const outboundText = cleanText(params.outboundText);
  const combinedText = cleanText(params.combinedText);

  const proposalHits = countPhraseHits(outboundText, PROPOSAL_PHRASES);
  const interestHits = countPhraseHits(inboundText, INTEREST_PHRASES);
  const qualificationHits = countPhraseHits(combinedText, QUALIFICATION_PHRASES);
  const appointmentHits = countPhraseHits(combinedText, APPOINTMENT_PHRASES);
  const callbackHits = countPhraseHits(inboundText, CALLBACK_PHRASES);
  const negativeHits = countPhraseHits(combinedText, NEGATIVE_PHRASES);
  const serviceThemes = detectServiceThemes(`${outboundText} ${combinedText}`);
  const matchedCampaigns = matchThreadToCampaigns(
    params.linkedCampaigns,
    `${params.pipelineObjective || ""} ${combinedText}`,
  );

  let confidence =
    proposalHits * 18 +
    interestHits * 16 +
    qualificationHits * 10 +
    appointmentHits * 22 +
    callbackHits * 14 +
    serviceThemes.length * 8 +
    Math.min(params.messageCount, 6) * 4 +
    (params.hasAttachments ? 6 : 0) +
    Math.round((matchedCampaigns[0]?.score || 0) / 2);

  if (proposalHits > 0 && interestHits > 0) {
    confidence += 12;
  }
  if (negativeHits > 0) {
    confidence -= 40;
  }

  const stage = stageFromSignals({
    proposalHits,
    interestHits,
    qualificationHits,
    appointmentHits,
    callbackHits,
  });

  const engagementScore = Math.min(
    100,
    params.messageCount * 10 +
      interestHits * 14 +
      callbackHits * 12 +
      appointmentHits * 18,
  );

  const readinessBase =
    stage === "appointment_set"
      ? 92
      : stage === "qualified"
        ? 82
        : stage === "qualifying"
          ? 72
          : stage === "engaged"
            ? 58
            : 40;

  const readinessScore = Math.min(100, readinessBase + qualificationHits * 6 + proposalHits * 4);
  const priorityScore = Math.min(100, Math.round((confidence + engagementScore + readinessScore) / 3));

  const callbacksDetected = callbackHits > 0;
  const isOpportunity =
    negativeHits === 0 &&
    confidence >= 34 &&
    (proposalHits > 0 || interestHits > 0 || serviceThemes.length > 0 || matchedCampaigns.length > 0);

  const nextActionAt = inferNextActionAt({
    stage,
    callbacksDetected,
    lastActivityAt: params.lastActivityAt,
    combinedText,
  });

  const actionType: ThreadSignalAnalysis["actionType"] =
    stage === "appointment_set" ? "note" : callbacksDetected ? "callback" : "email";

  const sourceDisposition =
    stage === "appointment_set"
      ? "appointment_booked"
      : callbacksDetected
        ? "callback_requested"
        : interestHits > 0
          ? "email_replied"
          : "proposal_sent";

  const signals = [
    proposalHits > 0 ? "proposal_language_detected" : null,
    interestHits > 0 ? "prospect_interest_detected" : null,
    qualificationHits > 0 ? "qualification_signals_detected" : null,
    appointmentHits > 0 ? "meeting_language_detected" : null,
    callbackHits > 0 ? "callback_language_detected" : null,
    params.hasAttachments ? "attachments_present" : null,
    matchedCampaigns.length > 0 ? "campaign_alignment_detected" : null,
  ].filter(Boolean) as string[];

  const topCampaign = matchedCampaigns[0]?.name;
  const primaryTheme = serviceThemes[0]?.replace(/_/g, " ") || "business opportunity";
  const summary =
    stage === "appointment_set"
      ? `Email thread indicates a booked or pending meeting around ${primaryTheme}.`
      : callbacksDetected
        ? `Prospect requested a phone follow-up about ${primaryTheme}.`
        : interestHits > 0
          ? `Prospect engaged with an email opportunity about ${primaryTheme}.`
          : `Outbound email thread shows a potential ${primaryTheme} opportunity.`;

  const recommendationParts = [
    callbacksDetected ? "Queue a callback" : stage === "appointment_set" ? "Confirm the meeting" : "Send a follow-up email",
    topCampaign ? `and anchor it to ${topCampaign}` : null,
    params.pipelineObjective ? `so the account stays aligned to "${params.pipelineObjective}"` : null,
  ].filter(Boolean);

  return {
    isOpportunity,
    stage,
    confidence: Math.max(0, Math.min(100, confidence)),
    engagementScore,
    readinessScore,
    priorityScore,
    actionType,
    nextActionAt,
    summary,
    signals,
    serviceThemes,
    matchedCampaigns,
    sourceDisposition,
    recommendation: `${recommendationParts.join(" ")}.`,
    callbacksDetected,
  };
}

function resolveExternalEmails(
  rows: ThreadMessageRow[],
  internalEmails: Set<string>,
  internalDomains: Set<string>,
): string[] {
  const emails = new Set<string>();

  for (const row of rows) {
    emails.add(normalizeEmail(row.message.fromEmail));
    for (const address of row.message.toEmails || []) {
      emails.add(normalizeEmail(address));
    }
    for (const address of row.message.ccEmails || []) {
      emails.add(normalizeEmail(address));
    }
    for (const address of row.conversation?.participantEmails || []) {
      emails.add(normalizeEmail(address));
    }
  }

  return Array.from(emails).filter((email) => {
    if (!email || !email.includes("@")) return false;
    const domain = email.split("@")[1] || "";
    if (!domain) return false;
    if (internalEmails.has(email)) return false;
    if (internalDomains.has(domain)) return false;
    return true;
  });
}

async function isPrimaryConversation(
  userId: string,
  rows: ThreadMessageRow[],
): Promise<boolean> {
  const inboundRows = rows
    .filter((row) => row.message.direction === "inbound")
    .sort((left, right) => getMessageTimestamp(right.message).getTime() - getMessageTimestamp(left.message).getTime());

  for (const row of inboundRows) {
    if (row.category?.category === "primary") {
      return true;
    }
    if (row.category?.category === "other") {
      continue;
    }

    const detected = await categorizePrimaryOther(
      row.message.id,
      row.message.fromEmail,
      null,
      null,
      row.message.opportunityId || row.conversation?.opportunityId || null,
    );
    if (detected === "primary") {
      return true;
    }
  }

  return false;
}

async function resolveContactForEmail(params: {
  email: string;
  accountId: string;
}) {
  const [existing] = await storage.getContactsByEmails([params.email]);
  if (existing) {
    if (existing.accountId === params.accountId) {
      return {
        id: existing.id,
        email: existing.email || params.email,
        fullName: existing.fullName || inferContactNameFromEmail(params.email),
        jobTitle: existing.jobTitle || null,
        accountId: existing.accountId || null,
        action: "existing" as const,
      };
    }

    const result = await storage.upsertContact(
      {
        email: params.email,
        accountId: params.accountId,
        fullName: existing.fullName || inferContactNameFromEmail(params.email),
        jobTitle: existing.jobTitle || null,
      },
      { sourceSystem: "inbox_analyzer" },
    );

    return {
      id: result.contact.id,
      email: result.contact.email || params.email,
      fullName: result.contact.fullName || inferContactNameFromEmail(params.email),
      jobTitle: result.contact.jobTitle || null,
      accountId: result.contact.accountId || null,
      action: result.action,
    };
  }

  const created = await storage.upsertContact(
    {
      email: params.email,
      accountId: params.accountId,
      fullName: inferContactNameFromEmail(params.email),
      emailVerificationStatus: "unknown",
    },
    { sourceSystem: "inbox_analyzer" },
  );

  return {
    id: created.contact.id,
    email: created.contact.email || params.email,
    fullName: created.contact.fullName || inferContactNameFromEmail(params.email),
    jobTitle: created.contact.jobTitle || null,
    accountId: created.contact.accountId || null,
    action: created.action,
  };
}

async function buildOpportunityCandidates(params: {
  pipelineObjective: string;
  linkedCampaigns: CampaignAlignmentRow[];
  userId: string;
  userEmails: string[];
  internalEmails: Set<string>;
  internalDomains: Set<string>;
  lookbackMonths: number;
  limitConversations: number;
}): Promise<{
  scannedMessages: number;
  scannedConversations: number;
  candidates: OpportunityAccountCandidate[];
}> {
  const since = new Date();
  since.setMonth(since.getMonth() - params.lookbackMonths);

  const ownershipFilter = or(
    ...params.userEmails.flatMap((email) => [
      sql`${email} = ANY(${dealMessages.toEmails})`,
      sql`${email} = ANY(${dealMessages.ccEmails})`,
      sql`LOWER(${dealMessages.fromEmail}) = ${email}`,
    ]),
  );

  const rows = await db
    .select({
      message: dealMessages,
      conversation: dealConversations,
      category: inboxCategories,
    })
    .from(dealMessages)
    .leftJoin(dealConversations, eq(dealConversations.id, dealMessages.conversationId))
    .leftJoin(
      inboxCategories,
      and(
        eq(inboxCategories.messageId, dealMessages.id),
        eq(inboxCategories.userId, params.userId),
      ),
    )
    .where(
      and(
        ownershipFilter,
        or(
          gte(dealMessages.receivedAt, since),
          gte(dealMessages.sentAt, since),
          gte(dealMessages.createdAt, since),
        ),
      ),
    )
    .orderBy(
      desc(sql`COALESCE(${dealMessages.receivedAt}, ${dealMessages.sentAt}, ${dealMessages.createdAt})`),
    )
    .limit(Math.min(params.limitConversations * 20, 5000));

  const byConversation = new Map<string, ThreadMessageRow[]>();
  for (const row of rows) {
    const key = row.message.conversationId;
    const existing = byConversation.get(key) || [];
    existing.push(row);
    byConversation.set(key, existing);
  }

  const threadCandidates: OpportunityAccountCandidate[] = [];

  for (const threadRows of byConversation.values()) {
    if (threadCandidates.length >= params.limitConversations) {
      break;
    }

    const hasPrimary = await isPrimaryConversation(params.userId, threadRows);
    if (!hasPrimary) continue;

    const inboundRows = threadRows
      .filter((row) => row.message.direction === "inbound")
      .sort((left, right) => getMessageTimestamp(right.message).getTime() - getMessageTimestamp(left.message).getTime());
    const outboundRows = threadRows
      .filter((row) => row.message.direction === "outbound")
      .sort((left, right) => getMessageTimestamp(right.message).getTime() - getMessageTimestamp(left.message).getTime());

    if (inboundRows.length === 0 || outboundRows.length === 0) continue;

    const externalEmails = resolveExternalEmails(
      threadRows,
      params.internalEmails,
      params.internalDomains,
    );
    if (externalEmails.length === 0) continue;

    const latestInbound = inboundRows.find((row) => externalEmails.includes(normalizeEmail(row.message.fromEmail)));
    const primaryEmail = normalizeEmail(latestInbound?.message.fromEmail || externalEmails[0]);
    const primaryDomain = extractRootDomain(normalizeDomain(primaryEmail.split("@")[1] || ""));
    if (!primaryDomain || isFreeEmailDomain(primaryDomain)) continue;

    const inboundText = inboundRows
      .map((row) => [row.message.subject, row.message.bodyContent, row.message.bodyPreview].map(cleanText).join(" "))
      .join("\n");
    const outboundText = outboundRows
      .map((row) => [row.message.subject, row.message.bodyContent, row.message.bodyPreview].map(cleanText).join(" "))
      .join("\n");
    const combinedText = `${outboundText}\n${inboundText}`;

    const analysis = analyzeInboxThreadSignals({
      inboundText,
      outboundText,
      combinedText,
      pipelineObjective: params.pipelineObjective,
      linkedCampaigns: params.linkedCampaigns,
      lastActivityAt: getMessageTimestamp(threadRows[0].message),
      messageCount: threadRows.length,
      hasAttachments: threadRows.some((row) => row.message.hasAttachments),
    });

    if (!analysis.isOpportunity) continue;

    const accountResult = await storage.upsertAccount(
      {
        name: extractCompanyNameFromDomain(primaryDomain),
        domain: primaryDomain,
        websiteDomain: primaryDomain,
      },
      { sourceSystem: "inbox_analyzer" },
    );

    const sameDomainEmails = externalEmails
      .filter((email) => {
        const domain = extractRootDomain(normalizeDomain(email.split("@")[1] || ""));
        return domain === primaryDomain;
      })
      .slice(0, 5);

    const relatedContacts: ResolvedContact[] = [];
    for (const email of sameDomainEmails) {
      const resolved = await resolveContactForEmail({
        email,
        accountId: accountResult.account.id,
      });
      relatedContacts.push(resolved);
    }

    const primaryContact =
      relatedContacts.find((contact) => normalizeEmail(contact.email) === primaryEmail) ||
      (await resolveContactForEmail({
        email: primaryEmail,
        accountId: accountResult.account.id,
      }));

    const uniqueRelatedContacts = mergeUnique(
      [primaryContact.id],
      relatedContacts.map((contact) => contact.id),
    )
      .map((id) => [primaryContact, ...relatedContacts].find((contact) => contact.id === id))
      .filter(Boolean) as ResolvedContact[];

    threadCandidates.push({
      accountId: accountResult.account.id,
      accountName: accountResult.account.name,
      accountDomain: primaryDomain,
      accountAction: accountResult.action,
      primaryContact,
      relatedContacts: uniqueRelatedContacts,
      supportingConversationIds: mergeUnique(
        [],
        threadRows.map((row) => row.message.conversationId),
      ),
      lastActivityAt: threadRows.reduce(
        (latest, row) => laterDate(latest, getMessageTimestamp(row.message)),
        getMessageTimestamp(threadRows[0].message),
      ),
      latestInboundAt: getMessageTimestamp(latestInbound?.message || threadRows[0].message),
      totalTouchpoints: threadRows.length,
      stage: analysis.stage,
      confidence: analysis.confidence,
      engagementScore: analysis.engagementScore,
      readinessScore: analysis.readinessScore,
      priorityScore: analysis.priorityScore,
      actionType: analysis.actionType,
      nextActionAt: analysis.nextActionAt,
      summary: analysis.summary,
      signals: analysis.signals,
      serviceThemes: analysis.serviceThemes,
      matchedCampaigns: analysis.matchedCampaigns,
      sourceDisposition: analysis.sourceDisposition,
      recommendation: analysis.recommendation,
    });
  }

  const aggregated = new Map<string, OpportunityAccountCandidate>();
  for (const candidate of threadCandidates) {
    const existing = aggregated.get(candidate.accountId);
    if (!existing) {
      aggregated.set(candidate.accountId, candidate);
      continue;
    }

    const higherStage =
      STAGE_RANK[candidate.stage] > STAGE_RANK[existing.stage] ? candidate.stage : existing.stage;
    const strongerAction =
      candidate.actionType === "callback" || existing.actionType === "note"
        ? candidate.actionType
        : existing.actionType;
    const strongerCampaigns = [...existing.matchedCampaigns, ...candidate.matchedCampaigns]
      .reduce((map, match) => {
        const current = map.get(match.id);
        if (!current || match.score > current.score) {
          map.set(match.id, match);
        }
        return map;
      }, new Map<string, CampaignMatch>());

    aggregated.set(candidate.accountId, {
      ...existing,
      accountAction:
        existing.accountAction === "created" || candidate.accountAction === "created" ? "created" : "updated",
      relatedContacts: mergeUnique(
        existing.relatedContacts.map((contact) => contact.id),
        candidate.relatedContacts.map((contact) => contact.id),
      )
        .map((id) => [...existing.relatedContacts, ...candidate.relatedContacts].find((contact) => contact.id === id))
        .filter(Boolean) as ResolvedContact[],
      supportingConversationIds: mergeUnique(
        existing.supportingConversationIds,
        candidate.supportingConversationIds,
      ),
      lastActivityAt: laterDate(existing.lastActivityAt, candidate.lastActivityAt),
      latestInboundAt: laterDate(existing.latestInboundAt, candidate.latestInboundAt),
      totalTouchpoints: existing.totalTouchpoints + candidate.totalTouchpoints,
      stage: higherStage,
      confidence: Math.max(existing.confidence, candidate.confidence),
      engagementScore: Math.max(existing.engagementScore, candidate.engagementScore),
      readinessScore: Math.max(existing.readinessScore, candidate.readinessScore),
      priorityScore: Math.max(existing.priorityScore, candidate.priorityScore),
      actionType: strongerAction,
      nextActionAt:
        strongerAction === candidate.actionType ? candidate.nextActionAt : existing.nextActionAt,
      summary:
        candidate.confidence >= existing.confidence ? candidate.summary : existing.summary,
      signals: mergeUnique(existing.signals, candidate.signals),
      serviceThemes: mergeUnique(existing.serviceThemes, candidate.serviceThemes),
      matchedCampaigns: Array.from(strongerCampaigns.values())
        .sort((left, right) => right.score - left.score)
        .slice(0, 3),
      sourceDisposition:
        strongerAction === candidate.actionType ? candidate.sourceDisposition : existing.sourceDisposition,
      recommendation:
        candidate.confidence >= existing.confidence ? candidate.recommendation : existing.recommendation,
    });
  }

  return {
    scannedMessages: rows.length,
    scannedConversations: byConversation.size,
    candidates: Array.from(aggregated.values())
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, params.limitConversations),
  };
}

export async function analyzePipelineInboxOpportunities(
  input: AnalyzePipelineInboxInput,
): Promise<AnalyzePipelineInboxResult> {
  const lookbackMonths = Math.max(1, Math.min(input.lookbackMonths || 6, 12));
  const limitConversations = Math.max(10, Math.min(input.limitConversations || 200, 500));
  const createFollowUps = input.createFollowUps !== false;

  const pipeline = await getUnifiedPipeline(input.pipelineId);
  if (!pipeline) {
    throw new Error("Pipeline not found");
  }

  const userMailboxRows = await db
    .select({
      email: mailboxAccounts.mailboxEmail,
    })
    .from(mailboxAccounts)
    .where(eq(mailboxAccounts.userId, input.userId));

  const userEmails = userMailboxRows
    .map((row) => normalizeEmail(row.email || ""))
    .filter(Boolean);

  if (userEmails.length === 0) {
    return {
      summary: {
        lookbackMonths,
        linkedCampaigns: 0,
        matchedCampaigns: 0,
        scannedMessages: 0,
        scannedConversations: 0,
        opportunityThreads: 0,
        opportunityAccounts: 0,
        createdAccounts: 0,
        updatedAccounts: 0,
        createdContacts: 0,
        updatedContacts: 0,
        createdPipelineAccounts: 0,
        updatedPipelineAccounts: 0,
        createdPipelineContacts: 0,
        updatedPipelineContacts: 0,
        createdActions: 0,
      },
      accounts: [],
    };
  }

  const linkedCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      campaignObjective: campaigns.campaignObjective,
      productServiceInfo: campaigns.productServiceInfo,
      targetAudienceDescription: campaigns.targetAudienceDescription,
      talkingPoints: campaigns.talkingPoints,
      enabledChannels: campaigns.enabledChannels,
    })
    .from(campaigns)
    .where(eq(campaigns.unifiedPipelineId, input.pipelineId));

  const allMailboxAccounts = await storage.getAllMailboxAccounts();
  const internalEmails = new Set(
    allMailboxAccounts
      .map((mailbox) => normalizeEmail(mailbox.mailboxEmail || ""))
      .filter(Boolean),
  );
  userEmails.forEach((email) => internalEmails.add(email));
  const internalDomains = new Set(
    Array.from(internalEmails)
      .map((email) => email.split("@")[1] || "")
      .filter(Boolean),
  );

  const { scannedMessages, scannedConversations, candidates } = await buildOpportunityCandidates({
    pipelineObjective: pipeline.objective || "",
    linkedCampaigns,
    userId: input.userId,
    userEmails,
    internalEmails,
    internalDomains,
    lookbackMonths,
    limitConversations,
  });

  if (candidates.length === 0) {
    return {
      summary: {
        lookbackMonths,
        linkedCampaigns: linkedCampaigns.length,
        matchedCampaigns: 0,
        scannedMessages,
        scannedConversations,
        opportunityThreads: 0,
        opportunityAccounts: 0,
        createdAccounts: 0,
        updatedAccounts: 0,
        createdContacts: 0,
        updatedContacts: 0,
        createdPipelineAccounts: 0,
        updatedPipelineAccounts: 0,
        createdPipelineContacts: 0,
        updatedPipelineContacts: 0,
        createdActions: 0,
      },
      accounts: [],
    };
  }

  const uniqueAccountIds = Array.from(new Set(candidates.map((candidate) => candidate.accountId)));
  const existingPipelineAccounts = await db
    .select()
    .from(unifiedPipelineAccounts)
    .where(
      and(
        eq(unifiedPipelineAccounts.pipelineId, input.pipelineId),
        inArray(unifiedPipelineAccounts.accountId, uniqueAccountIds),
      ),
    );
  const pipelineAccountByAccountId = new Map(
    existingPipelineAccounts.map((row) => [row.accountId, row]),
  );

  await enrollAccountsInPipeline(input.pipelineId, uniqueAccountIds, "inbox_analyzer");

  const pipelineAccountsAfter = await db
    .select()
    .from(unifiedPipelineAccounts)
    .where(
      and(
        eq(unifiedPipelineAccounts.pipelineId, input.pipelineId),
        inArray(unifiedPipelineAccounts.accountId, uniqueAccountIds),
      ),
    );
  const hydratedPipelineAccounts = new Map(
    pipelineAccountsAfter.map((row) => [row.accountId, row]),
  );

  let createdContacts = 0;
  let updatedContacts = 0;
  let createdPipelineContacts = 0;
  let updatedPipelineContacts = 0;
  let createdActions = 0;

  const responseAccounts: AnalyzePipelineInboxResult["accounts"] = [];

  for (const candidate of candidates) {
    for (const contact of candidate.relatedContacts) {
      if (contact.action === "created") createdContacts += 1;
      if (contact.action === "updated") updatedContacts += 1;
    }

    const pipelineAccount = hydratedPipelineAccounts.get(candidate.accountId);
    if (!pipelineAccount) {
      continue;
    }

    const existingStage = pipelineAccount.funnelStage as keyof typeof STAGE_RANK;
    const nextStage =
      STAGE_RANK[candidate.stage] > STAGE_RANK[existingStage] ? candidate.stage : pipelineAccount.funnelStage;
    const shouldAdvanceStage = nextStage !== pipelineAccount.funnelStage;

    const existingMetadata =
      pipelineAccount.metadata && typeof pipelineAccount.metadata === "object"
        ? (pipelineAccount.metadata as Record<string, unknown>)
        : {};

    const existingAnalyzerMetadata =
      existingMetadata.inboxAnalyzer && typeof existingMetadata.inboxAnalyzer === "object"
        ? (existingMetadata.inboxAnalyzer as Record<string, unknown>)
        : {};

    const analyzerMetadata = {
      ...existingAnalyzerMetadata,
      lastAnalyzedAt: new Date().toISOString(),
      source: "primary_inbox",
      supportingConversationIds: mergeUnique(
        Array.isArray(existingAnalyzerMetadata.supportingConversationIds)
          ? ((existingAnalyzerMetadata.supportingConversationIds || []) as string[])
          : [],
        candidate.supportingConversationIds,
      ),
      matchedCampaigns: candidate.matchedCampaigns,
      serviceThemes: candidate.serviceThemes,
      signals: candidate.signals,
      summary: candidate.summary,
      recommendation: candidate.recommendation,
      primaryContactEmail: candidate.primaryContact.email,
    };

    await db
      .update(unifiedPipelineAccounts)
      .set({
        funnelStage: nextStage as any,
        stageChangedAt: shouldAdvanceStage ? new Date() : pipelineAccount.stageChangedAt,
        previousStage: shouldAdvanceStage ? pipelineAccount.funnelStage : pipelineAccount.previousStage,
        priorityScore: Math.max(pipelineAccount.priorityScore || 0, candidate.priorityScore),
        readinessScore: Math.max(pipelineAccount.readinessScore || 0, candidate.readinessScore),
        engagementScore: Math.max(pipelineAccount.engagementScore || 0, candidate.engagementScore),
        aiRecommendation: candidate.recommendation,
        lastActivityAt:
          !pipelineAccount.lastActivityAt || candidate.lastActivityAt > pipelineAccount.lastActivityAt
            ? candidate.lastActivityAt
            : pipelineAccount.lastActivityAt,
        totalTouchpoints: Math.max(pipelineAccount.totalTouchpoints || 0, candidate.totalTouchpoints),
        nextActionType: candidate.actionType,
        nextActionAt: candidate.nextActionAt,
        enrollmentSource: pipelineAccount.enrollmentSource || "inbox_analyzer",
        metadata: {
          ...existingMetadata,
          inboxAnalyzer: analyzerMetadata,
        },
        updatedAt: new Date(),
      })
      .where(eq(unifiedPipelineAccounts.id, pipelineAccount.id));

    for (const contact of candidate.relatedContacts) {
      const [existingPipelineContact] = await db
        .select()
        .from(unifiedPipelineContacts)
        .where(
          and(
            eq(unifiedPipelineContacts.pipelineAccountId, pipelineAccount.id),
            eq(unifiedPipelineContacts.contactId, contact.id),
          ),
        )
        .limit(1);

      const role = inferContactRole(contact.jobTitle, contact.id === candidate.primaryContact.id);
      const engagementLevel =
        candidate.stage === "appointment_set"
          ? "champion"
          : STAGE_RANK[candidate.stage] >= STAGE_RANK.engaged
            ? "engaged"
            : "aware";

      if (existingPipelineContact) {
        updatedPipelineContacts += 1;
        await db
          .update(unifiedPipelineContacts)
          .set({
            role,
            engagementLevel,
            sourceCampaignId: candidate.matchedCampaigns[0]?.id || existingPipelineContact.sourceCampaignId,
            sourceDisposition: candidate.sourceDisposition,
            sourceAiAnalysis: {
              summary: candidate.summary,
              signals: candidate.signals,
              matchedCampaigns: candidate.matchedCampaigns,
              serviceThemes: candidate.serviceThemes,
            },
            lastContactedAt:
              !existingPipelineContact.lastContactedAt || candidate.latestInboundAt > existingPipelineContact.lastContactedAt
                ? candidate.latestInboundAt
                : existingPipelineContact.lastContactedAt,
            totalAttempts: Math.max(existingPipelineContact.totalAttempts || 0, candidate.totalTouchpoints),
            lastDisposition: candidate.sourceDisposition,
            updatedAt: new Date(),
          })
          .where(eq(unifiedPipelineContacts.id, existingPipelineContact.id));
      } else {
        createdPipelineContacts += 1;
        await db.insert(unifiedPipelineContacts).values({
          pipelineAccountId: pipelineAccount.id,
          contactId: contact.id,
          role,
          engagementLevel,
          sourceCampaignId: candidate.matchedCampaigns[0]?.id || null,
          sourceDisposition: candidate.sourceDisposition,
          sourceAiAnalysis: {
            summary: candidate.summary,
            signals: candidate.signals,
            matchedCampaigns: candidate.matchedCampaigns,
            serviceThemes: candidate.serviceThemes,
          },
          lastContactedAt: candidate.latestInboundAt,
          totalAttempts: candidate.totalTouchpoints,
          lastDisposition: candidate.sourceDisposition,
        });
      }
    }

    if (createFollowUps) {
      const existingActionConditions = [
        eq(unifiedPipelineActions.pipelineAccountId, pipelineAccount.id),
        eq(unifiedPipelineActions.actionType, candidate.actionType),
        inArray(unifiedPipelineActions.status, ["scheduled", "in_progress"]),
      ];

      if (candidate.primaryContact.id) {
        existingActionConditions.push(eq(unifiedPipelineActions.contactId, candidate.primaryContact.id));
      } else {
        existingActionConditions.push(isNull(unifiedPipelineActions.contactId));
      }

      const [existingScheduledAction] = await db
        .select()
        .from(unifiedPipelineActions)
        .where(and(...existingActionConditions))
        .orderBy(desc(unifiedPipelineActions.createdAt))
        .limit(1);

      if (!existingScheduledAction) {
        createdActions += 1;
        await createPipelineAction({
          pipelineAccountId: pipelineAccount.id,
          pipelineId: input.pipelineId,
          contactId: candidate.primaryContact.id,
          actionType: candidate.actionType,
          title:
            candidate.actionType === "callback"
              ? `Callback ${candidate.accountName}`
              : candidate.actionType === "note"
                ? `Confirm appointment for ${candidate.accountName}`
                : `Follow up with ${candidate.accountName}`,
          description: candidate.recommendation,
          scheduledAt: candidate.nextActionAt,
          aiGeneratedContext: {
            source: "inbox_analyzer",
            summary: candidate.summary,
            matchedCampaigns: candidate.matchedCampaigns,
            serviceThemes: candidate.serviceThemes,
            signals: candidate.signals,
            supportingConversationIds: candidate.supportingConversationIds,
          },
          sourceCampaignId: candidate.matchedCampaigns[0]?.id,
          createdBy: input.userId,
        });
      }
    }

    responseAccounts.push({
      accountId: candidate.accountId,
      accountName: candidate.accountName,
      accountDomain: candidate.accountDomain,
      primaryContact: {
        id: candidate.primaryContact.id,
        email: candidate.primaryContact.email,
        fullName: candidate.primaryContact.fullName,
        jobTitle: candidate.primaryContact.jobTitle,
      },
      relatedContacts: candidate.relatedContacts
        .filter((contact) => contact.id !== candidate.primaryContact.id)
        .map((contact) => ({
          id: contact.id,
          email: contact.email,
          fullName: contact.fullName,
          jobTitle: contact.jobTitle,
        })),
      funnelStage: nextStage,
      confidence: candidate.confidence,
      engagementScore: candidate.engagementScore,
      readinessScore: candidate.readinessScore,
      priorityScore: candidate.priorityScore,
      nextAction: {
        type: candidate.actionType,
        scheduledAt: candidate.nextActionAt.toISOString(),
      },
      matchedCampaigns: candidate.matchedCampaigns,
      supportingConversationIds: candidate.supportingConversationIds,
      signals: candidate.signals,
      serviceThemes: candidate.serviceThemes,
      summary: candidate.summary,
      recommendation: candidate.recommendation,
      lastActivityAt: candidate.lastActivityAt.toISOString(),
    });
  }

  const matchedCampaignCount = new Set(
    responseAccounts.flatMap((account) => account.matchedCampaigns.map((campaign) => campaign.id)),
  ).size;

  return {
    summary: {
      lookbackMonths,
      linkedCampaigns: linkedCampaigns.length,
      matchedCampaigns: matchedCampaignCount,
      scannedMessages,
      scannedConversations,
      opportunityThreads: candidates.reduce(
        (total, candidate) => total + candidate.supportingConversationIds.length,
        0,
      ),
      opportunityAccounts: responseAccounts.length,
      createdAccounts: candidates.filter((candidate) => candidate.accountAction === "created").length,
      updatedAccounts: candidates.filter((candidate) => candidate.accountAction === "updated").length,
      createdContacts,
      updatedContacts,
      createdPipelineAccounts: uniqueAccountIds.filter((accountId) => !pipelineAccountByAccountId.has(accountId)).length,
      updatedPipelineAccounts: uniqueAccountIds.filter((accountId) => pipelineAccountByAccountId.has(accountId)).length,
      createdPipelineContacts,
      updatedPipelineContacts,
      createdActions,
    },
    accounts: responseAccounts,
  };
}
