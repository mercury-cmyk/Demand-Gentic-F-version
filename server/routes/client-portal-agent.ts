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
  }
];

// System prompt for the agent
const SYSTEM_PROMPT = `You are an AI assistant for the Client Portal of Pivotal B2B, a B2B lead generation company.

You help clients with:
- Viewing and managing their campaigns
- Creating orders for verified leads
- Checking order status and delivery progress
- Viewing billing information and invoices
- Accessing reports and analytics
- Requesting new campaigns
- Submitting support requests

Guidelines:
1. Be helpful, professional, and concise
2. Only perform actions that the client explicitly requests or confirms
3. When showing data, format it clearly and highlight important information
4. If an action fails, explain why and suggest alternatives
5. For sensitive actions (like creating orders), confirm details before executing
6. Proactively offer relevant information based on context
7. When a user asks to create an order, always use the create_order function
8. When a user mentions quantities, extract the number for the order

You have access to the client's account data and can perform actions on their behalf.
Always act in the client's best interest and within the scope of allowed actions.

Important: When executing actions, call the appropriate function. Do not just describe what you would do - actually call the function to execute it.`;

// Action handlers
async function executeAction(
  action: string,
  params: Record<string, any>,
  clientAccountId: string,
  clientUserId: string
): Promise<{ success: boolean; data?: any; message: string; navigateTo?: string }> {

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
      if (isNaN(quantity) || quantity <= 0) {
        return { success: false, message: 'Invalid quantity. Please provide a positive number.' };
      }

      const now = new Date();
      const orderNumber = `ORD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const [newOrder] = await db.insert(clientPortalOrders).values({
        clientAccountId,
        campaignId: params.campaignId,
        orderNumber,
        requestedQuantity: quantity,
        deliveredQuantity: 0,
        status: 'submitted',
        orderMonth: now.getMonth() + 1,
        orderYear: now.getFullYear(),
        clientNotes: params.notes || null,
        createdBy: clientUserId
      }).returning();

      return {
        success: true,
        data: newOrder,
        message: `Order ${orderNumber} created successfully for ${quantity.toLocaleString()} leads from "${access.campaign.name}". Our team will review and approve it shortly.`
      };
    }

    case 'list_orders': {
      const orders = await db.select().from(clientPortalOrders)
        .where(eq(clientPortalOrders.clientAccountId, clientAccountId))
        .orderBy(desc(clientPortalOrders.createdAt));

      let filtered = orders;
      if (params.status && params.status !== 'all') {
        filtered = orders.filter(o => {
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

    case 'request_campaign': {
      return {
        success: true,
        data: {
          requestId: `REQ-${Date.now()}`,
          name: params.name,
          targetAudience: params.targetAudience,
          estimatedVolume: params.estimatedVolume || 'Not specified',
          timeline: params.timeline || 'Not specified',
          status: 'submitted'
        },
        message: `Campaign request submitted! Our team will review "${params.name}" and contact you within 24 hours.${params.estimatedVolume ? ` Estimated volume: ${params.estimatedVolume} leads.` : ''}`
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

// Main agent endpoint using Vertex AI
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

    // Call Vertex AI with function calling
    const { text: initialResponse, functionCalls } = await generateWithFunctions(
      SYSTEM_PROMPT,
      message,
      FUNCTION_DECLARATIONS,
      { temperature: 0.3, maxTokens: 2000 }
    );

    let actions: Array<{ action: string; params: any; result: any }> = [];
    let navigateTo: string | undefined;

    // Process function calls if any
    if (functionCalls && functionCalls.length > 0) {
      console.log(`[Client Portal Agent] Function calls detected:`, functionCalls);

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

      // Generate a follow-up response with the action results
      const actionResultsText = actions.map(a =>
        `Action: ${a.action}\nResult: ${a.result.success ? 'Success' : 'Failed'}\nMessage: ${a.result.message}${a.result.data ? `\nData: ${JSON.stringify(a.result.data, null, 2)}` : ''}`
      ).join('\n\n');

      const followUpPrompt = `The user asked: "${message}"

I executed the following actions:
${actionResultsText}

Please provide a helpful, conversational response summarizing the results for the user. Be concise but informative.`;

      const followUpResponse = await vertexChat(
        SYSTEM_PROMPT,
        [{ role: 'user', content: followUpPrompt }],
        { temperature: 0.7, maxTokens: 1000 }
      );

      // Update conversation history
      const newHistory: VertexChatMessage[] = [
        ...conversationHistory.slice(-18),
        { role: 'user' as const, content: message },
        { role: 'model' as const, content: followUpResponse }
      ];

      return res.json({
        response: followUpResponse,
        actions,
        navigateTo,
        conversationHistory: newHistory
      });
    }

    // No function calls, just return the response
    const newHistory: VertexChatMessage[] = [
      ...conversationHistory.slice(-18),
      { role: 'user' as const, content: message },
      { role: 'model' as const, content: initialResponse }
    ];

    return res.json({
      response: initialResponse,
      actions: [],
      navigateTo,
      conversationHistory: newHistory
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
