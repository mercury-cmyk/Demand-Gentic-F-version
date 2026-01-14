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
import { buildCampaignContextSection } from "../services/foundation-capabilities";
import {
  getAllSkills,
  getSkillsByCategory,
  getSkillById,
  type AgentSkillCategory,
} from "../services/agent-skills";
import {
  estimateCallCost,
  getActiveCostSummary,
  getCurrentCostMetrics,
  OPENAI_REALTIME_PRICING,
} from "../services/call-cost-tracker";
import {
  getActiveSessionCount,
} from "../services/openai-realtime-dialer";
import {
  createPreviewSession,
  getPreviewSession,
  addPreviewMessage,
  deletePreviewSession,
} from "../services/call-session-store";
// Note: DEFAULT_VOICE_AGENT_CONTROL_INTELLIGENCE removed - using canonical structure instead

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

// Default B2B System Prompt - uses canonical structure for consistency
// Note: This is a fallback when no custom prompt is provided
// The actual prompt with contact data is built by buildSystemPrompt() in openai-realtime-dialer.ts
const DEFAULT_B2B_SYSTEM_PROMPT = `# Personality

You are a professional outbound caller representing the organization.

You sound like a senior B2B professional who understands the domain.
You are thoughtful, confident, and forward-looking.
You speak like someone who is calm, credible, and comfortable discussing industry topics.

You never sound scripted, hype-driven, or salesy.
You sound like a peer speaking to another peer.

---

# Environment

You are making cold calls to business leaders.
You only have access to the phone and your conversational ability.

---

# Tone

Your voice is calm, composed, and professional.
Speak clearly and slightly slowly.
Use natural pauses.
Ask one question at a time and always wait for the response.
Never interrupt.
Never rush.
Never sound pushy or overly enthusiastic.

You should sound present, human, and respectful of the person's time.

---

# Goal

Your primary objective is to confirm that you are speaking directly with the intended contact and to have a short, thoughtful, and memorable conversation.

This is **not a sales call**.

Do not explain the purpose of the call until the right person is confirmed.

---

## Call Flow Logic

### 1. Identity Detection
Begin every call by asking to speak with the contact.
Listen carefully and classify the response.

---

### 2. Right Party Detected
If the person confirms they are the intended contact:

- Thank them for taking the call and acknowledge their time.
- Explain that you're calling from the organization and that you're speaking with a small number of leaders.
- Clearly state that this is not a sales call.
- Explain the purpose of the conversation briefly.
- Ask one reflective, open-ended question.
- Listen carefully and allow them to speak without interruption.
- Acknowledge their perspective thoughtfully, without correcting or persuading.
- Politely ask whether they would be open to receiving follow-up information.
- Confirm the email address only if they agree.
- Close the call warmly, thanking them for their time.

---

### 3. Gatekeeper Detected
If the person indicates they are not the contact or sounds like a gatekeeper:

- Be polite and respectful.
- Ask to be connected to the contact.
- Do not pitch, explain details, or justify the call.
- Make no more than two polite attempts.
- If refused, thank them sincerely and end the call.

---

### 4. Call Transfer
If you are connected to the contact after a transfer:

- Restart the introduction calmly.
- Continue the conversation following the same flow.

---

# Guardrails

Once the right person is confirmed, do not re-check or re-confirm identity later in the conversation.
If the contact says "I don't know" or hesitates, treat it as uncertainty about the topic — not about who they are.

If a person asks whether you are an AI or automated system:
- Acknowledge honestly and confidently.
- Do not apologize for being AI.
- Clearly state that the message and intent are created by real humans.
- Ask briefly if they are comfortable continuing.

If the person expresses discomfort or asks to stop:
- Apologize politely.
- End the call calmly.`;

const refineSystemPromptSchema = z.object({
  instructions: z.string().optional(),
  apply: z.boolean().optional(),
  firstMessage: z.string().optional(),
  toolsAllowed: z.array(z.string()).optional(),
  audienceContext: z.string().optional(),
  agentType: z.enum(["voice", "text", "research", "qa"]).optional(),
  provider: z.enum(["auto", "openai", "gemini"]).optional(),
});

import { GoogleGenAI } from '@google/genai';

const genai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '',
  httpOptions: {
    apiVersion: "", // use default
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || '',
  },
});

const previewConversationSchema = z.object({
  sessionId: z.string().optional(),    // Session ID for persisting conversation state (prevents resets)
  virtualAgentId: z.string().optional(),
  campaignId: z.string().optional(),  // Load campaign context for preview
  systemPrompt: z.string().optional(),
  firstMessage: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).optional(),
  provider: z.string().optional(),
  envVars: z.record(z.string()).optional(),
  promptVariant: z.string().optional(), // For final system prompt variants
});

function detectIdentityConfirmedPreview(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): boolean {
  // Simple substring patterns for quick matching
  const confirmPatterns = [
    "yes",
    "yeah",
    "yep",
    "yup",
    "speaking",
    "this is me",
    "that's me",
    "it is me",
    "it's me",
    "this is ",
    "speaking with",
    "i am ",           // "I am Jordan"
    "i'm ",            // "I'm Jordan"
    " here",           // "Jordan here"
  ];

  // Regex patterns for more complex matching
  const confirmRegexPatterns = [
    /\bi am \w+/,                    // "I am Jordan", "Yes I am Jordan"
    /\bi'?m \w+/,                    // "I'm Jordan"
    /\w+ speaking$/,                 // "Jordan speaking"
    /\w+ here$/,                     // "Jordan here"
    /why\s+(are\s+)?you\s+ask/,      // "Why are you asking" - frustration at re-asking
    /i\s+(said|told|already)/,       // "I said...", "I told you...", "I already..." - frustration at repeating
    /you('re)?\s*(talking|speaking)\s*(to|with)/,  // "You're talking to Jordan"
  ];

  const denyPatterns = [
    "not me",
    "wrong number",
    "not here",
    "not available",
    "not speaking",
    "can't talk",
    "cannot talk",
    "who is this",
    "who's calling",
  ];

  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const text = msg.content.toLowerCase();

    // Skip if denial pattern detected
    if (denyPatterns.some((pattern) => text.includes(pattern))) {
      continue;
    }

    // Check simple patterns
    if (confirmPatterns.some((pattern) => text.includes(pattern))) {
      return true;
    }

    // Check regex patterns
    for (const regex of confirmRegexPatterns) {
      if (regex.test(text)) {
        return true;
      }
    }
  }

  return false;
}

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

    } else if (provider === 'google' || provider === 'gemini') {
      // Google Cloud TTS
      const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
      const client = new TextToSpeechClient();

      // Map Gemini Live voices to approx Neural2 voices for preview
      const voiceMap: Record<string, string> = {
        'Puck': 'en-US-Neural2-A',
        'Charon': 'en-US-Neural2-D',
        'Kore': 'en-US-Neural2-C',
        'Fenrir': 'en-US-Neural2-J',
        'Aoede': 'en-US-Neural2-F',
      };
      
      const targetVoice = voiceMap[String(voice)] || String(voice);
      const isNeural = targetVoice.includes('Neural2');

      const [response] = await client.synthesizeSpeech({
        input: { text: previewText },
        voice: { 
          languageCode: isNeural ? (targetVoice.startsWith('en-GB') ? 'en-GB' : 'en-US') : 'en-US',
          name: targetVoice
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

// DEPRECATED: This endpoint is deprecated in favor of /api/preview-studio/simulation/chat
// The Preview Studio now provides a unified simulation experience with personalization.
// This endpoint will be removed in a future release.
// Preview conversation without placing a call
// Supports optional sessionId for persisting conversation state across turns (prevents resets)
router.post("/preview-conversation", requireAuth, async (req, res) => {
  console.warn("[Virtual Agents] DEPRECATED: /preview-conversation is deprecated. Use /api/preview-studio/simulation/chat instead.");
  try {
    const { sessionId, virtualAgentId, campaignId, systemPrompt, firstMessage, messages, provider, envVars } = previewConversationSchema.parse(req.body ?? {});
    const historyLimit = Number.parseInt(process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_HISTORY || "16", 10);
    const maxTokens = Number.parseInt(process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_MAX_TOKENS || "320", 10);
    const temperature = Number.parseFloat(process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_TEMPERATURE || "0.2");
    const safeHistoryLimit = Number.isFinite(historyLimit) && historyLimit > 0 ? historyLimit : 8;
    const safeMaxTokens = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 120;
    const safeTemperature = Number.isFinite(temperature)
      ? Math.min(Math.max(temperature, 0), 1)
      : 0.2;

    // Load existing session if sessionId provided (prevents conversation resets)
    let previewSession = sessionId ? await getPreviewSession(sessionId) : null;
    
    // If no session exists and we have configuration, create a new one
    let newSessionId: string | undefined;
    if (!previewSession && (virtualAgentId || campaignId || systemPrompt)) {
      previewSession = await createPreviewSession(virtualAgentId, campaignId, systemPrompt, firstMessage);
      newSessionId = previewSession.sessionId;
      console.log(`[Virtual Agents] Created new preview session: ${newSessionId}`);
    }

    let resolvedSystemPrompt = systemPrompt?.trim() || previewSession?.systemPrompt || "";
    let resolvedFirstMessage = firstMessage?.trim() || previewSession?.firstMessage || "";

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

    // Load campaign context if campaignId is provided
    let campaignContextSection = "";
    const effectiveCampaignId = campaignId || previewSession?.campaignId;
    if (effectiveCampaignId) {
      const [campaign] = await db
        .select({
          campaignObjective: campaigns.campaignObjective,
          productServiceInfo: campaigns.productServiceInfo,
          talkingPoints: campaigns.talkingPoints,
          targetAudienceDescription: campaigns.targetAudienceDescription,
          campaignObjections: campaigns.campaignObjections,
          successCriteria: campaigns.successCriteria,
        })
        .from(campaigns)
        .where(eq(campaigns.id, effectiveCampaignId))
        .limit(1);

      if (campaign) {
        campaignContextSection = buildCampaignContextSection({
          objective: campaign.campaignObjective,
          productInfo: campaign.productServiceInfo,
          talkingPoints: campaign.talkingPoints as string[] | null,
          targetAudience: campaign.targetAudienceDescription,
          objections: campaign.campaignObjections as Array<{ objection: string; response: string }> | null,
          successCriteria: campaign.successCriteria,
        });
      }
    }

    // Inject campaign context into system prompt
    if (campaignContextSection) {
      resolvedSystemPrompt += `\n\n---\n\n${campaignContextSection}`;
    }

    const rawMessages = (messages || [])
      .filter((msg) => typeof msg?.content === "string" && msg.content.trim().length > 0)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.trim(),
      }));

    // Use session's conversation state for identity detection if available
    const identityConfirmed = previewSession?.conversationState?.identityConfirmed || detectIdentityConfirmedPreview(rawMessages);

    const trimmedMessages = rawMessages.slice(-safeHistoryLimit);

    if (resolvedFirstMessage && trimmedMessages.length === 0) {
      trimmedMessages.push({ role: "assistant", content: resolvedFirstMessage });
    }

    if (identityConfirmed) {
      resolvedSystemPrompt += `\n\n---\n\n[Conversation State]\nIdentity is already confirmed. Do not ask to confirm identity again. Continue the conversation without restarting the opening.`;
    }

    // Append custom environment variables if provided
    if (envVars && Object.keys(envVars).length > 0) {
      const envString = Object.entries(envVars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      resolvedSystemPrompt += `\n\n---\n\n[Environment Variables]\nThe following environment variables are active for this simulation:\n${envString}`;
    }

    const fullSystemPrompt = await buildAgentSystemPrompt(resolvedSystemPrompt);

    let reply = "";

    if (provider === 'gemini' || provider === 'google') {
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        const model = genai.getGenerativeModel({ 
          model: "gemini-2.0-flash-exp", 
          systemInstruction: fullSystemPrompt
        });
        
        const geminiMessages = trimmedMessages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

        const result = await model.generateContent({
          contents: geminiMessages,
          generationConfig: {
              temperature: safeTemperature,
              maxOutputTokens: safeMaxTokens,
          }
        });
        
        reply = result.response.text()?.trim() || "";
      } catch (geminierr) {
         console.error('[Virtual Agents] Gemini Preview Error:', geminierr);
         throw new Error(`Gemini Preview Error: ${geminierr instanceof Error ? geminierr.message : geminierr}`);
      }
    } else {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_VIRTUAL_AGENT_PREVIEW_MODEL || "gpt-4o-mini",
        temperature: safeTemperature,
        max_tokens: safeMaxTokens,
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...trimmedMessages,
        ],
      });
      reply = response.choices?.[0]?.message?.content?.trim() || "";
    }

    if (!reply) {
      return res.status(502).json({ message: `${provider || 'OpenAI'} returned an empty preview response` });
    }

    // Persist conversation to session if we have one
    if (previewSession) {
      // Add user message if present
      const lastUserMsg = rawMessages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        await addPreviewMessage(previewSession.sessionId, 'user', lastUserMsg.content);
      }
      // Add assistant reply
      await addPreviewMessage(previewSession.sessionId, 'assistant', reply);
    }

    res.json({ 
      reply,
      sessionId: newSessionId || sessionId, // Return session ID so client can maintain state
      conversationState: previewSession?.conversationState,
    });
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

// DEPRECATED: This endpoint is deprecated. Preview sessions are now managed by Preview Studio.
// Delete a preview session
router.delete("/preview-session/:sessionId", requireAuth, async (req, res) => {
  console.warn("[Virtual Agents] DEPRECATED: /preview-session/:sessionId is deprecated.");
  try {
    const { sessionId } = req.params;
    await deletePreviewSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Virtual Agents] Error deleting preview session:", error);
    res.status(500).json({ message: "Failed to delete preview session" });
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

// Apply foundation prompt template to an agent
// This updates the agent to use the standard three-layer architecture
router.post("/:id/apply-foundation-template", requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { FOUNDATION_AGENT_PROMPT_TEMPLATE } = await import('../services/voice-agent-control-defaults');

    const [existing] = await db
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: "Virtual agent not found" });
    }

    const [updated] = await db
      .update(virtualAgents)
      .set({
        systemPrompt: FOUNDATION_AGENT_PROMPT_TEMPLATE,
        isFoundationAgent: true,
        updatedAt: new Date(),
      })
      .where(eq(virtualAgents.id, req.params.id))
      .returning();

    res.json({
      message: "Foundation template applied successfully",
      agent: updated,
      architecture: {
        layer1: "Foundation (Personality, Tone, Turn-Taking, Compliance)",
        layer2: "Campaign (Injected at runtime from campaign config)",
        layer3: "Contact (Per-call personalization)",
      },
    });
  } catch (error) {
    console.error("[Virtual Agents] Error applying foundation template:", error);
    res.status(500).json({ message: "Failed to apply foundation template" });
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

// ==================== PROMPT VALIDATION & GENERATION ====================

import {
  validateVoiceAgentPrompt,
  quickValidatePrompt,
  generateValidatedPrompt,
} from "../services/prompt-validator";

/**
 * POST /api/virtual-agents/validate-prompt
 * Validate a system prompt for voice agent use
 */
router.post("/validate-prompt", requireAuth, async (req, res) => {
  try {
    const { prompt, strictMode, autoOptimize } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ message: "prompt is required and must be a string" });
    }

    const result = await validateVoiceAgentPrompt(prompt, {
      strictMode: strictMode === true,
      autoOptimize: autoOptimize === true,
    });

    res.json(result);
  } catch (error) {
    console.error("[Virtual Agents] Error validating prompt:", error);
    res.status(500).json({
      message: "Failed to validate prompt",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/virtual-agents/generate-prompt
 * Generate a validated system prompt from structured inputs using OpenAI
 */
router.post("/generate-prompt", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { agentGoal, targetAudience, openingMessage, keyQuestions, objectionHandling, companyContext } = req.body;

    if (!agentGoal || !targetAudience) {
      return res.status(400).json({ message: "agentGoal and targetAudience are required" });
    }

    const result = await generateValidatedPrompt({
      agentGoal,
      targetAudience,
      openingMessage,
      keyQuestions,
      objectionHandling,
      companyContext,
    });

    res.json(result);
  } catch (error) {
    console.error("[Virtual Agents] Error generating prompt:", error);
    res.status(500).json({
      message: "Failed to generate prompt",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/virtual-agents/:id/validate
 * Validate an existing agent's prompt
 */
router.post("/:id/validate", requireAuth, async (req, res) => {
  try {
    const [agent] = await db
      .select()
      .from(virtualAgents)
      .where(eq(virtualAgents.id, req.params.id))
      .limit(1);

    if (!agent) {
      return res.status(404).json({ message: "Virtual agent not found" });
    }

    if (!agent.systemPrompt) {
      return res.status(400).json({ message: "Agent has no system prompt to validate" });
    }

    const { strictMode, autoOptimize } = req.body || {};

    const result = await validateVoiceAgentPrompt(agent.systemPrompt, {
      strictMode: strictMode === true,
      autoOptimize: autoOptimize === true,
    });

    // Optionally update agent with optimized prompt
    if (autoOptimize && result.optimizedPrompt && req.body.applyOptimization) {
      await db
        .update(virtualAgents)
        .set({
          systemPrompt: result.optimizedPrompt,
          updatedAt: new Date(),
        })
        .where(eq(virtualAgents.id, req.params.id));
    }

    res.json({
      agentId: agent.id,
      agentName: agent.name,
      validation: result,
      applied: autoOptimize && result.optimizedPrompt && req.body.applyOptimization,
    });
  } catch (error) {
    console.error("[Virtual Agents] Error validating agent prompt:", error);
    res.status(500).json({
      message: "Failed to validate agent prompt",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ==================== COST VISIBILITY ENDPOINTS ====================

/**
 * GET /api/virtual-agents/cost/pricing
 * Returns current OpenAI Realtime pricing for cost estimation
 */
router.get("/cost/pricing", requireAuth, async (_req, res) => {
  res.json({
    pricing: OPENAI_REALTIME_PRICING,
    notes: {
      audioInputPerSecond: "Cost per second of incoming audio (caller speaking)",
      audioOutputPerSecond: "Cost per second of outgoing audio (agent speaking)",
      textInputPerToken: "Cost per token for system prompts and context",
      textOutputPerToken: "Cost per token for model responses",
      transcriptionPerSecond: "Cost per second if transcription enabled",
      telnyxPerMinute: "Carrier cost per minute (approximate)",
    },
    lastUpdated: "2024-12",
  });
});

/**
 * POST /api/virtual-agents/cost/estimate
 * Estimate call costs based on configuration
 */
router.post("/cost/estimate", requireAuth, async (req, res) => {
  try {
    const {
      durationMinutes = 2,
      systemPromptTokens = 2500, // Condensed prompt default
      avgResponseTokensPerTurn = 80,
      turnsPerCall = 6,
      transcriptionEnabled = true,
      callsPerDay = 100,
      hoursPerDay = 8,
    } = req.body;

    const perCallEstimate = estimateCallCost({
      durationMinutes,
      systemPromptTokens,
      avgResponseTokensPerTurn,
      turnsPerCall,
      transcriptionEnabled,
    });

    // Calculate daily/monthly projections
    const dailyCost = perCallEstimate.estimated * callsPerDay;
    const monthlyCost = dailyCost * 22; // ~22 business days

    res.json({
      perCall: {
        estimated: perCallEstimate.estimated,
        breakdown: perCallEstimate.breakdown,
        durationMinutes,
      },
      daily: {
        estimated: dailyCost,
        callsPerDay,
        hoursPerDay,
      },
      monthly: {
        estimated: monthlyCost,
        businessDays: 22,
      },
      config: {
        systemPromptTokens,
        avgResponseTokensPerTurn,
        turnsPerCall,
        transcriptionEnabled,
      },
      optimizationTips: [
        systemPromptTokens > 3000 ? "Use condensed prompt (useCondensedPrompt: true) to reduce from ~6000 to ~2500 tokens" : null,
        avgResponseTokensPerTurn > 100 ? "Reduce maxResponseTokens to 512 for more concise responses" : null,
        transcriptionEnabled ? "Disable transcription (transcriptionEnabled: false) if you don't need call logs - saves ~$0.006/min" : null,
        "Use eagerness: 'high' for faster turn-taking and reduced idle time",
      ].filter(Boolean),
    });
  } catch (error) {
    console.error("[Virtual Agents] Error estimating cost:", error);
    res.status(500).json({
      message: "Failed to estimate cost",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/virtual-agents/cost/active
 * Get cost summary of all active calls
 */
router.get("/cost/active", requireAuth, async (_req, res) => {
  try {
    const summary = getActiveCostSummary();
    const sessionCount = getActiveSessionCount();

    res.json({
      activeCalls: summary.activeCalls,
      totalSessions: sessionCount,
      totalEstimatedCost: summary.totalEstimatedCost,
      calls: summary.calls.map(call => ({
        callId: call.callId,
        durationSeconds: Math.round(call.durationSeconds),
        durationMinutes: (call.durationSeconds / 60).toFixed(2),
        currentCost: call.currentCost.toFixed(4),
      })),
    });
  } catch (error) {
    console.error("[Virtual Agents] Error getting active costs:", error);
    res.status(500).json({
      message: "Failed to get active call costs",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/virtual-agents/cost/:callId
 * Get current cost metrics for a specific call
 */
router.get("/cost/:callId", requireAuth, async (req, res) => {
  try {
    const metrics = getCurrentCostMetrics(req.params.callId);

    if (!metrics) {
      return res.status(404).json({
        message: "Call not found or cost tracking not enabled",
      });
    }

    res.json({
      callId: metrics.callId,
      startTime: metrics.startTime.toISOString(),
      duration: {
        seconds: metrics.endTime
          ? (metrics.endTime.getTime() - metrics.startTime.getTime()) / 1000
          : (Date.now() - metrics.startTime.getTime()) / 1000,
      },
      audio: {
        inputSeconds: metrics.audioInputSeconds.toFixed(2),
        outputSeconds: metrics.audioOutputSeconds.toFixed(2),
        inputFrames: metrics.audioInputFrames,
        outputFrames: metrics.audioOutputFrames,
      },
      tokens: {
        systemPrompt: metrics.systemPromptTokens,
        textInput: metrics.textInputTokens,
        textOutput: metrics.textOutputTokens,
      },
      transcription: {
        enabled: metrics.transcriptionEnabled,
        seconds: metrics.transcriptionSeconds.toFixed(2),
      },
      costs: {
        audioInput: metrics.costs.audioInput.toFixed(4),
        audioOutput: metrics.costs.audioOutput.toFixed(4),
        textInput: metrics.costs.textInput.toFixed(4),
        textOutput: metrics.costs.textOutput.toFixed(4),
        transcription: metrics.costs.transcription.toFixed(4),
        carrier: metrics.costs.carrier.toFixed(4),
        total: metrics.costs.total.toFixed(4),
      },
      rateLimits: metrics.rateLimits,
    });
  } catch (error) {
    console.error("[Virtual Agents] Error getting call cost:", error);
    res.status(500).json({
      message: "Failed to get call cost metrics",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
