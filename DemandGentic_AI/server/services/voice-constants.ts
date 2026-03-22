/**
 * Voice Constants & Configuration
 * 
 * Centralized configuration for voice mapping across the application.
 * Maps application-level voice personas (OpenAI & Gemini names) to 
 * high-quality Google Cloud TTS voices (Journey, Studio, Neural2).
 */

export interface VoiceConfig {
  displayName: string;
  gender: 'male' | 'female' | 'neutral';
  googleVoiceName: string; // The actual Google Cloud TTS voice name
  provider: 'google'; // We are standardizing on Google Cloud TTS
  description: string;
}

// Map of all supported voices to their Google Cloud TTS configuration
export const VOICE_MAPPING: Record = {
  // --- OpenAI Names (Mapped to Google High-Quality Voices) ---
  'alloy': { 
    displayName: 'Alloy', 
    gender: 'neutral', 
    googleVoiceName: 'en-US-Neural2-D', 
    provider: 'google', 
    description: 'Balanced and neutral (Neural2)' 
  },
  'ash': { 
    displayName: 'Ash', 
    gender: 'male', 
    googleVoiceName: 'en-US-Neural2-A', 
    provider: 'google', 
    description: 'Clear and professional (Neural2)' 
  },
  'ballad': { 
    displayName: 'Ballad', 
    gender: 'male', 
    googleVoiceName: 'en-US-Studio-M', 
    provider: 'google', 
    description: 'Warm and storytelling (Studio)' 
  },
  'coral': { 
    displayName: 'Coral', 
    gender: 'female', 
    googleVoiceName: 'en-US-Neural2-F', 
    provider: 'google', 
    description: 'Warm and friendly (Neural2)' 
  },
  'echo': { 
    displayName: 'Echo', 
    gender: 'male', 
    googleVoiceName: 'en-US-Polyglot-1', 
    provider: 'google', 
    description: 'Deep and resonant (Polyglot)' 
  },
  'sage': { 
    displayName: 'Sage', 
    gender: 'female', 
    googleVoiceName: 'en-US-Studio-O', 
    provider: 'google', 
    description: 'Calm and wise (Studio)' 
  },
  'shimmer': { 
    displayName: 'Shimmer', 
    gender: 'female', 
    googleVoiceName: 'en-US-Neural2-C', 
    provider: 'google', 
    description: 'Light and expressive (Neural2)' 
  },
  'verse': { 
    displayName: 'Verse', 
    gender: 'male', 
    googleVoiceName: 'en-US-Studio-Q', 
    provider: 'google', 
    description: 'Poetic and dynamic (Studio)' 
  },
  'marin': { 
    displayName: 'Marin', 
    gender: 'female', 
    googleVoiceName: 'en-US-Neural2-E', 
    provider: 'google', 
    description: 'Calm, professional, soothing (Neural2)' 
  },
  'cedar': { 
    displayName: 'Cedar', 
    gender: 'male', 
    googleVoiceName: 'en-US-Neural2-J', 
    provider: 'google', 
    description: 'Warm, confident, engaging (Neural2)' 
  },
  'nova': { 
    displayName: 'Nova', 
    gender: 'female', 
    googleVoiceName: 'en-US-Neural2-G', 
    provider: 'google', 
    description: 'Bright and energetic (Neural2)' 
  },
  'fable': { 
    displayName: 'Fable', 
    gender: 'male', 
    googleVoiceName: 'en-GB-Studio-B', // British accent for variety
    provider: 'google', 
    description: 'Expressive and dynamic (British Studio)' 
  },
  'onyx': { 
    displayName: 'Onyx', 
    gender: 'male', 
    googleVoiceName: 'en-US-Neural2-I', 
    provider: 'google', 
    description: 'Deep and authoritative (Neural2)' 
  },

  // --- Gemini Live Names (Mapped to Google High-Quality Voices) ---
  'Puck': { 
    displayName: 'Puck', 
    gender: 'male', 
    googleVoiceName: 'en-US-Journey-D', 
    provider: 'google', 
    description: 'Light and expressive (Journey)' 
  },
  'Charon': { 
    displayName: 'Charon', 
    gender: 'male', 
    googleVoiceName: 'en-US-Wavenet-D', 
    provider: 'google', 
    description: 'Deep and authoritative (Wavenet)' 
  },
  'Kore': { 
    displayName: 'Kore', 
    gender: 'female', 
    googleVoiceName: 'en-US-Journey-F', 
    provider: 'google', 
    description: 'Soft and friendly (Journey)' 
  },
  'Fenrir': { 
    displayName: 'Fenrir', 
    gender: 'male', 
    googleVoiceName: 'en-US-Wavenet-B', 
    provider: 'google', 
    description: 'Calm and measured (Wavenet)' 
  },
  'Aoede': { 
    displayName: 'Aoede', 
    gender: 'female', 
    googleVoiceName: 'en-US-Journey-O', 
    provider: 'google', 
    description: 'Bright and warm (Journey)' 
  },
  'Leda': { 
    displayName: 'Leda', 
    gender: 'female', 
    googleVoiceName: 'en-US-Wavenet-F', 
    provider: 'google', 
    description: 'Steady and clear (Wavenet)' 
  },
  'Orus': { 
    displayName: 'Orus', 
    gender: 'male', 
    googleVoiceName: 'en-US-Wavenet-A', 
    provider: 'google', 
    description: 'Confident and direct (Wavenet)' 
  },
  'Zephyr': {
    displayName: 'Zephyr',
    gender: 'female',
    googleVoiceName: 'en-US-Wavenet-C',
    provider: 'google',
    description: 'Gentle and reliable (Wavenet)'
  },

  // --- Additional Gemini Live Voices ---
  'Sulafat': {
    displayName: 'Sulafat',
    gender: 'female',
    googleVoiceName: 'en-US-Neural2-H',
    provider: 'google',
    description: 'Warm and caring (Neural2)'
  },
  'Gacrux': {
    displayName: 'Gacrux',
    gender: 'male',
    googleVoiceName: 'en-US-Studio-M',
    provider: 'google',
    description: 'Mature and experienced (Studio)'
  },
  'Achird': {
    displayName: 'Achird',
    gender: 'female',
    googleVoiceName: 'en-US-Journey-O',
    provider: 'google',
    description: 'Friendly and approachable (Journey)'
  },
  'Schedar': {
    displayName: 'Schedar',
    gender: 'male',
    googleVoiceName: 'en-US-Wavenet-I',
    provider: 'google',
    description: 'Even and balanced (Wavenet)'
  },
  'Sadaltager': {
    displayName: 'Sadaltager',
    gender: 'male',
    googleVoiceName: 'en-US-Neural2-I',
    provider: 'google',
    description: 'Knowledgeable and expert (Neural2)'
  },
  'Pulcherrima': {
    displayName: 'Pulcherrima',
    gender: 'female',
    googleVoiceName: 'en-US-Studio-O',
    provider: 'google',
    description: 'Forward and confident (Studio)'
  },

  'Iapetus': {
    displayName: 'Iapetus',
    gender: 'male',
    googleVoiceName: 'en-US-Neural2-J',
    provider: 'google',
    description: 'Clear and precise (Neural2)'
  },
  'Erinome': {
    displayName: 'Erinome',
    gender: 'female',
    googleVoiceName: 'en-US-Neural2-C',
    provider: 'google',
    description: 'Clear and articulate (Neural2)'
  },
  'Vindemiatrix': {
    displayName: 'Vindemiatrix',
    gender: 'female',
    googleVoiceName: 'en-US-Wavenet-E',
    provider: 'google',
    description: 'Gentle and soft (Wavenet)'
  },
  'Achernar': {
    displayName: 'Achernar',
    gender: 'female',
    googleVoiceName: 'en-US-Neural2-F',
    provider: 'google',
    description: 'Soft and reassuring (Neural2)'
  },
  'Sadachbia': {
    displayName: 'Sadachbia',
    gender: 'female',
    googleVoiceName: 'en-US-Journey-F',
    provider: 'google',
    description: 'Lively and dynamic (Journey)'
  },
  'Laomedeia': {
    displayName: 'Laomedeia',
    gender: 'female',
    googleVoiceName: 'en-US-Neural2-G',
    provider: 'google',
    description: 'Upbeat and positive (Neural2)'
  },

  'Enceladus': {
    displayName: 'Enceladus',
    gender: 'male',
    googleVoiceName: 'en-US-Wavenet-J',
    provider: 'google',
    description: 'Breathy and intimate (Wavenet)'
  },
  'Algenib': {
    displayName: 'Algenib',
    gender: 'male',
    googleVoiceName: 'en-GB-Wavenet-B',
    provider: 'google',
    description: 'Gravelly and deep (British Wavenet)'
  },
  'Rasalgethi': {
    displayName: 'Rasalgethi',
    gender: 'male',
    googleVoiceName: 'en-US-Neural2-A',
    provider: 'google',
    description: 'Informative and educational (Neural2)'
  },
  'Alnilam': {
    displayName: 'Alnilam',
    gender: 'male',
    googleVoiceName: 'en-US-Wavenet-D',
    provider: 'google',
    description: 'Firm and decisive (Wavenet)'
  },

  // Additional common voice names
  'Pegasus': {
    displayName: 'Pegasus',
    gender: 'male',
    googleVoiceName: 'en-US-Journey-D',
    provider: 'google',
    description: 'Clear and professional (Journey)'
  },
  'Vega': {
    displayName: 'Vega',
    gender: 'female',
    googleVoiceName: 'en-US-Journey-O',
    provider: 'google',
    description: 'Modern and dynamic (Journey)'
  },
  'Altair': {
    displayName: 'Altair',
    gender: 'male',
    googleVoiceName: 'en-US-Neural2-D',
    provider: 'google',
    description: 'Professional and direct (Neural2)'
  },
  'Lyra': {
    displayName: 'Lyra',
    gender: 'female',
    googleVoiceName: 'en-GB-Neural2-A',
    provider: 'google',
    description: 'Sophisticated and elegant (British Neural2)'
  },
  'Clio': {
    displayName: 'Clio',
    gender: 'female',
    googleVoiceName: 'en-US-Neural2-E',
    provider: 'google',
    description: 'Intellectual and articulate (Neural2)'
  },
  'Atlas': {
    displayName: 'Atlas',
    gender: 'male',
    googleVoiceName: 'en-US-Wavenet-B',
    provider: 'google',
    description: 'Powerful and grounded (Wavenet)'
  }
};

/**
 * Get the Google Cloud TTS configuration for a given voice ID (case-insensitive)
 * Defaults to 'en-US-Journey-F' if not found.
 */
export function getGoogleVoiceConfig(voiceId: string): VoiceConfig {
  // Normalize checking
  const cleanId = Object.keys(VOICE_MAPPING).find(
    k => k.toLowerCase() === voiceId.toLowerCase()
  );
  
  if (cleanId) {
    return VOICE_MAPPING[cleanId];
  }

  // Fallback logic
  const isMale = ['male', 'deep', 'onyx', 'echo', 'ash', 'mens'].some(k => voiceId.toLowerCase().includes(k));
  
  if (isMale) {
    return {
       displayName: 'Default Male',
       gender: 'male',
       googleVoiceName: 'en-US-Journey-D',
       provider: 'google',
       description: 'Default Male Voice'
    };
  }

  return {
       displayName: 'Default Female',
       gender: 'female',
       googleVoiceName: 'en-US-Journey-F',
       provider: 'google',
       description: 'Default Female Voice'
  };
}