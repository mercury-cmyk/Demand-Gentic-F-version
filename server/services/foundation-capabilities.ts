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

**PREREQUISITE CHECK (MANDATORY)**: Before proposing ANY meeting or demo, you MUST have:
- ✅ Confirmed the prospect's identity
- ✅ Met the campaign's **Success Criteria** (check Campaign Context section) OR identified relevant interest
- ✅ Asked at least ONE question that aligns with the campaign objective

If the prospect immediately asks for a demo without qualification, say:
"Happy to set that up! First, let me ask a quick question so I can make sure we focus on what matters most to you — [use a question relevant to the campaign's talking points or objective]"

When the contact expresses interest AND qualification is complete:

1. **Confirm interest**: "Great, I'd love to set up a brief call to discuss this further."

2. **Suggest timing**: Offer 2-3 specific options
   "Would later this week work better, or sometime next week?"
   "Do you prefer mornings or afternoons?"

3. **Get specifics**: Once general timing is agreed, narrow down
   "How about [day] at [time]?"

4. **Confirm details**:
   - Date and time (confirm timezone if needed)
   - Duration: "This would be about [15/30] minutes"
   - Who else should attend: "Would it make sense to include anyone else from your team?"
   - Best number/link to reach them

5. **Use the schedule_callback tool** to record the appointment with:
   - Confirmed date/time
   - Contact's preferences
   - Key pain points discussed (for meeting prep)

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
    description: 'Campaign-driven qualification discovery',
    promptSection: `### Lead Qualification (CAMPAIGN-CONTEXT DRIVEN)

**IMPORTANT**: Your qualification approach MUST be driven by the **Campaign Context** section of this prompt.
- If the campaign defines specific **Success Criteria**, those are your qualification targets
- If the campaign defines **Talking Points**, weave those into your qualification questions
- If the campaign defines a **Campaign Objective**, that determines what qualifies as success

**VALUE PROPOSITION DELIVERY (when responding to interest):**
Always include SPECIFIC metrics when describing value:
- ❌ BAD: "We help companies improve their hiring process"
- ✅ GOOD: "We help companies reduce time-to-hire by 40% while improving quality of hire — one client went from 45 days to 27 days average"

**FALLBACK QUALIFICATION (only if no campaign-specific criteria provided):**
If the Campaign Context doesn't specify qualification criteria, use these discovery questions:

- **Need**: "What challenges are you facing with [topic]?"
- **Current Approach**: "How are you handling this today?"
- **Priority**: "Is this something you're actively looking to address?"

**QUALIFICATION GATE**: Before suggesting a meeting, you must have:
1. Identified alignment with the campaign's success criteria OR
2. Discovered at least ONE relevant pain point that matches the campaign objective

**Disqualification signals to note**:
- Explicit lack of interest after understanding the offer
- No relevance to the campaign's target audience
- Already committed to a competitor (if relevant to campaign)

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
  qualificationCriteria?: any | null; // Added qualification criteria
}): string {
  const sections: string[] = [];

  // Campaign type provides critical context for how to approach the call
  if (config.campaignType) {
    const typeDescriptions: Record<string, string> = {
      'appointment_generation': '**APPOINTMENT SETTING CAMPAIGN** - Your PRIMARY goal is to BOOK A SPECIFIC MEETING. Flow: (1) Deliver value proposition with metrics, (2) Ask ONE discovery question to qualify interest, (3) When interest is confirmed, propose specific times: "Would [day] at [time] or [day] at [time] work better for a quick 15-20 minute call?", (4) Confirm the meeting details and email. SUCCESS = explicit agreement to a specific date/time. Do NOT just send content and end - PUSH for the appointment.',
      'appointment_setting': '**APPOINTMENT SETTING CAMPAIGN** - Your PRIMARY goal is to BOOK A SPECIFIC MEETING. Flow: (1) Deliver value proposition with metrics, (2) Ask ONE discovery question to qualify interest, (3) When interest is confirmed, propose specific times: "Would [day] at [time] or [day] at [time] work better for a quick 15-20 minute call?", (4) Confirm the meeting details and email. SUCCESS = explicit agreement to a specific date/time. Do NOT just send content and end - PUSH for the appointment.',
      'content_syndication': '**CONTENT SYNDICATION CAMPAIGN** - Your ONLY goal is to deliver the white paper/content to the prospect. Do NOT ask discovery questions. Do NOT frame delivery as a yes/no question (never say "would you like to receive it?" or "are you interested?"). FLOW: (1) After identity confirmation, build brief RAPPORT by acknowledging their job title and company — e.g. "I see you\'re the [Title] at [Company], that\'s actually why I\'m reaching out..." — this makes them feel recognized and creates a natural bridge, (2) Introduce the content with one compelling insight or stat that ties to their role, (3) ASSUME interest and move directly to confirming the email address — e.g. "I\'ll send that over to you — is [email] still the best address?", (4) Close warmly. The prospect can decline naturally, but you never invite a "no" by asking permission.',
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

  // Qualification questions - CRITICAL for gathering required data
  if (config.qualificationCriteria && config.qualificationCriteria.length > 0) {
    let qualSection = `### ⚠️ MANDATORY QUALIFICATION QUESTIONS (Must Ask)\n\n`;
    qualSection += `**You are REQUIRED to ask these questions to qualify the lead. Do NOT skip them.**\n\n`;
    
    // Check if it's a JSON array of questions or just a string
    try {
      if (typeof config.qualificationCriteria === 'string' && config.qualificationCriteria.startsWith('[')) {
        const questions = JSON.parse(config.qualificationCriteria);
        if (Array.isArray(questions)) {
          questions.forEach((q, i) => {
            const requiredMark = q.required ? ' (REQUIRED)' : '';
            qualSection += `${i + 1}. **${q.label || q.question}**${requiredMark}\n`;
            if (q.type === 'select' && q.options) {
              qualSection += `   Options: ${q.options.join(', ')}\n`;
            }
          });
        } else {
            qualSection += config.qualificationCriteria;
        }
      } else {
        // It might be a plain string
        qualSection += config.qualificationCriteria;
      }
    } catch (e) {
      // Fallback if parsing fails
      qualSection += String(config.qualificationCriteria);
    }
    
    qualSection += `\n\n**INSTRUCTIONS:**\n- Weave these questions naturally into the conversation.\n- You MUST get answers to all REQUIRED questions before marking as qualified_lead.\n- If the prospect refuses to answer a required question, they cannot be marked as qualified.`;
    
    sections.push(qualSection);
  }

  // Campaign specific context helps agent adapt their approach
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
