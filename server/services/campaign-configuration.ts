
import { db } from "../db";
import { campaigns, virtualAgents, campaignAgentAssignments, campaignTypeEnum } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type CampaignType = (typeof campaignTypeEnum.enumValues)[number];

export interface CampaignConfiguration {
  type: CampaignType;
  label: string;
  purpose: string;
  agentFocus: string[];
  requirements?: string[];
  successCriteria?: string[];
  qualificationQuestions?: string[];
  openingMessageTemplate?: string;
}

export const CAMPAIGN_CONFIGURATIONS: Record<string, CampaignConfiguration> = {
  content_syndication: {
    type: "content_syndication",
    label: "Content Syndication",
    purpose: "Engage ideal buyers around a relevant topic, communicate value proposition contextually, assess interest and relevance, and obtain explicit consent for follow-up communication.",
    agentFocus: [
      "Interest validation",
      "Consent capture",
      "Value-based framing"
    ],
    successCriteria: [
      "Explicit consent obtained",
      "Interest validated"
    ],
    openingMessageTemplate: "Hi {{contact.firstName}}, I'm specific_agent_name calling from {{company_name}}. We just released a report on {{topic}}, and I wanted to see if you'd be interested in receiving a copy?"
  },
  live_webinar: {
    type: "live_webinar",
    label: "Live Webinar",
    purpose: "Invite ICP-aligned contacts, communicate relevance of the webinar topic, and drive registration.",
    agentFocus: [
      "Role relevance",
      "Timing",
      "Topic alignment"
    ],
    openingMessageTemplate: "Hi {{contact.firstName}}, this is specific_agent_name with {{company_name}}. We're hosting a live session on {{topic}} next week, and given your role as {{contact.jobTitle}}, I thought it might be relevant for you."
  },
  on_demand_webinar: {
    type: "on_demand_webinar",
    label: "On-Demand Webinar",
    purpose: "Promote access to recorded content and validate topical interest.",
    agentFocus: [
      "Problem relevance",
      "Learning intent"
    ],
    openingMessageTemplate: "Hi {{contact.firstName}}, specific_agent_name here from {{company_name}}. I'm reaching out because we have an on-demand session covering {{topic}} that has been very popular with other {{contact.jobTitle}}s."
  },
  high_quality_leads: {
    type: "high_quality_leads",
    label: "High-Quality Leads",
    purpose: "Deliver leads meeting predefined quality thresholds.",
    agentFocus: [
      "Quality verification",
      "Threshold checking"
    ],
    requirements: [
      "Mandatory qualifying questions",
      "Automatic enforcement of quality criteria"
    ]
  },
  executive_dinner: {
    type: "executive_dinner",
    label: "Executive Dinner",
    purpose: "Invite senior decision-makers to in-person events.",
    agentFocus: [
      "Seniority validation",
      "Strategic relevance",
      "Attendance confirmation"
    ],
    openingMessageTemplate: "Hello {{contact.firstName}}, I'm specific_agent_name calling on behalf of {{company_name}}. We are hosting an exclusive dinner for {{industry}} executives in {{city}} and I wanted to personally extend an invitation."
  },
  leadership_forum: {
    type: "leadership_forum",
    label: "Leadership Forum",
    purpose: "Engage senior leaders in peer-level discussions.",
    agentFocus: [
      "Leadership relevance",
      "Topic credibility"
    ]
  },
  conference: {
    type: "conference",
    label: "Conference",
    purpose: "Drive attendance or meetings at conferences.",
    agentFocus: [
      "Event relevance",
      "Role alignment"
    ]
  },
  sql: {
    type: "sql",
    label: "Sales Qualified Lead (SQL)",
    purpose: "Identify leads ready for sales engagement.",
    agentFocus: [
      "Problem confirmation",
      "Solution fit",
      "Engagement readiness"
    ],
    requirements: [
      "Confirmed problem or need",
      "Solution fit",
      "Engagement readiness"
    ]
  },
  appointment_generation: {
    type: "appointment_generation",
    label: "Appointment Generation",
    purpose: "Secure agreement for a sales or discovery meeting.",
    agentFocus: [
      "Scheduling",
      "Value proposition objection handling"
    ],
    successCriteria: [
      "Scheduled or explicitly agreed appointment"
    ]
  },
  lead_qualification: {
    type: "lead_qualification",
    label: "Lead Qualification",
    purpose: "Gather structured information for routing and prioritization.",
    agentFocus: [
      "Discovery",
      "Classification"
    ]
  },
  data_validation: {
    type: "data_validation",
    label: "Data Validation",
    purpose: "Verify accuracy of contact and account data.",
    agentFocus: [
      "Confirmation, not persuasion"
    ]
  },
  bant_leads: {
    type: "bant_leads",
    label: "BANT Leads",
    purpose: "Deliver leads qualified across BANT dimensions.",
    requirements: [
      "Budget",
      "Authority",
      "Need",
      "Timeline"
    ],
    agentFocus: [
      "Budget qualification",
      "Authority verification",
      "Need identification",
      "Timeline establishment"
    ]
  }
};

export function getCampaignConfiguration(type: string): CampaignConfiguration | undefined {
  return CAMPAIGN_CONFIGURATIONS[type];
}

export function generateAgentSystemPrompt(config: CampaignConfiguration, basePrompt?: string): string {
  let prompt = basePrompt || `You are an intelligent AI agent designed for ${config.label} campaigns. `;
  
  prompt += `\nOBJECTIVE:\n${config.purpose}\n`;
  
  if (config.agentFocus && config.agentFocus.length > 0) {
    prompt += `\nKEY FOCUS AREAS:\n`;
    config.agentFocus.forEach(focus => {
      prompt += `- ${focus}\n`;
    });
  }

  if (config.requirements && config.requirements.length > 0) {
    prompt += `\nREQUIREMENTS:\n`;
    config.requirements.forEach(req => {
      prompt += `- ${req}\n`;
    });
  }

  if (config.successCriteria && config.successCriteria.length > 0) {
    prompt += `\nSUCCESS CRITERIA:\n`;
    config.successCriteria.forEach(crit => {
      prompt += `- ${crit}\n`;
    });
  }

  prompt += `\nBEHAVIORAL GUIDELINES:\n`;
  prompt += `- Align your conversation with the campaign objective: ${config.purpose}\n`;
  if (config.type === 'data_validation') {
    prompt += `- Be concise and focused on verification. Do not attempt to sell or persuade. Check strictly for accuracy.\n`;
  } else if (config.type === 'executive_dinner' || config.type === 'leadership_forum') {
    prompt += `- Maintain a high level of professionalism and deference, appropriate for speaking with senior executives.\n`;
  } else if (config.type === 'content_syndication') {
    prompt += `- Focus on relevance and value. Do not be pushy. If they are interested, confirm their email.\n`;
  }

  return prompt;
}

export async function configureCampaignAgents(campaignId: string, type: string) {
  const config = getCampaignConfiguration(type);
  if (!config) {
      console.log(`[CampaignConfig] No configuration found for type: ${type}`);
      return;
  }

  console.log(`[CampaignConfig] Configuring agents for campaign ${campaignId} with type ${type}`);

  // Generate the system prompt
  const systemPrompt = generateAgentSystemPrompt(config);

  // Check if an AI (virtual) agent is already assigned
  const existingAssignments = await db.select()
    .from(campaignAgentAssignments)
    .where(and(
        eq(campaignAgentAssignments.campaignId, campaignId),
        eq(campaignAgentAssignments.agentType, 'ai')
    ));

  let virtualAgentId: string | null = null;
  if (existingAssignments.length > 0 && existingAssignments[0].virtualAgentId) {
    virtualAgentId = existingAssignments[0].virtualAgentId;
  }

  const updateData: any = {
    systemPrompt: systemPrompt,
    name: `${config.label} Agent - ${campaignId.substring(0, 8)}`, 
    description: `Auto-configured agent for ${config.label} campaign. Purpose: ${config.purpose}`,
    updatedAt: new Date(),
    isActive: true
  };
  
  if (config.openingMessageTemplate) {
      updateData.firstMessage = config.openingMessageTemplate;
  }

  if (virtualAgentId) {
    // Update existing virtual agent
    console.log(`[CampaignConfig] Updating existing virtual agent ${virtualAgentId}`);
    await db.update(virtualAgents)
      .set(updateData)
      .where(eq(virtualAgents.id, virtualAgentId));
  } else {
    // Create new virtual agent
    console.log(`[CampaignConfig] Creating new virtual agent`);
    const [newAgent] = await db.insert(virtualAgents).values({
      ...updateData,
      provider: 'gemini_live', // Default to Gemini
      voice: 'Kore', // Default voice
    }).returning();
    
    virtualAgentId = newAgent.id;

    // Assign to campaign
    await db.insert(campaignAgentAssignments).values({
      campaignId: campaignId,
      virtualAgentId: newAgent.id,
      agentType: 'ai',
      isActive: true,
      assignedBy: null // System assigned
    });
  }
}
