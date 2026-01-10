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
    eagerness: 'high',
    takeTurnAfterSilenceSeconds: 2,
    endConversationAfterSilenceSeconds: 60,
    maxConversationDurationSeconds: 240,
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
    maxResponseTokens: 512,
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
  settings: Partial<VirtualAgentSettings> | null;
} | null> {
  if (!virtualAgentId) return null;

  try {
    const [agent] = await db
      .select({
        systemPrompt: virtualAgents.systemPrompt,
        firstMessage: virtualAgents.firstMessage,
        voice: virtualAgents.voice,
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
      settings: (agent.settings as Partial<VirtualAgentSettings> | null) ?? null,
    };
  } catch (error) {
    console.error("[VirtualAgentSettings] Error fetching virtual agent config:", error);
    return null;
  }
}
