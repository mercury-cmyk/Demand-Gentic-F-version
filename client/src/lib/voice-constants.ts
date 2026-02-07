/**
 * Voice Constants for Client-Side
 *
 * Centralized voice configuration shared across all voice selection components.
 * Each voice maps to a unique Google Cloud TTS voice on the backend.
 */

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  tone: string;
  description: string;
  bestFor: string[];
  provider: 'gemini' | 'openai';
  color: string;
}

// Gemini Live voices with unique characteristics
export const GEMINI_VOICES: VoiceOption[] = [
  // Top recommended for B2B sales
  { id: 'Kore', name: 'Kore', gender: 'female', tone: 'Firm, Professional', description: 'Confident and direct', bestFor: ['Executive outreach'], provider: 'gemini', color: 'from-green-400 to-emerald-500' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', tone: 'Excitable, Energetic', description: 'Enthusiastic and persuasive', bestFor: ['Enterprise sales'], provider: 'gemini', color: 'from-blue-500 to-indigo-600' },
  { id: 'Charon', name: 'Charon', gender: 'male', tone: 'Informative, Authoritative', description: 'Trustworthy and knowledgeable', bestFor: ['Technical decision makers'], provider: 'gemini', color: 'from-slate-600 to-slate-800' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', tone: 'Breezy, Friendly', description: 'Light and approachable', bestFor: ['Mid-market outreach'], provider: 'gemini', color: 'from-rose-400 to-pink-500' },
  { id: 'Puck', name: 'Puck', gender: 'male', tone: 'Upbeat, Lively', description: 'Energetic and engaging', bestFor: ['Startups', 'SMB'], provider: 'gemini', color: 'from-orange-500 to-amber-500' },
  { id: 'Leda', name: 'Leda', gender: 'female', tone: 'Youthful, Fresh', description: 'Modern and relatable', bestFor: ['Tech companies'], provider: 'gemini', color: 'from-violet-500 to-purple-600' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'female', tone: 'Bright, Clear', description: 'Articulate and professional', bestFor: ['Financial services'], provider: 'gemini', color: 'from-cyan-500 to-blue-500' },
  { id: 'Orus', name: 'Orus', gender: 'male', tone: 'Firm, Steady', description: 'Reliable and trustworthy', bestFor: ['Healthcare', 'Education'], provider: 'gemini', color: 'from-teal-500 to-cyan-500' },

  // Additional professional voices
  { id: 'Sulafat', name: 'Sulafat', gender: 'female', tone: 'Warm, Caring', description: 'Empathetic and personable', bestFor: ['Customer success'], provider: 'gemini', color: 'from-pink-400 to-rose-400' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'male', tone: 'Mature, Experienced', description: 'Seasoned and credible', bestFor: ['C-suite conversations'], provider: 'gemini', color: 'from-gray-600 to-slate-700' },
  { id: 'Achird', name: 'Achird', gender: 'female', tone: 'Friendly, Approachable', description: 'Welcoming and warm', bestFor: ['First contact calls'], provider: 'gemini', color: 'from-amber-400 to-orange-500' },
  { id: 'Schedar', name: 'Schedar', gender: 'male', tone: 'Even, Balanced', description: 'Calm and composed', bestFor: ['Complex negotiations'], provider: 'gemini', color: 'from-indigo-500 to-blue-600' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', tone: 'Knowledgeable, Expert', description: 'Authoritative consultant', bestFor: ['Advisory calls'], provider: 'gemini', color: 'from-purple-600 to-indigo-700' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female', tone: 'Forward, Confident', description: 'Bold and assertive', bestFor: ['Closing calls'], provider: 'gemini', color: 'from-red-500 to-rose-600' },

  // Specialized voices
  { id: 'Algieba', name: 'Algieba', gender: 'male', tone: 'Smooth, Polished', description: 'Refined delivery', bestFor: ['Premium brands'], provider: 'gemini', color: 'from-yellow-500 to-amber-600' },
  { id: 'Despina', name: 'Despina', gender: 'female', tone: 'Smooth, Professional', description: 'Elegant and articulate', bestFor: ['Luxury market'], provider: 'gemini', color: 'from-fuchsia-500 to-pink-600' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'male', tone: 'Clear, Precise', description: 'Technical and accurate', bestFor: ['Product demos'], provider: 'gemini', color: 'from-sky-500 to-blue-600' },
  { id: 'Erinome', name: 'Erinome', gender: 'female', tone: 'Clear, Articulate', description: 'Professional presenter', bestFor: ['Presentations'], provider: 'gemini', color: 'from-violet-400 to-purple-500' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', tone: 'Gentle, Soft', description: 'Calming presence', bestFor: ['Sensitive topics'], provider: 'gemini', color: 'from-green-300 to-teal-400' },
  { id: 'Achernar', name: 'Achernar', gender: 'female', tone: 'Soft, Reassuring', description: 'Comforting and kind', bestFor: ['Support calls'], provider: 'gemini', color: 'from-blue-300 to-indigo-400' },

  // Dynamic voices
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'female', tone: 'Lively, Dynamic', description: 'High-energy and exciting', bestFor: ['Product launches'], provider: 'gemini', color: 'from-orange-400 to-red-500' },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', tone: 'Upbeat, Positive', description: 'Optimistic and motivating', bestFor: ['Follow-up calls'], provider: 'gemini', color: 'from-lime-400 to-green-500' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'female', tone: 'Bright, Cheerful', description: 'Sunny and engaging', bestFor: ['Relationship building'], provider: 'gemini', color: 'from-yellow-400 to-orange-500' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female', tone: 'Easy-going, Relaxed', description: 'Casual and comfortable', bestFor: ['Informal calls'], provider: 'gemini', color: 'from-teal-400 to-cyan-500' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'male', tone: 'Easy-going, Laid-back', description: 'Relaxed and natural', bestFor: ['Warm introductions'], provider: 'gemini', color: 'from-emerald-400 to-teal-500' },

  // Character voices
  { id: 'Enceladus', name: 'Enceladus', gender: 'male', tone: 'Breathy, Intimate', description: 'Thoughtful whisper', bestFor: ['Confidential discussions'], provider: 'gemini', color: 'from-slate-500 to-gray-600' },
  { id: 'Algenib', name: 'Algenib', gender: 'male', tone: 'Gravelly, Deep', description: 'Distinctive and memorable', bestFor: ['Brand differentiation'], provider: 'gemini', color: 'from-stone-600 to-slate-700' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', tone: 'Informative, Educational', description: 'Teacher-like clarity', bestFor: ['Training calls'], provider: 'gemini', color: 'from-blue-500 to-cyan-600' },
  { id: 'Alnilam', name: 'Alnilam', gender: 'male', tone: 'Firm, Decisive', description: 'Strong and commanding', bestFor: ['Leadership messaging'], provider: 'gemini', color: 'from-red-600 to-rose-700' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male', tone: 'Casual, Conversational', description: 'Natural and unscripted', bestFor: ['Peer-to-peer'], provider: 'gemini', color: 'from-green-500 to-emerald-600' },
];

// OpenAI Realtime voices
export const OPENAI_VOICES: VoiceOption[] = [
  { id: 'verse', name: 'Verse', gender: 'male', tone: 'Poetic, Dynamic', description: 'Expressive and nuanced', bestFor: ['Relationship Management', 'Luxury Brands'], provider: 'openai', color: 'from-purple-600 to-indigo-600' },
  { id: 'ash', name: 'Ash', gender: 'male', tone: 'Clear, Professional', description: 'Balanced and professional', bestFor: ['General Business', 'Consulting'], provider: 'openai', color: 'from-gray-500 to-gray-700' },
  { id: 'ballad', name: 'Ballad', gender: 'male', tone: 'Warm, Storytelling', description: 'Narrative-focused', bestFor: ['Education', 'Explainer Calls'], provider: 'openai', color: 'from-amber-600 to-orange-700' },
  { id: 'echo', name: 'Echo', gender: 'male', tone: 'Deep, Resonant', description: 'Soothing and authoritative', bestFor: ['High-Trust Sales', 'Legal'], provider: 'openai', color: 'from-indigo-800 to-blue-900' },
  { id: 'coral', name: 'Coral', gender: 'female', tone: 'Warm, Friendly', description: 'Approachable and kind', bestFor: ['Onboarding', 'Welcome Calls'], provider: 'openai', color: 'from-pink-400 to-rose-400' },
  { id: 'sage', name: 'Sage', gender: 'female', tone: 'Calm, Wise', description: 'Knowledgeable and steady', bestFor: ['Advisory', 'Technical Support'], provider: 'openai', color: 'from-emerald-600 to-teal-700' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', tone: 'Light, Expressive', description: 'High-pitched and clear', bestFor: ['Tech Sales', 'Marketing'], provider: 'openai', color: 'from-cyan-400 to-blue-400' },
  { id: 'marin', name: 'Marin', gender: 'female', tone: 'Calm, Professional', description: 'Smooth and professional', bestFor: ['Corporate Communications'], provider: 'openai', color: 'from-blue-600 to-slate-600' },
  { id: 'alloy', name: 'Alloy', gender: 'male', tone: 'Balanced, Neutral', description: 'Versatile and clear', bestFor: ['General Purpose'], provider: 'openai', color: 'from-gray-400 to-slate-500' },
  { id: 'nova', name: 'Nova', gender: 'female', tone: 'Bright, Energetic', description: 'Vibrant and engaging', bestFor: ['Product Launches'], provider: 'openai', color: 'from-purple-400 to-pink-500' },
  { id: 'onyx', name: 'Onyx', gender: 'male', tone: 'Deep, Authoritative', description: 'Commanding presence', bestFor: ['Executive Communications'], provider: 'openai', color: 'from-gray-800 to-black' },
  { id: 'fable', name: 'Fable', gender: 'male', tone: 'Expressive, Dynamic', description: 'Storytelling voice', bestFor: ['Content Marketing'], provider: 'openai', color: 'from-amber-500 to-yellow-600' },
];

// Combined list of all voices
export const ALL_VOICES: VoiceOption[] = [...GEMINI_VOICES, ...OPENAI_VOICES];

// Get voice by ID
export function getVoiceById(voiceId: string): VoiceOption | undefined {
  return ALL_VOICES.find(v => v.id.toLowerCase() === voiceId.toLowerCase());
}

// Get voices by provider
export function getVoicesByProvider(provider: 'gemini' | 'openai'): VoiceOption[] {
  return ALL_VOICES.filter(v => v.provider === provider);
}

// Get voices by gender
export function getVoicesByGender(gender: 'male' | 'female'): VoiceOption[] {
  return ALL_VOICES.filter(v => v.gender === gender);
}
