/**
 * Agent Prompt Visibility API Routes
 *
 * Endpoints for viewing runtime prompts used by different agent types:
 * - Email Agents (DeepSeek, OpenAI)
 * - Research/Reasoning Agents (OpenAI, Gemini, Claude, DeepSeek)
 *
 * These routes provide transparency into what prompts are sent to each AI provider.
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import {
  buildEmailAgentPrompts,
  buildResearchAgentPrompts,
  buildVoiceAgentPrompts,
  getEmailAgentPrompt,
  getResearchAgentPrompt,
  getVoiceAgentPrompt,
  type EmailAgentProvider,
  type ResearchAgentProvider,
  type VoiceAgentProvider,
} from "../services/agent-prompt-visibility-service";

const router = Router();

// ==================== EMAIL AGENT PROMPTS ====================

/**
 * GET /api/agent-prompts/email
 * Get all email agent prompts for all providers
 */
router.get("/email", requireAuth, async (req, res) => {
  try {
    const { accountId, campaignId, prompt, companyName, industry, targetAudience } = req.query;

    const prompts = await buildEmailAgentPrompts({
      accountId: accountId as string | undefined,
      campaignId: campaignId as string | undefined,
      prompt: prompt as string | undefined,
      companyName: companyName as string | undefined,
      industry: industry as string | undefined,
      targetAudience: targetAudience as string | undefined,
    });

    res.json({
      success: true,
      ...prompts,
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /email error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent-prompts/email/:provider
 * Get email agent prompt for a specific provider
 */
router.get("/email/:provider", requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { accountId, campaignId, prompt } = req.query;

    const validProviders: EmailAgentProvider[] = ['deepseek', 'openai'];
    if (!validProviders.includes(provider as EmailAgentProvider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
      });
    }

    const promptPreview = await getEmailAgentPrompt(provider as EmailAgentProvider, {
      accountId: accountId as string | undefined,
      campaignId: campaignId as string | undefined,
      prompt: prompt as string | undefined,
    });

    res.json({
      success: true,
      prompt: promptPreview,
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /email/:provider error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RESEARCH AGENT PROMPTS ====================

/**
 * GET /api/agent-prompts/research
 * Get all research agent prompts for all providers
 */
router.get("/research", requireAuth, async (req, res) => {
  try {
    const { organizationName, websiteUrl, industry, accountId } = req.query;

    const prompts = await buildResearchAgentPrompts({
      organizationName: organizationName as string | undefined,
      websiteUrl: websiteUrl as string | undefined,
      industry: industry as string | undefined,
      accountId: accountId as string | undefined,
    });

    res.json({
      success: true,
      ...prompts,
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /research error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent-prompts/research/:provider
 * Get research agent prompt for a specific provider
 */
router.get("/research/:provider", requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { organizationName, websiteUrl, industry, accountId } = req.query;

    const validProviders: ResearchAgentProvider[] = ['openai', 'gemini', 'claude', 'deepseek'];
    if (!validProviders.includes(provider as ResearchAgentProvider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
      });
    }

    const promptPreview = await getResearchAgentPrompt(provider as ResearchAgentProvider, {
      organizationName: organizationName as string | undefined,
      websiteUrl: websiteUrl as string | undefined,
      industry: industry as string | undefined,
      accountId: accountId as string | undefined,
    });

    res.json({
      success: true,
      prompt: promptPreview,
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /research/:provider error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VOICE AGENT PROMPTS ====================

/**
 * GET /api/agent-prompts/voice
 * Get all voice agent prompts for all providers (OpenAI, Gemini)
 */
router.get("/voice", requireAuth, async (req, res) => {
  try {
    const { agentId, useCondensed } = req.query;

    const prompts = await buildVoiceAgentPrompts({
      agentId: agentId as string | undefined,
      useCondensed: useCondensed !== 'false',
    });

    res.json({
      success: true,
      ...prompts,
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /voice error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent-prompts/voice/:provider
 * Get voice agent prompt for a specific provider (openai or gemini)
 */
router.get("/voice/:provider", requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { agentId, useCondensed } = req.query;

    const validProviders: VoiceAgentProvider[] = ['openai', 'gemini'];
    if (!validProviders.includes(provider as VoiceAgentProvider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`,
      });
    }

    const promptPreview = await getVoiceAgentPrompt(provider as VoiceAgentProvider, {
      agentId: agentId as string | undefined,
      useCondensed: useCondensed !== 'false',
    });

    res.json({
      success: true,
      prompt: promptPreview,
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /voice/:provider error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COMBINED VIEW ====================

/**
 * GET /api/agent-prompts/all
 * Get all agent prompts for all agent types and providers
 */
router.get("/all", requireAuth, async (req, res) => {
  try {
    const { accountId, campaignId, organizationName, websiteUrl, industry, agentId } = req.query;

    const [emailPrompts, researchPrompts, voicePrompts] = await Promise.all([
      buildEmailAgentPrompts({
        accountId: accountId as string | undefined,
        campaignId: campaignId as string | undefined,
        industry: industry as string | undefined,
      }),
      buildResearchAgentPrompts({
        organizationName: organizationName as string | undefined,
        websiteUrl: websiteUrl as string | undefined,
        industry: industry as string | undefined,
        accountId: accountId as string | undefined,
      }),
      buildVoiceAgentPrompts({
        agentId: agentId as string | undefined,
      }),
    ]);

    res.json({
      success: true,
      agentTypes: {
        email: emailPrompts,
        research: researchPrompts,
        voice: voicePrompts,
      },
      assembledAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /all error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent-prompts/providers
 * List available providers for each agent type
 */
router.get("/providers", requireAuth, async (_req, res) => {
  try {
    res.json({
      success: true,
      providers: {
        email: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            model: 'deepseek-chat',
            description: 'Email content generation and improvement',
            capabilities: ['generate', 'improve', 'subject_variants', 'analyze'],
          },
          {
            id: 'openai',
            name: 'OpenAI',
            model: 'gpt-4o-mini',
            description: 'Email analysis and rewriting',
            capabilities: ['analyze', 'rewrite'],
          },
        ],
        research: [
          {
            id: 'openai',
            name: 'OpenAI',
            model: process.env.ORG_RESEARCH_MODEL || 'gpt-4o',
            description: 'Organization intelligence extraction',
            capabilities: ['research', 'extract', 'analyze'],
          },
          {
            id: 'gemini',
            name: 'Google Gemini',
            model: process.env.VERTEX_REASONING_MODEL || 'gemini-2.0-flash-thinking-exp-01-21',
            description: 'Deep reasoning and chain-of-thought analysis',
            capabilities: ['reason', 'analyze', 'synthesize'],
          },
          {
            id: 'claude',
            name: 'Anthropic Claude',
            model: process.env.ORG_INTELLIGENCE_CLAUDE_MODEL || 'claude-3-sonnet-20240229',
            description: 'Multi-model synthesis and conflict resolution',
            capabilities: ['synthesize', 'resolve_conflicts', 'validate'],
          },
          {
            id: 'deepseek',
            name: 'DeepSeek',
            model: 'deepseek-chat',
            description: 'Market research and competitive intelligence',
            capabilities: ['market_research', 'competitor_analysis', 'pricing'],
          },
        ],
        voice: [
          {
            id: 'openai',
            name: 'OpenAI Realtime',
            model: 'gpt-realtime',
            description: 'Real-time voice conversations with OpenAI (most natural speech)',
            capabilities: ['voice_call', 'realtime', 'turn_detection', 'natural_speech'],
          },
          {
            id: 'gemini',
            name: 'Google Gemini Live',
            model: 'gemini-3-flash',
            description: 'Real-time voice conversations with Gemini 3 Flash Native Audio (30 HD voices)',
            capabilities: ['voice_call', 'realtime', 'multimodal', 'affective_dialog'],
          },
        ],
      },
    });
  } catch (error: any) {
    console.error("[AgentPromptVisibility] GET /providers error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
