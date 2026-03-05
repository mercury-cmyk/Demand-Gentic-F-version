import { GEMINI_VOICE_DETAILS, type GeminiVoice } from './gemini-types';

export type GeminiPersonaGender = 'male' | 'female' | 'neutral';

export interface GeminiPersonaProfile {
  name: string;
  archetype: 'The Guide' | 'The Guardian';
  gender: 'male' | 'female';
  prompt: string;
}

const MALE_NAME = 'Chris';
const FEMALE_NAME = 'Christine';

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function resolveGeminiVoiceGender(voiceName?: string): GeminiPersonaGender {
  if (!voiceName) return 'neutral';
  const details = GEMINI_VOICE_DETAILS[voiceName as GeminiVoice];
  return details?.gender ?? 'neutral';
}

export function resolveGeminiPersonaProfile(options: {
  voiceName?: string;
  sessionId: string;
}): GeminiPersonaProfile {
  const { voiceName, sessionId } = options;
  const voiceGender = resolveGeminiVoiceGender(voiceName);

  const gender: 'male' | 'female' =
    voiceGender === 'female'
      ? 'female'
      : voiceGender === 'male'
        ? 'male'
        : hashString(`${sessionId}:neutral`) % 2 === 0
          ? 'male'
          : 'female';

  const name = gender === 'male' ? MALE_NAME : FEMALE_NAME;

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
