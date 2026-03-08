import { buildCampaignContextSection, buildContactContextSection } from "../foundation-capabilities";
import { resolveGeminiPersonaProfile } from "../voice-providers/gemini-dynamic-persona";

export interface SipRuntimePromptContext {
  sessionId: string;
  voiceName?: string;
  systemPrompt?: string;
  contactName?: string;
  contactFirstName?: string;
  contactJobTitle?: string;
  accountName?: string;
  organizationName?: string;
  campaignName?: string;
  campaignType?: string | null;
  campaignObjective?: string;
  successCriteria?: string;
  targetAudienceDescription?: string;
  productServiceInfo?: string;
  talkingPoints?: string[];
  campaignContextBrief?: string | null;
  callFlow?: unknown;
}

export function buildSipRuntimePrompt(context: SipRuntimePromptContext): string {
  const voiceName = context.voiceName || "Puck";
  const organizationName = context.organizationName || "DemandGentic.ai By Pivotal B2B";
  const contactName = context.contactName || context.contactFirstName || "the contact";
  const personaProfile = resolveGeminiPersonaProfile({
    voiceName,
    sessionId: context.sessionId,
  });

  const sections: string[] = [
    personaProfile.prompt.trim(),
    `## Your Identity

You are an AI voice assistant representing ${organizationName}.`,
  ];

  if (context.systemPrompt?.trim()) {
    sections.push(`## Foundation Instructions

${context.systemPrompt.trim()}`);
  }

  const prospectSection = buildContactContextSection({
    firstName: context.contactFirstName || null,
    fullName: context.contactName || null,
    jobTitle: context.contactJobTitle || null,
    company: context.accountName || null,
  });
  if (prospectSection) {
    sections.push(prospectSection);
  }

  const callOpeningLines = [
    `Start by politely asking for ${contactName}.`,
    "Confirm you are speaking with the right person before moving deeper into the conversation.",
  ];
  if (context.campaignName?.trim()) {
    callOpeningLines.push(`Stay aligned with the goals and stage order configured for the ${context.campaignName.trim()} campaign.`);
  }
  sections.push(`## Opening Priority

${callOpeningLines.join("\n")}`);

  const campaignContextSection = buildCampaignContextSection({
    objective: context.campaignObjective,
    productInfo: context.productServiceInfo,
    talkingPoints: context.talkingPoints,
    targetAudience: context.targetAudienceDescription,
    successCriteria: context.successCriteria,
    brief: context.campaignContextBrief,
    campaignType: context.campaignType,
    callFlow: context.callFlow as any,
  });
  if (campaignContextSection) {
    sections.push(campaignContextSection);
  }

  sections.push(`## SIP Runtime Guardrails

### Voicemail And IVR Fast Exit
If you hear any automation or mailbox cue, stop immediately.
Examples:
- "leave a message", "after the beep", "after the tone", "voicemail", "mailbox"
- "the person you are trying to reach is not available"
- menu prompts like "press 1", "press 2", "to disconnect", "main menu"
- repeated automated prompts, beep loops, or long silence loops

When detected:
1. Call \`submit_disposition\` with "voicemail"
2. Immediately call \`end_call\`

Never leave a voicemail. Never continue discovery or pitching on automation.

### Silence Guard
If the call is connected but there is no meaningful human response after your opening for about 8 to 10 seconds, end quickly.
Use "no_answer" only for pure silence or ringing with no voicemail cue.

### Recording Call Outcome
Before ending any call, you must call \`submit_disposition\` with one of:
- "qualified_lead" for an interested prospect
- "not_interested" for a decline
- "do_not_call" for removal requests
- "voicemail" for automation or mailbox
- "no_answer" for silence or unanswered calls
- "invalid_data" for wrong number or bad data

### Ending The Call
When the conversation is over:
1. Call \`submit_disposition\` with the best outcome
2. Call \`end_call\` to hang up`);

  return sections.filter(Boolean).join("\n\n");
}
