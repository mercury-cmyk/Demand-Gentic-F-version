/**
 * AI Disposition Intelligence Service
 *
 * Analyzes call dispositions across campaigns to generate coaching recommendations,
 * detect patterns, and produce actionable improvements for AI voice agents.
 */

import OpenAI from 'openai';

// Use DeepSeek for coaching analysis (cheaper, good at reasoning tasks)
// Falls back to OpenAI if DeepSeek is not configured
function getAIClient(): { client: OpenAI; model: string } {
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  if (hasDeepSeek) {
    return {
      client: new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      }),
      model: 'deepseek-chat',
    };
  }
  return {
    client: new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    }),
    model: 'gpt-4o',
  };
}

const LOG_PREFIX = '[DispositionIntelligence]';

// ============================================================================
// TYPES
// ============================================================================

interface CallDataForAnalysis {
  callSessionId: string;
  transcript: string;
  disposition: string | null;
  qualityScore: number | null;
  engagementScore: number | null;
  objectionHandlingScore: number | null;
  closingScore: number | null;
  flowComplianceScore: number | null;
  durationSeconds: number | null;
  issues: any[];
  recommendations: any[];
  campaignName: string | null;
  sentiment: string | null;
  assignedDisposition: string | null;
  expectedDisposition: string | null;
  dispositionAccurate: boolean | null;
}

interface CampaignContext {
  name: string;
  objective: string | null;
  successCriteria: string | null;
  talkingPoints: any;
  objections: any;
  targetAudienceDescription: string | null;
}

interface CoachingInput {
  calls: CallDataForAnalysis[];
  campaignContext?: CampaignContext;
  focusAreas?: string[];
}

export interface CoachingResult {
  topIssues: Array<{
    issue: string;
    frequency: number;
    impact: 'high' | 'medium' | 'low';
    affectedCalls: number;
    description: string;
  }>;
  recommendations: Array<{
    area: string;
    currentBehavior: string;
    suggestedImprovement: string;
    expectedImpact: string;
    priority: 'high' | 'medium' | 'low';
    examples: Array<{ before: string; after: string }>;
  }>;
  promptImprovements: Array<{
    section: string;
    currentPromptSnippet: string;
    suggestedEdit: string;
    rationale: string;
  }>;
  naturalLanguagePatterns: {
    adopt: Array<{ pattern: string; reason: string; example: string }>;
    avoid: Array<{ pattern: string; reason: string; alternative: string }>;
  };
  voicemailOptimization: {
    avgDetectionTime: number;
    missedVoicemailPhrases: string[];
    recommendations: string[];
  } | null;
  metadata: {
    callsAnalyzed: number;
    dateRange: { start: string; end: string };
    generatedAt: string;
  };
}

// ============================================================================
// COACHING GENERATION
// ============================================================================

export async function generateCoachingRecommendations(
  input: CoachingInput
): Promise<CoachingResult> {
  const { calls, campaignContext, focusAreas } = input;

  if (calls.length === 0) {
    return {
      topIssues: [],
      recommendations: [],
      promptImprovements: [],
      naturalLanguagePatterns: { adopt: [], avoid: [] },
      voicemailOptimization: null,
      metadata: {
        callsAnalyzed: 0,
        dateRange: { start: '', end: '' },
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // Pre-aggregate issue frequencies
  const issueFrequencies: Record<string, number> = {};
  for (const call of calls) {
    if (Array.isArray(call.issues)) {
      for (const issue of call.issues) {
        const key = issue.type || issue.description || 'unknown';
        issueFrequencies[key] = (issueFrequencies[key] || 0) + 1;
      }
    }
  }

  // Build call summaries (truncate transcripts to 3000 chars each)
  const callSummaries = calls.map((call, i) => {
    const transcript = (call.transcript || '').slice(0, 3000);
    return `
--- Call ${i + 1} ---
Disposition: ${call.disposition || 'unknown'}
${call.dispositionAccurate === false ? `Expected Disposition: ${call.expectedDisposition}` : ''}
Quality Score: ${call.qualityScore ?? 'N/A'}/100
Duration: ${call.durationSeconds ?? 'N/A'}s
Sentiment: ${call.sentiment || 'N/A'}
Engagement: ${call.engagementScore ?? 'N/A'}/100
Objection Handling: ${call.objectionHandlingScore ?? 'N/A'}/100
Closing: ${call.closingScore ?? 'N/A'}/100
Flow Compliance: ${call.flowComplianceScore ?? 'N/A'}/100
Issues: ${Array.isArray(call.issues) ? call.issues.map((i: any) => `[${i.severity}] ${i.type}: ${i.description}`).join('; ') : 'None'}
Transcript:
${transcript}`;
  }).join('\n');

  // Build campaign context section
  const campaignSection = campaignContext ? `
CAMPAIGN CONTEXT:
Name: ${campaignContext.name}
Objective: ${campaignContext.objective || 'Not specified'}
Success Criteria: ${campaignContext.successCriteria || 'Not specified'}
Target Audience: ${campaignContext.targetAudienceDescription || 'Not specified'}
Talking Points: ${JSON.stringify(campaignContext.talkingPoints || [])}
Known Objections: ${JSON.stringify(campaignContext.objections || [])}
` : '';

  // Build focus areas section
  const focusSection = focusAreas?.length
    ? `\nFOCUS AREAS (prioritize these in your analysis): ${focusAreas.join(', ')}\n`
    : '';

  const systemPrompt = `You are an expert B2B sales coach and AI voice agent performance analyst. You analyze batches of call transcripts and quality data to identify systemic patterns, common mistakes, and generate actionable coaching recommendations.

${campaignSection}
${focusSection}

AGGREGATE ISSUE FREQUENCIES ACROSS ALL CALLS:
${Object.entries(issueFrequencies).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([issue, count]) => `- ${issue}: ${count} occurrences`).join('\n')}

CRITICAL RULES — DO NOT VIOLATE:
1. NEVER suggest improvements to pronunciation, enunciation, or speech clarity. The agent is an AI voice agent — any perceived pronunciation issues are speech-to-text (STT) transcription errors, NOT actual agent mistakes.
2. NEVER suggest leaving voicemails. This system does NOT leave voicemails. If a call reached voicemail, the agent correctly hung up.
3. NEVER flag STT artifacts (misspellings, garbled words, incomplete sentences) as agent performance issues.
4. NEVER suggest "bundled openings" or combining greeting and introduction. The two-step opening flow (confirm identity first, then introduce purpose) is intentional.
5. The agent says "calling on behalf of [Organization]" — NEVER suggest changing to "calling from [Organization]".
6. All analysis MUST be contextualized against the campaign objectives and success criteria, NOT generic sales best practices.
7. Focus on actionable, specific improvements — not vague suggestions.
8. When analyzing voicemail calls, focus on how quickly the agent detected it was a voicemail and hung up. Suggest specific phrases/patterns to detect faster.

Respond with a JSON object matching this structure exactly:
{
  "topIssues": [{"issue": "string", "frequency": number, "impact": "high|medium|low", "affectedCalls": number, "description": "string"}],
  "recommendations": [{"area": "string", "currentBehavior": "string", "suggestedImprovement": "string", "expectedImpact": "string", "priority": "high|medium|low", "examples": [{"before": "string", "after": "string"}]}],
  "promptImprovements": [{"section": "string", "currentPromptSnippet": "string", "suggestedEdit": "string", "rationale": "string"}],
  "naturalLanguagePatterns": {
    "adopt": [{"pattern": "string", "reason": "string", "example": "string"}],
    "avoid": [{"pattern": "string", "reason": "string", "alternative": "string"}]
  },
  "voicemailOptimization": {"avgDetectionTime": number, "missedVoicemailPhrases": ["string"], "recommendations": ["string"]} or null
}`;

  const userPrompt = `Analyze these ${calls.length} calls and generate coaching recommendations:

${callSummaries}

Generate a comprehensive coaching analysis. Be specific — reference actual phrases from the transcripts. Prioritize issues by frequency and impact on campaign objectives.`;

  try {
    const { client, model } = getAIClient();
    console.log(`${LOG_PREFIX} Generating coaching for ${calls.length} calls using ${model}...`);

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty AI response');
    }

    const parsed = JSON.parse(content);
    console.log(`${LOG_PREFIX} Coaching generated: ${parsed.topIssues?.length || 0} issues, ${parsed.recommendations?.length || 0} recommendations`);

    return {
      topIssues: parsed.topIssues || [],
      recommendations: parsed.recommendations || [],
      promptImprovements: parsed.promptImprovements || [],
      naturalLanguagePatterns: parsed.naturalLanguagePatterns || { adopt: [], avoid: [] },
      voicemailOptimization: parsed.voicemailOptimization || null,
      metadata: {
        callsAnalyzed: calls.length,
        dateRange: {
          start: calls[calls.length - 1]?.callSessionId || '',
          end: calls[0]?.callSessionId || '',
        },
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Coaching generation failed:`, error.message);
    throw new Error(`Failed to generate coaching recommendations: ${error.message}`);
  }
}
