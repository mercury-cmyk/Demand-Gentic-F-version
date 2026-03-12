/**
 * Global Agent Defaults API
 * 
 * Manages centralized default configuration for all virtual agents.
 * These defaults are automatically applied to new agents unless overridden.
 * ⚠️ DEPRECATION NOTICE:
 * The following knowledge fields are deprecated:
 * - defaultSystemPrompt: No longer used. Prompts now come from Unified Knowledge Hub.
 * - defaultTrainingGuidelines: No longer used. Training comes from Unified Knowledge Hub.
 * - defaultFirstMessage: No longer used. Messages defined in Unified Knowledge Hub.
 * 
 * ACTIVE OPERATIONAL FIELDS:
 * - defaultVoiceProvider: Voice provider for new agents (google/openai)
 * - defaultVoice: Default voice name for new agents
 * - defaultMaxConcurrentCalls: Per-agent concurrent call limit
 * - globalMaxConcurrentCalls: System-wide concurrent call limit
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { agentDefaults } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';

const router = Router();
const LOG_PREFIX = '[AgentDefaults]';

// Default values for new installations
const SYSTEM_DEFAULT_FIRST_MESSAGE = 'Hi, may I speak with {{contact.full_name}}, the {{contact.job_title}} at {{account.name}}?';

const SYSTEM_DEFAULT_PROMPT = `# Personality

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

You should sound present, human, and respectful of the person's time.`;

const SYSTEM_DEFAULT_TRAINING = [
  'Always verify you are speaking with the right person before proceeding',
  'Handle gatekeepers professionally - they are allies, not obstacles',
  'If voicemail is detected, hang up immediately without leaving a message',
  'Listen actively and acknowledge what the prospect says',
  'Ask discovery questions to understand their situation',
  'Handle objections with empathy and understanding',
  'Never make assumptions about their needs or situation',
  'Respect their time - be concise and purposeful',
  'Focus on value and outcomes, not features',
  'End conversations gracefully if they are not interested'
];

/**
 * GET /api/agent-defaults
 * Get the current global agent defaults configuration
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log(`${LOG_PREFIX} Fetching global agent defaults`);

    const [defaults] = await db
      .select()
      .from(agentDefaults)
      .limit(1);

    // If no defaults exist, return system defaults
    if (!defaults) {
      return res.json({
        id: null,
        defaultFirstMessage: SYSTEM_DEFAULT_FIRST_MESSAGE,
        defaultSystemPrompt: SYSTEM_DEFAULT_PROMPT,
        defaultTrainingGuidelines: SYSTEM_DEFAULT_TRAINING,
        defaultVoiceProvider: 'openai',
        defaultVoice: 'ash',
        defaultMaxConcurrentCalls: 100,
        globalMaxConcurrentCalls: 100,
        isSystemDefault: true,
        updatedAt: null,
      });
    }

    res.json({
      ...defaults,
      isSystemDefault: false,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching defaults:`, error);
    res.status(500).json({
      error: 'Failed to fetch agent defaults',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/agent-defaults
 * Update the global agent defaults configuration
 */
router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      defaultFirstMessage,
      defaultSystemPrompt,
      defaultTrainingGuidelines,
      defaultVoiceProvider,
      defaultVoice,
      defaultMaxConcurrentCalls,
      globalMaxConcurrentCalls,
    } = req.body;

    console.log(`${LOG_PREFIX} Updating global agent defaults`);

    // Check if defaults exist
    const [existing] = await db
      .select()
      .from(agentDefaults)
      .limit(1);

    let result;

    if (existing) {
      // Update existing
      [result] = await db
        .update(agentDefaults)
        .set({
          defaultFirstMessage: defaultFirstMessage || SYSTEM_DEFAULT_FIRST_MESSAGE,
          defaultSystemPrompt: defaultSystemPrompt || SYSTEM_DEFAULT_PROMPT,
          defaultTrainingGuidelines: defaultTrainingGuidelines || SYSTEM_DEFAULT_TRAINING,
          defaultVoiceProvider: defaultVoiceProvider || 'openai',
          defaultVoice: defaultVoice || 'ash',
          defaultMaxConcurrentCalls: typeof defaultMaxConcurrentCalls === 'number' ? defaultMaxConcurrentCalls : 100,
          globalMaxConcurrentCalls: typeof globalMaxConcurrentCalls === 'number' ? globalMaxConcurrentCalls : 100,
          updatedAt: new Date(),
        })
        .where(eq(agentDefaults.id, existing.id))
        .returning();
    } else {
      // Create new
      [result] = await db
        .insert(agentDefaults)
        .values({
          defaultFirstMessage: defaultFirstMessage || SYSTEM_DEFAULT_FIRST_MESSAGE,
          defaultSystemPrompt: defaultSystemPrompt || SYSTEM_DEFAULT_PROMPT,
          defaultTrainingGuidelines: defaultTrainingGuidelines || SYSTEM_DEFAULT_TRAINING,
          defaultVoiceProvider: defaultVoiceProvider || 'openai',
          defaultVoice: defaultVoice || 'ash',
          defaultMaxConcurrentCalls: typeof defaultMaxConcurrentCalls === 'number' ? defaultMaxConcurrentCalls : 100,
          globalMaxConcurrentCalls: typeof globalMaxConcurrentCalls === 'number' ? globalMaxConcurrentCalls : 100,
        })
        .returning();
    }

    console.log(`${LOG_PREFIX} Agent defaults updated successfully`);

    res.json({
      ...result,
      isSystemDefault: false,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating defaults:`, error);
    res.status(500).json({
      error: 'Failed to update agent defaults',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/agent-defaults/reset
 * Reset to system defaults
 */
router.post('/reset', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log(`${LOG_PREFIX} Resetting to system defaults`);

    // Delete existing defaults (will fall back to system defaults)
    await db.delete(agentDefaults);

    res.json({
      id: null,
      defaultFirstMessage: SYSTEM_DEFAULT_FIRST_MESSAGE,
      defaultSystemPrompt: SYSTEM_DEFAULT_PROMPT,
      defaultTrainingGuidelines: SYSTEM_DEFAULT_TRAINING,
      defaultVoiceProvider: 'openai',
      defaultVoice: 'ash',
      defaultMaxConcurrentCalls: 100,
      globalMaxConcurrentCalls: 100,
      isSystemDefault: true,
      updatedAt: null,
      message: 'Reset to system defaults successfully',
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error resetting defaults:`, error);
    res.status(500).json({
      error: 'Failed to reset defaults',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
