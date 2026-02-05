
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
export const VOICE_MAPPING: Record<string, VoiceConfig> = {
  // --- OpenAI Names (Mapped to Google High-Quality Voices) ---
  'alloy': { 
    displayName: 'Alloy', 
    gender: 'neutral', 
    googleVoiceName: 'en-US-Journey-D', 
    provider: 'google', 
    description: 'Balanced and neutral (Journey)' 
  },
  'ash': { 
    displayName: 'Ash', 
    gender: 'male', 
    googleVoiceName: 'en-US-Journey-D', 
    provider: 'google', 
    description: 'Clear and professional (Journey)' 
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
    googleVoiceName: 'en-US-Journey-F', 
    provider: 'google', 
    description: 'Warm and friendly (Journey)' 
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
    googleVoiceName: 'en-US-Journey-F', 
    provider: 'google', 
    description: 'Light and expressive (Journey)' 
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
    googleVoiceName: 'en-US-Journey-F', 
    provider: 'google', 
    description: 'Calm, professional, soothing (Journey)' 
  },
  'cedar': { 
    displayName: 'Cedar', 
    gender: 'male', 
    googleVoiceName: 'en-US-Journey-D', 
    provider: 'google', 
    description: 'Warm, confident, engaging (Journey)' 
  },
  'nova': { 
    displayName: 'Nova', 
    gender: 'female', 
    googleVoiceName: 'en-US-Journey-O', // If O is available, else F
    provider: 'google', 
    description: 'Bright and energetic (Journey)' 
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
    googleVoiceName: 'en-US-Studio-M', 
    provider: 'google', 
    description: 'Deep and authoritative (Studio)' 
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
    googleVoiceName: 'en-US-Studio-M', 
    provider: 'google', 
    description: 'Deep and authoritative (Studio)' 
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
    googleVoiceName: 'en-US-Studio-Q', 
    provider: 'google', 
    description: 'Calm and measured (Studio)' 
  },
  'Aoede': { 
    displayName: 'Aoede', 
    gender: 'female', 
    googleVoiceName: 'en-US-Journey-F', 
    provider: 'google', 
    description: 'Bright and warm (Journey)' 
  },
  'Leda': { 
    displayName: 'Leda', 
    gender: 'female', 
    googleVoiceName: 'en-US-Studio-O', 
    provider: 'google', 
    description: 'Steady and clear (Studio)' 
  },
  'Orus': { 
    displayName: 'Orus', 
    gender: 'male', 
    googleVoiceName: 'en-US-Journey-D', 
    provider: 'google', 
    description: 'Confident and direct (Journey)' 
  },
  'Zephyr': { 
    displayName: 'Zephyr', 
    gender: 'female', 
    googleVoiceName: 'en-US-Journey-O', 
    provider: 'google', 
    description: 'Gentle and reliable (Journey)' 
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
