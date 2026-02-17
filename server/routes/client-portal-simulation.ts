/**
 * Client Portal Simulation Routes
 * Allows clients to simulate AI agent conversations with their own campaigns
 */
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, or } from 'drizzle-orm';
import {
  campaigns,
  clientCampaignAccess,
  campaignAgentAssignments,
  virtualAgents,
  verificationCampaigns,
  accounts,
  contacts,
  previewStudioSessions,
  previewSimulationTranscripts,
} from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  generateClientEmailContent,
  VARIANT_SPECS,
  type GeneratedEmailContent,
} from '../lib/deepseek-client-email-service';
import { buildBrandedEmailHtml, type BrandPaletteKey } from '../../client/src/components/email-builder/ai-email-template';
import { clientAccounts, clientBusinessProfiles, workOrders, campaignIntakeRequests, clientCampaigns } from '@shared/schema';
import {
  checkPreviewIntelligence,
  enforcePreviewIntelligence,
  intelligenceGateErrorResponse,
} from '../services/preview-intelligence-gate';
import {
  getOrBuildAccountIntelligence,
  getOrBuildAccountMessagingBrief,
  getAccountProfileData,
} from '../services/account-messaging-service';
import {
  getVirtualAgentConfig,
  mergeAgentSettings,
} from '../services/virtual-agent-settings';
import { getCallerIdForCall, releaseNumberWithoutOutcome, sleep as numberPoolSleep } from '../services/number-pool-integration';
import {
  buildUnifiedCallContext,
  contextToClientStateParams,
} from '../services/unified-call-context';
import { analyzeConversationQuality } from '../services/conversation-quality-analyzer';

const router = Router();

/**
 * Unified campaign access check — mirrors the union approach from client-portal.ts preview-audience.
 * Checks 5 access paths: clientCampaignAccess, workOrders, campaignIntakeRequests,
 * campaigns.clientAccountId, and clientCampaigns.
 */
async function checkClientCampaignAccess(clientAccountId: string, campaignId: string): Promise<boolean> {
  const accessChecks = await Promise.all([
    db.select({ id: clientCampaignAccess.id }).from(clientCampaignAccess).where(and(eq(clientCampaignAccess.clientAccountId, clientAccountId), or(eq(clientCampaignAccess.campaignId, campaignId), eq(clientCampaignAccess.regularCampaignId, campaignId)))).limit(1),
    db.select({ id: workOrders.id }).from(workOrders).where(and(eq(workOrders.clientAccountId, clientAccountId), eq(workOrders.campaignId, campaignId))).limit(1),
    db.select({ id: campaignIntakeRequests.id }).from(campaignIntakeRequests).where(and(eq(campaignIntakeRequests.clientAccountId, clientAccountId), eq(campaignIntakeRequests.campaignId, campaignId))).limit(1),
    db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.clientAccountId, clientAccountId))).limit(1),
    db.select({ id: clientCampaigns.id }).from(clientCampaigns).where(and(eq(clientCampaigns.id, campaignId), eq(clientCampaigns.clientAccountId, clientAccountId))).limit(1),
  ]);
  return accessChecks.some(result => result.length > 0);
}

// Initialize Gemini client
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '');

// Mock contact data for simulations
interface MockContact {
  fullName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  accountName: string;
}

// Agent persona for display
interface AgentInfo {
  name: string;
  companyName: string;
  role: string;
  voice: string;
}

// In-memory session store
interface SimulationSession {
  id: string;
  campaignId: string;
  campaignName: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  createdAt: Date;
  mockContact?: MockContact;
  agentInfo?: AgentInfo;
}

const simulationSessions = new Map<string, SimulationSession>();

// Select only the fields needed for simulation flows.
// Avoids hard failures if the database is missing newly-added optional columns.
const CAMPAIGN_SIMULATION_SELECT = {
  id: campaigns.id,
  name: campaigns.name,
  aiAgentSettings: campaigns.aiAgentSettings,
  campaignObjective: campaigns.campaignObjective,
  productServiceInfo: campaigns.productServiceInfo,
  talkingPoints: campaigns.talkingPoints,
  targetAudienceDescription: campaigns.targetAudienceDescription,
  callScript: campaigns.callScript,
  campaignObjections: campaigns.campaignObjections,
  successCriteria: campaigns.successCriteria,
  qualificationQuestions: campaigns.qualificationQuestions,
};

// Sample mock contact data pools for realistic simulations
const MOCK_FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Cameron', 'Avery', 'Drew'];
const MOCK_LAST_NAMES = ['Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Anderson', 'Thompson', 'Martinez', 'Garcia'];
const MOCK_COMPANY_SUFFIXES = ['Technologies', 'Solutions', 'Group', 'Inc.', 'Corporation', 'Partners', 'Enterprises'];

// Prospect persona configurations for different simulation scenarios
const PROSPECT_PERSONAS: Record<string, { titles: string[]; disposition: string; description: string }> = {
  'friendly_dm': {
    titles: ['VP of Marketing', 'Director of Business Development', 'Head of Growth'],
    disposition: 'friendly and open to conversation',
    description: 'Open to learning more, actively looking for solutions'
  },
  'neutral_dm': {
    titles: ['Director of Technology', 'VP of Operations', 'Senior Director of Sales'],
    disposition: 'professional and neutral',
    description: 'Needs to be convinced with clear value proposition'
  },
  'skeptical_dm': {
    titles: ['IT Director', 'CTO', 'VP of Engineering'],
    disposition: 'skeptical and challenging',
    description: 'Has objections, tests your pitch, mentions competitors'
  },
  'busy_executive': {
    titles: ['CEO', 'CFO', 'Chief Revenue Officer'],
    disposition: 'time-constrained and direct',
    description: 'Only has 30 seconds, needs quick value proposition'
  },
  'gatekeeper': {
    titles: ['Executive Assistant', 'Office Manager', 'Receptionist'],
    disposition: 'protective of the decision maker',
    description: 'Screens calls, may require callback or email instead'
  }
};

/**
 * Generate mock contact data for simulation based on persona
 */
function generateMockContact(campaignName: string, personaPreset?: string): MockContact {
  const firstName = MOCK_FIRST_NAMES[Math.floor(Math.random() * MOCK_FIRST_NAMES.length)];
  const lastName = MOCK_LAST_NAMES[Math.floor(Math.random() * MOCK_LAST_NAMES.length)];

  // Select job title based on persona or random
  let jobTitle: string;
  if (personaPreset && PROSPECT_PERSONAS[personaPreset]) {
    const persona = PROSPECT_PERSONAS[personaPreset];
    jobTitle = persona.titles[Math.floor(Math.random() * persona.titles.length)];
  } else {
    const allTitles = Object.values(PROSPECT_PERSONAS).flatMap(p => p.titles);
    jobTitle = allTitles[Math.floor(Math.random() * allTitles.length)];
  }

  // Generate a realistic account name
  const suffix = MOCK_COMPANY_SUFFIXES[Math.floor(Math.random() * MOCK_COMPANY_SUFFIXES.length)];
  const accountName = `Acme ${suffix}`;

  return {
    fullName: `${firstName} ${lastName}`,
    firstName,
    lastName,
    jobTitle,
    accountName,
  };
}

/**
 * Get persona behavior description for system prompt
 */
function getPersonaBehavior(personaPreset?: string): string {
  if (!personaPreset || !PROSPECT_PERSONAS[personaPreset]) {
    return 'professional and engaged';
  }
  return PROSPECT_PERSONAS[personaPreset].disposition;
}

// Clean up old sessions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  for (const [id, session] of simulationSessions) {
    if (now - session.createdAt.getTime() > maxAge) {
      simulationSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * GET /intelligence-status
 * Check intelligence readiness for a campaign + account before running preview/test.
 */
router.get('/intelligence-status', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const { campaignId, accountId } = req.query as { campaignId: string; accountId: string };
    if (!campaignId || !accountId) {
      return res.status(400).json({ error: 'campaignId and accountId are required' });
    }
    const status = await checkPreviewIntelligence({ accountId, campaignId });
    res.json(status);
  } catch (error) {
    console.error('[Client Simulation] Intelligence status check error:', error);
    res.status(500).json({ error: 'Failed to check intelligence status' });
  }
});

/**
 * POST /intelligence-generate
 * Auto-generate missing intelligence for a campaign + account.
 */
router.post('/intelligence-generate', async (req: Request, res: Response) => {
  try {
    const { campaignId, accountId } = req.body;
    if (!campaignId || !accountId) {
      return res.status(400).json({ error: 'campaignId and accountId are required' });
    }
    const result = await enforcePreviewIntelligence({ accountId, campaignId, autoGenerate: true });
    res.json({
      success: result.passed,
      status: result.status,
    });
  } catch (error) {
    console.error('[Client Simulation] Intelligence generation error:', error);
    res.status(500).json({ error: 'Failed to generate intelligence' });
  }
});

/**
 * Start a new simulation session
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const { campaignId, contactData, voiceId, mode, personaPreset } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Verify client has access to this campaign (union approach — all access paths)
    const hasAccess = await checkClientCampaignAccess(clientUser.clientAccountId, campaignId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this campaign' });
    }

    // Get campaign details
    const [campaign] = await db
      .select(CAMPAIGN_SIMULATION_SELECT)
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // REMOVED: Strict check for 'published' status and clientAccountId ownership.

    // Try to get virtual agent if assigned
    let agentPersona = '';
    let agentInfo: AgentInfo = {
      name: 'AI Sales Agent',
      companyName: 'Your Company',
      role: 'Sales Development Representative',
      voice: 'Fenrir',
    };

    // First try to get agent info from campaign's aiAgentSettings
    if (campaign.aiAgentSettings?.persona) {
      const persona = campaign.aiAgentSettings.persona;
      agentInfo.name = persona.name || agentInfo.name;
      agentInfo.companyName = persona.companyName || agentInfo.companyName;
      agentInfo.role = persona.role || agentInfo.role;
      agentInfo.voice = persona.voice || campaign.aiAgentSettings.voice || agentInfo.voice;
    }

    // Try to get virtual agent if assigned (overrides campaign settings)
    try {
      const [assignment] = await db
        .select()
        .from(campaignAgentAssignments)
        .where(eq(campaignAgentAssignments.campaignId, campaignId))
        .limit(1);

      if (assignment?.virtualAgentId) {
        const [agent] = await db
          .select()
          .from(virtualAgents)
          .where(eq(virtualAgents.id, assignment.virtualAgentId))
          .limit(1);

        if (agent) {
          if (agent.systemPrompt) {
            agentPersona = agent.systemPrompt;
          }
          // Update agent info from virtual agent
          agentInfo.name = agent.name || agentInfo.name;
          agentInfo.voice = agent.voice || agentInfo.voice;
        }
      }
    } catch (e) {
      console.log('[Simulation] No virtual agent assignment found');
    }

    // Override voice if provided in request
    if (voiceId) {
      agentInfo.voice = voiceId;
    }

    // Use provided contact data or generate mock contact based on persona
    let simulationContact: MockContact;
    if (contactData && (contactData.contactName || contactData.accountName)) {
      // Use the selected contact from campaign audience
      const firstName = contactData.contactFirstName || contactData.contactName?.split(' ')[0] || 'Contact';
      const lastName = contactData.contactLastName || contactData.contactName?.split(' ').slice(1).join(' ') || '';
      simulationContact = {
        fullName: contactData.contactName || `${firstName} ${lastName}`.trim() || 'Contact',
        firstName,
        lastName,
        jobTitle: contactData.contactTitle || 'Decision Maker',
        accountName: contactData.accountName || 'Company',
      };
    } else {
      // Generate mock contact for this simulation based on selected persona
      simulationContact = generateMockContact(campaign.name, personaPreset);
    }

    // Get persona behavior for the system prompt
    const personaBehavior = getPersonaBehavior(personaPreset);

    // Build simulation system prompt with contact and persona context
    const systemPrompt = buildSimulationPrompt(campaign, agentPersona, simulationContact, personaBehavior);

    // Generate first message based on campaign with contact data
    const firstMessage = generateFirstMessage(campaign, simulationContact, mode);

    // Create session
    const sessionId = uuidv4();
    const session: SimulationSession = {
      id: sessionId,
      campaignId,
      campaignName: campaign.name,
      systemPrompt,
      messages: [{ role: 'assistant', content: firstMessage }],
      createdAt: new Date(),
      mockContact: simulationContact,
      agentInfo,
    };

    simulationSessions.set(sessionId, session);

    res.json({
      sessionId,
      firstMessage,
      context: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        // Include contact data for display (prospect being called)
        accountName: simulationContact.accountName,
        contactName: simulationContact.fullName,
        contactFirstName: simulationContact.firstName,
        contactLastName: simulationContact.lastName,
        contactTitle: simulationContact.jobTitle,
        // Include agent info for display (AI agent making the call)
        agentName: agentInfo.name,
        agentCompany: agentInfo.companyName,
        agentRole: agentInfo.role,
        agentVoice: agentInfo.voice,
      },
    });
  } catch (error) {
    console.error('[Client Portal Simulation] Start error:', error);
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

/**
 * Send a message in a simulation session
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const { sessionId, campaignId, userMessage } = req.body;

    if (!userMessage?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let session = sessionId ? simulationSessions.get(sessionId) : null;

    // If no session, create one on-the-fly
    if (!session && campaignId) {
      // Verify access (union approach)
      const hasAccess = await checkClientCampaignAccess(clientUser.clientAccountId, campaignId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'No access to this campaign' });
      }

      const [campaign] = await db
        .select(CAMPAIGN_SIMULATION_SELECT)
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Generate mock contact for on-the-fly session
      const mockContact = generateMockContact(campaign.name);

      // Extract agent info from campaign settings
      let agentInfo: AgentInfo = {
        name: 'AI Sales Agent',
        companyName: 'Your Company',
        role: 'Sales Development Representative',
        voice: 'Fenrir',
      };

      if (campaign.aiAgentSettings?.persona) {
        const persona = campaign.aiAgentSettings.persona;
        agentInfo.name = persona.name || agentInfo.name;
        agentInfo.companyName = persona.companyName || agentInfo.companyName;
        agentInfo.role = persona.role || agentInfo.role;
        agentInfo.voice = persona.voice || campaign.aiAgentSettings.voice || agentInfo.voice;
      }

      const newSessionId = uuidv4();
      session = {
        id: newSessionId,
        campaignId,
        campaignName: campaign.name,
        systemPrompt: buildSimulationPrompt(campaign, '', mockContact),
        messages: [],
        createdAt: new Date(),
        mockContact,
        agentInfo,
      };
      simulationSessions.set(newSessionId, session);
    }

    if (!session) {
      return res.status(400).json({ error: 'Invalid or expired session. Please start a new simulation.' });
    }

    // Add user message to history
    session.messages.push({ role: 'user', content: userMessage });

    // Generate AI response using Gemini
    let reply: string;
    try {
      reply = await generateGeminiResponse(session.systemPrompt, session.messages);
    } catch (error) {
      console.error('[Simulation] Gemini error:', error);
      reply = "I apologize, but I'm experiencing some technical difficulties. Could you please repeat that?";
    }

    // Add assistant reply to session
    session.messages.push({ role: 'assistant', content: reply });

    res.json({
      reply,
      sessionId: session.id,
      context: {
        campaignId: session.campaignId,
        campaignName: session.campaignName,
        // Include mock contact data for display (prospect being called)
        accountName: session.mockContact?.accountName,
        contactName: session.mockContact?.fullName,
        contactFirstName: session.mockContact?.firstName,
        contactLastName: session.mockContact?.lastName,
        contactTitle: session.mockContact?.jobTitle,
        // Include agent info for display (AI agent making the call)
        agentName: session.agentInfo?.name,
        agentCompany: session.agentInfo?.companyName,
        agentRole: session.agentInfo?.role,
        agentVoice: session.agentInfo?.voice,
      },
    });
  } catch (error) {
    console.error('[Client Portal Simulation] Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * Generate AI response using Gemini
 */
async function generateGeminiResponse(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const model = gemini.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  // Convert messages to Gemini format
  // Gemini requires first message to be from user
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: m.content }],
  }));

  // Filter to ensure history starts with user message
  const filteredHistory = history.filter((_, i) => {
    if (i === 0) return history[0].role === 'user';
    return true;
  });

  const lastMessage = messages[messages.length - 1];
  
  const chat = model.startChat({ history: filteredHistory });
  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

/**
 * Generate first message based on campaign data and mock contact
 * Uses the standard opening format: "Hello, may I please speak with [Name], the [Title] at [Company]?"
 */
function generateFirstMessage(campaign: any, mockContact: MockContact, mode?: string): string {
  if (mode === 'email') {
    return `Subject: Partnership with ${mockContact.accountName}

Hi ${mockContact.firstName},

I hope you're having a great week.

I'm reaching out because I believe we can help ${mockContact.accountName} achieve its growth goals this quarter.

Would you be open to a brief conversation?

Best regards,
${campaign.aiAgentSettings?.persona?.name || 'AI Assistant'}
${campaign.aiAgentSettings?.persona?.companyName || 'DemandGentic'}`;
  }

  // Check if campaign has AI agent settings with opening script
  if (campaign.aiAgentSettings?.scripts?.opening) {
    // Substitute mock contact variables in the custom opening script
    let openingScript = campaign.aiAgentSettings.scripts.opening;
    openingScript = openingScript.replace(/\{\{contact\.full_name\}\}/gi, mockContact.fullName);
    openingScript = openingScript.replace(/\{\{contact\.first_name\}\}/gi, mockContact.firstName);
    openingScript = openingScript.replace(/\{\{contact\.job_title\}\}/gi, mockContact.jobTitle);
    openingScript = openingScript.replace(/\{\{account\.name\}\}/gi, mockContact.accountName);
    openingScript = openingScript.replace(/\{\{ContactFullName\}\}/gi, mockContact.fullName);
    openingScript = openingScript.replace(/\{\{ContactFirstName\}\}/gi, mockContact.firstName);
    openingScript = openingScript.replace(/\{\{JobTitle\}\}/gi, mockContact.jobTitle);
    openingScript = openingScript.replace(/\{\{AccountName\}\}/gi, mockContact.accountName);
    return openingScript;
  }

  // Default first message - standard outbound call opening
  // This matches the format used by test AI agent calls
  return `Hello, may I please speak with ${mockContact.fullName}, the ${mockContact.jobTitle} at ${mockContact.accountName}?`;
}

/**
 * Build the simulation system prompt from campaign data
 */
function buildSimulationPrompt(campaign: any, agentPersona: string, mockContact?: MockContact, personaBehavior?: string): string {
  const parts: string[] = [];

  parts.push(`You are an AI sales development representative for a campaign called "${campaign.name}".`);
  parts.push(`This is a SIMULATION MODE where the user is playing the role of a prospect to test your capabilities.`);

  // Add mock contact context so AI knows who it's speaking with
  if (mockContact) {
    parts.push(`\n## PROSPECT CONTEXT (The person you are calling)`);
    parts.push(`- Full Name: ${mockContact.fullName}`);
    parts.push(`- First Name: ${mockContact.firstName}`);
    parts.push(`- Job Title: ${mockContact.jobTitle}`);
    parts.push(`- Company: ${mockContact.accountName}`);
    if (personaBehavior) {
      parts.push(`- Disposition: The prospect is ${personaBehavior}`);
    }
    parts.push(`\nUse this context throughout the conversation. Address them by name when appropriate.`);
    parts.push(`When they confirm their identity, acknowledge it: "Great, thanks for confirming [Name]."`);
    parts.push(`Reference their role and company naturally in your pitch.`);
  }
  
  parts.push(`\n## Your Role`);
  parts.push(`- Act as a professional, friendly SDR making an outbound call`);
  parts.push(`- Follow the campaign's objectives and qualification criteria`);
  parts.push(`- Handle objections gracefully and professionally`);
  parts.push(`- Try to qualify the prospect and book a meeting if appropriate`);

  if (agentPersona) {
    parts.push(`\n## Agent Persona`);
    parts.push(agentPersona);
  }

  // Campaign objective
  if (campaign.campaignObjective) {
    parts.push(`\n## Campaign Objective`);
    parts.push(campaign.campaignObjective);
  }

  // Product/Service info
  if (campaign.productServiceInfo) {
    parts.push(`\n## Product/Service Information`);
    parts.push(campaign.productServiceInfo);
  }

  // Talking points
  if (campaign.talkingPoints && Array.isArray(campaign.talkingPoints)) {
    parts.push(`\n## Key Talking Points`);
    campaign.talkingPoints.forEach((point: string) => {
      parts.push(`- ${point}`);
    });
  }

  // Target audience
  if (campaign.targetAudienceDescription) {
    parts.push(`\n## Target Audience`);
    parts.push(campaign.targetAudienceDescription);
  }

  // Call script
  if (campaign.callScript) {
    parts.push(`\n## Call Script Guidelines`);
    parts.push(campaign.callScript);
  }

  // AI agent settings
  if (campaign.aiAgentSettings) {
    const settings = campaign.aiAgentSettings;
    
    if (settings.persona) {
      parts.push(`\n## Your Persona`);
      if (settings.persona.name) parts.push(`- Name: ${settings.persona.name}`);
      if (settings.persona.role) parts.push(`- Role: ${settings.persona.role}`);
      if (settings.persona.companyName) parts.push(`- Company: ${settings.persona.companyName}`);
    }

    if (settings.scripts?.pitch) {
      parts.push(`\n## Value Proposition/Pitch`);
      parts.push(settings.scripts.pitch);
    }

    if (settings.scripts?.objections) {
      parts.push(`\n## Objection Handling`);
      parts.push(settings.scripts.objections);
    }
  }

  // Campaign objections
  if (campaign.campaignObjections && Array.isArray(campaign.campaignObjections)) {
    parts.push(`\n## Common Objections & Responses`);
    campaign.campaignObjections.forEach((obj: { objection: string; response: string }) => {
      parts.push(`- Objection: "${obj.objection}"`);
      parts.push(`  Response: "${obj.response}"`);
    });
  }

  // Success criteria
  if (campaign.successCriteria) {
    parts.push(`\n## Success Criteria`);
    parts.push(campaign.successCriteria);
  }

  // Qualification questions
  if (campaign.qualificationQuestions && Array.isArray(campaign.qualificationQuestions)) {
    parts.push(`\n## Qualification Questions to Ask`);
    campaign.qualificationQuestions.forEach((q: any, i: number) => {
      const question = typeof q === 'string' ? q : q.question || q.text;
      if (question) parts.push(`${i + 1}. ${question}`);
    });
  }

  parts.push(`\n## Conversation Guidelines`);
  parts.push(`- Keep responses conversational and natural (1-3 sentences typically)`);
  parts.push(`- Listen actively and respond DIRECTLY to what the prospect says`);
  parts.push(`- If they confirm their identity (e.g., "Yes", "Speaking", "This is [name]"), acknowledge it and proceed with your pitch`);
  parts.push(`- If they ask "Who is this?" or "What company?", introduce yourself clearly`);
  parts.push(`- If they show interest, try to qualify them and suggest next steps`);
  parts.push(`- If they object, acknowledge their concern and try to address it`);
  parts.push(`- If they say they're busy, offer to call back at a better time`);
  parts.push(`- If they're not interested, thank them politely and end the call`);
  parts.push(`- Be respectful and never be pushy or aggressive`);
  parts.push(`- Use the prospect's first name naturally in conversation`);

  return parts.join('\n');
}

// ============================================================================
// EMAIL TEMPLATE GENERATION
// ============================================================================

/**
 * Required variables that must be present for call/email operations
 */
const REQUIRED_CONTACT_VARIABLES = ['firstName', 'lastName', 'email', 'company', 'jobTitle'];

/**
 * Validate that a contact has all required variables
 */
function validateContactVariables(contact: any): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!contact.firstName?.trim()) missing.push('firstName');
  if (!contact.lastName?.trim()) missing.push('lastName');
  if (!contact.email?.trim() || !isValidEmail(contact.email)) missing.push('email');
  if (!contact.company?.trim() && !contact.accountName?.trim()) missing.push('company');
  if (!contact.jobTitle?.trim()) missing.push('jobTitle');
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate contact variables before call/email
 */
router.post('/validate-contact', async (req: Request, res: Response) => {
  try {
    const { contact, campaignId } = req.body;

    if (!contact) {
      return res.status(400).json({ error: 'Contact data is required' });
    }

    const validation = validateContactVariables(contact);
    
    if (!validation.valid) {
      return res.json({
        valid: false,
        blocked: true,
        reason: `Missing required variables: ${validation.missing.join(', ')}`,
        missing: validation.missing,
      });
    }

    res.json({
      valid: true,
      blocked: false,
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
        company: contact.company || contact.accountName,
        jobTitle: contact.jobTitle,
      },
    });
  } catch (error) {
    console.error('[Simulation] Validate contact error:', error);
    res.status(500).json({ error: 'Failed to validate contact' });
  }
});

/**
 * Generate campaign-aware, compliant email templates
 * Optimized for Outlook and Gmail delivery
 */
router.post('/generate-email-template', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const { 
      campaignId, 
      templateType = 'initial_outreach',
      tone = 'professional',
      length = 'medium',
      includeVariables = true,
    } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Verify client has access (union approach)
    const hasAccess = await checkClientCampaignAccess(clientUser.clientAccountId, campaignId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this campaign' });
    }

    // Get campaign details (try regular first, then verification)
    let campaign: any = null;
    const [regularCamp] = await db
      .select(CAMPAIGN_SIMULATION_SELECT)
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (regularCamp) {
      campaign = regularCamp;
    } else {
      const [verifCamp] = await db
        .select({
          id: verificationCampaigns.id,
          name: verificationCampaigns.name,
          status: verificationCampaigns.status,
        })
        .from(verificationCampaigns)
        .where(eq(verificationCampaigns.id, campaignId))
        .limit(1);
      if (verifCamp) {
        campaign = {
          ...verifCamp,
          campaignObjective: 'Appointment Setting / Contact Verification',
          productServiceInfo: null,
          talkingPoints: [],
          targetAudienceDescription: null,
          successCriteria: 'Qualified meeting booked',
        };
      }
    }

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Generate email template using Gemini
    const emailTemplate = await generateEmailTemplate(campaign, {
      templateType,
      tone,
      length,
      includeVariables,
    });

    res.json({
      template: emailTemplate,
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      variables: includeVariables ? getAvailableVariables() : [],
    });
  } catch (error) {
    console.error('[Simulation] Generate email template error:', error);
    res.status(500).json({ error: 'Failed to generate email template' });
  }
});

/**
 * Get available merge variables for templates
 */
function getAvailableVariables(): Array<{ key: string; description: string; example: string }> {
  return [
    { key: '{{firstName}}', description: 'Contact first name', example: 'John' },
    { key: '{{lastName}}', description: 'Contact last name', example: 'Smith' },
    { key: '{{fullName}}', description: 'Contact full name', example: 'John Smith' },
    { key: '{{email}}', description: 'Contact email', example: 'john.smith@company.com' },
    { key: '{{company}}', description: 'Company name', example: 'Acme Corp' },
    { key: '{{jobTitle}}', description: 'Contact job title', example: 'VP of Marketing' },
    { key: '{{campaignName}}', description: 'Campaign name', example: 'Q1 Outreach' },
    { key: '{{senderName}}', description: 'Sender name', example: 'Sarah Johnson' },
    { key: '{{senderTitle}}', description: 'Sender title', example: 'Account Executive' },
    { key: '{{senderCompany}}', description: 'Sender company', example: 'Your Company' },
  ];
}

/**
 * Generate an email template using Gemini AI
 */
async function generateEmailTemplate(
  campaign: any,
  options: {
    templateType: string;
    tone: string;
    length: string;
    includeVariables: boolean;
  }
): Promise<{
  subject: string;
  preheader: string;
  htmlContent: string;
  plainTextContent: string;
  variables: string[];
}> {
  const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = buildEmailGenerationPrompt(campaign, options);

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Parse the AI response
  return parseEmailTemplateResponse(response, options.includeVariables);
}

/**
 * Build the prompt for email template generation
 */
function buildEmailGenerationPrompt(campaign: any, options: any): string {
  const templateTypes: Record<string, string> = {
    'initial_outreach': 'Initial cold outreach email to introduce the offering',
    'follow_up': 'Follow-up email after no response to initial outreach',
    'meeting_request': 'Direct meeting request email',
    'value_proposition': 'Email focused on key value propositions and benefits',
    'case_study': 'Email referencing relevant case studies or success stories',
    'nurture': 'Soft-touch nurture email to stay top of mind',
    'breakup': 'Final attempt email before removing from sequence',
  };

  const toneDescriptions: Record<string, string> = {
    'professional': 'Professional and business-appropriate',
    'friendly': 'Warm and approachable while still professional',
    'direct': 'Concise and to-the-point',
    'consultative': 'Helpful and advisory, focused on solving problems',
    'casual': 'Relaxed and conversational',
  };

  const lengthGuide: Record<string, string> = {
    'short': '50-75 words, very concise',
    'medium': '100-150 words, balanced',
    'long': '200-250 words, detailed',
  };

  return `You are an expert email copywriter specializing in B2B sales emails. Generate a high-converting email template that is:

1. **COMPLIANT**: No spam trigger words, no ALL CAPS, no excessive punctuation, no misleading subject lines
2. **DELIVERABLE**: Optimized for Outlook and Gmail inbox placement
3. **CLEAN HTML**: Uses only inline CSS, no external stylesheets, no JavaScript, no images requiring download
4. **MOBILE RESPONSIVE**: Simple table-based layout that works on all devices
5. **ACCESSIBLE**: Proper semantic structure, alt text placeholders

## Campaign Context
- Campaign Name: ${campaign.name}
- Objective: ${campaign.campaignObjective || 'Generate qualified meetings'}
- Target Audience: ${campaign.targetAudienceDescription || 'Business professionals'}
- Product/Service: ${campaign.productServiceInfo || 'Not specified'}
- Key Talking Points: ${JSON.stringify(campaign.talkingPoints || [])}
- Success Criteria: ${campaign.successCriteria || 'Meeting booked'}

## Template Requirements
- Type: ${templateTypes[options.templateType] || options.templateType}
- Tone: ${toneDescriptions[options.tone] || options.tone}
- Length: ${lengthGuide[options.length] || 'medium'}
- Include merge variables: ${options.includeVariables ? 'Yes - use {{variableName}} format' : 'No'}

## Available Merge Variables (if including variables)
- {{firstName}} - Contact's first name
- {{lastName}} - Contact's last name
- {{fullName}} - Contact's full name
- {{company}} - Contact's company name
- {{jobTitle}} - Contact's job title
- {{senderName}} - Sender's name
- {{senderTitle}} - Sender's job title
- {{senderCompany}} - Sender's company

## Output Format
Respond with a JSON object containing:
{
  "subject": "Email subject line (compelling, under 50 chars, no spam words)",
  "preheader": "Preview text shown after subject (under 100 chars)",
  "htmlContent": "Full HTML email with inline styles, table-based layout",
  "plainTextContent": "Plain text version of the email"
}

## HTML Guidelines
- Use table-based layout for Outlook compatibility
- All styles must be inline (style="...")
- Use web-safe fonts: Arial, Helvetica, Georgia, Times New Roman
- Colors should have good contrast (WCAG AA)
- Max width: 600px
- No images, no external resources
- Include proper doctype and meta tags
- Use mso conditionals for Outlook if needed

Generate the email template now:`;
}

/**
 * Parse the AI response into structured email template
 */
function parseEmailTemplateResponse(
  response: string,
  includeVariables: boolean
): {
  subject: string;
  preheader: string;
  htmlContent: string;
  plainTextContent: string;
  variables: string[];
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Extract used variables
      const variables: string[] = [];
      if (includeVariables) {
        const varRegex = /\{\{(\w+)\}\}/g;
        const fullText = `${parsed.subject} ${parsed.htmlContent} ${parsed.plainTextContent}`;
        let match;
        while ((match = varRegex.exec(fullText)) !== null) {
          if (!variables.includes(match[1])) {
            variables.push(match[1]);
          }
        }
      }

      return {
        subject: sanitizeEmailContent(parsed.subject || 'Follow up on our conversation'),
        preheader: sanitizeEmailContent(parsed.preheader || ''),
        htmlContent: sanitizeHtmlEmail(parsed.htmlContent || generateFallbackHtml(parsed)),
        plainTextContent: sanitizeEmailContent(parsed.plainTextContent || ''),
        variables,
      };
    }
  } catch (e) {
    console.error('[Email Template] Parse error:', e);
  }

  // Fallback template
  return generateFallbackTemplate();
}

/**
 * Sanitize email content to remove spam triggers
 */
function sanitizeEmailContent(content: string): string {
  return content
    .replace(/FREE!/gi, 'complimentary')
    .replace(/ACT NOW/gi, 'take action')
    .replace(/LIMITED TIME/gi, 'time-sensitive')
    .replace(/GUARANTEED/gi, 'proven')
    .replace(/!!+/g, '!')
    .replace(/\?\?+/g, '?')
    .replace(/\$\$\$/g, 'savings')
    .trim();
}

/**
 * Sanitize HTML email for deliverability
 */
function sanitizeHtmlEmail(html: string): string {
  // Remove any script tags
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove onclick and other event handlers
  clean = clean.replace(/\s*on\w+="[^"]*"/gi, '');
  
  // Remove external stylesheets
  clean = clean.replace(/<link[^>]*stylesheet[^>]*>/gi, '');
  
  // Ensure proper doctype if not present
  if (!clean.includes('<!DOCTYPE')) {
    clean = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif;">
${clean}
</body>
</html>`;
  }

  return clean;
}

/**
 * Generate fallback HTML from parsed content
 */
function generateFallbackHtml(parsed: any): string {
  const plainText = parsed.plainTextContent || 'Thank you for your interest.';
  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
<tr>
<td style="padding: 20px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
<tr>
<td style="padding: 40px 30px; font-size: 16px; line-height: 1.6; color: #333333;">
${plainText.split('\n').map((p: string) => `<p style="margin: 0 0 16px 0;">${p}</p>`).join('')}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

/**
 * Generate a fallback template when AI fails
 */
function generateFallbackTemplate() {
  return {
    subject: 'Quick question about {{company}}',
    preheader: 'I noticed something interesting about your team',
    htmlContent: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
<tr>
<td style="padding: 20px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center" style="background-color: #ffffff; border-radius: 8px;">
<tr>
<td style="padding: 40px 30px; font-size: 16px; line-height: 1.6; color: #333333;">
<p style="margin: 0 0 16px 0;">Hi {{firstName}},</p>
<p style="margin: 0 0 16px 0;">I've been researching {{company}} and noticed some interesting opportunities that align with what we help similar organizations achieve.</p>
<p style="margin: 0 0 16px 0;">Would you be open to a brief call this week to explore if there's a fit?</p>
<p style="margin: 0 0 16px 0;">Best regards,<br/>{{senderName}}<br/>{{senderTitle}}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`,
    plainTextContent: `Hi {{firstName}},

I've been researching {{company}} and noticed some interesting opportunities that align with what we help similar organizations achieve.

Would you be open to a brief call this week to explore if there's a fit?

Best regards,
{{senderName}}
{{senderTitle}}`,
    variables: ['firstName', 'company', 'senderName', 'senderTitle'],
  };
}

/**
 * Generate email for Preview Studio using DeepSeek AI + branded HTML builder
 * Maps to /api/client-portal/simulation/generate-email
 */
router.post('/generate-email', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const {
      campaignId,
      accountId,
      contactId,
      emailType = 'cold_outreach',
      brandPalette,
    } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    console.log('[Preview Studio] Generating email for campaign:', campaignId, 'client:', clientUser.email);

    // Verify client has access (union approach)
    const hasAccess = await checkClientCampaignAccess(clientUser.clientAccountId, campaignId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this campaign' });
    }

    // ── Intelligence Gate ── Enforce account intelligence + org intelligence + solution mapping
    if (accountId) {
      const gateResult = await enforcePreviewIntelligence({ accountId, campaignId, autoGenerate: true });
      if (!gateResult.passed) {
        console.warn(`[Preview Studio] Intelligence gate BLOCKED email generation for account ${accountId}:`, gateResult.status.missingComponents);
        return res.status(422).json(intelligenceGateErrorResponse(gateResult.status));
      }
    }

    // ── Context Gathering ── Collect all intelligence for the AI
    let accountContext = null;
    let messagingBrief = null;
    let contactContext = null;

    if (accountId) {
      try {
        const aiRecord = await getOrBuildAccountIntelligence(accountId);
        if (aiRecord) {
          accountContext = aiRecord.payloadJson;
        }
        
        const ambRecord = await getOrBuildAccountMessagingBrief({ accountId, campaignId });
        if (ambRecord) {
          messagingBrief = ambRecord.payloadJson;
        }
      } catch (e) {
        console.warn('[Preview Studio] Failed to fetch intelligence context:', e);
      }
    }

    if (contactId) {
       try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
          
        if (contact) {
           contactContext = {
             name: contact.fullName,
             firstName: contact.firstName, // Ensure firstName is available
             title: contact.jobTitle,
             email: contact.email,
             linkedin: contact.linkedinUrl,
             // Add any other relevant contact fields
           };
        }
       } catch (e) {
         console.warn('[Preview Studio] Failed to fetch contact context:', e);
       }
    }

    // Map emailType to variant spec for differentiated output
    const emailTypeToVariant: Record<string, number> = {
      cold_outreach: 1,   // branded
      follow_up: 0,       // plain / direct
      meeting_request: 1, // branded
      nurture: 2,         // newsletter
      breakup: 0,         // plain / direct
    };
    const variantIdx = emailTypeToVariant[emailType] ?? 1;
    const variantSpec = VARIANT_SPECS[variantIdx];

    // Resolve business profile for branded footer
    const [businessProfile] = await db
      .select()
      .from(clientBusinessProfiles)
      .where(eq(clientBusinessProfiles.clientAccountId, clientUser.clientAccountId))
      .limit(1);

    const [clientAccount] = await db
      .select({ name: clientAccounts.name })
      .from(clientAccounts)
      .where(eq(clientAccounts.id, clientUser.clientAccountId))
      .limit(1);

    const companyName =
      businessProfile?.dbaName ||
      businessProfile?.legalBusinessName ||
      clientAccount?.name ||
      '';
      
    const organizationContext = {
      name: companyName,
      website: businessProfile?.website,
      industry: businessProfile?.industry,
      description: businessProfile?.description,
      proposition: businessProfile?.valueProposition
    };

    const companyAddress = (() => {
      if (!businessProfile?.addressLine1 || !businessProfile?.city || !businessProfile?.state || !businessProfile?.postalCode) return undefined;
      const line1 = businessProfile.addressLine1;
      const line2 = businessProfile.addressLine2 ? `, ${businessProfile.addressLine2}` : '';
      const cityStateZip = `${businessProfile.city}, ${businessProfile.state} ${businessProfile.postalCode}`;
      return `${line1}${line2} - ${cityStateZip}`;
    })();

    // Generate AI-powered email content via DeepSeek
    const content = await generateClientEmailContent({
      campaignId,
      clientAccountId: clientUser.clientAccountId,
      emailType: emailType || 'cold_outreach',
      tone: 'professional',
      variantSpec,
      // Inject Enhanced Intelligence
      accountContext,
      messagingBrief,
      contactContext,
      organizationContext
    });

    const palette: BrandPaletteKey = brandPalette || 'indigo';

    // Build styled HTML using the branded email builder
    let html = buildBrandedEmailHtml({
      copy: content,
      brandPalette: palette,
      companyName,
      companyAddress,
      ctaUrl: '{{campaign.landing_page}}',
      includeFooter: true,
    });

    // Get account and contact details to personalise
    let accountName = '';
    let contactName = '';
    let contactTitle = '';

    if (accountId) {
      const [account] = await db
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);
      if (account) accountName = account.name;
    }

    if (contactId) {
      const [contact] = await db
        .select({ fullName: contacts.fullName, jobTitle: contacts.jobTitle })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      if (contact) {
        contactName = contact.fullName || '';
        contactTitle = contact.jobTitle || '';
      }
    }

    // Substitute real values into the HTML
    const firstName = contactName.split(' ')[0] || '';
    if (firstName) html = html.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{firstName\}\}/g, firstName);
    if (contactName) html = html.replace(/\{\{fullName\}\}/g, contactName);
    if (accountName) html = html.replace(/\{\{company\}\}/g, accountName);
    if (contactTitle) html = html.replace(/\{\{jobTitle\}\}/g, contactTitle);

    let subject = content.subject || 'Follow-up';
    if (accountName) subject = subject.replace(/\{\{company\}\}/g, accountName);

    console.log('[Preview Studio] Email generated successfully:', subject);

    // Return in the shape the Preview Studio expects
    res.json({
      subject,
      preheader: content.heroSubtitle || content.intro?.substring(0, 100) || '',
      html,
      variant: variantSpec.label,
      variantStyle: variantSpec.style,
      campaign: { id: campaignId, name: '' },
      rawContent: content,
    });
  } catch (error: any) {
    console.error('[Preview Studio] Generate email error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate email' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phone Test Call — Real Telnyx call for client portal (mirrors admin preview)
// ─────────────────────────────────────────────────────────────────────────────

const clientPhoneTestSchema = z.object({
  campaignId: z.string(),
  accountId: z.string(),
  contactId: z.string().optional(),
  testPhoneNumber: z.string().min(10, 'Phone number must be at least 10 digits'),
  voiceProvider: z.enum(['openai', 'google']).default('google'),
  voice: z.string().optional(),
});

/**
 * Resolve virtual agent ID for a campaign (simplified from admin version).
 */
async function resolveClientVirtualAgentId(campaignId: string): Promise<string | null> {
  const [assignment] = await db
    .select()
    .from(campaignAgentAssignments)
    .where(eq(campaignAgentAssignments.campaignId, campaignId))
    .limit(1);
  return assignment?.virtualAgentId ?? null;
}

const CLIENT_PHONE_TEST_FIRST_MESSAGE =
  "Hello, may I speak with the person in charge of your technology decisions?";

type ClientPostCallResult = {
  finalDisposition: string;
  postCallAnalysis: Record<string, unknown>;
};

function buildTranscriptText(transcripts: Array<{ role: string; content: string | null }>): string {
  return transcripts
    .map((entry) => {
      const roleLabel = entry.role === 'assistant' ? 'Agent' : entry.role === 'user' ? 'Prospect' : 'System';
      return `${roleLabel}: ${entry.content || ''}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

function inferDispositionFromTranscript(transcriptText: string, metadata: Record<string, unknown>): string {
  const lower = transcriptText.toLowerCase();
  const endReason = String(metadata.endReason || '').toLowerCase();

  if (endReason.includes('error') || metadata.error) return 'failed';
  if (lower.includes('voicemail') || lower.includes('after the beep')) return 'voicemail';
  if (lower.includes('do not call') || lower.includes("don't call")) return 'do_not_call';
  if (lower.includes('not interested') || lower.includes('no thanks')) return 'not_interested';
  if (lower.includes('call me back') || lower.includes('callback')) return 'callback_requested';
  if (lower.includes('yes') && lower.includes('meeting')) return 'qualified';
  if (endReason.includes('no_call_control')) return 'no_answer';
  if (!lower.trim()) return 'no_answer';
  return 'needs_review';
}

async function finalizePhoneTestPostCall(sessionId: string): Promise<ClientPostCallResult | null> {
  const [session] = await db
    .select()
    .from(previewStudioSessions)
    .where(eq(previewStudioSessions.id, sessionId))
    .limit(1);

  if (!session) return null;
  if (session.status !== 'completed' && session.status !== 'error') return null;

  const transcripts = await db
    .select()
    .from(previewSimulationTranscripts)
    .where(eq(previewSimulationTranscripts.sessionId, sessionId))
    .orderBy(previewSimulationTranscripts.timestampMs);

  const metadata = ((session.metadata as Record<string, unknown>) || {}) as Record<string, unknown>;
  const transcriptText = buildTranscriptText(transcripts);
  const turnCount = transcripts.length;
  const existingTurnCount = Number(metadata.postCallAnalysisTranscriptCount || 0);

  if (metadata.finalDisposition && metadata.postCallAnalysis && existingTurnCount === turnCount) {
    return {
      finalDisposition: String(metadata.finalDisposition),
      postCallAnalysis: metadata.postCallAnalysis as Record<string, unknown>,
    };
  }

  const finalDisposition = inferDispositionFromTranscript(transcriptText, metadata);

  let conversationQuality: Record<string, unknown> | null = null;
  if (transcriptText.trim().length > 0) {
    try {
      const quality = await analyzeConversationQuality({
        transcript: transcriptText,
        interactionType: 'test_call',
        analysisStage: 'post_call',
        disposition: finalDisposition,
        campaignId: session.campaignId,
      });
      conversationQuality = quality as unknown as Record<string, unknown>;
    } catch (analysisError) {
      console.warn('[Client Phone Test] Post-call quality analysis failed:', analysisError);
    }
  }

  const postCallAnalysis: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    transcriptTurnCount: turnCount,
    transcriptAvailable: transcriptText.trim().length > 0,
    summary:
      transcriptText.trim().length > 0
        ? `Post-call analysis ready (${turnCount} turns captured).`
        : 'Call ended. No transcript captured yet; showing provisional outcome.',
    conversationQuality,
  };

  await db.update(previewStudioSessions)
    .set({
      metadata: {
        ...metadata,
        finalDisposition,
        postCallAnalysis,
        postCallAnalysisTranscriptCount: turnCount,
        postCallReadyAt: new Date().toISOString(),
      },
    })
    .where(eq(previewStudioSessions.id, sessionId));

  return {
    finalDisposition,
    postCallAnalysis,
  };
}

/**
 * POST /phone-test/start
 * Initiate a real phone test call from the client portal.
 */
router.post('/phone-test/start', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const body = clientPhoneTestSchema.parse(req.body);
    const { campaignId, accountId, contactId, testPhoneNumber, voiceProvider, voice: voiceOverride } = body;

    // Access check
    const hasAccess = await checkClientCampaignAccess(clientUser.clientAccountId, campaignId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'No access to this campaign' });
    }

    // Intelligence gate
    const gateResult = await enforcePreviewIntelligence({ accountId, campaignId, autoGenerate: true });
    if (!gateResult.passed) {
      console.warn(`[Client Phone Test] Intelligence gate BLOCKED for account ${accountId}:`, gateResult.status.missingComponents);
      return res.status(422).json(intelligenceGateErrorResponse(gateResult.status));
    }

    // Environment check
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const texmlAppId = process.env.TELNYX_TEXML_APP_ID;

    if (!telnyxApiKey || telnyxApiKey.startsWith('REPLACE_ME')) {
      return res.status(500).json({ error: 'Telnyx not configured' });
    }
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    if (!texmlAppId) {
      return res.status(500).json({ error: 'Telnyx TeXML Application ID not configured' });
    }

    // Get campaign
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get account & contact
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);

    let contact = null;
    if (contactId) {
      const [contactResult] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
      contact = contactResult || null;
    }

    // Normalize phone number
    let normalizedPhone = testPhoneNumber.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+44' + normalizedPhone.substring(1);
      } else {
        normalizedPhone = '+' + normalizedPhone;
      }
    }

    // Get caller ID
    let fromNumber = '';
    let callerNumberId: string | null = null;
    let callerNumberDecisionId: string | null = null;
    try {
      const callerIdResult = await getCallerIdForCall({
        campaignId,
        prospectNumber: normalizedPhone,
        virtualAgentId: virtualAgentId || undefined,
        callType: 'preview_phone_test',
      });
      fromNumber = callerIdResult.callerId;
      callerNumberId = callerIdResult.numberId;
      callerNumberDecisionId = callerIdResult.decisionId;
      if (callerIdResult.jitterDelayMs > 0) {
        await numberPoolSleep(callerIdResult.jitterDelayMs);
      }
    } catch (poolError) {
      console.warn('[Client Phone Test] Number pool selection failed, using fallback:', poolError);
      fromNumber = process.env.TELNYX_FROM_NUMBER || '';
    }

    if (!fromNumber) {
      return res.status(500).json({ error: 'Caller ID not configured' });
    }

    // Create preview call IDs
    const testCallId = `client-preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const runId = `run-client-preview-${Date.now()}`;

    // Build unified context (same setup contract as campaign AI test calls)
    const unifiedContext = await buildUnifiedCallContext({
      campaignId,
      callId: testCallId,
      runId,
      queueItemId: `preview-queue-${testCallId}`,
      callAttemptId: `preview-attempt-${testCallId}`,
      contactId: contactId || `preview-contact-${testCallId}`,
      calledNumber: normalizedPhone,
      fromNumber,
      callerNumberId,
      callerNumberDecisionId,
      contactName: (contact as any)?.fullName || account?.name || 'Preview Contact',
      contactFirstName: (contact as any)?.firstName || (contact as any)?.fullName?.split(' ')[0] || 'Preview',
      contactLastName: (contact as any)?.lastName || (contact as any)?.fullName?.split(' ').slice(1).join(' ') || '',
      contactJobTitle: (contact as any)?.jobTitle || 'Contact',
      contactEmail: (contact as any)?.email || '',
      accountName: account?.name || 'Preview Company',
      isTestCall: true,
      provider: voiceProvider === 'google' ? 'google' : 'openai',
    });

    if (!unifiedContext) {
      return res.status(400).json({
        error: 'No AI agent configured for this campaign',
        suggestion: 'Please configure AI voice settings in the campaign wizard, or ask your admin to assign a virtual agent before testing',
      });
    }

    // Prepare voice selection
    let voice = unifiedContext.voice || 'Puck';
    if (voiceProvider === 'google') {
      voice = (voiceOverride || unifiedContext.voice || 'Puck').toString().trim();
    } else {
      const supportedVoices = new Set(['alloy', 'ash', 'coral', 'marin', 'verse', 'cedar']);
      const rawVoice = (voiceOverride || unifiedContext.voice || '').toString().trim().toLowerCase();
      voice = supportedVoices.has(rawVoice) ? rawVoice : 'marin';
    }

    const providerForClientState = voiceProvider === 'google' ? 'google' : 'openai_realtime';
    const providerForSession = voiceProvider === 'google' ? 'google' : 'openai';

    unifiedContext.voice = voice;
    unifiedContext.provider = providerForSession;
    unifiedContext.firstMessage = unifiedContext.firstMessage || CLIENT_PHONE_TEST_FIRST_MESSAGE;

    // Create preview session

    const [session] = await db.insert(previewStudioSessions).values({
      campaignId,
      accountId,
      contactId: contactId || null,
      userId: clientUser.id || clientUser.clientAccountId,
      virtualAgentId: unifiedContext.virtualAgentId,
      sessionType: 'simulation',
      status: 'active',
      metadata: {
        type: 'phone_test',
        source: 'client_portal',
        testCallId,
        testPhoneNumber: normalizedPhone,
        voiceProvider,
        startedAt: new Date().toISOString(),
        accountName: account?.name || null,
        contactName: (contact as any)?.fullName || null,
      },
    }).returning();

    // Custom parameters for WebSocket
    const customParams = {
      ...contextToClientStateParams(unifiedContext),
      is_preview_test: true,
      preview_session_id: session.id,
      provider: providerForClientState,
    };

    // Store session in Redis
    const { callSessionStore } = await import('../services/call-session-store');
    await callSessionStore.setSession(testCallId, {
      call_id: unifiedContext.callId,
      run_id: unifiedContext.runId,
      campaign_id: unifiedContext.campaignId,
      queue_item_id: unifiedContext.queueItemId,
      call_attempt_id: unifiedContext.callAttemptId,
      contact_id: unifiedContext.contactId,
      called_number: unifiedContext.calledNumber,
      from_number: unifiedContext.fromNumber,
      caller_number_id: unifiedContext.callerNumberId,
      caller_number_decision_id: unifiedContext.callerNumberDecisionId,
      virtual_agent_id: unifiedContext.virtualAgentId || undefined,
      is_test_call: true,
      is_preview_test: true,
      test_call_id: unifiedContext.testCallId || testCallId,
      preview_session_id: session.id,
      first_message: unifiedContext.firstMessage || undefined,
      voice: unifiedContext.voice,
      agent_name: unifiedContext.agentName,
      organization_name: unifiedContext.organizationName,
      provider: unifiedContext.provider,
      system_prompt: unifiedContext.systemPrompt || undefined,
      test_contact: {
        name: unifiedContext.contactName,
        company: unifiedContext.accountName,
        title: unifiedContext.contactJobTitle,
        email: unifiedContext.contactEmail || undefined,
      },
      campaign_objective: unifiedContext.campaignObjective,
      success_criteria: unifiedContext.successCriteria,
      target_audience_description: unifiedContext.targetAudienceDescription,
      product_service_info: unifiedContext.productServiceInfo,
      talking_points: unifiedContext.talkingPoints,
      max_call_duration_seconds: unifiedContext.maxCallDurationSeconds,
    });

    const clientStateB64 = Buffer.from(JSON.stringify(customParams)).toString('base64');

    // Webhook URL
    let webhookHost = process.env.PUBLIC_TEXML_HOST || process.env.PUBLIC_WEBHOOK_HOST || req.get('X-Public-Host') || req.get('host') || '';
    if (!webhookHost && process.env.TELNYX_WEBHOOK_URL) {
      try {
        const u = new URL((process.env.TELNYX_WEBHOOK_URL || '').trim());
        webhookHost = u.host;
      } catch {}
    }
    webhookHost = webhookHost || 'localhost:5000';
    const webhookProtocol = webhookHost.includes('localhost') ? 'http' : 'https';
    const texmlUrl = `${webhookProtocol}://${webhookHost}/api/texml/ai-call?client_state=${encodeURIComponent(clientStateB64)}`;

    console.log('[Client Phone Test] Initiating Telnyx call to:', normalizedPhone);

    // Make Telnyx call
    const telnyxEndpoint = `https://api.telnyx.com/v2/texml/calls/${texmlAppId}`;
    const telnyxResponse = await fetch(telnyxEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${telnyxApiKey}`,
      },
      body: JSON.stringify({
        To: normalizedPhone,
        From: fromNumber,
        Url: texmlUrl,
        StatusCallback: (process.env.TELNYX_WEBHOOK_URL || '').trim() || `https://${webhookHost}/api/webhooks/telnyx`,
      }),
    });

    if (!telnyxResponse.ok) {
      releaseNumberWithoutOutcome(callerNumberId);
      const errorText = await telnyxResponse.text();
      console.error('[Client Phone Test] Telnyx API error:', errorText);

      let friendlyMessage = 'Telnyx API error';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errors?.[0]) {
          friendlyMessage = errorJson.errors[0].detail || errorJson.errors[0].title || friendlyMessage;
        }
      } catch (e) {}

      await db.update(previewStudioSessions)
        .set({
          status: 'error',
          endedAt: new Date(),
          metadata: { ...(session.metadata as Record<string, unknown> || {}), error: friendlyMessage },
        })
        .where(eq(previewStudioSessions.id, session.id));

      return res.status(400).json({ error: friendlyMessage });
    }

    const telnyxResult = await telnyxResponse.json();
    const callControlId = telnyxResult.data?.call_control_id;

    // Update session with call control ID
    await db.update(previewStudioSessions)
      .set({
        metadata: { ...(session.metadata as Record<string, unknown> || {}), callControlId },
      })
      .where(eq(previewStudioSessions.id, session.id));

    console.log(`[Client Phone Test] Call initiated successfully: ${callControlId}`);

    res.json({
      success: true,
      message: 'Phone test initiated. Your phone will ring shortly.',
      sessionId: session.id,
      testCallId,
      callControlId,
      phoneNumber: normalizedPhone,
      campaignName: campaign.name,
      voiceProvider,
    });
  } catch (error: any) {
    console.error('[Client Phone Test] Error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', errors: error.errors });
    }
    res.status(500).json({ error: 'Failed to initiate phone test' });
  }
});

/**
 * GET /phone-test/:sessionId
 * Get phone test session status
 */
router.get('/phone-test/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const [session] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get transcripts if available
    const transcripts = await db
      .select()
      .from(previewSimulationTranscripts)
      .where(eq(previewSimulationTranscripts.sessionId, sessionId))
      .orderBy(previewSimulationTranscripts.timestampMs);

    const postCall = await finalizePhoneTestPostCall(sessionId);

    const [latestSession] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    res.json({
      session: latestSession || session,
      transcripts,
      finalDisposition: postCall?.finalDisposition || (latestSession?.metadata as any)?.finalDisposition || null,
      postCallAnalysis: postCall?.postCallAnalysis || (latestSession?.metadata as any)?.postCallAnalysis || null,
    });
  } catch (error) {
    console.error('[Client Phone Test] Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch phone test session' });
  }
});

/**
 * POST /phone-test/:sessionId/hangup
 * End an active phone test call
 */
router.post('/phone-test/:sessionId/hangup', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const [session] = await db
      .select()
      .from(previewStudioSessions)
      .where(eq(previewStudioSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const metadata = session.metadata as any;
    const callControlId = metadata?.callControlId;

    if (!callControlId) {
      await db.update(previewStudioSessions)
        .set({
          status: 'completed',
          endedAt: new Date(),
          metadata: { ...metadata, endReason: 'user_hangup_no_call_control' },
        })
        .where(eq(previewStudioSessions.id, sessionId));

      return res.json({ success: true, message: 'Session ended (no active call)' });
    }

    // Hang up via Telnyx
    const telnyxApiKey = process.env.TELNYX_API_KEY;
    if (!telnyxApiKey) {
      return res.status(500).json({ error: 'Telnyx API key not configured' });
    }

    console.log(`[Client Phone Test] Hanging up call: ${callControlId}`);

    try {
      const hangupResponse = await fetch(
        `https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${telnyxApiKey}`,
          },
          body: JSON.stringify({}),
        }
      );
      if (!hangupResponse.ok) {
        const errorText = await hangupResponse.text();
        console.error(`[Client Phone Test] Telnyx hangup error: ${hangupResponse.status} - ${errorText}`);
      } else {
        console.log(`[Client Phone Test] Telnyx hangup successful for ${callControlId}`);
      }
    } catch (telnyxError) {
      console.error('[Client Phone Test] Telnyx hangup request failed:', telnyxError);
    }

    await db.update(previewStudioSessions)
      .set({
        status: 'completed',
        endedAt: new Date(),
        metadata: { ...metadata, endReason: 'user_hangup' },
      })
      .where(eq(previewStudioSessions.id, sessionId));

    const postCall = await finalizePhoneTestPostCall(sessionId);

    res.json({
      success: true,
      message: 'Call ended successfully',
      finalDisposition: postCall?.finalDisposition || null,
      postCallAnalysis: postCall?.postCallAnalysis || null,
    });
  } catch (error) {
    console.error('[Client Phone Test] Hangup error:', error);
    res.status(500).json({ error: 'Failed to hang up call' });
  }
});

export default router;
