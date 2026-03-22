/**
 * Opening Variation Engine
 * 
 * Generates phonetically different opening lines to avoid carrier audio fingerprinting.
 * Each call uses a semantically identical but sonically unique opener.
 * 
 * Key principles:
 * - 5-7 variations of the same semantic opener
 * - Vary pacing, fillers, sentence structure
 * - Never use identical audio patterns
 * - Include natural micro-disfluencies (hesitations, breathing patterns)
 * 
 * @see Anti-spam plan section 3A
 */

// ==================== TYPES ====================

export interface OpeningVariation {
  id: string;
  template: string;
  disfluencyPattern: DisfluencyPattern;
  pauseBeforeMs: number;
  pauseAfterNameMs: number;
  style: 'formal' | 'casual' | 'friendly' | 'direct';
}

export interface DisfluencyPattern {
  useFiller: boolean;
  fillerPosition: 'start' | 'middle' | 'none';
  filler: string;
  breathPauseMs: number;
}

export interface OpeningConfig {
  contactName: string;
  contactTitle?: string;
  companyName?: string;
  agentName?: string;
  agentCompany?: string;
}

// ==================== OPENING TEMPLATES ====================

/**
 * Semantically identical openers with phonetic variations.
 * These all ask the same thing but sound different to audio fingerprinting.
 */
const GATEKEEPER_OPENING_VARIATIONS: OpeningVariation[] = [
  {
    id: 'formal_standard',
    template: 'Hello, this is {{agent}} from Harver. May I speak with {{name}}, please?',
    disfluencyPattern: { useFiller: false, fillerPosition: 'none', filler: '', breathPauseMs: 0 },
    pauseBeforeMs: 200,
    pauseAfterNameMs: 100,
    style: 'formal',
  },
  {
    id: 'casual_hey',
    template: 'Hi, this is {{agent}} from Harver—is {{name}} available?',
    disfluencyPattern: { useFiller: true, fillerPosition: 'start', filler: 'uh', breathPauseMs: 150 },
    pauseBeforeMs: 100,
    pauseAfterNameMs: 200,
    style: 'casual',
  },
  {
    id: 'friendly_hi',
    template: 'Hi, this is {{agent}} calling from Harver. I was hoping to reach {{name}}—is this a good time?',
    disfluencyPattern: { useFiller: false, fillerPosition: 'none', filler: '', breathPauseMs: 100 },
    pauseBeforeMs: 150,
    pauseAfterNameMs: 150,
    style: 'friendly',
  },
  {
    id: 'direct_quick',
    template: 'Hello, this is {{agent}} from Harver—can I speak with {{name}}?',
    disfluencyPattern: { useFiller: true, fillerPosition: 'start', filler: 'um', breathPauseMs: 200 },
    pauseBeforeMs: 50,
    pauseAfterNameMs: 100,
    style: 'direct',
  },
  {
    id: 'polite_apology',
    template: 'Hi, this is {{agent}} from Harver. Sorry to bother you—is {{name}} around?',
    disfluencyPattern: { useFiller: false, fillerPosition: 'none', filler: '', breathPauseMs: 100 },
    pauseBeforeMs: 100,
    pauseAfterNameMs: 200,
    style: 'friendly',
  },
  {
    id: 'formal_calling_for',
    template: 'Hello, this is {{agent}} from Harver. I\'m calling to speak with {{name}}—are they available?',
    disfluencyPattern: { useFiller: true, fillerPosition: 'middle', filler: 'uh', breathPauseMs: 150 },
    pauseBeforeMs: 200,
    pauseAfterNameMs: 100,
    style: 'formal',
  },
  {
    id: 'casual_reaching_out',
    template: 'Hey, this is {{agent}} from Harver. I\'m trying to reach {{name}}—any chance they\'re free?',
    disfluencyPattern: { useFiller: false, fillerPosition: 'none', filler: '', breathPauseMs: 100 },
    pauseBeforeMs: 100,
    pauseAfterNameMs: 150,
    style: 'casual',
  },
];

/**
 * Permission openers - ask if it's a good time (reduces early hang-ups)
 */
const PERMISSION_OPENING_VARIATIONS: OpeningVariation[] = [
  {
    id: 'bad_time_check',
    template: 'Hey—uh—did I catch you at a bad time?',
    disfluencyPattern: { useFiller: true, fillerPosition: 'middle', filler: 'uh', breathPauseMs: 200 },
    pauseBeforeMs: 100,
    pauseAfterNameMs: 0,
    style: 'casual',
  },
  {
    id: 'quick_minute',
    template: 'Hi {{name}}—got a quick minute?',
    disfluencyPattern: { useFiller: false, fillerPosition: 'none', filler: '', breathPauseMs: 100 },
    pauseBeforeMs: 150,
    pauseAfterNameMs: 100,
    style: 'direct',
  },
  {
    id: 'good_time_check',
    template: 'Hello {{name}}, is this a good time to chat briefly?',
    disfluencyPattern: { useFiller: true, fillerPosition: 'start', filler: 'um', breathPauseMs: 150 },
    pauseBeforeMs: 200,
    pauseAfterNameMs: 150,
    style: 'formal',
  },
];

/**
 * Natural filler words for micro-disfluencies
 */
const FILLER_WORDS = ['uh', 'um', 'so', 'well', 'hmm'];

/**
 * Pause duration ranges (in milliseconds) for natural speech patterns
 */
const PAUSE_RANGES = {
  breath: { min: 100, max: 300 },
  hesitation: { min: 200, max: 500 },
  thoughtful: { min: 300, max: 700 },
  emphasis: { min: 150, max: 400 },
};

// ==================== MAIN SERVICE ====================

/**
 * Select a random opening variation with deterministic seeding
 * Uses call ID or phone number as seed for reproducibility
 */
export function selectOpeningVariation(
  seed: string,
  type: 'gatekeeper' | 'permission' = 'gatekeeper'
): OpeningVariation {
  const variations = type === 'gatekeeper'
    ? GATEKEEPER_OPENING_VARIATIONS
    : PERMISSION_OPENING_VARIATIONS;

  // Use seed to get deterministic but varied selection
  const hash = simpleHash(seed);
  const index = hash % variations.length;

  return variations[index];
}

/**
 * Generate a complete opening line with all variations applied
 */
export function generateOpening(
  config: OpeningConfig,
  seed: string,
  type: 'gatekeeper' | 'permission' = 'gatekeeper'
): {
  text: string;
  variation: OpeningVariation;
  ssml: string;
  metadata: {
    selectedVariationId: string;
    disfluencyApplied: boolean;
    pausePattern: string;
  };
} {
  const variation = selectOpeningVariation(seed, type);
  
  // Interpolate the template
  let text = variation.template
    .replace(/\{\{name\}\}/g, config.contactName)
    .replace(/\{\{title\}\}/g, config.contactTitle || '')
    .replace(/\{\{company\}\}/g, config.companyName || '')
    .replace(/\{\{agent\}\}/g, config.agentName || '')
    .replace(/\{\{agentCompany\}\}/g, config.agentCompany || '');

  // Apply disfluency pattern
  if (variation.disfluencyPattern.useFiller) {
    text = applyDisfluency(text, variation.disfluencyPattern);
  }

  // Generate SSML for TTS with natural pauses
  const ssml = generateSSML(text, variation);

  return {
    text,
    variation,
    ssml,
    metadata: {
      selectedVariationId: variation.id,
      disfluencyApplied: variation.disfluencyPattern.useFiller,
      pausePattern: `${variation.pauseBeforeMs}ms-${variation.pauseAfterNameMs}ms`,
    },
  };
}

/**
 * Generate a completely randomized opening with micro-variations
 */
export function generateRandomizedOpening(
  config: OpeningConfig,
  baseTemplate?: string
): string {
  // If a base template is provided, add micro-variations to it
  if (baseTemplate) {
    return addMicroVariations(baseTemplate, config);
  }

  // Otherwise generate from our variation pool
  const seed = `${config.contactName}-${Date.now()}-${Math.random()}`;
  const { text } = generateOpening(config, seed);
  return text;
}

/**
 * Add micro-variations to an existing template
 * Makes the same script sound different each time
 */
function addMicroVariations(template: string, config: OpeningConfig): string {
  let result = template;

  // Interpolate contact info
  result = result
    .replace(/\{\{contact\.full_name\}\}/gi, config.contactName)
    .replace(/\{\{contact\.first_name\}\}/gi, config.contactName.split(' ')[0])
    .replace(/\{\{contact\.job_title\}\}/gi, config.contactTitle || '')
    .replace(/\{\{account\.name\}\}/gi, config.companyName || '')
    .replace(/\{\{agent\.name\}\}/gi, config.agentName || '')
    .replace(/\{\{agent\.company\}\}/gi, config.agentCompany || '');

  // Randomly add natural variations (30% chance each)
  if (Math.random() = 2) {
        return `${parts[0]}${parts[1]}${pattern.filler}, ${parts.slice(2).join('')}`;
      }
      return text;
    default:
      return text;
  }
}

/**
 * Generate SSML markup for natural TTS delivery
 */
function generateSSML(text: string, variation: OpeningVariation): string {
  const { pauseBeforeMs, pauseAfterNameMs, disfluencyPattern } = variation;

  let ssml = '';

  // Add initial pause/breath
  if (pauseBeforeMs > 0) {
    ssml += ``;
  }

  // Add breath if specified
  if (disfluencyPattern.breathPauseMs > 0) {
    ssml += ``;
  }

  // Add the text with emphasis on key parts
  ssml += text;

  ssml += '';

  return ssml;
}

/**
 * Simple hash function for deterministic variation selection
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get a random pause duration within a range
 */
export function getRandomPause(type: keyof typeof PAUSE_RANGES): number {
  const range = PAUSE_RANGES[type];
  return Math.floor(Math.random() * (range.max - range.min) + range.min);
}

/**
 * Get all available opening variations for preview/testing
 */
export function getAllOpeningVariations(): {
  gatekeeper: OpeningVariation[];
  permission: OpeningVariation[];
} {
  return {
    gatekeeper: GATEKEEPER_OPENING_VARIATIONS,
    permission: PERMISSION_OPENING_VARIATIONS,
  };
}

// ==================== EXPORTS ====================

export default {
  selectOpeningVariation,
  generateOpening,
  generateRandomizedOpening,
  addMicroVariations,
  getAllOpeningVariations,
  getRandomPause,
  FILLER_WORDS,
  PAUSE_RANGES,
};