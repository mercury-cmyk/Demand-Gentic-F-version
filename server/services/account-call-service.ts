import { createHash } from "crypto";
import { db } from "../db";
import {
  accountCallBriefs,
  accountCallMemoryNotes,
  callFollowupEmails,
  campaigns,
  contacts,
  emailEvents,
  participantCallMemoryNotes,
  participantCallPlans,
  dialerCallAttempts,
  type AccountCallBrief,
  type ParticipantCallPlan,
} from "@shared/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import {
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  type AccountIntelligencePayload,
  type AccountMessagingBriefPayload,
} from "./account-messaging-service";

const ACCOUNT_CALL_BRIEF_TTL_DAYS = 30;
const CALL_PLAN_TTL_DAYS = 7;

export type AccountCallBriefPayload = {
  account_id: string;
  theme: string;
  safe_problem_frame: string;
  opening_posture: string;
  one_sentence_insight: string;
  success_definition: string;
  avoid: string[];
  confidence: number;
};

export type ParticipantCallContext = {
  name: string;
  role: string;
  seniority: string;
  relationship_state: string;
  prior_touches: string[];
  channel_preference: string;
  last_call_outcome: string | null;
};

export type ParticipantCallPlanPayload = {
  opening_lines: string[];
  first_question: string;
  micro_insight: string;
  cta: string;
  branching: {
    gatekeeper: { ask: string; fallback: string };
    objection_busy: { response: string };
    objection_not_interested: { response: string };
    voicemail: { message: string };
  };
};

export type PostCallFollowupEmailPayload = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
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

export async function getOrBuildAccountCallBrief(params: {
  accountId: string;
  campaignId?: string | null;
}): Promise<AccountCallBrief> {
  const { accountId, campaignId } = params;
  const [latest] = await db
    .select()
    .from(accountCallBriefs)
    .where(
      and(
        eq(accountCallBriefs.accountId, accountId),
        campaignId
          ? eq(accountCallBriefs.campaignId, campaignId)
          : sql`${accountCallBriefs.campaignId} IS NULL`
      )
    )
    .orderBy(desc(accountCallBriefs.createdAt))
    .limit(1);

  const intelligence = await getOrBuildAccountIntelligence(accountId);
  const messagingBrief = await getOrBuildAccountMessagingBrief({
    accountId,
    campaignId: campaignId || null,
    intelligenceRecord: intelligence,
  });

  const campaignIntent = await loadCampaignIntent(campaignId || null);
  const campaignFingerprint = buildCampaignFingerprint(campaignIntent);

  const shouldRegenerate =
    !latest ||
    isTtlExpired(latest.createdAt, ACCOUNT_CALL_BRIEF_TTL_DAYS) ||
    latest.intelligenceVersion !== intelligence.version ||
    latest.campaignFingerprint !== campaignFingerprint;

  if (!shouldRegenerate) {
    return latest;
  }

  const payload = await generateAccountCallBriefPayload({
    accountId,
    intelligence: intelligence.payloadJson as AccountIntelligencePayload,
    messagingBrief: messagingBrief.payloadJson as AccountMessagingBriefPayload,
    campaignIntent,
  });

  const [inserted] = await db
    .insert(accountCallBriefs)
    .values({
      accountId,
      campaignId: campaignId || null,
      intelligenceVersion: intelligence.version,
      campaignFingerprint,
      payloadJson: payload,
    })
    .returning();

  return inserted;
}

export async function buildParticipantCallContext(contactId: string): Promise<ParticipantCallContext> {
  const [contact] = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      jobTitle: contacts.jobTitle,
      seniorityLevel: contacts.seniorityLevel,
      accountId: contacts.accountId,
      email: contacts.email,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) {
    throw new Error(`Participant context blocked: contact ${contactId} not found.`);
  }

  const last90Days = new Date();
  last90Days.setDate(last90Days.getDate() - 90);

  const emailTouchRows = await db
    .select({
      type: emailEvents.type,
      createdAt: emailEvents.createdAt,
    })
    .from(emailEvents)
    .where(
      and(eq(emailEvents.contactId, contactId), gte(emailEvents.createdAt, last90Days))
    )
    .orderBy(desc(emailEvents.createdAt))
    .limit(20);

  const callTouchRows = await db
    .select({
      disposition: dialerCallAttempts.disposition,
      callStartedAt: dialerCallAttempts.callStartedAt,
      callEndedAt: dialerCallAttempts.callEndedAt,
    })
    .from(dialerCallAttempts)
    .where(eq(dialerCallAttempts.contactId, contactId))
    .orderBy(desc(dialerCallAttempts.createdAt))
    .limit(10);

  const priorTouches = [
    ...emailTouchRows.map((row) => `email_${row.type}`),
    ...callTouchRows.map((row) => `call_${row.disposition || "attempted"}`),
  ];

  const lastCallOutcome = callTouchRows[0]?.disposition || null;

  let relationshipState = "cold";
  const emailTypes = new Set(emailTouchRows.map((row) => row.type));
  if (emailTypes.has("reply") || emailTypes.has("clicked")) {
    relationshipState = "engaged";
  } else if (emailTypes.has("opened")) {
    relationshipState = "aware";
  }

  if (lastCallOutcome === "not_interested" || lastCallOutcome === "do_not_call") {
    relationshipState = "disengaged";
  }

  const channelPreference = emailTouchRows.length > 0
    ? "email"
    : callTouchRows.length > 0
      ? "phone"
      : (contact.email ? "email" : "unknown");

  return {
    name: contact.fullName || "",
    role: contact.jobTitle || "",
    seniority: contact.seniorityLevel || "",
    relationship_state: relationshipState,
    prior_touches: priorTouches,
    channel_preference: channelPreference,
    last_call_outcome: lastCallOutcome,
  };
}

export async function getOrBuildParticipantCallPlan(params: {
  accountId: string;
  contactId: string;
  campaignId?: string | null;
  attemptNumber?: number;
  callAttemptId?: string | null;
  accountCallBrief?: AccountCallBrief;
}): Promise<ParticipantCallPlan> {
  const {
    accountId,
    contactId,
    campaignId,
    attemptNumber = 1,
    callAttemptId,
  } = params;

  const accountCallBrief =
    params.accountCallBrief || (await getOrBuildAccountCallBrief({ accountId, campaignId }));

  const [latest] = await db
    .select()
    .from(participantCallPlans)
    .where(
      and(
        eq(participantCallPlans.contactId, contactId),
        callAttemptId
          ? eq(participantCallPlans.callAttemptId, callAttemptId)
          : sql`${participantCallPlans.callAttemptId} IS NULL`
      )
    )
    .orderBy(desc(participantCallPlans.createdAt))
    .limit(1);

  const shouldRegenerate =
    !latest ||
    isTtlExpired(latest.createdAt, CALL_PLAN_TTL_DAYS) ||
    latest.attemptNumber !== attemptNumber ||
    latest.accountCallBriefId !== accountCallBrief.id;

  if (!shouldRegenerate) {
    return latest;
  }

  const participantContext = await buildParticipantCallContext(contactId);
  const payload = await generateParticipantCallPlanPayload({
    accountCallBrief: accountCallBrief.payloadJson as AccountCallBriefPayload,
    participant: participantContext,
    attemptNumber,
  });

  const [inserted] = await db
    .insert(participantCallPlans)
    .values({
      accountId,
      contactId,
      campaignId: campaignId || null,
      callAttemptId: callAttemptId || null,
      attemptNumber,
      accountCallBriefId: accountCallBrief.id,
      payloadJson: payload,
    })
    .returning();

  return inserted;
}

export async function getCallMemoryNotes(accountId: string, contactId: string): Promise<{
  account: string[];
  participant: string[];
}> {
  const accountNotes = await db
    .select({
      summary: accountCallMemoryNotes.summary,
      createdAt: accountCallMemoryNotes.createdAt,
    })
    .from(accountCallMemoryNotes)
    .where(eq(accountCallMemoryNotes.accountId, accountId))
    .orderBy(desc(accountCallMemoryNotes.createdAt))
    .limit(3);

  const participantNotes = await db
    .select({
      summary: participantCallMemoryNotes.summary,
      createdAt: participantCallMemoryNotes.createdAt,
    })
    .from(participantCallMemoryNotes)
    .where(eq(participantCallMemoryNotes.contactId, contactId))
    .orderBy(desc(participantCallMemoryNotes.createdAt))
    .limit(3);

  return {
    account: accountNotes.map((note) => note.summary || "").filter(Boolean),
    participant: participantNotes.map((note) => note.summary || "").filter(Boolean),
  };
}

export function buildCallPlanContextSection(params: {
  accountCallBrief: AccountCallBriefPayload;
  participantCallPlan: ParticipantCallPlanPayload;
  participantContext: ParticipantCallContext;
  memoryNotes: { account: string[]; participant: string[] };
}): string {
  const memorySection = {
    account: params.memoryNotes.account,
    participant: params.memoryNotes.participant,
  };

  return [
    "# Account Call Brief (Required)",
    JSON.stringify(params.accountCallBrief, null, 2),
    "",
    "# Participant Call Context (Required)",
    JSON.stringify(params.participantContext, null, 2),
    "",
    "# Participant Call Plan (Required)",
    JSON.stringify(params.participantCallPlan, null, 2),
    "",
    "# Memory Notes",
    JSON.stringify(memorySection, null, 2),
    "",
    "Call Rules:",
    "- Use the Call Plan as your governing contract.",
    "- Ask questions before making statements.",
    "- Never pitch features or ask for a demo.",
    "- Do not assume internal problems; frame as industry patterns.",
  ].join("\n");
}

export async function recordCallMemoryNotes(params: {
  accountId: string;
  contactId: string;
  callAttemptId?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const payloadJson = params.payload || null;

  await db.insert(accountCallMemoryNotes).values({
    accountId: params.accountId,
    callAttemptId: params.callAttemptId || null,
    summary: params.summary,
    payloadJson,
  });

  await db.insert(participantCallMemoryNotes).values({
    accountId: params.accountId,
    contactId: params.contactId,
    callAttemptId: params.callAttemptId || null,
    summary: params.summary,
    payloadJson,
  });
}

export async function generatePostCallFollowupEmail(params: {
  accountId: string;
  contactId: string;
  campaignId?: string | null;
  callOutcome: string;
  keyNotes: string[];
  recipient: { name: string; role: string };
}): Promise<PostCallFollowupEmailPayload> {
  const messagingBrief = await getOrBuildAccountMessagingBrief({
    accountId: params.accountId,
    campaignId: params.campaignId || null,
  });
  const accountBrief = messagingBrief.payloadJson as AccountMessagingBriefPayload;

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return buildFallbackFollowupEmail(params, accountBrief);
  }

  const systemPrompt = await buildAgentSystemPrompt(`
You are generating a post-call follow-up email.
Be short, thoughtful, and consistent with the Account Messaging Brief.
Do not pitch or assume internal facts.
Return JSON only with: subject, preheader, html, text.
`);

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: process.env.DEMAND_ENGAGE_MODEL || "gpt-4o",
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Account Messaging Brief:
${JSON.stringify(accountBrief, null, 2)}

Call Outcome: ${params.callOutcome}
Key Notes: ${params.keyNotes.join("; ") || "None"}
Recipient: ${params.recipient.name} (${params.recipient.role})

Return JSON:
{
  "subject": "",
  "preheader": "",
  "text": "",
  "html": ""
}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    return normalizeFollowupEmail(parsed, params, accountBrief);
  } catch (error) {
    console.error("[CallFollowupEmail] AI generation failed:", error);
    return buildFallbackFollowupEmail(params, accountBrief);
  }
}

export async function saveCallFollowupEmail(params: {
  accountId: string;
  contactId: string;
  campaignId?: string | null;
  callAttemptId?: string | null;
  payload: PostCallFollowupEmailPayload;
}): Promise<void> {
  await db.insert(callFollowupEmails).values({
    accountId: params.accountId,
    contactId: params.contactId,
    campaignId: params.campaignId || null,
    callAttemptId: params.callAttemptId || null,
    payloadJson: params.payload,
  });
}

async function loadCampaignIntent(campaignId: string | null): Promise<CampaignIntent | null> {
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

async function generateAccountCallBriefPayload(params: {
  accountId: string;
  intelligence: AccountIntelligencePayload;
  messagingBrief: AccountMessagingBriefPayload;
  campaignIntent: CampaignIntent | null;
}): Promise<AccountCallBriefPayload> {
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return buildFallbackAccountCallBrief(params);
  }

  const systemPrompt = await buildAgentSystemPrompt(`
You are generating an Account Call Brief.
Be conservative, non-salesy, and hypothesis-driven.
Do not pitch products or assume internal facts.
Return JSON only in this format:
{
  "account_id": "",
  "theme": "",
  "safe_problem_frame": "",
  "opening_posture": "",
  "one_sentence_insight": "",
  "success_definition": "",
  "avoid": [],
  "confidence": 0.0
}`);

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: process.env.DEMAND_QUAL_MODEL || "gpt-4o",
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Account Intelligence:
${JSON.stringify(params.intelligence, null, 2)}

Account Messaging Brief:
${JSON.stringify(params.messagingBrief, null, 2)}

Campaign Intent:
${JSON.stringify(params.campaignIntent || {}, null, 2)}

Return Account Call Brief JSON now.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return normalizeAccountCallBrief(parsed, params.accountId);
  } catch (error) {
    console.error("[AccountCallBrief] AI generation failed:", error);
    return buildFallbackAccountCallBrief(params);
  }
}

async function generateParticipantCallPlanPayload(params: {
  accountCallBrief: AccountCallBriefPayload;
  participant: ParticipantCallContext;
  attemptNumber: number;
}): Promise<ParticipantCallPlanPayload> {
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return buildFallbackCallPlan(params);
  }

  const systemPrompt = await buildAgentSystemPrompt(`
You create a call plan that obeys the account brief.
Provide short spoken lines, not paragraphs.
Include branching for gatekeeper, voicemail, objection, not interested.
Return JSON only in this format:
{
  "opening_lines": [],
  "first_question": "",
  "micro_insight": "",
  "cta": "",
  "branching": {
    "gatekeeper": { "ask": "", "fallback": "" },
    "objection_busy": { "response": "" },
    "objection_not_interested": { "response": "" },
    "voicemail": { "message": "" }
  }
}`);

  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: process.env.DEMAND_QUAL_MODEL || "gpt-4o",
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Account Call Brief:
${JSON.stringify(params.accountCallBrief, null, 2)}

Participant Context:
${JSON.stringify(params.participant, null, 2)}

Attempt Number: ${params.attemptNumber}

Return Participant Call Plan JSON now.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return normalizeCallPlan(parsed, params);
  } catch (error) {
    console.error("[ParticipantCallPlan] AI generation failed:", error);
    return buildFallbackCallPlan(params);
  }
}

function normalizeAccountCallBrief(raw: any, accountId: string): AccountCallBriefPayload {
  const avoid = Array.isArray(raw?.avoid)
    ? raw.avoid.map((item: any) => String(item)).filter((item) => item.trim())
    : ["pricing", "feature pitching", "accusations", "assuming pain"];

  return {
    account_id: accountId,
    theme: typeof raw?.theme === "string" ? raw.theme : "Demand Earn vs Demand Capture",
    safe_problem_frame: typeof raw?.safe_problem_frame === "string"
      ? raw.safe_problem_frame
      : "Some teams capture demand signals but are still working on how engagement is earned before leads reach sales.",
    opening_posture: typeof raw?.opening_posture === "string" ? raw.opening_posture : "exploratory",
    one_sentence_insight: typeof raw?.one_sentence_insight === "string"
      ? raw.one_sentence_insight
      : "Often the difference is not lead volume - it is whether engagement compounds or resets at handoff.",
    success_definition: typeof raw?.success_definition === "string"
      ? raw.success_definition
      : "Earn permission to send a short follow-up note or ask one diagnostic question.",
    avoid,
    confidence: clampConfidence(raw?.confidence),
  };
}

function normalizeCallPlan(raw: any, params: {
  accountCallBrief: AccountCallBriefPayload;
  participant: ParticipantCallContext;
}): ParticipantCallPlanPayload {
  const fallback = buildFallbackCallPlan({
    accountCallBrief: params.accountCallBrief,
    participant: params.participant,
    attemptNumber: 1,
  });

  return {
    opening_lines: Array.isArray(raw?.opening_lines) && raw.opening_lines.length > 0
      ? raw.opening_lines
      : fallback.opening_lines,
    first_question: typeof raw?.first_question === "string" ? raw.first_question : fallback.first_question,
    micro_insight: typeof raw?.micro_insight === "string" ? raw.micro_insight : fallback.micro_insight,
    cta: typeof raw?.cta === "string" ? raw.cta : fallback.cta,
    branching: raw?.branching || fallback.branching,
  };
}

function buildFallbackAccountCallBrief(params: {
  accountId: string;
  intelligence: AccountIntelligencePayload;
}): AccountCallBriefPayload {
  const insight = params.intelligence.recommended_angle
    ? params.intelligence.recommended_angle
    : "Explore how engagement is earned before leads enter pipeline.";

  return {
    account_id: params.accountId,
    theme: "Demand Earn vs Demand Capture",
    safe_problem_frame: params.intelligence.problem_hypothesis || "Exploring how engagement is earned before pipeline.",
    opening_posture: "exploratory",
    one_sentence_insight: "Often the difference is not lead volume - it is whether engagement compounds or resets at handoff.",
    success_definition: "Earn permission to send a short follow-up note or ask one diagnostic question.",
    avoid: ["pricing", "feature pitching", "accusations", "assuming pain"],
    confidence: clampConfidence(params.intelligence.confidence),
  };
}

function buildFallbackCallPlan(params: {
  accountCallBrief: AccountCallBriefPayload;
  participant: ParticipantCallContext;
  attemptNumber: number;
}): ParticipantCallPlanPayload {
  const name = params.participant.name || "there";
  const theme = params.accountCallBrief.theme || "demand engagement";

  return {
    opening_lines: [
      `Hi ${name} -- this is {{agent.name}}. I'll be brief. We're comparing notes with demand leaders on ${theme.toLowerCase()}.`,
      `Hi ${name} -- quick one. We're speaking with demand teams about how engagement gets earned before pipeline.`,
    ],
    first_question: "How does your team think about earning engagement before a lead is handed to sales?",
    micro_insight: params.accountCallBrief.one_sentence_insight,
    cta: "If it's useful, I can send a short note outlining the framework - would that be okay?",
    branching: {
      gatekeeper: {
        ask: "Is this the right person to ask about demand-to-pipeline quality?",
        fallback: "Who owns demand-to-pipeline quality on your team?",
      },
      objection_busy: {
        response: "Understood. Should I ask one quick question now, or send a short note for later?",
      },
      objection_not_interested: {
        response: "That's fair. Is demand-to-pipeline continuity already strong on your team, or still evolving?",
      },
      voicemail: {
        message: `Hi ${name} -- this is {{agent.name}}. Quick note: we're comparing notes with demand teams on how engagement is earned before pipeline. If it's useful, I can send a short framework. You can reach me at {{system.caller_id}}.`,
      },
    },
  };
}

function buildFallbackFollowupEmail(
  params: {
    callOutcome: string;
    keyNotes: string[];
    recipient: { name: string; role: string };
  },
  brief: AccountMessagingBriefPayload
): PostCallFollowupEmailPayload {
  const subject = "as promised - a short note";
  const preheader = "Sharing the framework we referenced on the call.";
  const notes = params.keyNotes.length > 0 ? `Notes I captured: ${params.keyNotes.join("; ")}.` : "";
  const text = `Hi ${params.recipient.name},

Thanks for the time today. ${brief.insight}
${notes}

If it's useful, happy to share a short framework or clarify anything from the call.

Best,
[Your Name]`;

  const html = `<p>Hi ${params.recipient.name},</p>
<p>Thanks for the time today. ${brief.insight}</p>
${notes ? `<p>${notes}</p>` : ""}
<p>If it's useful, happy to share a short framework or clarify anything from the call.</p>
<p>Best,<br>[Your Name]</p>`;

  return { subject, preheader, text, html };
}

function normalizeFollowupEmail(
  parsed: any,
  params: {
    recipient: { name: string; role: string };
  },
  brief: AccountMessagingBriefPayload
): PostCallFollowupEmailPayload {
  const subject = typeof parsed?.subject === "string" ? parsed.subject : "as promised - a short note";
  const preheader = typeof parsed?.preheader === "string" ? parsed.preheader : "Sharing the framework we referenced on the call.";
  const text = typeof parsed?.text === "string" ? parsed.text : `Hi ${params.recipient.name},\n\n${brief.insight}\n\nBest,\n[Your Name]`;
  const html = typeof parsed?.html === "string" ? parsed.html : `<p>Hi ${params.recipient.name},</p><p>${brief.insight}</p><p>Best,<br>[Your Name]</p>`;

  return { subject, preheader, text, html };
}

function isTtlExpired(date: Date | null | undefined, ttlDays: number): boolean {
  if (!date) return true;
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  return Date.now() - date.getTime() > ttlMs;
}

function clampConfidence(value: any): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.4;
  return Math.min(1, Math.max(0, numeric));
}

function hashObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}
