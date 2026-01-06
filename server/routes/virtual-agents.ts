import { Router } from "express";
import { db } from "../db";
import { virtualAgents, campaignAgentAssignments, campaigns } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { optimizePromptPackage } from "../services/prompt-optimization-pipeline";
import OpenAI from "openai";
import { buildAgentSystemPrompt } from "../lib/org-intelligence-helper";
import {
  generateMasterAgentPrompt,
  getOrganizationBrain,
  buildCompleteAgentContext,
  type AgentCreationInput,
} from "../services/agent-brain-service";
import {
  getDemandAgentKnowledge,
  getDefaultFirstMessage,
  getDefaultProvider,
  getDemandAgentDescription,
  buildDemandAgentKnowledgePrompt,
} from "../services/demand-agent-knowledge";
import {
  compileSkillToPrompt,
  validateSkillInputs,
  previewCompiledPrompt,
} from "../services/agent-skill-compiler";
import {
  getAllSkills,
  getSkillsByCategory,
  getSkillById,
  type AgentSkillCategory,
} from "../services/agent-skills";
import { DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE } from "../services/voice-agent-control-defaults";

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
});

const insertVirtualAgentSchema = createInsertSchema(virtualAgents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const DEFAULT_B2B_SYSTEM_PROMPT = `${DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE}

# Default B2B Calling Fundamentals
You are a professional B2B outbound caller. Follow these rules:
- Be conversational, friendly, and professional
- Listen carefully and ask one question at a time
- Respect business hours in the prospect's local time; avoid calls before 8am or after 6pm unless requested
- If you encounter an IVR, navigate to dial-by-name or operator quickly and politely
- If you reach a gatekeeper, be concise and ask to be connected to the prospect (do not pitch unless asked)
- If dial-by-name is available, try the prospect's last name first; otherwise ask for an operator
- If the prospect asks not to be called again, comply immediately`;

const refineSystemPromptSchema = z.object({
  instructions: z.string().optional(),
  apply: z.boolean().optional(),
  firstMessage: z.string().optional(),
  toolsAllowed: z.array(z.string()).optional(),
  audienceContext: z.string().optional(),
  agentType: z.enum(["voice", "text", "research", "qa"]).optional(),
  provider: z.enum(["auto", "openai", "gemini"]).optional(),
});

const previewConversationSchema = z.object({
  virtualAgentId: z.string().optional(),
  systemPrompt: z.string().optional(),
  firstMessage: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
});

// Schema for simplified agent creation (just task + first message)
const createSmartAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  taskDescription: z.string().min(10, "Task description must be at least 10 characters"),
  firstMessage: z.string().min(5, "First message must be at least 5 characters"),
  agentType: z.enum(["voice", "text", "research", "qa"]).optional().default("voice"),
  additionalContext: z.string().optional(),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().default("nova"),
  autoGeneratePrompt: z.boolean().optional().default(true),
});

// Schema for regenerating/updating agent prompt
const regeneratePromptSchema = z.object({
  taskDescription: z.string().optional(),
  firstMessage: z.string().optional(),
  additionalContext: z.string().optional(),
  agentType: z.enum(["voice", "text", "research", "qa"]).optional(),
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const agents = await db
      .select({
        id: virtualAgents.id,
        name: virtualAgents.name,
        description: virtualAgents.description,
        provider: virtualAgents.provider,
        externalAgentId: virtualAgents.externalAgentId,
        voice: virtualAgents.voice,
        systemPrompt: virtualAgents.systemPrompt,
        firstMessage: virtualAgents.firstMessage,
        settings: virtualAgents.settings,
        isActive: virtualAgents.isActive,
        createdBy: virtualAgents.createdBy,
        createdAt: virtualAgents.createdAt,
        updatedAt: virtualAgents.updatedAt,
      })
      .from(virtualAgents)
      .orderBy(desc(virtualAgents.createdAt));
    
    res.json(agents);
  } catch (error) {
    console.error("[Virtual Agents] Error fetching agents:", error);
    res.status(500).json({ message: "Failed to fetch virtual agents" });
  }
});

// Voice preview endpoint - MUST be before /:id route to avoid conflict
router.get("/preview-voice", requireAuth, async (req, res) => {
  try {
    const { voice, provider, text } = req.query;
    
    if (!voice || !provider || !text) {
      return res.status(400).json({ message: "Missing required parameters: voice, provider, text" });
    }

    const maxPreviewChars = Math.min(
      Math.max(Number.parseInt(process.env.VOICE_PREVIEW_MAX_CHARS || "600", 10), 1),
      4000
    );
    const previewText = String(text).substring(0, maxPreviewChars);

    if (provider === 'openai') {
      // OpenAI TTS
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "OpenAI API key not configured" });
      }

      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: voice,
          input: previewText,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS failed: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(audioBuffer));

    } else if (provider === 'google') {
      // Google Cloud TTS
      const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
      const client = new TextToSpeechClient();

      const [response] = await client.synthesizeSpeech({
        input: { text: previewText },
        voice: { 
          languageCode: voice.startsWith('en-US') ? 'en-US' : 'en-GB',
          name: String(voice) 
        },
        audioConfig: { audioEncoding: 'MP3' },
      });

      res.set('Content-Type', 'audio/mpeg');
      res.send(response.audioContent);

    } else {
      return res.status(400).json({ message: "Unsupported provider" });
    }

  } catch (error) {
    console.error("[Virtual Agents] Voice preview error:", error);
    res.status(500).json({ 
      message: "Failed to generate voice preview", 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const [agent] = await db
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id))
      .limit(1);
    
    if (!agent) {
      return res.status(404).json({ message: "Virtual agent not found" });
    }
    
    res.json(agent);
  } catch (error) {
    console.error("[Virtual Agents] Error fetching agent:", error);
    res.status(500).json({ message: "Failed to fetch virtual agent" });
  }
});

// Optimize a virtual agent prompt using the internal Prompt Optimization Pipeline
router.post("/:id/refine-system", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const {
      instructions,
      apply,
      firstMessage,
      toolsAllowed,
      audienceContext,
      agentType,
      provider,
    } = refineSystemPromptSchema.parse(req.body ?? {});

    const [agent] = await db
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id))
      .limit(1);

    if (!agent) {
      return res.status(404).json({ message: "Virtual agent not found" });
    }

    const currentPrompt = agent.systemPrompt?.trim()
      ? agent.systemPrompt
      : DEFAULT_B2B_SYSTEM_PROMPT;
    const resolvedFirstMessage = firstMessage?.trim()
      ? firstMessage
      : agent.firstMessage?.trim() || null;

    const toolPolicy =
      agent.settings && typeof agent.settings === "object"
        ? (agent.settings as { systemTools?: Record<string, boolean> }).systemTools ?? null
        : null;

    const optimizationResult = await optimizePromptPackage({
      systemPrompt: currentPrompt,
      firstMessage: resolvedFirstMessage,
      instructions,
      toolsAllowed,
      toolPolicy,
      audienceContext,
      agentType: agentType ?? "voice",
      provider: provider ?? "auto",
    });

    const requiresApproval = Boolean(apply) && !optimizationResult.autoApplyAllowed;

    if (apply && optimizationResult.autoApplyAllowed) {
      const updates: Partial<typeof virtualAgents.$inferInsert> = {
        systemPrompt: optimizationResult.optimizedSystemPrompt,
        updatedAt: new Date(),
      };
      if (optimizationResult.optimizedFirstMessage !== null) {
        updates.firstMessage = optimizationResult.optimizedFirstMessage;
      }

      const [updated] = await db
        .update(virtualAgents)
        .set(updates)
        .where(eq(virtualAgents.id, req.params.id))
        .returning();

      return res.json({
        refinedPrompt: optimizationResult.optimizedSystemPrompt,
        refinedFirstMessage: optimizationResult.optimizedFirstMessage,
        applied: true,
        requiresApproval: false,
        agent: updated,
        optimization: optimizationResult,
      });
    }

    res.json({
      refinedPrompt: optimizationResult.optimizedSystemPrompt,
      refinedFirstMessage: optimizationResult.optimizedFirstMessage,
      applied: false,
      requiresApproval,
      optimization: optimizationResult,
    });
  } catch (error) {
    console.error("[Virtual Agents] Error refining system prompt:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to refine system prompt" });
  }
});

// Preview conversation without placing a call
router.post("/preview-conversation", requireAuth, async (req, res) => {
  try {
    const { virtualAgentId, systemPrompt, firstMessage, messages } = previewConversationSchema.parse(req.body ?? {});
    const historyLimit = Number.parseInt(process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_HISTORY || "8", 10);
    const maxTokens = Number.parseInt(process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_MAX_TOKENS || "320", 10);
    const temperature = Number.parseFloat(process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_TEMPERATURE || "0.2");
    const safeHistoryLimit = Number.isFinite(historyLimit) && historyLimit > 0 ? historyLimit : 8;
    const safeMaxTokens = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 120;
    const safeTemperature = Number.isFinite(temperature)
      ? Math.min(Math.max(temperature, 0), 1)
      : 0.2;

    let resolvedSystemPrompt = systemPrompt?.trim() || "";
    let resolvedFirstMessage = firstMessage?.trim() || "";

    if (virtualAgentId) {
      const [agent] = await db
        .select({
          systemPrompt: virtualAgents.systemPrompt,
          firstMessage: virtualAgents.firstMessage,
        })
        .from(virtualAgents)
        .where(eq(virtualAgents.id, virtualAgentId))
        .limit(1);

      if (agent) {
        if (!resolvedSystemPrompt && agent.systemPrompt) {
          resolvedSystemPrompt = agent.systemPrompt;
        }
        if (!resolvedFirstMessage && agent.firstMessage) {
          resolvedFirstMessage = agent.firstMessage;
        }
      }
    }

    if (!resolvedSystemPrompt) {
      resolvedSystemPrompt = DEFAULT_B2B_SYSTEM_PROMPT;
    }

    const trimmedMessages = (messages || [])
      .filter((msg) => typeof msg?.content === "string" && msg.content.trim().length > 0)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.trim(),
      }))
      .slice(-safeHistoryLimit);

    if (resolvedFirstMessage && trimmedMessages.length === 0) {
      trimmedMessages.push({ role: "assistant", content: resolvedFirstMessage });
    }

    const fullSystemPrompt = await buildAgentSystemPrompt(resolvedSystemPrompt);

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_MODEL || "gpt-4o-mini",
      temperature: safeTemperature,
      max_tokens: safeMaxTokens,
      messages: [
        { role: "system", content: fullSystemPrompt },
        ...trimmedMessages,
      ],
    });

    const reply = response.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ message: "OpenAI returned an empty preview response" });
    }

    res.json({ reply });
  } catch (error) {
    console.error("[Virtual Agents] Preview conversation error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("OpenAI API key not configured")) {
      return res.status(503).json({ message: "OpenAI API key not configured" });
    }
    res.status(500).json({ message: "Failed to generate preview response", error: message });
  }
});

// ==================== SMART AGENT CREATION ====================

/**
 * POST /api/virtual-agents/create-smart
 * Simplified agent creation - user provides task + first message
 * System generates master prompt using Organization Intelligence
 */
router.post("/create-smart", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const parsed = createSmartAgentSchema.parse(req.body);

    console.log(`[Virtual Agents] Creating smart agent: ${parsed.name}`);

    // Generate master prompt using Agent Brain Service
    const agentInput: AgentCreationInput = {
      taskDescription: parsed.taskDescription,
      firstMessage: parsed.firstMessage,
      agentType: parsed.agentType,
      additionalContext: parsed.additionalContext,
    };

    let systemPrompt = DEFAULT_B2B_SYSTEM_PROMPT;
    let firstMessage = parsed.firstMessage;
    let generationMeta: any = null;

    if (parsed.autoGeneratePrompt) {
      console.log("[Virtual Agents] Auto-generating master prompt with Organization Intelligence...");

      const generated = await generateMasterAgentPrompt(agentInput);

      systemPrompt = generated.masterPrompt;
      firstMessage = generated.optimizedFirstMessage;
      generationMeta = {
        reasoning: generated.reasoning,
        knowledgeSources: generated.knowledgeSources,
        generatedAt: new Date().toISOString(),
      };

      console.log(`[Virtual Agents] Master prompt generated. Sources: ${generated.knowledgeSources.join(", ")}`);
    }

    // Create the agent
    const [agent] = await db
      .insert(virtualAgents)
      .values({
        name: parsed.name,
        description: `Task: ${parsed.taskDescription.substring(0, 100)}...`,
        provider: "openai_realtime",
        voice: parsed.voice,
        systemPrompt,
        firstMessage,
        settings: {
          taskDescription: parsed.taskDescription,
          agentType: parsed.agentType,
          generationMeta,
        },
        createdBy: req.user!.userId,
      })
      .returning();

    res.status(201).json({
      agent,
      generation: generationMeta,
      message: parsed.autoGeneratePrompt
        ? "Agent created with AI-generated master prompt"
        : "Agent created with default prompt",
    });
  } catch (error) {
    console.error("[Virtual Agents] Error creating smart agent:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create smart agent" });
  }
});

// ==================== SPECIALIZED DEMAND AGENT CREATION ====================

const createDemandAgentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  demandAgentType: z.enum(['demand_intel', 'demand_qual', 'demand_engage']),
  taskDescription: z.string().min(10, "Task description must be at least 10 characters"),
  firstMessage: z.string().optional(),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional().default('nova'),
  additionalContext: z.string().optional(),
  specializationConfig: z.object({
    // For demand_intel
    researchDepth: z.enum(['shallow', 'standard', 'deep']).optional(),
    targetSignals: z.array(z.string()).optional(),
    // For demand_qual
    bantWeights: z.object({
      budget: z.number().min(0).max(1),
      authority: z.number().min(0).max(1),
      need: z.number().min(0).max(1),
      timeframe: z.number().min(0).max(1),
    }).optional(),
    escalationThreshold: z.number().min(0).max(100).optional(),
    // For demand_engage
    personalizationLevel: z.number().min(1).max(3).optional(),
    sequenceType: z.enum(['cold', 'warm', 'reengagement']).optional(),
  }).optional(),
});

/**
 * POST /api/virtual-agents/create-demand-agent
 * Create a specialized demand generation agent (Intel, Qual, or Engage)
 * These agents have deep domain knowledge and specialized capabilities
 */
router.post("/create-demand-agent", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const parsed = createDemandAgentSchema.parse(req.body);

    console.log(`[Virtual Agents] Creating demand agent: ${parsed.name} (type: ${parsed.demandAgentType})`);

    // Get type-specific defaults
    const defaultFirstMessage = parsed.firstMessage || getDefaultFirstMessage(parsed.demandAgentType);
    const defaultProvider = getDefaultProvider(parsed.demandAgentType);
    const typeDescription = getDemandAgentDescription(parsed.demandAgentType);

    // Generate master prompt using Agent Brain Service with specialized knowledge
    const agentInput: AgentCreationInput = {
      taskDescription: parsed.taskDescription,
      firstMessage: defaultFirstMessage,
      agentType: parsed.demandAgentType,
      additionalContext: parsed.additionalContext,
      specializationConfig: parsed.specializationConfig as AgentCreationInput['specializationConfig'],
    };

    console.log("[Virtual Agents] Generating master prompt with specialized demand knowledge...");

    const generated = await generateMasterAgentPrompt(agentInput);

    const generationMeta = {
      reasoning: generated.reasoning,
      knowledgeSources: generated.knowledgeSources,
      demandAgentType: parsed.demandAgentType,
      generatedAt: new Date().toISOString(),
    };

    console.log(`[Virtual Agents] Master prompt generated. Sources: ${generated.knowledgeSources.join(", ")}`);

    // Create the specialized demand agent
    const [agent] = await db
      .insert(virtualAgents)
      .values({
        name: parsed.name,
        description: typeDescription,
        provider: defaultProvider,
        voice: parsed.voice,
        systemPrompt: generated.masterPrompt,
        firstMessage: generated.optimizedFirstMessage,
        demandAgentType: parsed.demandAgentType,
        specializationConfig: parsed.specializationConfig || {},
        settings: {
          taskDescription: parsed.taskDescription,
          agentType: parsed.demandAgentType,
          generationMeta,
        },
        createdBy: req.user!.userId,
      })
      .returning();

    res.status(201).json({
      agent,
      generation: generationMeta,
      message: `${parsed.demandAgentType} agent created with specialized knowledge`,
    });
  } catch (error) {
    console.error("[Virtual Agents] Error creating demand agent:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create demand agent" });
  }
});

/**
 * GET /api/virtual-agents/demand-knowledge/:type
 * Get the specialized knowledge for a demand agent type
 */
router.get("/demand-knowledge/:type", requireAuth, async (req, res) => {
  try {
    const type = req.params.type as 'demand_intel' | 'demand_qual' | 'demand_engage';

    if (!['demand_intel', 'demand_qual', 'demand_engage'].includes(type)) {
      return res.status(400).json({
        message: "Invalid demand agent type. Must be: demand_intel, demand_qual, or demand_engage",
      });
    }

    const knowledge = getDemandAgentKnowledge(type);
    const fullPrompt = buildDemandAgentKnowledgePrompt(type);

    res.json({
      type,
      name: knowledge.name,
      description: knowledge.description,
      knowledgePrompt: fullPrompt,
      defaultFirstMessage: getDefaultFirstMessage(type),
      defaultProvider: getDefaultProvider(type),
    });
  } catch (error) {
    console.error("[Virtual Agents] Error fetching demand knowledge:", error);
    res.status(500).json({ message: "Failed to fetch demand knowledge" });
  }
});

/**
 * GET /api/virtual-agents/demand-types
 * List all available demand agent types with their descriptions
 */
router.get("/demand-types", requireAuth, async (req, res) => {
  res.json({
    types: [
      {
        type: 'demand_intel',
        name: 'Demand Intel',
        description: getDemandAgentDescription('demand_intel'),
        defaultProvider: getDefaultProvider('demand_intel'),
        icon: 'search',
        capabilities: ['Account Research', 'Buying Signal Detection', 'Pain Analysis', 'Competitive Intelligence'],
      },
      {
        type: 'demand_qual',
        name: 'Demand Qual',
        description: getDemandAgentDescription('demand_qual'),
        defaultProvider: getDefaultProvider('demand_qual'),
        icon: 'phone',
        capabilities: ['BANT Qualification', 'Objection Handling', 'Lead Validation', 'Sales Escalation'],
      },
      {
        type: 'demand_engage',
        name: 'Demand Engage',
        description: getDemandAgentDescription('demand_engage'),
        defaultProvider: getDefaultProvider('demand_engage'),
        icon: 'mail',
        capabilities: ['Email Personalization', 'Sequence Optimization', 'Engagement Tracking', 'A/B Testing'],
      },
    ],
  });
});

/**
 * POST /api/virtual-agents/generate-prompt
 * Generate a master prompt without creating an agent (preview)
 */
router.post("/generate-prompt", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { taskDescription, firstMessage, agentType, additionalContext } = req.body;

    if (!taskDescription || !firstMessage) {
      return res.status(400).json({
        message: "taskDescription and firstMessage are required",
      });
    }

    console.log("[Virtual Agents] Generating prompt preview...");

    const agentInput: AgentCreationInput = {
      taskDescription,
      firstMessage,
      agentType: agentType || "voice",
      additionalContext,
    };

    const generated = await generateMasterAgentPrompt(agentInput);

    // Also fetch org brain for context display
    const orgBrain = await getOrganizationBrain();

    res.json({
      masterPrompt: generated.masterPrompt,
      optimizedFirstMessage: generated.optimizedFirstMessage,
      reasoning: generated.reasoning,
      knowledgeSources: generated.knowledgeSources,
      organizationContext: orgBrain ? {
        companyName: orgBrain.identity.companyName,
        hasOrgIntelligence: true,
        offeringsIncluded: !!orgBrain.offerings.products,
        icpIncluded: !!orgBrain.icp.targetPersonas,
        complianceIncluded: !!orgBrain.compliance,
      } : {
        hasOrgIntelligence: false,
        message: "No Organization Intelligence found. Create one in AI Studio for richer agent context.",
      },
    });
  } catch (error) {
    console.error("[Virtual Agents] Error generating prompt:", error);
    res.status(500).json({ message: "Failed to generate prompt" });
  }
});

/**
 * POST /api/virtual-agents/:id/regenerate-prompt
 * Regenerate the master prompt for an existing agent
 */
router.post("/:id/regenerate-prompt", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const parsed = regeneratePromptSchema.parse(req.body ?? {});

    const [agent] = await db
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id))
      .limit(1);

    if (!agent) {
      return res.status(404).json({ message: "Virtual agent not found" });
    }

    // Get existing task description from settings or use current prompt
    const settings = agent.settings as any || {};
    const taskDescription = parsed.taskDescription || settings.taskDescription || "Handle outbound B2B calls professionally";
    const firstMessage = parsed.firstMessage || agent.firstMessage || "Hello, this is an AI assistant calling.";
    const agentType = parsed.agentType || settings.agentType || "voice";
    const additionalContext = parsed.additionalContext || "";

    console.log(`[Virtual Agents] Regenerating prompt for agent: ${agent.name}`);

    const agentInput: AgentCreationInput = {
      taskDescription,
      firstMessage,
      agentType,
      additionalContext,
    };

    const generated = await generateMasterAgentPrompt(agentInput);

    // Update the agent with new prompt
    const generationMeta = {
      reasoning: generated.reasoning,
      knowledgeSources: generated.knowledgeSources,
      regeneratedAt: new Date().toISOString(),
      previousPromptLength: agent.systemPrompt?.length || 0,
    };

    const [updated] = await db
      .update(virtualAgents)
      .set({
        systemPrompt: generated.masterPrompt,
        firstMessage: generated.optimizedFirstMessage,
        settings: {
          ...settings,
          taskDescription,
          agentType,
          generationMeta,
        },
        updatedAt: new Date(),
      })
      .where(eq(virtualAgents.id, req.params.id))
      .returning();

    res.json({
      agent: updated,
      generation: {
        reasoning: generated.reasoning,
        knowledgeSources: generated.knowledgeSources,
      },
      message: "Agent prompt regenerated with latest Organization Intelligence",
    });
  } catch (error) {
    console.error("[Virtual Agents] Error regenerating prompt:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to regenerate prompt" });
  }
});

/**
 * GET /api/virtual-agents/organization-brain
 * Get the current Organization Intelligence that will be injected into agents
 */
router.get("/organization-brain", requireAuth, async (req, res) => {
  try {
    const orgBrain = await getOrganizationBrain();

    if (!orgBrain) {
      return res.json({
        available: false,
        message: "No Organization Intelligence configured. Create one in AI Studio → Organization Intelligence.",
        requiredFields: [
          "Company Identity (name, description, industry)",
          "Products & Services",
          "Ideal Customer Profile (ICP)",
          "Positioning & Messaging",
        ],
      });
    }

    res.json({
      available: true,
      brain: orgBrain,
      coverage: {
        identity: !!orgBrain.identity.companyName,
        offerings: !!orgBrain.offerings.products,
        icp: !!orgBrain.icp.targetPersonas,
        positioning: !!orgBrain.positioning.oneLiner,
        compliance: !!orgBrain.compliance,
        voiceDefaults: !!orgBrain.voiceDefaults,
      },
    });
  } catch (error) {
    console.error("[Virtual Agents] Error fetching organization brain:", error);
    res.status(500).json({ message: "Failed to fetch organization brain" });
  }
});

// ==================== SKILL-BASED AGENT CREATION ====================

/**
 * GET /api/virtual-agents/agent-skills
 * Get all available agent skills
 */
router.get("/agent-skills", requireAuth, async (req, res) => {
  try {
    const skills = getAllSkills();
    res.json(skills);
  } catch (error) {
    console.error("[Virtual Agents] Error fetching skills:", error);
    res.status(500).json({ message: "Failed to fetch agent skills" });
  }
});

/**
 * GET /api/virtual-agents/agent-skills/category/:category
 * Get skills by category
 */
router.get("/agent-skills/category/:category", requireAuth, async (req, res) => {
  try {
    const category = req.params.category as AgentSkillCategory;
    const skills = getSkillsByCategory(category);
    res.json(skills);
  } catch (error) {
    console.error("[Virtual Agents] Error fetching skills by category:", error);
    res.status(500).json({ message: "Failed to fetch skills by category" });
  }
});

/**
 * GET /api/virtual-agents/agent-skills/:skillId
 * Get skill details with input requirements
 */
router.get("/agent-skills/:skillId", requireAuth, async (req, res) => {
  try {
    const skill = getSkillById(req.params.skillId);
    if (!skill) {
      return res.status(404).json({ message: "Skill not found" });
    }
    res.json(skill);
  } catch (error) {
    console.error("[Virtual Agents] Error fetching skill:", error);
    res.status(500).json({ message: "Failed to fetch skill details" });
  }
});

/**
 * POST /api/virtual-agents/agent-skills/preview
 * Preview compiled prompt for a skill without creating agent
 */
router.post("/agent-skills/preview", requireAuth, async (req, res) => {
  try {
    const { agentName, skillId, skillInputValues } = req.body;

    if (!agentName || !skillId) {
      return res.status(400).json({
        message: "agentName and skillId are required",
      });
    }

    // Validate inputs
    const validation = validateSkillInputs(skillId, skillInputValues || {});
    if (!validation.valid) {
      return res.status(400).json({
        message: "Invalid inputs",
        missingInputs: validation.missingInputs,
        errors: validation.errors,
      });
    }

    // Generate preview
    const preview = await previewCompiledPrompt({
      agentName,
      skillId,
      skillInputValues: skillInputValues || {},
      organizationName: req.user?.organizationName,
    });

    res.json(preview);
  } catch (error) {
    console.error("[Virtual Agents] Error previewing skill prompt:", error);
    res.status(500).json({
      message: "Failed to preview prompt",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/virtual-agents/create-from-skill
 * Create agent from a skill definition
 */
router.post("/create-from-skill", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { agentName, skillId, skillInputValues, voice, provider } = req.body;

    if (!agentName || !skillId) {
      return res.status(400).json({
        message: "agentName and skillId are required",
      });
    }

    console.log(`[Virtual Agents] Creating skill-based agent: ${agentName} with skill: ${skillId}`);

    // Validate inputs
    const validation = validateSkillInputs(skillId, skillInputValues || {});
    if (!validation.valid) {
      return res.status(400).json({
        message: "Invalid skill inputs",
        missingInputs: validation.missingInputs,
        errors: validation.errors,
      });
    }

    // Compile skill to prompt
    const compiled = await compileSkillToPrompt({
      agentName,
      skillId,
      skillInputValues: skillInputValues || {},
      organizationName: req.user?.organizationName,
    });

    console.log(`[Virtual Agents] Skill compiled. Sources: ${compiled.sources.join(", ")}`);

    // Create agent in database
    const [agent] = await db
      .insert(virtualAgents)
      .values({
        name: agentName,
        systemPrompt: compiled.systemPrompt,
        firstMessage: compiled.firstMessage,
        skillId,
        skillInputs: skillInputValues || {},
        compiledPromptMetadata: {
          sources: compiled.sources,
          compiledAt: compiled.compiledAt.toISOString(),
          skillMetadata: compiled.skillMetadata,
        },
        voice: voice || "nova",
        provider: provider || "openai",
        isActive: true,
        createdBy: req.user!.userId,
      })
      .returning();

    console.log(`[Virtual Agents] Skill-based agent created: ${agent.id}`);

    res.status(201).json({
      agent,
      skillMetadata: compiled.skillMetadata,
      sources: compiled.sources,
      message: `${compiled.skillMetadata.skillName} agent created successfully`,
    });
  } catch (error) {
    console.error("[Virtual Agents] Error creating skill-based agent:", error);
    res.status(500).json({
      message: "Failed to create skill-based agent",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== STANDARD AGENT CRUD ====================

router.post("/", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const parsed = insertVirtualAgentSchema.parse(req.body);

    const [agent] = await db
      .insert(virtualAgents)
      .values({
        ...parsed,
        systemPrompt: parsed.systemPrompt?.trim() ? parsed.systemPrompt : DEFAULT_B2B_SYSTEM_PROMPT,
        createdBy: req.user!.userId,
      })
      .returning();

    res.status(201).json(agent);
  } catch (error) {
    console.error("[Virtual Agents] Error creating agent:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create virtual agent" });
  }
});

const updateVirtualAgentSchema = insertVirtualAgentSchema.partial();

router.patch("/:id", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ message: "Virtual agent not found" });
    }
    
    const parsed = updateVirtualAgentSchema.parse(req.body);
    
    const [updated] = await db
      .update(virtualAgents)
      .set({
        ...parsed,
        updatedAt: new Date(),
      })
      .where(eq(virtualAgents.id, req.params.id))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error("[Virtual Agents] Error updating agent:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update virtual agent" });
  }
});

router.delete("/:id", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const activeAssignments = await db
      .select()
      .from(campaignAgentAssignments)
      .where(
        and(
          eq(campaignAgentAssignments.virtualAgentId, req.params.id),
          eq(campaignAgentAssignments.isActive, true)
        )
      );
    
    if (activeAssignments.length > 0) {
      return res.status(400).json({
        message: "Cannot delete virtual agent with active campaign assignments",
        activeAssignmentCount: activeAssignments.length,
      });
    }
    
    await db
      .delete(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id));
    
    res.json({ message: "Virtual agent deleted successfully" });
  } catch (error) {
    console.error("[Virtual Agents] Error deleting agent:", error);
    res.status(500).json({ message: "Failed to delete virtual agent" });
  }
});

router.get("/:id/assignments", requireAuth, async (req, res) => {
  try {
    const assignments = await db
      .select({
        id: campaignAgentAssignments.id,
        campaignId: campaignAgentAssignments.campaignId,
        campaignName: campaigns.name,
        assignedAt: campaignAgentAssignments.assignedAt,
        isActive: campaignAgentAssignments.isActive,
      })
      .from(campaignAgentAssignments)
      .innerJoin(campaigns, eq(campaigns.id, campaignAgentAssignments.campaignId))
      .where(eq(campaignAgentAssignments.virtualAgentId, req.params.id))
      .orderBy(desc(campaignAgentAssignments.assignedAt));
    
    res.json(assignments);
  } catch (error) {
    console.error("[Virtual Agents] Error fetching assignments:", error);
    res.status(500).json({ message: "Failed to fetch virtual agent assignments" });
  }
});

export default router;
