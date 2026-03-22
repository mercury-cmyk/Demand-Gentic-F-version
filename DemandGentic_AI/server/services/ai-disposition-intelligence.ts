/**
 * AI Disposition Intelligence Service
 *
 * Analyzes call dispositions across campaigns to generate coaching recommendations,
 * detect patterns, and produce actionable improvements for AI voice agents.
 */

import { deepAnalyze } from "./ai-analysis-router";

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

interface AggregateStats {
  totalCalls: number;
  avgQualityScore: number | null;
  avgEngagementScore: number | null;
  avgObjectionHandlingScore: number | null;
  avgClosingScore: number | null;
  avgQualificationScore: number | null;
  avgFlowComplianceScore: number | null;
  avgDuration: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  dispositionDistribution: Record;
  dispositionAccuracy: { accurate: number; inaccurate: number; unreviewed: number };
  issueFrequencies: Record;
}

interface CoachingInput {
  calls: CallDataForAnalysis[];
  campaignContext?: CampaignContext;
  focusAreas?: string[];
  aggregateStats?: AggregateStats;
}

export interface CoachingResult {
  topIssues: Array;
  recommendations: Array;
  }>;
  promptImprovements: Array;
  naturalLanguagePatterns: {
    adopt: Array;
    avoid: Array;
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
): Promise {
  const { calls, campaignContext, focusAreas, aggregateStats } = input;

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

  const totalAnalyzed = aggregateStats?.totalCalls || calls.length;

  // Use aggregate issue frequencies when available, otherwise compute from sampled calls
  let issueFrequencies: Record;
  if (aggregateStats?.issueFrequencies && Object.keys(aggregateStats.issueFrequencies).length > 0) {
    issueFrequencies = aggregateStats.issueFrequencies;
  } else {
    issueFrequencies = {};
    for (const call of calls) {
      if (Array.isArray(call.issues)) {
        for (const issue of call.issues) {
          const key = issue.type || issue.description || 'unknown';
          issueFrequencies[key] = (issueFrequencies[key] || 0) + 1;
        }
      }
    }
  }

  // Build call summaries (truncate transcripts to 2000 chars each to fit more calls)
  const callSummaries = calls.map((call, i) => {
    const transcript = (call.transcript || '').slice(0, 2000);
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

  // Build aggregate statistics section when analyzing large batches
  const aggregateSection = aggregateStats ? `
AGGREGATE STATISTICS FROM ALL ${aggregateStats.totalCalls} CALLS:
(Note: ${calls.length} representative call transcripts are provided below, but these statistics cover ALL ${aggregateStats.totalCalls} calls. Base your frequency/impact estimates on the full dataset, not just the sampled transcripts.)

Performance Averages:
- Overall Quality: ${aggregateStats.avgQualityScore ?? 'N/A'}/100
- Engagement: ${aggregateStats.avgEngagementScore ?? 'N/A'}/100
- Objection Handling: ${aggregateStats.avgObjectionHandlingScore ?? 'N/A'}/100
- Closing: ${aggregateStats.avgClosingScore ?? 'N/A'}/100
- Qualification: ${aggregateStats.avgQualificationScore ?? 'N/A'}/100
- Flow Compliance: ${aggregateStats.avgFlowComplianceScore ?? 'N/A'}/100
- Avg Duration: ${aggregateStats.avgDuration ?? 'N/A'}s

Sentiment Distribution: Positive: ${aggregateStats.sentimentDistribution.positive}, Neutral: ${aggregateStats.sentimentDistribution.neutral}, Negative: ${aggregateStats.sentimentDistribution.negative}

Disposition Distribution:
${Object.entries(aggregateStats.dispositionDistribution).sort((a, b) => b[1] - a[1]).map(([d, c]) => `- ${d}: ${c} calls (${Math.round((c / aggregateStats.totalCalls) * 100)}%)`).join('\n')}

Disposition Accuracy: ${aggregateStats.dispositionAccuracy.accurate} accurate, ${aggregateStats.dispositionAccuracy.inaccurate} inaccurate, ${aggregateStats.dispositionAccuracy.unreviewed} unreviewed
` : '';

  const systemPrompt = `You are an expert B2B sales coach and AI voice agent performance analyst. You analyze batches of call transcripts and quality data to identify systemic patterns, common mistakes, and generate actionable coaching recommendations.

${campaignSection}
${focusSection}
${aggregateSection}

AGGREGATE ISSUE FREQUENCIES ACROSS ALL ${totalAnalyzed} CALLS:
${Object.entries(issueFrequencies).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([issue, count]) => `- ${issue}: ${count} occurrences (${Math.round((count / totalAnalyzed) * 100)}% of calls)`).join('\n')}

CRITICAL RULES — DO NOT VIOLATE:
1. NEVER suggest improvements to pronunciation, enunciation, or speech clarity. The agent is an AI voice agent — any perceived pronunciation issues are speech-to-text (STT) transcription errors, NOT actual agent mistakes.
2. NEVER suggest leaving voicemails. This system does NOT leave voicemails. If a call reached voicemail, the agent correctly hung up.
3. NEVER flag STT artifacts (misspellings, garbled words, incomplete sentences) as agent performance issues.
4. NEVER suggest "bundled openings" or combining greeting and introduction. The two-step opening flow (confirm identity first, then introduce purpose) is intentional.
5. The agent says "calling on behalf of [Organization]" — NEVER suggest changing to "calling from [Organization]".
6. All analysis MUST be contextualized against the campaign objectives and success criteria, NOT generic sales best practices.
7. Focus on actionable, specific improvements — not vague suggestions.
8. When analyzing voicemail calls, focus on how quickly the agent detected it was a voicemail and hung up. Suggest specific phrases/patterns to detect faster.
9. When aggregate statistics are provided, use them to scale your frequency and impact estimates to the FULL dataset, not just the sampled transcripts.

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

  const userPrompt = `Analyze coaching data from ${totalAnalyzed} calls (${calls.length} representative transcripts provided below) and generate coaching recommendations:

${callSummaries}

Generate a comprehensive coaching analysis based on the full ${totalAnalyzed}-call dataset. Be specific — reference actual phrases from the transcripts. Prioritize issues by frequency and impact on campaign objectives. Scale your affectedCalls estimates to the full ${totalAnalyzed} calls, not just the ${calls.length} sampled transcripts.`;

  try {
    console.log(`${LOG_PREFIX} Generating coaching for ${totalAnalyzed} calls (${calls.length} sampled) using Gemini 3 Deep Think...`);

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const parsed = await deepAnalyze(fullPrompt, { temperature: 0.3, maxTokens: 6000, label: "disposition-intel", preferredProvider: "deepseek" });
    console.log(`${LOG_PREFIX} Coaching generated: ${parsed.topIssues?.length || 0} issues, ${parsed.recommendations?.length || 0} recommendations`);

    return {
      topIssues: parsed.topIssues || [],
      recommendations: parsed.recommendations || [],
      promptImprovements: parsed.promptImprovements || [],
      naturalLanguagePatterns: parsed.naturalLanguagePatterns || { adopt: [], avoid: [] },
      voicemailOptimization: parsed.voicemailOptimization || null,
      metadata: {
        callsAnalyzed: totalAnalyzed,
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