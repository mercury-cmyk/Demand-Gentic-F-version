import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, desc, sql, gte, lte, isNull } from 'drizzle-orm';
import OpenAI from 'openai';
import {
  clientVoiceCommands,
  clientVoiceConfig,
  clientProjects,
  clientActivityCosts,
  clientInvoices,
  clientPortalOrders,
  clientDeliveryLinks,
  verificationCampaigns,
  clientCampaignAccess,
} from '@shared/schema';
import { z } from 'zod';

const router = Router();

// Initialize OpenAI client lazily to allow server startup without API key
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

// Voice command intent types
type VoiceIntent = 'navigation' | 'query' | 'action' | 'report' | 'unknown';

interface ParsedCommand {
  intent: VoiceIntent;
  action: string;
  entities: Record<string, unknown>;
  confidence: number;
}

interface CommandResult {
  success: boolean;
  responseText: string;
  data?: unknown;
  navigation?: {
    path: string;
    params?: Record<string, string>;
  };
}

// System prompt for intent parsing
const INTENT_PARSER_PROMPT = `You are an AI assistant for a B2B lead generation client portal. Parse user voice commands and extract intent and entities.

Available intents:
- navigation: User wants to go to a page (projects, campaigns, billing, invoices, orders, settings)
- query: User is asking for information (costs, lead counts, campaign status, invoice status)
- action: User wants to perform an action (create order, download report)
- report: User wants a summary or analysis

Available entities to extract:
- page: The page user wants to navigate to
- timeframe: Date range (this month, last month, this week, this year)
- project_name: Name of a project
- campaign_name: Name of a campaign
- quantity: A number
- status: Status filter (pending, completed, paid, etc.)

Respond in JSON format:
{
  "intent": "navigation|query|action|report|unknown",
  "action": "specific action name",
  "entities": { extracted entities },
  "confidence": 0.0-1.0
}

Examples:
- "Go to my projects" -> {"intent":"navigation","action":"go_to_projects","entities":{"page":"projects"},"confidence":0.95}
- "What's my spend this month?" -> {"intent":"query","action":"get_monthly_spend","entities":{"timeframe":"this_month"},"confidence":0.9}
- "Create a new order for 500 leads" -> {"intent":"action","action":"create_order","entities":{"quantity":500},"confidence":0.85}
- "Summarize campaign performance" -> {"intent":"report","action":"campaign_summary","entities":{},"confidence":0.8}`;

// Parse voice command using GPT-4
async function parseVoiceCommand(transcript: string): Promise<ParsedCommand> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: INTENT_PARSER_PROMPT },
        { role: 'user', content: transcript },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 256,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from GPT');
    }

    return JSON.parse(content) as ParsedCommand;
  } catch (error) {
    console.error('[VOICE] Parse error:', error);
    return {
      intent: 'unknown',
      action: 'unknown',
      entities: {},
      confidence: 0,
    };
  }
}

// Execute navigation commands
function executeNavigation(action: string, entities: Record<string, unknown>): CommandResult {
  const navigationMap: Record<string, string> = {
    go_to_projects: '/client-portal/projects',
    go_to_campaigns: '/client-portal/campaigns',
    go_to_billing: '/client-portal/billing',
    go_to_invoices: '/client-portal/billing/invoices',
    go_to_orders: '/client-portal/orders',
    go_to_settings: '/client-portal/settings',
    go_to_dashboard: '/client-portal/dashboard',
    go_to_costs: '/client-portal/billing/costs',
  };

  const path = navigationMap[action];
  if (path) {
    const pageName = action.replace('go_to_', '').replace('_', ' ');
    return {
      success: true,
      responseText: `Navigating to ${pageName}.`,
      navigation: { path },
    };
  }

  return {
    success: false,
    responseText: "I'm not sure which page you want to go to. You can say things like 'Go to projects' or 'Show billing'.",
  };
}

// Execute query commands
async function executeQuery(
  action: string,
  entities: Record<string, unknown>,
  clientAccountId: string
): Promise<CommandResult> {
  try {
    switch (action) {
      case 'get_monthly_spend':
      case 'get_total_spend': {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [result] = await db
          .select({
            total: sql<string>`COALESCE(SUM(total_cost), 0)::text`,
          })
          .from(clientActivityCosts)
          .where(
            and(
              eq(clientActivityCosts.clientAccountId, clientAccountId),
              gte(clientActivityCosts.activityDate, startOfMonth)
            )
          );

        const total = parseFloat(result?.total || '0');
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(total);

        return {
          success: true,
          responseText: `Your total spend this month is ${formatted}.`,
          data: { total, formatted },
        };
      }

      case 'get_lead_count': {
        const [result] = await db
          .select({
            count: sql<number>`COALESCE(SUM(quantity), 0)::int`,
          })
          .from(clientActivityCosts)
          .where(
            and(
              eq(clientActivityCosts.clientAccountId, clientAccountId),
              eq(clientActivityCosts.activityType, 'lead_delivered')
            )
          );

        return {
          success: true,
          responseText: `You have received ${result?.count || 0} leads in total.`,
          data: { count: result?.count || 0 },
        };
      }

      case 'get_pending_invoices': {
        const invoices = await db
          .select({
            id: clientInvoices.id,
            invoiceNumber: clientInvoices.invoiceNumber,
            totalAmount: clientInvoices.totalAmount,
            dueDate: clientInvoices.dueDate,
          })
          .from(clientInvoices)
          .where(
            and(
              eq(clientInvoices.clientAccountId, clientAccountId),
              eq(clientInvoices.status, 'sent')
            )
          );

        if (invoices.length === 0) {
          return {
            success: true,
            responseText: 'You have no pending invoices.',
            data: { invoices: [] },
          };
        }

        const total = invoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(total);

        return {
          success: true,
          responseText: `You have ${invoices.length} pending invoice${invoices.length > 1 ? 's' : ''} totaling ${formatted}.`,
          data: { invoices, total },
          navigation: { path: '/client-portal/billing/invoices' },
        };
      }

      case 'get_project_count': {
        const [result] = await db
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(clientProjects)
          .where(eq(clientProjects.clientAccountId, clientAccountId));

        return {
          success: true,
          responseText: `You have ${result?.count || 0} project${result?.count !== 1 ? 's' : ''}.`,
          data: { count: result?.count || 0 },
        };
      }

      case 'get_order_status': {
        const orders = await db
          .select({
            status: clientPortalOrders.status,
            count: sql<number>`count(*)::int`,
          })
          .from(clientPortalOrders)
          .where(eq(clientPortalOrders.clientAccountId, clientAccountId))
          .groupBy(clientPortalOrders.status);

        const statusSummary = orders.map((o) => `${o.count} ${o.status}`).join(', ');

        return {
          success: true,
          responseText: statusSummary
            ? `Your orders: ${statusSummary}.`
            : 'You have no orders yet.',
          data: { orders },
        };
      }

      default:
        return {
          success: false,
          responseText: "I can help you with spending, leads, invoices, projects, and orders. What would you like to know?",
        };
    }
  } catch (error) {
    console.error('[VOICE] Query error:', error);
    return {
      success: false,
      responseText: 'Sorry, I had trouble getting that information. Please try again.',
    };
  }
}

// Execute action commands
async function executeAction(
  action: string,
  entities: Record<string, unknown>,
  clientAccountId: string
): Promise<CommandResult> {
  switch (action) {
    case 'create_order':
      return {
        success: true,
        responseText: "I'll help you create a new order. Opening the order form now.",
        navigation: { path: '/client-portal/orders/new' },
        data: { quantity: entities.quantity },
      };

    case 'download_report':
    case 'download_latest_report': {
      const [latest] = await db
        .select()
        .from(clientDeliveryLinks)
        .where(
          and(
            eq(clientDeliveryLinks.clientAccountId, clientAccountId),
            eq(clientDeliveryLinks.deliveryStatus, 'delivered')
          )
        )
        .orderBy(desc(clientDeliveryLinks.createdAt))
        .limit(1);

      if (latest) {
        return {
          success: true,
          responseText: `Found your latest report from ${new Date(latest.createdAt).toLocaleDateString()}. Opening download.`,
          data: { deliveryId: latest.id, token: latest.accessToken },
          navigation: { path: `/client-portal/deliveries/${latest.id}` },
        };
      }

      return {
        success: false,
        responseText: 'No reports are available for download yet.',
      };
    }

    default:
      return {
        success: false,
        responseText: "I can help you create orders or download reports. What would you like to do?",
      };
  }
}

// Execute report commands
async function executeReport(
  action: string,
  entities: Record<string, unknown>,
  clientAccountId: string
): Promise<CommandResult> {
  try {
    switch (action) {
      case 'campaign_summary': {
        // Get campaigns and their stats
        const campaigns = await db
          .select({
            id: verificationCampaigns.id,
            name: verificationCampaigns.name,
          })
          .from(clientCampaignAccess)
          .innerJoin(
            verificationCampaigns,
            eq(clientCampaignAccess.campaignId, verificationCampaigns.id)
          )
          .where(eq(clientCampaignAccess.clientAccountId, clientAccountId))
          .limit(5);

        if (campaigns.length === 0) {
          return {
            success: true,
            responseText: "You don't have any campaigns yet.",
            data: { campaigns: [] },
          };
        }

        return {
          success: true,
          responseText: `You have ${campaigns.length} active campaign${campaigns.length > 1 ? 's' : ''}. Would you like me to show the details?`,
          data: { campaigns },
          navigation: { path: '/client-portal/campaigns' },
        };
      }

      case 'billing_summary': {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [costs] = await db
          .select({
            total: sql<string>`COALESCE(SUM(total_cost), 0)::text`,
          })
          .from(clientActivityCosts)
          .where(
            and(
              eq(clientActivityCosts.clientAccountId, clientAccountId),
              gte(clientActivityCosts.activityDate, startOfMonth)
            )
          );

        const [invoices] = await db
          .select({
            pending: sql<number>`count(*) FILTER (WHERE status = 'sent')::int`,
            overdue: sql<number>`count(*) FILTER (WHERE status = 'overdue')::int`,
          })
          .from(clientInvoices)
          .where(eq(clientInvoices.clientAccountId, clientAccountId));

        const total = parseFloat(costs?.total || '0');
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(total);

        let summary = `This month's spend is ${formatted}.`;
        if (invoices?.pending) {
          summary += ` You have ${invoices.pending} pending invoice${invoices.pending > 1 ? 's' : ''}.`;
        }
        if (invoices?.overdue) {
          summary += ` ${invoices.overdue} invoice${invoices.overdue > 1 ? 's are' : ' is'} overdue.`;
        }

        return {
          success: true,
          responseText: summary,
          data: { monthlySpend: total, ...invoices },
          navigation: { path: '/client-portal/billing' },
        };
      }

      default:
        return {
          success: true,
          responseText: "I can provide campaign summaries and billing summaries. Which would you like?",
        };
    }
  } catch (error) {
    console.error('[VOICE] Report error:', error);
    return {
      success: false,
      responseText: 'Sorry, I had trouble generating that report. Please try again.',
    };
  }
}

// Generate TTS response
async function generateAudioResponse(text: string, voice: string = 'nova'): Promise<string | null> {
  try {
    const mp3Response = await getOpenAI().audio.speech.create({
      model: 'tts-1',
      voice: voice as 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer',
      input: text,
      speed: 1.0,
    });

    // Convert to base64 data URL
    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    const base64 = buffer.toString('base64');
    return `data:audio/mp3;base64,${base64}`;
  } catch (error) {
    console.error('[VOICE] TTS error:', error);
    return null;
  }
}

// ==================== ROUTES ====================

// Process voice command
const voiceCommandSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required'),
  generateAudio: z.boolean().optional().default(true),
});

router.post('/command', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const clientUserId = req.clientUser!.clientUserId;
    const clientAccountId = req.clientUser!.clientAccountId;

    const parsed = voiceCommandSchema.parse(req.body);
    const { transcript, generateAudio } = parsed;

    // Get voice config
    const [voiceConfig] = await db
      .select()
      .from(clientVoiceConfig)
      .where(eq(clientVoiceConfig.clientAccountId, clientAccountId))
      .limit(1);

    // Parse command
    const command = await parseVoiceCommand(transcript);

    // Execute based on intent
    let result: CommandResult;

    switch (command.intent) {
      case 'navigation':
        result = executeNavigation(command.action, command.entities);
        break;
      case 'query':
        result = await executeQuery(command.action, command.entities, clientAccountId);
        break;
      case 'action':
        // Check permissions
        if (command.action === 'create_order' && voiceConfig && !voiceConfig.voiceCanCreateOrders) {
          result = {
            success: false,
            responseText: 'Voice order creation is disabled for your account.',
          };
        } else {
          result = await executeAction(command.action, command.entities, clientAccountId);
        }
        break;
      case 'report':
        result = await executeReport(command.action, command.entities, clientAccountId);
        break;
      default:
        result = {
          success: false,
          responseText: "I didn't quite catch that. You can ask me about your spending, leads, invoices, or tell me to navigate somewhere.",
        };
    }

    // Generate audio response if requested
    let audioUrl: string | null = null;
    if (generateAudio && result.responseText) {
      audioUrl = await generateAudioResponse(
        result.responseText,
        voiceConfig?.preferredVoice || 'nova'
      );
    }

    const processingTime = Date.now() - startTime;

    // Store command in history
    await db.insert(clientVoiceCommands).values({
      clientUserId,
      clientAccountId,
      transcript,
      intent: command.intent,
      entities: command.entities,
      responseText: result.responseText,
      responseAudioUrl: audioUrl,
      actionType: command.action,
      actionResult: result.data as Record<string, unknown>,
      actionSuccess: result.success,
      processingDurationMs: processingTime,
    });

    res.json({
      success: result.success,
      intent: command.intent,
      action: command.action,
      confidence: command.confidence,
      response: {
        text: result.responseText,
        audioUrl,
      },
      navigation: result.navigation,
      data: result.data,
      processingTimeMs: processingTime,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[VOICE] Command processing error:', error);
    res.status(500).json({ message: 'Failed to process voice command' });
  }
});

// Get command history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const clientUserId = req.clientUser!.clientUserId;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const history = await db
      .select({
        id: clientVoiceCommands.id,
        transcript: clientVoiceCommands.transcript,
        intent: clientVoiceCommands.intent,
        actionType: clientVoiceCommands.actionType,
        actionSuccess: clientVoiceCommands.actionSuccess,
        responseText: clientVoiceCommands.responseText,
        createdAt: clientVoiceCommands.createdAt,
      })
      .from(clientVoiceCommands)
      .where(eq(clientVoiceCommands.clientUserId, clientUserId))
      .orderBy(desc(clientVoiceCommands.createdAt))
      .limit(limit);

    res.json(history);
  } catch (error) {
    console.error('[VOICE] Get history error:', error);
    res.status(500).json({ message: 'Failed to get command history' });
  }
});

// Get voice config
router.get('/config', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;

    const [config] = await db
      .select()
      .from(clientVoiceConfig)
      .where(eq(clientVoiceConfig.clientAccountId, clientAccountId))
      .limit(1);

    if (!config) {
      return res.json({
        voiceEnabled: true,
        preferredVoice: 'nova',
        responseSpeed: 1.0,
        voiceCanCreateOrders: true,
        voiceCanViewInvoices: true,
        voiceCanDownloadReports: true,
      });
    }

    res.json({
      voiceEnabled: config.voiceEnabled,
      preferredVoice: config.preferredVoice,
      responseSpeed: parseFloat(config.responseSpeed || '1.0'),
      voiceCanCreateOrders: config.voiceCanCreateOrders,
      voiceCanViewInvoices: config.voiceCanViewInvoices,
      voiceCanDownloadReports: config.voiceCanDownloadReports,
    });
  } catch (error) {
    console.error('[VOICE] Get config error:', error);
    res.status(500).json({ message: 'Failed to get voice config' });
  }
});

// Update voice config
const updateConfigSchema = z.object({
  voiceEnabled: z.boolean().optional(),
  preferredVoice: z.enum(['marin', 'cedar', 'nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer', 'ash', 'coral', 'sage', 'verse', 'ballad']).optional(),
  responseSpeed: z.number().min(0.5).max(2.0).optional(),
});

router.put('/config', async (req: Request, res: Response) => {
  try {
    const clientAccountId = req.clientUser!.clientAccountId;
    const parsed = updateConfigSchema.parse(req.body);

    // Upsert config
    const [existing] = await db
      .select({ id: clientVoiceConfig.id })
      .from(clientVoiceConfig)
      .where(eq(clientVoiceConfig.clientAccountId, clientAccountId))
      .limit(1);

    if (existing) {
      await db
        .update(clientVoiceConfig)
        .set({
          ...(parsed.voiceEnabled !== undefined && { voiceEnabled: parsed.voiceEnabled }),
          ...(parsed.preferredVoice && { preferredVoice: parsed.preferredVoice }),
          ...(parsed.responseSpeed !== undefined && { responseSpeed: parsed.responseSpeed.toString() }),
          updatedAt: new Date(),
        })
        .where(eq(clientVoiceConfig.clientAccountId, clientAccountId));
    } else {
      await db.insert(clientVoiceConfig).values({
        clientAccountId,
        voiceEnabled: parsed.voiceEnabled ?? true,
        preferredVoice: parsed.preferredVoice ?? 'nova',
        responseSpeed: (parsed.responseSpeed ?? 1.0).toString(),
      });
    }

    res.json({ message: 'Voice config updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('[VOICE] Update config error:', error);
    res.status(500).json({ message: 'Failed to update voice config' });
  }
});

// Transcribe audio (using Whisper)
router.post('/transcribe', async (req: Request, res: Response) => {
  try {
    // This endpoint expects audio data in the request
    // For browser-based recording, we'd receive a blob/base64

    const { audioData, mimeType } = req.body;

    if (!audioData) {
      return res.status(400).json({ message: 'Audio data is required' });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData.replace(/^data:audio\/\w+;base64,/, ''), 'base64');

    // Create a File-like object for OpenAI
    const audioFile = new File([audioBuffer], 'audio.webm', {
      type: mimeType || 'audio/webm',
    });

    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
    });

    res.json({
      transcript: transcription.text,
    });
  } catch (error) {
    console.error('[VOICE] Transcription error:', error);
    res.status(500).json({ message: 'Failed to transcribe audio' });
  }
});

// TTS endpoint for voice simulation - generates audio using Google Cloud TTS
// Supports all Gemini voices mapped to high-quality Google Cloud TTS voices
router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceId, provider } = req.body;

    if (!text || typeof text !== 'string' || text.length === 0) {
      return res.status(400).json({ message: 'Text is required' });
    }

    if (!voiceId || typeof voiceId !== 'string') {
      return res.status(400).json({ message: 'Voice ID is required' });
    }

    // Import the TTS generator from voice-discovery-service
    const { generateTTSAudio } = await import('../services/voice-discovery-service');
    
    const validProvider = provider === 'openai' ? 'openai' : 'gemini';
    const audioBuffer = await generateTTSAudio(text, voiceId, validProvider);

    // Set appropriate headers for audio response
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length.toString());
    res.set('Content-Disposition', 'inline; filename="tts-audio.mp3"');
    res.set('Cache-Control', 'private, max-age=60');

    res.send(audioBuffer);
  } catch (error) {
    console.error('[VOICE] TTS error:', error);
    res.status(500).json({ message: 'Failed to generate TTS audio' });
  }
});

export default router;
