/**
 * Argyle Events Integration — Draft Generator
 * 
 * Maps parsed ArgyleEvent data into WorkOrderDraft source/draft fields.
 * Optionally uses LLM enrichment to generate a polished campaign brief.
 */

import type { ArgyleEvent, DraftFieldsPayload, CampaignBrief } from './types';

// Audience mapping: community/category -> likely target personas
const COMMUNITY_AUDIENCE_MAP: Record<string, { titles: string[]; industries: string[] }> = {
  'Finance': {
    titles: ['CFO', 'VP Finance', 'Controller', 'Finance Director', 'Treasurer', 'Head of FP&A'],
    industries: ['Financial Services', 'Banking', 'Insurance', 'Investment Management'],
  },
  'Information Technology': {
    titles: ['CIO', 'CTO', 'VP IT', 'IT Director', 'VP Engineering', 'CISO', 'Head of Infrastructure'],
    industries: ['Technology', 'Software', 'Cloud Computing', 'Cybersecurity'],
  },
  'Human Resources': {
    titles: ['CHRO', 'VP HR', 'HR Director', 'VP People', 'Head of Talent', 'VP Total Rewards'],
    industries: ['Human Resources', 'Staffing', 'Workforce Management'],
  },
  'Marketing': {
    titles: ['CMO', 'VP Marketing', 'Marketing Director', 'Head of Demand Gen', 'VP Brand'],
    industries: ['Marketing', 'Advertising', 'Digital Marketing', 'Media'],
  },
  'Operations': {
    titles: ['COO', 'VP Operations', 'Operations Director', 'Head of Supply Chain'],
    industries: ['Manufacturing', 'Logistics', 'Supply Chain'],
  },
  'Legal': {
    titles: ['General Counsel', 'CLO', 'VP Legal', 'Legal Director', 'Head of Compliance'],
    industries: ['Legal Services', 'Compliance', 'Regulatory'],
  },
  'Sales': {
    titles: ['CRO', 'VP Sales', 'Sales Director', 'Head of Revenue', 'VP Business Development'],
    industries: ['Sales', 'Business Development', 'Revenue Operations'],
  },
};

// Event type keywords that refine audience
const EVENT_TYPE_TITLE_HINTS: Record<string, string[]> = {
  'CIO': ['CIO', 'VP IT', 'IT Director', 'CTO'],
  'CISO': ['CISO', 'VP Security', 'Security Director', 'Head of Cybersecurity'],
  'CFO': ['CFO', 'VP Finance', 'Finance Director', 'Controller'],
  'HR': ['CHRO', 'VP HR', 'HR Director', 'VP People'],
  'CMO': ['CMO', 'VP Marketing', 'Marketing Director'],
  'C-Suite': ['CEO', 'President', 'COO', 'CFO', 'CIO', 'CMO', 'CHRO'],
};

/**
 * Derive target audience from event community and title keywords.
 */
function deriveTargetAudience(event: ArgyleEvent): { titles: string[]; industries: string[] } {
  const base = COMMUNITY_AUDIENCE_MAP[event.community || ''] || {
    titles: ['VP', 'Director', 'Head of', 'C-Suite Executive'],
    industries: [],
  };

  // Refine based on title keywords
  const titleWords = (event.title + ' ' + (event.subtitle || '')).toUpperCase();
  const refinedTitles = new Set(base.titles);

  for (const [keyword, titles] of Object.entries(EVENT_TYPE_TITLE_HINTS)) {
    if (titleWords.includes(keyword.toUpperCase())) {
      titles.forEach(t => refinedTitles.add(t));
    }
  }

  return {
    titles: Array.from(refinedTitles),
    industries: base.industries,
  };
}

/**
 * Calculate recommended outreach window (3-6 weeks before event).
 */
function deriveTimingNotes(event: ArgyleEvent): string {
  const parts: string[] = [];

  if (event.dateIso) {
    const eventDate = new Date(event.dateIso);
    const now = new Date();

    const sixWeeksBefore = new Date(eventDate);
    sixWeeksBefore.setDate(sixWeeksBefore.getDate() - 42);
    const threeWeeksBefore = new Date(eventDate);
    threeWeeksBefore.setDate(threeWeeksBefore.getDate() - 21);

    const formatDate = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (now < sixWeeksBefore) {
      parts.push(`Recommended outreach window: ${formatDate(sixWeeksBefore)} – ${formatDate(threeWeeksBefore)}`);
      parts.push(`Event date: ${formatDate(eventDate)}`);
    } else if (now < threeWeeksBefore) {
      parts.push(`Outreach window is NOW — event on ${formatDate(eventDate)}`);
    } else if (now < eventDate) {
      parts.push(`Event is less than 3 weeks away (${formatDate(eventDate)}) — urgent outreach needed`);
    } else {
      parts.push(`Event has already passed (${formatDate(eventDate)})`);
    }
  } else {
    parts.push(`Event date: ${event.dateHuman || 'TBD'} — set outreach 3-6 weeks prior`);
  }

  return parts.join('. ');
}

/**
 * Generate source fields payload from a parsed event.
 * These are the auto-generated fields that get overwritten on re-sync.
 */
export function generateSourceFields(event: ArgyleEvent): DraftFieldsPayload {
  const audience = deriveTargetAudience(event);
  const timingNotes = deriveTimingNotes(event);

  const titleParts = [event.title];
  if (event.eventType) titleParts.push(`(${event.eventType})`);
  if (event.dateHuman) titleParts.push(`— ${event.dateHuman}`);
  const campaignTitle = titleParts.join(' ');

  // Build context from overview + agenda + speakers + audience
  const contextParts: string[] = [];
  
  // Event overview
  if (event.overviewExcerpt) {
    contextParts.push(`EVENT OVERVIEW:\n${event.overviewExcerpt}`);
  }
  
  // Agenda topics give agents talking points
  if (event.agendaExcerpt) {
    contextParts.push(`KEY TOPICS & AGENDA:\n${event.agendaExcerpt}`);
  }

  // Featured speakers add credibility context
  if (event.speakersExcerpt) {
    contextParts.push(`FEATURED SPEAKERS:\n${event.speakersExcerpt}`);
  }

  // Target audience for agents to reference
  contextParts.push(`TARGET AUDIENCE:\nJob Titles: ${audience.titles.join(', ')}`);
  if (audience.industries.length > 0) {
    contextParts.push(`Target Industries: ${audience.industries.join(', ')}`);
  }
  if (event.community) {
    contextParts.push(`Event Community: ${event.community} — this event is designed for ${event.community} executives and leaders.`);
  }

  contextParts.push(`Source: ${event.sourceUrl}`);
  const context = contextParts.join('\n\n');

  const objective = `Generate qualified leads for Argyle's "${event.title}" ${event.eventType || 'event'}`;

  const targetingNotes = [
    `Target audience: ${audience.titles.join(', ')}`,
    audience.industries.length > 0 ? `Industries: ${audience.industries.join(', ')}` : '',
    event.community ? `Event community: ${event.community}` : '',
    event.location ? `Event location: ${event.location}` : '',
  ].filter(Boolean).join('\n');

  return {
    title: campaignTitle,
    description: `Lead generation campaign for Argyle's ${event.eventType || 'event'}: ${event.title}`,
    context,
    objective,
    targetAudience: audience.titles,
    targetIndustries: audience.industries,
    targetingNotes,
    timingNotes,
    orderType: 'lead_generation',
    eventDate: event.dateHuman || '',
    eventType: event.eventType || '',
    eventCommunity: event.community || '',
    eventLocation: event.location || '',
    sourceUrl: event.sourceUrl,
  };
}

/**
 * LLM enrichment prompt template.
 * Uses our existing LLM wrappers to generate a polished campaign brief.
 */
export function buildEnrichmentPrompt(event: ArgyleEvent): string {
  return `You generate an email lead-generation campaign brief for a single Argyle event. Use ONLY the provided extracted event data. Do not invent facts. Return strict JSON.

EVENT DATA:
- Title: ${event.title}
- Subtitle: ${event.subtitle || 'N/A'}
- Community: ${event.community || 'N/A'}
- Event Type: ${event.eventType || 'N/A'}
- Date: ${event.dateHuman || 'TBD'}
- Location: ${event.location || 'N/A'}
- Overview: ${event.overviewExcerpt || 'No overview available'}
- Speakers: ${event.speakersExcerpt || 'Not listed'}
- Agenda: ${event.agendaExcerpt || 'Not listed'}
- Source URL: ${event.sourceUrl}

Return a JSON object with these exact fields:
{
  "title": "Campaign title (include event name and date)",
  "context": "2-5 sentence context summary of the event and why it matters to the target audience",
  "objective": "Clear objective statement for the lead generation campaign",
  "targetAudience": ["array", "of", "target", "job", "titles"],
  "targetIndustries": ["array", "of", "relevant", "industries"],
  "targetingNotes": "Additional targeting guidance for the campaign team",
  "timingNotes": "Recommended outreach timing relative to event date",
  "orderType": "lead_generation"
}

RULES:
- Do NOT invent dates, locations, or speaker names
- Do NOT add information not present in the EVENT DATA above
- Keep context to 2-5 factual sentences
- Target audience should be specific job titles (CIO, VP IT, etc.)
- Return ONLY valid JSON, no other text`;
}

/**
 * Enrich a draft using LLM (optional).
 * Falls back to rule-based generation if LLM fails.
 */
export async function enrichWithLLM(event: ArgyleEvent): Promise<DraftFieldsPayload> {
  const ruleBasedFields = generateSourceFields(event);

  try {
    // Try Gemini first (Google-native bias)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!geminiKey) {
      console.log('[DraftGenerator] No Gemini API key, using rule-based generation');
      return ruleBasedFields;
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genai = new GoogleGenerativeAI(geminiKey);
    const model = genai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildEnrichmentPrompt(event);
    const result = await model.generateContent(prompt);
    const responseText = result.response?.text();

    if (!responseText) {
      console.log('[DraftGenerator] Empty LLM response, using rule-based');
      return ruleBasedFields;
    }

    // Parse JSON
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

    const brief: CampaignBrief = JSON.parse(jsonStr.trim());

    // Merge LLM results with rule-based (preserving event source data)
    return {
      ...ruleBasedFields,
      title: brief.title || ruleBasedFields.title,
      context: brief.context || ruleBasedFields.context,
      objective: brief.objective || ruleBasedFields.objective,
      targetAudience: brief.targetAudience?.length > 0 ? brief.targetAudience : ruleBasedFields.targetAudience,
      targetIndustries: brief.targetIndustries?.length > 0 ? brief.targetIndustries : ruleBasedFields.targetIndustries,
      targetingNotes: brief.targetingNotes || ruleBasedFields.targetingNotes,
      timingNotes: brief.timingNotes || ruleBasedFields.timingNotes,
    };
  } catch (error: any) {
    console.error('[DraftGenerator] LLM enrichment failed, using rule-based:', error.message);
    return ruleBasedFields;
  }
}
