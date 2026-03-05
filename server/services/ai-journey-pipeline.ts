/**
 * AI Journey Pipeline Service
 *
 * Generates context-aware follow-up content for leads in the journey pipeline.
 * Uses Vertex AI to create personalized talking points, emails, and next-action
 * recommendations based on previous call activity and Organization Intelligence.
 */

import { deepSeekJSON } from "./deepseek-client";
import { db } from "../db";
import {
  clientJourneyLeads,
  clientJourneyActions,
  clientJourneyPipelines,
  callSessions,
  contacts,
  campaignOrganizations,
  clientOrganizationLinks,
  accountIntelligence,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

// ─── Types ───

interface FollowUpContext {
  talkingPoints: string[];
  objectionResponses: { objection: string; response: string }[];
  recommendedApproach: string;
  openingLine: string;
  keyPointsToAddress: string[];
  toneGuidance: string;
}

interface FollowUpEmail {
  subject: string;
  bodyHtml: string;
  previewText: string;
  bodyTheme: string;
}

interface NextActionRecommendation {
  actionType: "callback" | "email" | "sms" | "note";
  timing: string;
  priority: number;
  reasoning: string;
  suggestedContent: string;
}

// ─── OI Context Extraction (reused pattern from campaign planner) ───

async function getClientOIContext(clientAccountId: string): Promise<string> {
  try {
    // Get org link for this client
    const [link] = await db
      .select()
      .from(clientOrganizationLinks)
      .where(eq(clientOrganizationLinks.clientAccountId, clientAccountId))
      .limit(1);

    if (!link?.organizationId) return "";

    const [org] = await db
      .select()
      .from(campaignOrganizations)
      .where(eq(campaignOrganizations.id, link.organizationId))
      .limit(1);

    if (!org) return "";

    const profile = (org as any).profile;
    if (!profile || typeof profile !== "object") return "";

    const parts: string[] = [];

    if (profile.identity?.legalName) {
      parts.push(`Company: ${profile.identity.legalName}`);
    }
    if (profile.identity?.description) {
      parts.push(`Description: ${profile.identity.description}`);
    }
    if (profile.offerings?.coreProducts?.length) {
      parts.push(
        `Products/Services: ${profile.offerings.coreProducts.join(", ")}`
      );
    }
    if (profile.positioning?.valueProposition) {
      parts.push(
        `Value Proposition: ${profile.positioning.valueProposition}`
      );
    }
    if (profile.icp?.personas?.length) {
      const personaSummary = profile.icp.personas
        .map((p: any) => `${p.title}: ${p.painPoints?.join(", ") || ""}`)
        .join("; ");
      parts.push(`Target Personas: ${personaSummary}`);
    }

    return parts.join("\n");
  } catch (e) {
    console.error("[JourneyPipeline] Failed to get OI context:", e);
    return "";
  }
}

// ─── Build Activity History ───

async function buildActivityHistory(
  journeyLeadId: string
): Promise<string> {
  const actions = await db
    .select()
    .from(clientJourneyActions)
    .where(eq(clientJourneyActions.journeyLeadId, journeyLeadId))
    .orderBy(desc(clientJourneyActions.createdAt))
    .limit(20);

  if (actions.length === 0) return "No previous follow-up actions recorded.";

  return actions
    .map((a, i) => {
      const status = a.completedAt ? "Completed" : a.status;
      const date = a.scheduledAt
        ? new Date(a.scheduledAt).toLocaleDateString()
        : "unscheduled";
      return `${i + 1}. [${status}] ${a.actionType} on ${date}${a.title ? ` — ${a.title}` : ""}${a.outcome ? ` → Outcome: ${a.outcome}` : ""}`;
    })
    .join("\n");
}

// ─── Generate Follow-Up Context for Callbacks ───

export async function generateFollowUpContext(
  journeyLeadId: string,
  clientAccountId: string
): Promise<FollowUpContext> {
  // Fetch the journey lead with source context
  const [lead] = await db
    .select()
    .from(clientJourneyLeads)
    .where(eq(clientJourneyLeads.id, journeyLeadId))
    .limit(1);

  if (!lead) throw new Error("Journey lead not found");

  // Gather context
  const [oiContext, activityHistory] = await Promise.all([
    getClientOIContext(clientAccountId),
    buildActivityHistory(journeyLeadId),
  ]);

  // Build call context from source
  let callContext = "";
  if (lead.sourceCallSummary) {
    callContext += `\nOriginal Call Summary: ${lead.sourceCallSummary}`;
  }
  if (lead.sourceDisposition) {
    callContext += `\nOriginal Disposition: ${lead.sourceDisposition}`;
  }
  if (lead.sourceAiAnalysis && typeof lead.sourceAiAnalysis === "object") {
    const analysis = lead.sourceAiAnalysis as any;
    if (analysis.keyTopicsDiscussed) {
      callContext += `\nTopics Discussed: ${Array.isArray(analysis.keyTopicsDiscussed) ? analysis.keyTopicsDiscussed.join(", ") : analysis.keyTopicsDiscussed}`;
    }
    if (analysis.objections) {
      callContext += `\nObjections Raised: ${Array.isArray(analysis.objections) ? analysis.objections.join(", ") : analysis.objections}`;
    }
    if (analysis.interestLevel) {
      callContext += `\nInterest Level: ${analysis.interestLevel}`;
    }
    if (analysis.nextSteps) {
      callContext += `\nSuggested Next Steps: ${analysis.nextSteps}`;
    }
  }

  const prompt = `You are a sales follow-up strategist. Generate personalized callback context for a lead in a nurture pipeline.

${oiContext ? `## Organization Context\n${oiContext}\n` : ""}

## Lead Information
- Name: ${lead.contactName || "Unknown"}
- Company: ${lead.companyName || "Unknown"}
- Title: ${lead.jobTitle || "Unknown"}
- Priority: ${lead.priority}/5
${callContext}

## Previous Follow-Up Activity
${activityHistory}

${lead.notes ? `## Notes\n${lead.notes}` : ""}

Generate a JSON response with:
- talkingPoints: array of 3-5 specific talking points referencing previous conversation context
- objectionResponses: array of {objection, response} pairs based on known concerns
- recommendedApproach: brief strategy for this callback (warm, direct, consultative, etc.)
- openingLine: suggested opener that references the previous interaction naturally
- keyPointsToAddress: 2-3 critical items to cover
- toneGuidance: recommended tone and pacing`;

  const result = await deepSeekJSON<FollowUpContext>(prompt, {
    temperature: 0.7,
  });

  return result;
}

// ─── Generate Follow-Up Email ───

export async function generateFollowUpEmail(
  journeyLeadId: string,
  clientAccountId: string,
  emailType: "initial_followup" | "value_add" | "meeting_request" | "custom" = "initial_followup",
  customInstructions?: string
): Promise<FollowUpEmail> {
  const [lead] = await db
    .select()
    .from(clientJourneyLeads)
    .where(eq(clientJourneyLeads.id, journeyLeadId))
    .limit(1);

  if (!lead) throw new Error("Journey lead not found");

  const [oiContext, activityHistory] = await Promise.all([
    getClientOIContext(clientAccountId),
    buildActivityHistory(journeyLeadId),
  ]);

  const emailTypeGuidance: Record<string, string> = {
    initial_followup:
      "Write a warm follow-up email referencing the previous conversation. Keep it concise and valuable.",
    value_add:
      "Share a relevant insight or resource that addresses their specific pain points. Position as helpful, not salesy.",
    meeting_request:
      "Request a brief meeting or call to continue the conversation. Provide clear value and make it easy to schedule.",
    custom: customInstructions || "Write a professional follow-up email.",
  };

  const prompt = `You are an expert B2B email copywriter. Generate a personalized follow-up email for a lead.

${oiContext ? `## Organization Context\n${oiContext}\n` : ""}

## Lead Information
- Name: ${lead.contactName || "Unknown"}
- Company: ${lead.companyName || "Unknown"}
- Title: ${lead.jobTitle || "Unknown"}
- Source Disposition: ${lead.sourceDisposition || "N/A"}
${lead.sourceCallSummary ? `- Previous Call Summary: ${lead.sourceCallSummary}` : ""}

## Activity History
${activityHistory}

## Email Type
${emailTypeGuidance[emailType]}

Generate a JSON response with:
- subject: compelling subject line (under 60 chars)
- bodyHtml: professional HTML email body (use <p> tags, keep under 200 words)
- previewText: email preview text (under 100 chars)
- bodyTheme: 2-3 word description of the email theme`;

  const result = await deepSeekJSON<FollowUpEmail>(prompt, {
    temperature: 0.7,
  });

  return result;
}

// ─── Recommend Next Action ───

export async function recommendNextAction(
  journeyLeadId: string,
  clientAccountId: string
): Promise<NextActionRecommendation> {
  const [lead] = await db
    .select()
    .from(clientJourneyLeads)
    .where(eq(clientJourneyLeads.id, journeyLeadId))
    .limit(1);

  if (!lead) throw new Error("Journey lead not found");

  const [oiContext, activityHistory] = await Promise.all([
    getClientOIContext(clientAccountId),
    buildActivityHistory(journeyLeadId),
  ]);

  const prompt = `You are a sales pipeline advisor. Analyze this lead's journey and recommend the best next action.

## Lead Information
- Name: ${lead.contactName || "Unknown"}
- Company: ${lead.companyName || "Unknown"}
- Title: ${lead.jobTitle || "Unknown"}
- Priority: ${lead.priority}/5
- Current Stage: ${lead.currentStageId}
- Source Disposition: ${lead.sourceDisposition || "N/A"}
- Total Previous Actions: ${lead.totalActions}
${lead.sourceCallSummary ? `- Original Call Summary: ${lead.sourceCallSummary}` : ""}

## Activity History
${activityHistory}

${oiContext ? `## Organization Context\n${oiContext}` : ""}

Generate a JSON response with:
- actionType: "callback" | "email" | "sms" | "note" — the best next action type
- timing: when to execute (e.g., "Tomorrow morning", "Within 2 days", "Next week")
- priority: 1-5 urgency rating
- reasoning: why this is the best next step (2-3 sentences)
- suggestedContent: brief suggestion for the action content`;

  const result = await deepSeekJSON<NextActionRecommendation>(prompt, {
    temperature: 0.5,
  });

  return result;
}
