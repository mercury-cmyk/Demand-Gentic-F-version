/**
 * Client Portal Agentic Operator (Vertex AI Powered)
 *
 * This module provides an AI-powered agent that can perform actions
 * on behalf of clients within the client portal.
 *
 * Powered by Google Cloud Vertex AI (Gemini) for enterprise-grade AI.
 *
 * Allowed Actions:
 * - View campaigns and their stats
 * - Create/submit orders
 * - View order history and status
 * - View billing and invoices
 * - View reports and analytics
 * - Request new campaigns
 * - Submit support tickets
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  clientAccounts, clientUsers, clientCampaignAccess, clientPortalOrders,
  campaigns, clientInvoices, clientBillingConfig, clientActivityCosts
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, sum } from 'drizzle-orm';
import {
  generateWithFunctions,
  chat as vertexChat,
  type FunctionDeclaration,
  type ChatMessage as VertexChatMessage
} from '../services/vertex-ai';

const router = Router();

// Define the allowed actions and their schemas for Vertex AI function calling
const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  // Navigation actions
  {
    name: 'navigate',
    description: 'Navigate to a specific section of the dashboard',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'The section to navigate to',
          enum: ['dashboard', 'campaigns', 'leads', 'reports', 'billing', 'support']
        }
      },
      required: ['section']
    }
  },

  // Campaign actions
  {
    name: 'list_campaigns',
    description: 'List all campaigns the client has access to with their stats',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_campaign_details',
    description: 'Get detailed information about a specific campaign including eligible, verified, and delivered counts',
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'The unique identifier of the campaign'
        }
      },
      required: ['campaignId']
    }
  },

  // Order actions
  {
    name: 'create_order',
    description: 'Create a new order to request leads from a campaign. Use this when the user wants to order contacts or leads.',
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'The campaign ID to order from'
        },
        quantity: {
          type: 'string',
          description: 'Number of leads to request (as a string number)'
        },
        notes: {
          type: 'string',
          description: 'Optional notes or special requirements for the order'
        }
      },
      required: ['campaignId', 'quantity']
    }
  },
  {
    name: 'list_orders',
    description: 'List all orders with optional status filter. Shows order history.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by order status',
          enum: ['all', 'pending', 'approved', 'completed']
        }
      },
      required: []
    }
  },
  {
    name: 'get_order_status',
    description: 'Get the detailed status of a specific order by order number',
    parameters: {
      type: 'object',
      properties: {
        orderNumber: {
          type: 'string',
          description: 'The order number (e.g., ORD-202601-ABC123)'
        }
      },
      required: ['orderNumber']
    }
  },

  // Billing actions
  {
    name: 'get_billing_summary',
    description: 'Get billing summary including total spent, outstanding balance, billing model, and recent invoices',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'list_invoices',
    description: 'List all invoices with optional status filter',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter invoices by status',
          enum: ['all', 'draft', 'sent', 'paid', 'overdue']
        }
      },
      required: []
    }
  },

  // Report actions
  {
    name: 'get_analytics_summary',
    description: 'Get analytics summary including total leads delivered, fulfillment rates, and order statistics for a time period',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Time period for analytics',
          enum: ['7d', '30d', '90d', '1y']
        }
      },
      required: []
    }
  },

  // Support actions
  {
    name: 'request_campaign',
    description: 'Submit a request for a new campaign with target audience and volume requirements',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new campaign'
        },
        targetAudience: {
          type: 'string',
          description: 'Description of the target audience (job titles, industries, company size, geography)'
        },
        estimatedVolume: {
          type: 'string',
          description: 'Estimated number of leads needed (as a string number)'
        },
        timeline: {
          type: 'string',
          description: 'Desired timeline for campaign setup',
          enum: ['asap', '1week', '2weeks', '1month']
        }
      },
      required: ['name', 'targetAudience']
    }
  },
  {
    name: 'submit_support_ticket',
    description: 'Submit a support request or help ticket',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Subject line of the support request'
        },
        category: {
          type: 'string',
          description: 'Category of the issue',
          enum: ['billing', 'delivery', 'quality', 'technical', 'other']
        },
        description: {
          type: 'string',
          description: 'Detailed description of the issue or request'
        }
      },
      required: ['subject', 'description']
    }
  },
  // New Capabilities
  {
    name: 'request_new_campaign',
    description: "Request a new campaign setup across various service types (Event, Webinar, Content Syndication, etc.)",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Proposed name of the campaign" },
        type: { 
          type: 'string', 
          enum: [
            'event_promotion', 
            'webinar_registration', 
            'executive_dinner', 
            'content_syndication', 
            'lead_qualification', 
            'mql', 
            'sql', 
            'appointment_generation', 
            'data_validation'
          ],
          description: "Type of service requested"
        },
        objectives: { type: 'string', description: "Primary goal (e.g., 50 attendees, 1000 leads)" },
        targetAudience: { type: 'string', description: "Description of the target audience (e.g., CTOs in UK)" },
        budget: { type: 'string', description: "Estimated budget or CPL expectation" }
      },
      required: ['name', 'type', 'targetAudience']
    }
  },
  {
    name: 'generate_email_template',
    description: "Generate a campaign-specific email template based on the campaign context",
    parameters: {
      type: 'object',
      properties: {
        campaignType: { type: 'string', description: "Type of campaign (e.g., Webinar, Outreach)" },
        audience: { type: 'string', description: "Target audience description" },
        valueProposition: { type: 'string', description: "Key selling points or offer" },
        tone: { type: 'string', description: "Tone of voice (Professional, Urgent, Friendly)" }
      },
      required: ['campaignType', 'audience']
    }
  },
  {
    name: 'run_campaign_simulation',
    description: "Run a simulation to estimate campaign performance (leads, cost, timeframe)",
    parameters: {
      type: 'object',
      properties: {
        audienceSize: { type: 'number', description: "Size of the target pool" },
        campaignType: { type: 'string', description: "Type of campaign" },
        budget: { type: 'number', description: "Total budget available" }
      },
      required: ['audienceSize', 'campaignType']
    }
  }
];

// System prompt for the agent
const SYSTEM_PROMPT = `You are an AI assistant for the Client Portal of Pivotal B2B, a B2B lead generation company.

You ONLY help the signed-in client with:
- Viewing and managing THEIR OWN campaigns
- Creating and managing orders for THEIR OWN verified leads
- Checking order status and delivery progress for THEIR OWN account
- Viewing billing information and invoices for THEIR OWN account
- Accessing reports and analytics for THEIR OWN campaigns and orders
- Requesting new campaigns for THEIR OWN account
- Submitting support requests related to THEIR OWN account and campaigns

Strict scope & privacy rules (NON-NEGOTIABLE):
1. Never reveal information about other clients, other campaigns, or internal systems.
2. Never answer questions about general world knowledge, AI models, or anything unrelated to this client's campaigns, orders, billing, or portal usage.
3. If the user asks about anything outside their own campaigns or portal (e.g., "how do LLMs work?", "what is your architecture?"), politely decline and redirect them back to their campaigns and portal.
4. Use ONLY the data returned from the allowed functions and the client's own portal context.

## Action Classification & Execution Policy

**IMMEDIATE ACTIONS (execute directly, no confirmation needed):**
These are read-only or low-risk actions. Execute them immediately and return results:
- list_campaigns — viewing available campaigns
- get_campaign_details — viewing campaign information
- list_orders — viewing order history
- get_order_status — checking order status
- get_billing_summary — viewing billing information
- get_analytics — viewing reports and metrics
- navigate — navigating to portal sections
- run_simulation — running performance estimates

**CONFIRMATION-REQUIRED ACTIONS (must confirm before executing):**
These actions create, modify, or commit resources. Present a brief summary and ask for confirmation:
- create_order — committing to purchase leads (confirm quantity, campaign, and cost)
- request_new_campaign — requesting a new campaign setup
- submit_support_request — creating support tickets

## Workflow Guidelines

1. **For IMMEDIATE actions**: When the user asks to view, list, check, or get information, call the appropriate function immediately and return the results. Do NOT ask for confirmation.

2. **For CONFIRMATION-REQUIRED actions**: 
   - Gather all necessary information from the user first (e.g., campaign name, type, quantity)
   - If information is missing, ask for it directly in a single question
   - Once you have all required details, briefly summarize what you will do (1-2 sentences max) and ask: "Should I proceed?"
   - On confirmation ("yes", "confirm", "go ahead", "proceed"), execute immediately
   - On decline, ask what they'd like to change

3. **Be concise**: Don't over-explain. Don't show multi-step numbered plans for simple requests. Just act or ask what's needed.

4. **Gather info efficiently**: If creating a campaign or order and missing details, ask for ALL missing fields in one question, not one at a time.

Additional guidelines:
- Be helpful, professional, and concise
- When showing data, format it clearly and highlight important information
- If an action fails, explain why and suggest alternatives
- Extract quantities when mentioned (e.g., "500 leads" → quantity: 500)

You have access to the client's account data. Execute read-only actions immediately. Only pause for confirmation on actions that create, modify, or commit resources.`;

// Action handlers
async function executeAction(
  action: string,
  params: Record,
  clientAccountId: string,
  clientUserId: string
): Promise {

  console.log(`[Client Portal Agent] Executing action: ${action}`, params);

  switch (action) {
    case 'navigate':
      return {
        success: true,
        message: `Navigating to ${params.section}`,
        navigateTo: params.section
      };

    case 'list_campaigns': {
      const accessRecords = await db.query.clientCampaignAccess.findMany({
        where: eq(clientCampaignAccess.clientAccountId, clientAccountId),
        with: { campaign: true }
      });

      const campaignList = accessRecords.map(a => ({
        id: a.campaign?.id,
        name: a.campaign?.name,
        status: a.campaign?.status,
        eligibleCount: (a.campaign?.stats as any)?.eligibleCount || 0
      }));

      return {
        success: true,
        data: campaignList,
        message: `Found ${campaignList.length} campaigns you have access to.`
      };
    }

    case 'get_campaign_details': {
      const access = await db.query.clientCampaignAccess.findFirst({
        where: and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(clientCampaignAccess.campaignId, params.campaignId)
        ),
        with: { campaign: true }
      });

      if (!access?.campaign) {
        return { success: false, message: 'Campaign not found or you do not have access to it.' };
      }

      const stats = access.campaign.stats as any;
      return {
        success: true,
        data: {
          id: access.campaign.id,
          name: access.campaign.name,
          status: access.campaign.status,
          eligibleCount: stats?.eligibleCount || 0,
          verifiedCount: stats?.verifiedCount || 0,
          deliveredCount: stats?.deliveredCount || 0
        },
        message: `Campaign: ${access.campaign.name}`
      };
    }

    case 'create_order': {
      // Verify campaign access
      const access = await db.query.clientCampaignAccess.findFirst({
        where: and(
          eq(clientCampaignAccess.clientAccountId, clientAccountId),
          eq(clientCampaignAccess.campaignId, params.campaignId)
        ),
        with: { campaign: true }
      });

      if (!access?.campaign) {
        return { success: false, message: 'Campaign not found or you do not have access.' };
      }

      const quantity = parseInt(params.quantity);
      if (isNaN(quantity) || quantity  {
          if (params.status === 'pending') return o.status === 'submitted' || o.status === 'approved';
          return o.status === params.status;
        });
      }

      return {
        success: true,
        data: filtered.slice(0, 10),
        message: `Found ${filtered.length} orders${params.status && params.status !== 'all' ? ` with status: ${params.status}` : ''}.`
      };
    }

    case 'get_order_status': {
      const order = await db.query.clientPortalOrders.findFirst({
        where: and(
          eq(clientPortalOrders.clientAccountId, clientAccountId),
          eq(clientPortalOrders.orderNumber, params.orderNumber)
        )
      });

      if (!order) {
        return { success: false, message: `Order ${params.orderNumber} not found.` };
      }

      return {
        success: true,
        data: order,
        message: `Order ${order.orderNumber}: Status is "${order.status}". Requested: ${order.requestedQuantity.toLocaleString()}, Delivered: ${order.deliveredQuantity.toLocaleString()}.`
      };
    }

    case 'get_billing_summary': {
      const billingConfig = await db.query.clientBillingConfig.findFirst({
        where: eq(clientBillingConfig.clientAccountId, clientAccountId)
      });

      const invoiceList = await db.select().from(clientInvoices)
        .where(eq(clientInvoices.clientAccountId, clientAccountId))
        .orderBy(desc(clientInvoices.createdAt))
        .limit(5);

      const totalSpent = invoiceList.reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0);
      const outstanding = invoiceList
        .filter(inv => inv.status !== 'paid')
        .reduce((sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.amountPaid || 0)), 0);

      return {
        success: true,
        data: {
          totalSpent,
          outstanding,
          invoiceCount: invoiceList.length,
          billingModel: billingConfig?.billingModel || 'cpl',
          recentInvoices: invoiceList.slice(0, 3)
        },
        message: `Total spent: $${totalSpent.toFixed(2)}. Outstanding balance: $${outstanding.toFixed(2)}. ${invoiceList.length} invoices on record.`
      };
    }

    case 'list_invoices': {
      let invoiceList = await db.select().from(clientInvoices)
        .where(eq(clientInvoices.clientAccountId, clientAccountId))
        .orderBy(desc(clientInvoices.createdAt));

      if (params.status && params.status !== 'all') {
        invoiceList = invoiceList.filter(inv => inv.status === params.status);
      }

      return {
        success: true,
        data: invoiceList.slice(0, 10),
        message: `Found ${invoiceList.length} invoices${params.status && params.status !== 'all' ? ` with status: ${params.status}` : ''}.`
      };
    }

    case 'get_analytics_summary': {
      const periodDays = params.period === '7d' ? 7 : params.period === '30d' ? 30 : params.period === '90d' ? 90 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const orders = await db.select().from(clientPortalOrders)
        .where(and(
          eq(clientPortalOrders.clientAccountId, clientAccountId),
          gte(clientPortalOrders.createdAt, startDate)
        ));

      const totalLeads = orders.reduce((sum, o) => sum + (o.deliveredQuantity || 0), 0);
      const totalRequested = orders.reduce((sum, o) => sum + (o.requestedQuantity || 0), 0);
      const completedOrders = orders.filter(o => o.status === 'completed').length;

      return {
        success: true,
        data: {
          period: params.period || '30d',
          totalLeadsDelivered: totalLeads,
          totalLeadsRequested: totalRequested,
          fulfillmentRate: totalRequested > 0 ? ((totalLeads / totalRequested) * 100).toFixed(1) + '%' : 'N/A',
          ordersPlaced: orders.length,
          ordersCompleted: completedOrders
        },
        message: `In the last ${params.period || '30d'}: ${totalLeads.toLocaleString()} leads delivered from ${orders.length} orders. Fulfillment rate: ${totalRequested > 0 ? ((totalLeads / totalRequested) * 100).toFixed(1) : 0}%.`
      };
    }

    case 'request_campaign':
    case 'request_new_campaign': {
      return {
        success: true,
        data: {
          requestId: `REQ-${Date.now()}`,
          name: params.name,
          type: params.type || 'Combined',
          targetAudience: params.targetAudience,
          objectives: params.objectives || 'Not specified',
          budget: params.budget || 'Open',
          status: 'submitted'
        },
        message: `Campaign request for "${params.name}" (${params.type}) has been submitted! Our team will review the objectives (${params.objectives}) and target audience. We'll be in touch shortly to finalize.`
      };
    }

    case 'generate_email_template': {
      // Mock generation - normally would call LLM again or use a template service
      // We'll return a helpful message inviting them to use the detailed response which will be generated by the follow-up prompt
      return {
        success: true,
        data: {
          templateType: params.campaignType,
          tone: params.tone || 'Professional',
          status: 'generated'
        },
        message: `I have generated a draft email template for your ${params.campaignType} campaign targeting ${params.audience}. Please see below.`
      };
    }

    case 'run_campaign_simulation': {
      // Mock simulation logic
      const audienceSize = Number(params.audienceSize) || 10000;
      const budget = Number(params.budget) || 5000;
      
      const estimatedCPL = params.campaignType?.toLowerCase().includes('exec') ? 150 : 45;
      const estimatedLeads = Math.floor(budget / estimatedCPL);
      const conversionRate = params.campaignType?.toLowerCase().includes('webinar') ? '2.5%' : '1.2%';
      const timeframeWeeks = Math.ceil(estimatedLeads / 50); // Assume 50 leads/week capacity

      return {
        success: true,
        data: {
          estimatedLeads,
          estimatedCPL,
          conversionRate,
          timeframe: `${timeframeWeeks} weeks`,
          totalCost: estimatedLeads * estimatedCPL
        },
        message: `Simulation Complete: With a budget of $${budget}, we estimate ~${estimatedLeads} leads at $${estimatedCPL}/lead. Expected conversion rate around ${conversionRate}.`
      };
    }

    case 'submit_support_ticket': {
      const ticketId = `TKT-${Date.now()}`;
      return {
        success: true,
        data: {
          ticketId,
          subject: params.subject,
          category: params.category || 'other',
          status: 'open'
        },
        message: `Support ticket created: "${params.subject}". Our team will respond within 24 hours. Ticket ID: ${ticketId}`
      };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

// Main agent endpoint using Vertex AI by default, or DeepSeek when configured
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const user = (req as any).clientUser;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`[Client Portal Agent] Processing message from user ${user.clientUserId}: ${message}`);

    const history = (conversationHistory || []) as VertexChatMessage[];
    const normalized = message.trim().toLowerCase();

    // Helper to find the last user + assistant turns for context
    const lastAssistant = [...history].reverse().find((m) => m.role === 'model');
    const lastUser = [...history].reverse().find((m) => m.role === 'user');

    // Actions that can be executed immediately without confirmation
    const IMMEDIATE_ACTIONS = new Set([
      'list_campaigns',
      'get_campaign_details', 
      'list_orders',
      'get_order_status',
      'get_billing_summary',
      'get_analytics',
      'navigate',
      'run_simulation'
    ]);

    // Actions that require explicit confirmation before execution
    const CONFIRMATION_REQUIRED_ACTIONS = new Set([
      'create_order',
      'request_new_campaign',
      'submit_support_request'
    ]);

    // Check if this is a confirmation of a pending action
    const isConfirm = (
      /\b(confirm|confirmed|yes|proceed|go ahead|do it|sure|ok|okay)\b/.test(normalized)
    ) && !!lastAssistant && lastAssistant.content.includes('Should I proceed');

    const isDecline =
      /\b(decline|cancel|no|don\'t|change|wait|hold on|stop)\b/.test(normalized) && 
      !!lastAssistant && lastAssistant.content.includes('Should I proceed');

    // ==================== EXECUTE ON CONFIRMATION ====================
    if (isConfirm) {
      const originalRequest = lastUser?.content || 'previous request';
      const previousPlan = lastAssistant?.content || '';

      const confirmInstruction = `The client confirmed they want to proceed with the action you proposed.\n\nOriginal request: "${originalRequest}"\nYour proposal: "${previousPlan}"\nClient's confirmation: "${message}"\n\nNow execute the action using the appropriate function. After execution, provide a brief confirmation of what was done.`;

      const { text: initialResponse, functionCalls } = await generateWithFunctions(
        SYSTEM_PROMPT,
        confirmInstruction,
        FUNCTION_DECLARATIONS,
        { temperature: 0.3, maxTokens: 2000 }
      );

      let actions: Array = [];
      let navigateTo: string | undefined;

      if (functionCalls && functionCalls.length > 0) {
        console.log(`[Client Portal Agent] Executing confirmed actions:`, functionCalls.map(f => f.name));

        for (const funcCall of functionCalls) {
          const result = await executeAction(
            funcCall.name,
            funcCall.args,
            user.clientAccountId,
            user.clientUserId
          );

          actions.push({ action: funcCall.name, params: funcCall.args, result });

          if (result.navigateTo) {
            navigateTo = result.navigateTo;
          }
        }

        const actionResultsText = actions
          .map((a) =>
            `Action: ${a.action}\nResult: ${a.result.success ? 'Success' : 'Failed'}\nMessage: ${a.result.message}${a.result.data ? `\nData: ${JSON.stringify(a.result.data, null, 2)}` : ''}`
          )
          .join('\n\n');

        const followUpPrompt = `You executed these actions for the client:\n${actionResultsText}\n\nProvide a brief, friendly confirmation of what was done. Be concise (1-2 sentences).`;

        const followUpResponse = await vertexChat(
          SYSTEM_PROMPT,
          [{ role: 'user', content: followUpPrompt }],
          { temperature: 0.7, maxTokens: 500 }
        );

        const newHistory: VertexChatMessage[] = [
          ...history.slice(-18),
          { role: 'user' as const, content: message },
          { role: 'model' as const, content: followUpResponse },
        ];

        return res.json({
          response: followUpResponse,
          actions,
          navigateTo,
          conversationHistory: newHistory,
        });
      }

      const newHistory: VertexChatMessage[] = [
        ...history.slice(-18),
        { role: 'user' as const, content: message },
        { role: 'model' as const, content: initialResponse },
      ];

      return res.json({
        response: initialResponse,
        actions: [],
        navigateTo: undefined,
        conversationHistory: newHistory,
      });
    }

    // ==================== DECLINE - ASK WHAT TO CHANGE ====================
    if (isDecline) {
      const declineResponse = "No problem! What would you like to change or do instead?";

      const newHistory: VertexChatMessage[] = [
        ...history.slice(-18),
        { role: 'user' as const, content: message },
        { role: 'model' as const, content: declineResponse },
      ];

      return res.json({
        response: declineResponse,
        actions: [],
        navigateTo: undefined,
        conversationHistory: newHistory,
      });
    }

    // ==================== PROCESS NEW REQUEST ====================
    const { text: initialResponse, functionCalls } = await generateWithFunctions(
      SYSTEM_PROMPT,
      message,
      FUNCTION_DECLARATIONS,
      { temperature: 0.3, maxTokens: 2000 }
    );

    let actions: Array = [];
    let navigateTo: string | undefined;
    let finalResponse = initialResponse;

    if (functionCalls && functionCalls.length > 0) {
      // Separate immediate vs confirmation-required actions
      const immediateCallsToExecute = functionCalls.filter(fc => IMMEDIATE_ACTIONS.has(fc.name));
      const confirmationRequiredCalls = functionCalls.filter(fc => CONFIRMATION_REQUIRED_ACTIONS.has(fc.name));

      // Execute immediate actions right away
      if (immediateCallsToExecute.length > 0) {
        console.log(`[Client Portal Agent] Executing immediate actions:`, immediateCallsToExecute.map(f => f.name));

        for (const funcCall of immediateCallsToExecute) {
          const result = await executeAction(
            funcCall.name,
            funcCall.args,
            user.clientAccountId,
            user.clientUserId
          );

          actions.push({ action: funcCall.name, params: funcCall.args, result });

          if (result.navigateTo) {
            navigateTo = result.navigateTo;
          }
        }

        // Generate response with the action results
        const actionResultsText = actions
          .map((a) =>
            `Action: ${a.action}\nResult: ${a.result.success ? 'Success' : 'Failed'}\nMessage: ${a.result.message}${a.result.data ? `\nData: ${JSON.stringify(a.result.data, null, 2)}` : ''}`
          )
          .join('\n\n');

        const followUpPrompt = `The client asked: "${message}"\n\nYou executed these actions:\n${actionResultsText}\n\nProvide a helpful response presenting this information clearly and concisely.`;

        finalResponse = await vertexChat(
          SYSTEM_PROMPT,
          [{ role: 'user', content: followUpPrompt }],
          { temperature: 0.7, maxTokens: 1000 }
        );
      }

      // For confirmation-required actions, the model should have already asked for confirmation
      // in its response (per the system prompt). We don't execute them yet.
      if (confirmationRequiredCalls.length > 0 && immediateCallsToExecute.length === 0) {
        console.log(`[Client Portal Agent] Confirmation required for:`, confirmationRequiredCalls.map(f => f.name));
        // The model's response should already include a confirmation prompt per the system instructions
        // If it doesn't, we keep the initial response as-is
      }
    }

    const newHistory: VertexChatMessage[] = [
      ...history.slice(-18),
      { role: 'user' as const, content: message },
      { role: 'model' as const, content: finalResponse },
    ];

    return res.json({
      response: finalResponse,
      actions,
      navigateTo,
      conversationHistory: newHistory,
    });

  } catch (error: any) {
    console.error('[Client Portal Agent] Error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
});

// Get available actions (for UI hints)
router.get('/actions', (req: Request, res: Response) => {
  const actionList = FUNCTION_DECLARATIONS.map(func => ({
    name: func.name,
    description: func.description
  }));

  res.json(actionList);
});

// Quick actions endpoint - execute predefined actions without AI
router.post('/quick-action', async (req: Request, res: Response) => {
  try {
    const { action, params } = req.body;
    const user = (req as any).clientUser;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validActions = FUNCTION_DECLARATIONS.map(f => f.name);
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const result = await executeAction(action, params || {}, user.clientAccountId, user.clientUserId);
    return res.json(result);

  } catch (error: any) {
    console.error('[Client Portal Agent] Quick action error:', error);
    return res.status(500).json({ error: 'Failed to execute action' });
  }
});

export default router;