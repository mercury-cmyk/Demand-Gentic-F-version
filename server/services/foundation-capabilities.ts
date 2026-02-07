/**
 * Foundation Capability Templates
 *
 * Pre-defined prompt sections that can be selected when creating a foundation agent.
 * Each template injects specific prompt content into the agent's system prompt.
 *
 * Foundation Layer Architecture:
 * - Foundation (Virtual Agent): Trained once, reused across campaigns
 * - Campaign Context: Goals, product info, talking points (injected at runtime)
 * - Contact Context: Per-call personalization (existing)
 */

export interface FoundationCapability {
  id: string;
  label: string;
  description: string;
  promptSection: string;
}

export const FOUNDATION_CAPABILITIES: FoundationCapability[] = [
  {
    id: 'gatekeeper_handling',
    label: 'Gatekeeper Handling',
    description: 'Navigate receptionists and assistants professionally',
    promptSection: `### Gatekeeper Handling

If the person indicates they are not the target contact or sounds like a gatekeeper:

- Be polite, professional, and respectful of their role
- Introduce yourself briefly: "Hi, this is [agent_name] calling from [company]"
- Ask to be connected to the target contact by name
- If asked about the purpose: "I'm reaching out regarding [brief, non-salesy reason]"
- Do not pitch, explain details, or justify the call to the gatekeeper
- Make no more than two polite attempts to be transferred
- If refused or if they offer to take a message: thank them sincerely
- Never be pushy or try to go around the gatekeeper
- If transferred, restart the introduction when connected`
  },
  {
    id: 'right_party_verification',
    label: 'Right Party Verification',
    description: 'Confirm you are speaking with the correct person',
    promptSection: `### Right Party Verification

At the start of every call:

1. Ask to speak with the target contact by name
2. Listen carefully and classify the response:
   - "Speaking" / "This is [name]" → Right party confirmed, proceed with conversation
   - "Who's calling?" → Introduce yourself, then re-confirm identity
   - "They're not available" / "I'll transfer you" → Gatekeeper detected
   - Uncertain response → Politely clarify: "I'm looking for [first name] [last name], is that you?"

Once confirmed, do not re-check identity later in the conversation.
If they say "I don't know" or hesitate about a topic, treat it as uncertainty about the topic, not about who they are.`
  },
  {
    id: 'objection_handling',
    label: 'General Objection Handling',
    description: 'Framework for handling common objections professionally',
    promptSection: `### Objection Handling Framework

When the contact raises an objection, follow this approach:

1. **Acknowledge** - Show you heard and respect their concern
   "I completely understand..." / "That's a fair point..."

2. **Clarify** - Ask a brief question if the objection is vague
   "When you say you're all set, is it more about timing or the solution itself?"

3. **Respond** - Address the concern directly and concisely
   - Don't argue or try to overcome every objection
   - Provide relevant information if appropriate
   - Respect their perspective

4. **Check** - Gauge their reaction
   "Does that make sense?" / "Would you like me to elaborate?"

**Common Objections:**
- "Not interested" → "I appreciate that. Mind if I ask what solutions you're currently using?"
- "No time" → "I understand you're busy. Is there a better time to reconnect briefly?"
- "We already have a solution" → "That makes sense. How is it working for you?"
- "Send me information" → "Happy to do that. What specifically would be most relevant?"
- "How did you get my number?" → "We research companies in [industry] who might benefit from [brief value]"

If they firmly decline after one attempt, thank them and end professionally.`
  },
  {
    id: 'meeting_booking',
    label: 'Meeting Booking',
    description: 'Calendar coordination and availability discussion',
    promptSection: `### Meeting Booking

When the contact expresses interest in a meeting or follow-up call:

1. **Confirm interest**: "Great, I'd love to set up a brief call to discuss this further."

2. **Suggest timing**: Offer 2-3 specific options
   "Would later this week work better, or sometime next week?"
   "Do you prefer mornings or afternoons?"

3. **Get specifics**: Once general timing is agreed, narrow down
   "How about [day] at [time]?"

4. **Confirm details**:
   - Date and time (confirm timezone if needed)
   - Duration: "This would be about [15/30] minutes"
   - Who should attend (if relevant)
   - Best number/link to reach them

5. **Use the schedule_callback tool** to record the appointment with:
   - Confirmed date/time
   - Contact's preferences
   - Any preparation needed

6. **Close**: "Perfect, I'll send a calendar invite to [email]. Looking forward to speaking with you."

Never pressure for a meeting. If they prefer email follow-up first, respect that.`
  },
  {
    id: 'survey_collection',
    label: 'Survey Collection',
    description: 'Question asking and response capture',
    promptSection: `### Survey Collection

When conducting a survey or research call:

1. **Frame the purpose**: Explain briefly why you're gathering this information
   "We're speaking with leaders in [industry] to understand [topic]..."

2. **Ask permission**: "Would you have a few minutes to share your perspective?"

3. **Question approach**:
   - Ask one question at a time
   - Wait for complete response before asking the next
   - Use open-ended questions: "How do you currently handle...?"
   - Follow up on interesting points: "Tell me more about that..."
   - Don't lead the response or suggest answers

4. **Active listening**:
   - Acknowledge responses: "That's interesting..." / "I see..."
   - Paraphrase key points to confirm understanding
   - Never correct or debate their answers

5. **Recording**:
   - Note key themes and specific quotes
   - Include in the call summary with submit_call_summary tool

6. **Thank and close**: Express genuine appreciation for their time and insights`
  },
  {
    id: 'qualification',
    label: 'Lead Qualification',
    description: 'BANT/qualification criteria discovery',
    promptSection: `### Lead Qualification

Discover qualification criteria naturally through conversation:

**Budget** (approach subtly):
- "How are decisions like this typically funded in your organization?"
- "Is this something that would come from IT budget or operations?"

**Authority**:
- "Who else would typically be involved in evaluating something like this?"
- "Are you the right person to discuss [topic] with?"

**Need**:
- "What challenges are you facing with [current approach]?"
- "How does [problem] impact your team/business?"
- "What would success look like if you solved this?"

**Timeline**:
- "Is this something you're actively looking to address, or more exploratory?"
- "When are you hoping to have a solution in place?"

**Disqualification signals to note**:
- No budget or frozen budgets
- Not the decision maker and won't introduce you
- No pain or need identified
- Long timeline (12+ months) with no urgency
- Already committed to a competitor

Record qualification findings in the call summary.`
  },
  {
    id: 'voicemail_handling',
    label: 'Voicemail Handling',
    description: 'Policy for voicemail detection',
    promptSection: `### Voicemail Handling

When you detect voicemail or an answering machine:

1. **Detection signals**:
   - "Please leave a message after the beep"
   - "You've reached the voicemail of..."
   - Long silence followed by a tone
   - Automated greeting

2. **Policy**: Do NOT leave a voicemail message. End the call silently.

3. **Disposition**: Use submit_disposition with outcome: "voicemail"

4. **Rationale**: AI-generated voicemails can sound unnatural and may create a negative impression. Human follow-up voicemails are more effective.`
  },
  {
    id: 'transfer_handoff',
    label: 'Transfer & Handoff',
    description: 'Human agent transfer triggers and process',
    promptSection: `### Transfer & Handoff

Transfer to a human agent when:

1. **Explicit request**: Contact asks to speak with a human/real person
2. **Complex situation**: Issue beyond the scope of this conversation
3. **Escalation needed**: Contact is frustrated or issue requires authority
4. **Technical depth**: Detailed technical questions you can't answer

**Transfer process**:

1. **Acknowledge the request**: "Absolutely, let me connect you with someone who can help"

2. **Set expectations**: "I'll transfer you now. There may be a brief hold."

3. **Use transfer_to_human tool** with:
   - Reason for transfer
   - Summary of conversation so far
   - Any specific needs mentioned

4. **Warm handoff message**: "Thanks for your patience—I'm connecting you with someone who can help."

**If transfer fails or no one available**:
- Apologize for the inconvenience
- Offer to schedule a callback
- Ensure their concern is captured for follow-up`
  }
];

/**
 * Build foundation prompt sections from selected capability IDs
 */
export function buildFoundationPromptSections(capabilityIds: string[]): string {
  if (!capabilityIds || capabilityIds.length === 0) return '';

  const sections = capabilityIds
    .map(id => FOUNDATION_CAPABILITIES.find(cap => cap.id === id))
    .filter((cap): cap is FoundationCapability => cap !== undefined)
    .map(cap => cap.promptSection);

  if (sections.length === 0) return '';

  return `## Foundation Capabilities\n\n${sections.join('\n\n---\n\n')}`;
}

/**
 * Get capability by ID
 */
export function getCapabilityById(id: string): FoundationCapability | undefined {
  return FOUNDATION_CAPABILITIES.find(cap => cap.id === id);
}

/**
 * Validate capability IDs
 */
export function validateCapabilityIds(ids: string[]): { valid: string[]; invalid: string[] } {
  const validIds = FOUNDATION_CAPABILITIES.map(cap => cap.id);
  return {
    valid: ids.filter(id => validIds.includes(id)),
    invalid: ids.filter(id => !validIds.includes(id))
  };
}

/**
 * Build campaign context section from campaign fields
 *
 * PRIORITY ORDER: Key Talking Points and Critical Messages are placed FIRST
 * to ensure the agent prioritizes delivering these during the conversation.
 */
export function buildCampaignContextSection(config: {
  objective?: string | null;
  productInfo?: string | null;
  talkingPoints?: string[] | null;
  targetAudience?: string | null;
  objections?: Array<{ objection: string; response: string }> | null;
  successCriteria?: string | null;
  brief?: string | null;
  campaignType?: string | null;
}): string {
  const sections: string[] = [];

  // Campaign type provides critical context for how to approach the call
  if (config.campaignType) {
    const typeDescriptions: Record<string, string> = {
      'appointment_generation': '**APPOINTMENT SETTING CAMPAIGN** - Your primary goal is to SCHEDULE A MEETING or get explicit agreement for a follow-up call at a specific time. Do NOT end the call after just sending content - push for an appointment.',
      'appointment_setting': '**APPOINTMENT SETTING CAMPAIGN** - Your primary goal is to SCHEDULE A MEETING or get explicit agreement for a follow-up call at a specific time. Do NOT end the call after just sending content - push for an appointment.',
      'content_syndication': 'Content Syndication Campaign - Focus on getting consent to receive content and validating interest.',
      'lead_qualification': 'Lead Qualification Campaign - Focus on discovery and gathering qualifying information.',
      'sql': 'Sales Qualified Lead Campaign - Focus on identifying sales-ready prospects with budget, authority, need, and timeline.',
      'bant_leads': 'BANT Qualification Campaign - Qualify leads on Budget, Authority, Need, and Timeline.',
      'data_validation': 'Data Validation Campaign - Verify and update contact information.',
      'high_quality_leads': 'High-Quality Leads Campaign - Focus on identifying highly qualified prospects.',
      'webinar_invite': 'Webinar Invitation Campaign - Focus on driving webinar registrations.',
      'live_webinar': 'Live Webinar Campaign - Focus on driving live webinar attendance.',
      'on_demand_webinar': 'On-Demand Webinar Campaign - Focus on driving on-demand content consumption.',
      'executive_dinner': 'Executive Dinner Campaign - Focus on securing attendance from senior executives.',
    };
    const typeDesc = typeDescriptions[config.campaignType] || `Campaign Type: ${config.campaignType}`;
    sections.push(`## CAMPAIGN TYPE\n${typeDesc}`);
  }

  // CRITICAL: Campaign objective comes first - this is the PRIMARY GOAL
  if (config.objective) {
    sections.push(`### PRIMARY OBJECTIVE (Critical)\n${config.objective}\n\n**You MUST work toward this objective in every conversation.**`);
  }

  // KEY TALKING POINTS - HIGHEST PRIORITY for message delivery
  // These are placed early and emphasized to ensure the agent delivers them
  // Following OpenAI/Gemini voice best practices for natural delivery
  if (config.talkingPoints && config.talkingPoints.length > 0) {
    const points = config.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');
    sections.push(`### KEY TALKING POINTS (Must Deliver)

**CRITICAL: You MUST naturally weave these points into the conversation. These are the core messages to communicate:**

${points}

**Delivery Guidelines (Voice-Optimized):**
- Introduce these points conversationally, NOT as a reading list
- Look for natural moments to bring up each point based on conversation flow
- Prioritize points 1-3 as most critical if time is limited
- VARY your phrasing — do not repeat identical phrases
- Use natural pauses after important points to let them land
- Adapt your enthusiasm level to match the prospect's energy
- If interrupted mid-point, acknowledge and return naturally when appropriate`);
  }

  // Campaign brief provides additional context for intelligent delivery
  if (config.brief) {
    sections.push(`### Campaign Brief\n${config.brief}`);
  }

  // Product/Service info for context
  if (config.productInfo) {
    sections.push(`### Product/Service Information\n${config.productInfo}`);
  }

  // Target audience helps agent adapt their approach
  if (config.targetAudience) {
    sections.push(`### Target Audience\n${config.targetAudience}`);
  }

  // Campaign-specific objections with prepared responses
  if (config.objections && config.objections.length > 0) {
    const objectionText = config.objections
      .map(o => `**"${o.objection}"**\nResponse: ${o.response}`)
      .join('\n\n');
    sections.push(`### Campaign-Specific Objections\n${objectionText}`);
  }

  // Success criteria defines what a good outcome looks like AND triggers qualified_lead disposition
  if (config.successCriteria) {
    sections.push(`### Success Criteria (CRITICAL for Disposition)
${config.successCriteria}

**DISPOSITION RULE:** When the above success criteria are met during the conversation, you MUST call \`submit_disposition\` with \`"qualified_lead"\`. This is how qualified leads are captured.

**Qualified Lead Checklist:**
1. ✅ Identity confirmed (prospect confirmed they are the named contact)
2. ✅ Success criteria signals detected (see above)
3. ✅ Meaningful conversation occurred (not just "yes" or "sure")

If ALL three conditions are met → Call \`submit_disposition("qualified_lead", "Met success criteria: [brief reason]")\``);
  } else {
    // Add default disposition guidance when no success criteria is defined
    sections.push(`### Disposition Guidelines (Default)
**When to use each disposition:**

- **qualified_lead**: Prospect showed genuine interest - asked questions, requested follow-up, demo, or more info
- **not_interested**: Prospect politely declined or said they're not interested
- **do_not_call**: Prospect explicitly asked not to be called again
- **voicemail**: Reached voicemail/answering machine
- **no_answer**: Call connected but no human response
- **invalid_data**: Wrong number or person no longer at company

**Remember:** A "qualified_lead" requires BOTH identity confirmation AND genuine interest signals (not just "yes" or "ok").`);
  }

  if (sections.length === 0) {
    console.warn('[Foundation Capabilities] ⚠️ Campaign context is empty - no objective, brief, or talking points configured');
    return '';
  }

  console.log(`[Foundation Capabilities] ✅ Built campaign context with ${sections.length} sections (talking points: ${config.talkingPoints?.length || 0})`);
  return `## Campaign Context\n\n${sections.join('\n\n')}`;
}

/**
 * Build contact context section for per-call personalization
 */
export function buildContactContextSection(contact: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  company?: string | null;
  companyName?: string | null;
  industry?: string | null;
}): string {
  if (!contact) return '';

  const lines: string[] = [];

  const fullName = contact.fullName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();

  if (fullName) lines.push(`- **Name**: ${fullName}`);

  const company = contact.company || contact.companyName;
  if (company) lines.push(`- **Company**: ${company}`);

  if (contact.jobTitle) lines.push(`- **Title**: ${contact.jobTitle}`);
  if (contact.industry) lines.push(`- **Industry**: ${contact.industry}`);
  if (contact.email) lines.push(`- **Email**: ${contact.email}`);

  if (lines.length === 0) return '';

  return `## Prospect Information\n\n${lines.join('\n')}`;
}
