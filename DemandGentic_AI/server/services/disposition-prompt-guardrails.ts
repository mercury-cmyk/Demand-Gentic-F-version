import type { PhraseInsightResult, PhraseInsightTerm } from './disposition-phrase-insights';

export interface PromptGuardrailExport {
  generatedAt: string;
  summary: {
    analyzedCalls: number;
    dispositions: string[];
  };
  sections: {
    voicemailMarkers: string[];
    qualifiedIntentLexicon: string[];
    notInterestedSuppressionCues: string[];
    doNotCallCues: string[];
    machineDetectedCues: string[];
    humanDetectedCues: string[];
  };
  promptBlock: string;
}

function pickTerms(terms: PhraseInsightTerm[] | undefined, max = 8): string[] {
  if (!terms?.length) return [];
  return terms.slice(0, max).map((t) => t.term);
}

function uniqueCompact(items: string[]): string[] {
  const seen = new Set();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item.trim());
  }
  return result;
}

export function buildPromptGuardrailExport(phraseInsights: PhraseInsightResult): PromptGuardrailExport {
  const byDisposition = new Map(phraseInsights.byDisposition.map((b) => [b.key, b]));
  const bySignal = new Map(phraseInsights.byDetectionSignal.map((b) => [b.key, b]));

  const vm = byDisposition.get('voicemail');
  const qualified = byDisposition.get('qualified_lead');
  const notInterested = byDisposition.get('not_interested');
  const dnc = byDisposition.get('do_not_call');

  const machine = bySignal.get('machine');
  const human = bySignal.get('human');

  const voicemailMarkers = uniqueCompact([
    ...pickTerms(vm?.topBigrams, 8),
    ...pickTerms(vm?.topTrigrams, 6),
    ...pickTerms(machine?.topKeywords, 6),
  ]);

  const qualifiedIntentLexicon = uniqueCompact([
    ...pickTerms(qualified?.topKeywords, 8),
    ...pickTerms(qualified?.topBigrams, 8),
  ]);

  const notInterestedSuppressionCues = uniqueCompact([
    ...pickTerms(notInterested?.topKeywords, 8),
    ...pickTerms(notInterested?.topBigrams, 8),
  ]);

  const doNotCallCues = uniqueCompact([
    ...pickTerms(dnc?.topKeywords, 8),
    ...pickTerms(dnc?.topBigrams, 8),
  ]);

  const machineDetectedCues = uniqueCompact([
    ...pickTerms(machine?.topKeywords, 8),
    ...pickTerms(machine?.topBigrams, 6),
  ]);

  const humanDetectedCues = uniqueCompact([
    ...pickTerms(human?.topKeywords, 8),
    ...pickTerms(human?.topBigrams, 6),
  ]);

  const guardrailLines = [
    '## HISTORICAL DISPOSITION DETECTION GUARDRAILS (AUTO-GENERATED)',
    '',
    `- Data basis: ${phraseInsights.analyzedCalls} historical calls`,
    '- Objective: favor real observed language cues over generic heuristics.',
    '',
    '### 1) MACHINE / VOICEMAIL DETECTION (HIGH PRIORITY)',
    voicemailMarkers.length
      ? `Prioritize these cues for early machine/voicemail detection: ${voicemailMarkers.map((x) => `"${x}"`).join(', ')}`
      : 'No strong voicemail markers found in current filter window.',
    machineDetectedCues.length
      ? `Machine-detected signal words/phrases: ${machineDetectedCues.map((x) => `"${x}"`).join(', ')}`
      : 'No machine-specific signals available.',
    '',
    '### 2) HUMAN DETECTION',
    humanDetectedCues.length
      ? `Human-detected signal words/phrases: ${humanDetectedCues.map((x) => `"${x}"`).join(', ')}`
      : 'No human-specific signals available.',
    '',
    '### 3) QUALIFIED LEAD LEXICON',
    qualifiedIntentLexicon.length
      ? `Treat these as positive intent cues (with context): ${qualifiedIntentLexicon.map((x) => `"${x}"`).join(', ')}`
      : 'No strong qualified-intent lexicon found in current filter window.',
    '',
    '### 4) NOT-INTERESTED SUPPRESSION CUES',
    notInterestedSuppressionCues.length
      ? `Treat these as not-interested cues (with context): ${notInterestedSuppressionCues.map((x) => `"${x}"`).join(', ')}`
      : 'No strong not-interested cues found in current filter window.',
    '',
    '### 5) DNC CUES',
    doNotCallCues.length
      ? `Escalate to DNC handling if explicit cues appear: ${doNotCallCues.map((x) => `"${x}"`).join(', ')}`
      : 'No strong DNC cues found in current filter window.',
    '',
    '### 6) OPERATING RULES',
    '- Use cue combinations, not single-token triggers, when possible.',
    '- If cues conflict, prioritize explicit user intent over probabilistic patterns.',
    '- Log matched cues per call for future learning updates.',
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      analyzedCalls: phraseInsights.analyzedCalls,
      dispositions: phraseInsights.byDisposition.map((b) => b.key),
    },
    sections: {
      voicemailMarkers,
      qualifiedIntentLexicon,
      notInterestedSuppressionCues,
      doNotCallCues,
      machineDetectedCues,
      humanDetectedCues,
    },
    promptBlock: guardrailLines.join('\n'),
  };
}