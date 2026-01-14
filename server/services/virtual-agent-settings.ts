import { eq } from "drizzle-orm";
import { db } from "../db";
import { virtualAgents } from "@shared/schema";

export type SystemToolsSettings = {
  endConversation: boolean;
  detectLanguage: boolean;
  skipTurn: boolean;
  transferToAgent: boolean;
  transferToNumber: boolean;
  playKeypadTouchTone: boolean;
  voicemailDetection: boolean;
};

export type AdvancedSettings = {
  asr: {
    model: 'default' | 'scribe_realtime';
    inputFormat: 'pcm_16000';
    keywords: string;
    transcriptionEnabled?: boolean;
    textOnly?: boolean;
  };
  conversational: {
    eagerness: 'low' | 'normal' | 'high';
    silenceDurationMs?: number;  // Milliseconds of silence before assuming turn is complete
    takeTurnAfterSilenceSeconds: number;
    endConversationAfterSilenceSeconds: number;
    maxConversationDurationSeconds: number;
  };
  realtime: {
    turnDetection: {
      mode: 'normal' | 'semantic' | 'disabled';
      threshold: number;
      prefixPaddingMs: number;
      silenceDurationMs: number;
      idleTimeoutMs: number;
    };
    functions: string[];
    mcpServers: string[];
    model: string;
    userTranscriptModel: string;
    noiseReduction: 'enabled' | 'disabled';
    modelConfig: string;
    maxTokens: number;
    toolChoice: 'auto' | 'required' | 'none';
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

export type VirtualAgentSettings = {
  systemTools: SystemToolsSettings;
  advanced: AdvancedSettings;
};

export const DEFAULT_SYSTEM_TOOLS: SystemToolsSettings = {
  endConversation: true,
  detectLanguage: false,
  skipTurn: false,
  transferToAgent: true,
  transferToNumber: true,
  playKeypadTouchTone: false,
  voicemailDetection: false,
};

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  asr: {
    model: 'default',
    inputFormat: 'pcm_16000',
    keywords: '',
    transcriptionEnabled: true,
  },
  conversational: {
    eagerness: 'low',  // Changed from 'high' to prevent mid-sentence cutoffs
    silenceDurationMs: 1200,  // 1.2 seconds of silence before assuming turn is complete (prevents cutting mid-sentence)
    takeTurnAfterSilenceSeconds: 2,
    endConversationAfterSilenceSeconds: 60,
    maxConversationDurationSeconds: 240,
  },
  realtime: {
    turnDetection: {
      mode: 'normal',
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 500,
      idleTimeoutMs: 0,
    },
    functions: [],
    mcpServers: [],
    model: 'gpt-4o-realtime-preview',
    userTranscriptModel: '',
    noiseReduction: 'enabled',
    modelConfig: '',
    maxTokens: 4096,
    toolChoice: 'auto',
  },
  softTimeout: {
    responseTimeoutSeconds: -1,
  },
  clientEvents: {
    audio: true,
    interruption: true,
    userTranscript: true,
    agentResponse: true,
    agentResponseCorrection: true,
  },
  privacy: {
    noPiiLogging: false,
    retentionDays: -1,
  },
  costOptimization: {
    maxResponseTokens: 1024,  // Increased from 512 to prevent mid-sentence token cutoffs
    useCondensedPrompt: true,
    enableCostTracking: true,
  },
};

export function mergeAgentSettings(raw?: Partial<VirtualAgentSettings>): VirtualAgentSettings {
  return {
    systemTools: {
      ...DEFAULT_SYSTEM_TOOLS,
      ...(raw?.systemTools ?? {}),
    },
    advanced: {
      asr: {
        ...DEFAULT_ADVANCED_SETTINGS.asr,
        ...(raw?.advanced?.asr ?? {}),
      },
      conversational: {
        ...DEFAULT_ADVANCED_SETTINGS.conversational,
        ...(raw?.advanced?.conversational ?? {}),
      },
      realtime: {
        ...DEFAULT_ADVANCED_SETTINGS.realtime,
        turnDetection: {
          ...DEFAULT_ADVANCED_SETTINGS.realtime.turnDetection,
          ...(raw?.advanced?.realtime?.turnDetection ?? {}),
        },
        ...(raw?.advanced?.realtime ?? {}),
      },
      softTimeout: {
        ...DEFAULT_ADVANCED_SETTINGS.softTimeout,
        ...(raw?.advanced?.softTimeout ?? {}),
      },
      clientEvents: {
        ...DEFAULT_ADVANCED_SETTINGS.clientEvents,
        ...(raw?.advanced?.clientEvents ?? {}),
      },
      privacy: {
        ...DEFAULT_ADVANCED_SETTINGS.privacy,
        ...(raw?.advanced?.privacy ?? {}),
      },
      costOptimization: {
        ...DEFAULT_ADVANCED_SETTINGS.costOptimization,
        ...(raw?.advanced?.costOptimization ?? {}),
      },
    },
  };
}

export async function getVirtualAgentConfig(virtualAgentId: string): Promise<{
  systemPrompt: string | null;
  firstMessage: string | null;
  voice: string | null;
  provider: string | null;
  settings: Partial<VirtualAgentSettings> | null;
} | null> {
  if (!virtualAgentId) return null;

  try {
    const [agent] = await db
      .select({
        systemPrompt: virtualAgents.systemPrompt,
        firstMessage: virtualAgents.firstMessage,
        voice: virtualAgents.voice,
        provider: virtualAgents.provider,
        settings: virtualAgents.settings,
      })
      .from(virtualAgents)
      .where(eq(virtualAgents.id, virtualAgentId))
      .limit(1);

    if (!agent) return null;

    return {
      systemPrompt: agent.systemPrompt,
      firstMessage: agent.firstMessage,
      voice: agent.voice,
      provider: agent.provider || null,
      settings: (agent.settings as Partial<VirtualAgentSettings> | null) ?? null,
    };
  } catch (error) {
    console.error("[VirtualAgentSettings] Error fetching virtual agent config:", error);
    return null;
  }
}
