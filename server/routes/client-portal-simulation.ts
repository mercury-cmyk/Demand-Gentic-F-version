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
} from '@shared/schema';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

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

// In-memory session store
interface SimulationSession {
  id: string;
  campaignId: string;
  campaignName: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  createdAt: Date;
  mockContact?: MockContact;
}

const simulationSessions = new Map<string, SimulationSession>();

// Sample mock contact data pools for realistic simulations
const MOCK_FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Cameron', 'Avery', 'Drew'];
const MOCK_LAST_NAMES = ['Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Anderson', 'Thompson', 'Martinez', 'Garcia'];
const MOCK_JOB_TITLES = [
  'VP of Marketing',
  'Director of Business Development',
  'Chief Revenue Officer',
  'Senior Director of Sales',
  'Head of Demand Generation',
  'VP of Sales Operations',
  'Director of Growth',
  'Chief Marketing Officer',
  'VP of Partnerships',
  'Head of Sales Enablement'
];
const MOCK_COMPANY_SUFFIXES = ['Technologies', 'Solutions', 'Group', 'Inc.', 'Corporation', 'Partners', 'Enterprises'];

/**
 * Generate mock contact data for simulation
 */
function generateMockContact(campaignName: string): MockContact {
  const firstName = MOCK_FIRST_NAMES[Math.floor(Math.random() * MOCK_FIRST_NAMES.length)];
  const lastName = MOCK_LAST_NAMES[Math.floor(Math.random() * MOCK_LAST_NAMES.length)];
  const jobTitle = MOCK_JOB_TITLES[Math.floor(Math.random() * MOCK_JOB_TITLES.length)];
  
  // Generate a realistic account name based on campaign or random suffix
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
 * Start a new simulation session
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const clientUser = (req as any).clientUser;
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Verify client has access to this campaign
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientUser.clientAccountId),
          or(
            eq(clientCampaignAccess.regularCampaignId, campaignId),
            eq(clientCampaignAccess.campaignId, campaignId)
          )
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ error: 'No access to this campaign' });
    }

    // Get campaign details
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // REMOVED: Strict check for 'published' status and clientAccountId ownership.
    // Access is already verified via clientCampaignAccess above.
    
    // Try to get virtual agent if assigned
    let agentPersona = '';
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
        
        if (agent?.systemPrompt) {
          agentPersona = agent.systemPrompt;
        }
      }
    } catch (e) {
      console.log('[Simulation] No virtual agent assignment found');
    }

    // Generate mock contact for this simulation
    const mockContact = generateMockContact(campaign.name);
    
    // Build simulation system prompt with mock contact context
    const systemPrompt = buildSimulationPrompt(campaign, agentPersona, mockContact);
    
    // Generate first message based on campaign with mock contact data
    const firstMessage = generateFirstMessage(campaign, mockContact);

    // Create session
    const sessionId = uuidv4();
    const session: SimulationSession = {
      id: sessionId,
      campaignId,
      campaignName: campaign.name,
      systemPrompt,
      messages: [{ role: 'assistant', content: firstMessage }],
      createdAt: new Date(),
      mockContact,
    };

    simulationSessions.set(sessionId, session);

    res.json({
      sessionId,
      firstMessage,
      context: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        // Include mock contact data for display
        accountName: mockContact.accountName,
        contactName: mockContact.fullName,
        contactTitle: mockContact.jobTitle,
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
      // Verify access
      const [access] = await db
        .select()
        .from(clientCampaignAccess)
        .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientUser.clientAccountId),
          or(
            eq(clientCampaignAccess.regularCampaignId, campaignId),
            eq(clientCampaignAccess.campaignId, campaignId)
          )
        )
        )
        .limit(1);

      if (!access) {
        return res.status(403).json({ error: 'No access to this campaign' });
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Generate mock contact for on-the-fly session
      const mockContact = generateMockContact(campaign.name);

      const newSessionId = uuidv4();
      session = {
        id: newSessionId,
        campaignId,
        campaignName: campaign.name,
        systemPrompt: buildSimulationPrompt(campaign, '', mockContact),
        messages: [],
        createdAt: new Date(),
        mockContact,
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
function generateFirstMessage(campaign: any, mockContact: MockContact): string {
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
function buildSimulationPrompt(campaign: any, agentPersona: string, mockContact?: MockContact): string {
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

    // Verify client has access
    const [access] = await db
      .select()
      .from(clientCampaignAccess)
      .where(
        and(
          eq(clientCampaignAccess.clientAccountId, clientUser.clientAccountId),
          or(
            eq(clientCampaignAccess.regularCampaignId, campaignId),
            eq(clientCampaignAccess.campaignId, campaignId)
          )
        )
      )
      .limit(1);

    if (!access) {
      return res.status(403).json({ error: 'No access to this campaign' });
    }

    // Get campaign details
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

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

export default router;
