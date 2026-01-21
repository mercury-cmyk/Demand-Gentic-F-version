/**
 * Voice Agent Configuration Types
 *
 * These types define the structure for voice agent personality, conversation flow,
 * and behavior configuration that can be managed through the UI.
 *
 * Based on OpenAI Voice Agents Guide best practices:
 * https://platform.openai.com/docs/guides/voice-agents
 */

/**
 * Personality and Tone Configuration
 * Defines how the agent sounds and behaves during conversations
 */
export type VoicePersonalityConfig = {
  /** Who or what the AI represents (e.g., friendly teacher, formal advisor) */
  identity: string;

  /** What is the agent expected to do at a high level */
  task: string;

  /** Overall attitude or disposition (e.g., patient, upbeat, serious, empathetic) */
  demeanor: string;

  /** Voice style (e.g., warm and conversational, polite and authoritative) */
  tone: string;

  /** Degree of energy in responses */
  enthusiasmLevel: 'very-low' | 'low' | 'moderate' | 'high' | 'very-high';

  /** Casual vs. professional language */
  formalityLevel: 'very-casual' | 'casual' | 'balanced' | 'professional' | 'very-professional';

  /** How emotionally expressive or neutral the AI should be */
  emotionLevel: 'neutral' | 'slightly-expressive' | 'expressive' | 'very-expressive';

  /** Filler word usage frequency */
  fillerWords: 'none' | 'rarely' | 'occasionally' | 'often' | 'very-often';

  /** Rhythm and speed of delivery */
  pacing: 'very-slow' | 'slow' | 'moderate' | 'fast' | 'very-fast';

  /** Any other personality details */
  additionalDetails?: string;
};

/**
 * Conversation State Definition
 * Defines structured conversation flows with states and transitions
 */
export type ConversationState = {
  /** Unique identifier for this state */
  id: string;

  /** Human-readable description of what happens in this state */
  description: string;

  /** Step-by-step instructions for the agent in this state */
  instructions: string[];

  /** Example phrases or responses the agent might use */
  examples: string[];

  /** Possible transitions to other states */
  transitions: {
    nextStep: string;
    condition: string;
  }[];
};

/**
 * Filler Words Configuration
 * Controls when and how the agent uses filler words
 */
export type FillerWordsConfig = {
  /** Overall frequency */
  frequency: 'none' | 'rarely' | 'occasionally' | 'often' | 'very-often';

  /** When to use filler words */
  useWhen: {
    processingComplexInfo: boolean;
    consideringResponse: boolean;
    expressing

Empathy: boolean;
    transitioning: boolean;
  };

  /** When NOT to use filler words */
  avoidWhen: {
    identityVerification: boolean;
    keyInformationDelivery: boolean;
    closingStatements: boolean;
    transferHandoff: boolean;
  };

  /** Custom instructions for filler word usage */
  customInstructions?: string;
};

/**
 * Enhanced Agent Handoff Configuration
 * Defines how the agent handles transfers to human agents or specialized AI agents
 */
export type AgentHandoffConfig = {
  /** Whether handoff capability is enabled */
  enabled: boolean;

  /** Available destination agents */
  destinations: {
    id: string;
    name: string;
    description: string;
    specializesIn: string[];
    /** When to transfer to this agent */
    transferCriteria: string;
  }[];

  /** Context to capture during handoff */
  contextFields: {
    rationale: boolean;
    conversationSummary: boolean;
    prospectSentiment: boolean;
    urgency: boolean;
    keyTopics: boolean;
    attemptedResolution: boolean;
  };

  /** Pre-transfer message template */
  preTransferMessage?: string;

  /** Post-transfer fallback message if transfer fails */
  transferFailureMessage?: string;
};

/**
 * Complete Voice Agent Configuration
 * Combines all configuration aspects into a single structure
 * stored in the virtualAgents.settings JSONB field
 */
export type VoiceAgentSettings = {
  /** Personality and tone configuration */
  personality?: VoicePersonalityConfig;

  /** Structured conversation states (optional - for guided flows) */
  conversationStates?: ConversationState[];

  /** Filler words configuration */
  fillerWords?: FillerWordsConfig;

  /** Agent handoff configuration */
  handoff?: AgentHandoffConfig;

  /** Advanced system tools settings */
  systemTools?: {
    endConversation: boolean;
    detectLanguage: boolean;
    skipTurn: boolean;
    transferToAgent: boolean;
    transferToNumber: boolean;
    playKeypadTouchTone: boolean;
    voicemailDetection: boolean;
  };

  /** Advanced conversation settings */
  advanced?: {
    asr: {
      model: 'default' | 'scribe_realtime';
      inputFormat: 'pcm_16000';
      keywords: string;
      transcriptionEnabled: boolean;
    };
    conversational: {
      eagerness: 'low' | 'normal' | 'high';
      takeTurnAfterSilenceSeconds: number;
      endConversationAfterSilenceSeconds: number;
      maxConversationDurationSeconds: number;
    };
    softTimeout: {
      responseTimeoutSeconds: number;
    };
    clientEvents: {
      audio: boolean;
      interruption: boolean;
      userTranscript: boolean;
      agentResponse: boolean;
      agentResponseCorrection: boolean;
    };
    privacy: {
      noPiiLogging: boolean;
      retentionDays: number;
    };
    costOptimization: {
      maxResponseTokens: number;
      useCondensedPrompt: boolean;
      enableCostTracking: boolean;
    };
  };
};

/**
 * Default personality configuration
 */
export const DEFAULT_VOICE_PERSONALITY: VoicePersonalityConfig = {
  identity: "You are a professional B2B calling assistant representing DemandGentic.ai By Pivotal B2B.",
  task: "Have focused, outcome-driven conversations with business leaders to clearly explain why you're calling, respect their time, and identify qualified leads or clean disqualifications.",
  demeanor: "Calm, confident, and consultative. Never vague or rambling.",
  tone: "Clear, direct, and professional — friendly but not casual.",
  enthusiasmLevel: 'moderate',
  formalityLevel: 'professional',
  emotionLevel: 'expressive',
  // Minimize verbal tics like "um" and "uh" by default
  fillerWords: 'rarely',
  pacing: 'moderate',
};

/**
 * Default filler words configuration
 */
export const DEFAULT_FILLER_WORDS_CONFIG: FillerWordsConfig = {
  // Global policy: very light use of fillers to keep speech crisp
  frequency: 'rarely',
  useWhen: {
    // Allow a brief, natural filler only when genuinely processing something complex
    processingComplexInfo: true,
    consideringResponse: false,
    expressingEmpathy: false,
    transitioning: false,
  },
  avoidWhen: {
    // Absolutely no fillers when delivering value, answering "why are you calling?",
    // confirming identity, or closing for next steps
    identityVerification: true,
    keyInformationDelivery: true,
    closingStatements: true,
    transferHandoff: true,
  },
  customInstructions: "Keep your speech clean and confident. Do not stack fillers (like 'um, uh') and never start a sentence with a filler word.",
};

/**
 * Default handoff configuration
 */
export const DEFAULT_HANDOFF_CONFIG: AgentHandoffConfig = {
  enabled: true,
  destinations: [
    {
      id: 'human_agent',
      name: 'Human Agent',
      description: 'Transfer to a live human representative',
      specializesIn: ['Complex situations', 'Escalations', 'Detailed technical questions'],
      transferCriteria: 'User explicitly requests human agent OR situation is beyond AI scope OR user is frustrated',
    },
  ],
  contextFields: {
    rationale: true,
    conversationSummary: true,
    prospectSentiment: true,
    urgency: true,
    keyTopics: true,
    attemptedResolution: true,
  },
  preTransferMessage: "I understand. Let me connect you with someone who can help. Just a moment please.",
  transferFailureMessage: "I apologize, but I'm unable to connect you at this moment. May I take your information for a callback?",
};

/**
 * Helper function to build personality section from config
 */
export function buildPersonalityPromptSection(config: VoicePersonalityConfig): string {
  const enthusiasmMap = {
    'very-low': 'Very calm and measured',
    'low': 'Calm and understated',
    'moderate': 'Balanced and engaged',
    'high': 'Energetic and enthusiastic',
    'very-high': 'Very energetic and animated',
  };

  const formalityMap = {
    'very-casual': 'Very casual - use contractions, informal language',
    'casual': 'Casual but respectful',
    'balanced': 'Professional but approachable',
    'professional': 'Professional and polished',
    'very-professional': 'Highly formal and corporate',
  };

  const emotionMap = {
    'neutral': 'Matter-of-fact and objective',
    'slightly-expressive': 'Subtly warm and understanding',
    'expressive': 'Empathetic and understanding',
    'very-expressive': 'Highly compassionate and emotionally engaged',
  };

  const fillerMap = {
    'none': 'Never use filler words',
    'rarely': 'Very rarely use "um" or "uh" (only in complex processing)',
    'occasionally': 'Occasionally use "um", "uh", "hmm" when processing or thinking',
    'often': 'Often use natural filler words to sound conversational',
    'very-often': 'Frequently use filler words throughout the conversation',
  };

  const pacingMap = {
    'very-slow': 'Speak very slowly and deliberately with long pauses',
    'slow': 'Speak slowly with thoughtful pauses',
    'moderate': 'Speak at a measured, clear pace',
    'fast': 'Speak briskly but clearly',
    'very-fast': 'Speak quickly and energetically',
  };

  return `# Personality and Tone

## Identity
${config.identity}

## Task
${config.task}

## Demeanor
${config.demeanor}

## Tone
${config.tone}

## Level of Enthusiasm
${enthusiasmMap[config.enthusiasmLevel]}

## Level of Formality
${formalityMap[config.formalityLevel]}

## Level of Emotion
${emotionMap[config.emotionLevel]}

## Filler Words
${fillerMap[config.fillerWords]}

## Pacing
${pacingMap[config.pacing]}
${config.additionalDetails ? `\n## Additional Details\n${config.additionalDetails}` : ''}`;
}

/**
 * Helper function to build conversation states section
 */
export function buildConversationStatesSection(states: ConversationState[]): string {
  if (!states || states.length === 0) return '';

  return `# Conversation States\n\n${JSON.stringify(states, null, 2)}`;
}

/**
 * Helper function to build filler words instructions
 */
export function buildFillerWordsInstructions(config: FillerWordsConfig): string {
  const useWhenList = Object.entries(config.useWhen)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());

  const avoidWhenList = Object.entries(config.avoidWhen)
    .filter(([_, enabled]) => enabled)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());

  return `## Filler Words Usage

Frequency: ${config.frequency}

Use filler words ("um", "uh", "hmm") when:
${useWhenList.map(item => `- ${item}`).join('\n')}

NEVER use filler words during:
${avoidWhenList.map(item => `- ${item}`).join('\n')}
${config.customInstructions ? `\n### Additional Guidelines\n${config.customInstructions}` : ''}`;
}
