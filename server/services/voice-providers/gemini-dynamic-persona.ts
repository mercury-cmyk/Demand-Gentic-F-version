import { GEMINI_VOICE_DETAILS, type GeminiVoice } from './gemini-types';

export type GeminiPersonaGender = 'male' | 'female' | 'neutral';

export interface GeminiPersonaProfile {
  name: string;
  archetype: 'The Guide' | 'The Guardian';
  gender: 'male' | 'female';
  prompt: string;
}

const MALE_CORE = ['Chris'] as const;
const MALE_EXPANDED = [] as const;

const FEMALE_CORE = ['Christine'] as const;
const FEMALE_EXPANDED = [] as const;

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickFromPool(seed: string, pool: readonly string[]): string {
  const index = hashString(seed) % pool.length;
  return pool[index];
}

export function resolveGeminiVoiceGender(voiceName?: string): GeminiPersonaGender {
  if (!voiceName) return 'neutral';
  const details = GEMINI_VOICE_DETAILS[voiceName as GeminiVoice];
  return details?.gender ?? 'neutral';
}

export function resolveGeminiPersonaProfile(options: {
  voiceName?: string;
  sessionId: string;
  includeExpandedPool?: boolean;
}): GeminiPersonaProfile {
  const { voiceName, sessionId, includeExpandedPool = true } = options;
  const voiceGender = resolveGeminiVoiceGender(voiceName);

  const gender: 'male' | 'female' =
    voiceGender === 'female'
      ? 'female'
      : voiceGender === 'male'
        ? 'male'
        : hashString(`${sessionId}:neutral`) % 2 === 0
          ? 'male'
          : 'female';

  const pool = gender === 'male'
    ? [...MALE_CORE, ...(includeExpandedPool ? MALE_EXPANDED : [])]
    : [...FEMALE_CORE, ...(includeExpandedPool ? FEMALE_EXPANDED : [])];

  const name = pickFromPool(`${sessionId}:${voiceName || 'unknown'}:${gender}`, pool);

  if (gender === 'male') {
    return {
      name,
      gender,
      archetype: 'The Guide',
      prompt: `You are ${name}, a calm, clear, strategically focused professional.\nYour tone reflects clarity, direction, and composed authority.`,
    };
  }

  return {
    name,
    gender,
    archetype: 'The Guardian',
    prompt: `You are ${name}, a thoughtful, perceptive professional.\nYour tone reflects wisdom, care, and insightful discernment.`,
  };
}
