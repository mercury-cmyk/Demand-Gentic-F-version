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

### CRITICAL: Do NOT End The Call Early
When a prospect expresses interest or agrees to talk, that is NOT the end of the call.
You MUST continue through ALL remaining call flow stages (pitch, qualification, confirmation, closing) before ending.
Only end the call after you have:
- Completed the closing stage OR
- The prospect explicitly ends the conversation, says goodbye, or asks to be removed
- You detect voicemail, IVR, or pure silence

Do NOT submit disposition or end the call just because the prospect said "yes" or "sure" or confirmed interest.
That is the START of the real conversation, not the end.

### Recording Call Outcome
Only when the conversation has naturally concluded or you have completed the closing stage, call \`submit_disposition\` with one of:
- "qualified_lead" — prospect is interested AND you completed qualification/closing
- "not_interested" — prospect explicitly declined after hearing the pitch
- "do_not_call" — prospect requested removal from the list
- "voicemail" — automation or mailbox detected
- "no_answer" — silence or unanswered call
- "invalid_data" — wrong number or bad data

### Ending The Call
After the conversation has fully concluded (closing stage done, or prospect ended it):
1. Say a proper goodbye and thank them
2. Call \`submit_disposition\` with the best outcome
3. Call \`end_call\` to hang up

NEVER call submit_disposition or end_call in the middle of an active conversation.`);

  return sections.filter(Boolean).join("\n\n");
}
