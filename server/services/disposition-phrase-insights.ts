/**
 * Disposition Phrase Insights Service
 *
 * Deterministic NLP-lite extraction for historical phrase visibility by outcome.
 * Supports canonical dispositions and AMD detection buckets (human/machine/unknown).
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'hers',
  'him', 'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'let', 'like', 'may',
  'me', 'more', 'most', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'ours', 'please',
  's', 'she', 'so', 'that', 'the', 'their', 'them', 'there', 'they', 'this', 'to', 'too',
  'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with',
  'you', 'your', 'yours', 'im', 'ive', 'id', 'dont', 'didnt', 'cant', 'wont', 'thats',
  'hello', 'hi', 'hey', 'thanks', 'thank', 'okay', 'ok', 'yeah', 'yes', 'uh', 'um',
]);

const SPEAKER_PREFIXES = [
  /^\s*agent\s*:\s*/i,
  /^\s*assistant\s*:\s*/i,
  /^\s*ai\s*:\s*/i,
  /^\s*prospect\s*:\s*/i,
  /^\s*contact\s*:\s*/i,
  /^\s*caller\s*:\s*/i,
  /^\s*callee\s*:\s*/i,
  /^\s*customer\s*:\s*/i,
  /^\s*human\s*:\s*/i,
];

export type DetectionSignal = 'human' | 'machine' | 'unknown';

export interface PhraseInsightInputRow {
  callSessionId: string;
  disposition: string;
  transcript: string;
  detectionSignal?: DetectionSignal;
}

export interface PhraseInsightTerm {
  term: string;
  count: number;
  callCoverage: number;
  callCoveragePct: number;
}

export interface PhraseInsightBucket {
  key: string;
  totalCalls: number;
  totalTokens: number;
  topKeywords: PhraseInsightTerm[];
  topBigrams: PhraseInsightTerm[];
  topTrigrams: PhraseInsightTerm[];
}

export interface PhraseInsightResult {
  generatedAt: string;
  analyzedCalls: number;
  settings: {
    minCount: number;
    maxKeywords: number;
    maxPhrases: number;
    minTokenLength: number;
  };
  byDisposition: PhraseInsightBucket[];
  byDetectionSignal: PhraseInsightBucket[];
}

interface ExtractionOptions {
  minCount?: number;
  maxKeywords?: number;
  maxPhrases?: number;
  minTokenLength?: number;
}

function normalizeTranscript(raw: string): string {
  if (!raw) return '';

  const normalizedLines = raw
    .split(/\r?\n/)
    .map((line) => {
      let cleaned = line;
      for (const re of SPEAKER_PREFIXES) {
        cleaned = cleaned.replace(re, '');
      }
      return cleaned;
    })
    .filter(Boolean)
    .join(' ');

  return normalizedLines
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string, minTokenLength: number): string[] {
  if (!text) return [];

  return text
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= minTokenLength)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => !/^\d+$/.test(t));
}

function toNgrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    const gram = tokens.slice(i, i + n).join(' ');
    out.push(gram);
  }
  return out;
}

function rankTerms(
  termCounts: Map<string, number>,
  callCoverage: Map<string, Set<string>>,
  totalCalls: number,
  minCount: number,
  maxOut: number,
): PhraseInsightTerm[] {
  const rows: PhraseInsightTerm[] = [];

  for (const [term, count] of termCounts.entries()) {
    if (count < minCount) continue;
    const coverageSet = callCoverage.get(term);
    const coverage = coverageSet?.size || 0;
    rows.push({
      term,
      count,
      callCoverage: coverage,
      callCoveragePct: totalCalls > 0 ? Math.round((coverage / totalCalls) * 100) : 0,
    });
  }

  return rows
    .sort((a, b) => {
      if (b.callCoverage !== a.callCoverage) return b.callCoverage - a.callCoverage;
      if (b.count !== a.count) return b.count - a.count;
      return a.term.localeCompare(b.term);
    })
    .slice(0, maxOut);
}

function buildBucket(key: string, rows: PhraseInsightInputRow[], opts: Required<ExtractionOptions>): PhraseInsightBucket {
  const keywordCounts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  const trigramCounts = new Map<string, number>();

  const keywordCoverage = new Map<string, Set<string>>();
  const bigramCoverage = new Map<string, Set<string>>();
  const trigramCoverage = new Map<string, Set<string>>();

  let totalTokens = 0;

  for (const row of rows) {
    const normalized = normalizeTranscript(row.transcript || '');
    const tokens = tokenize(normalized, opts.minTokenLength);
    if (tokens.length === 0) continue;

    totalTokens += tokens.length;

    const uniqueKeywords = new Set(tokens);
    const uniqueBigrams = new Set(toNgrams(tokens, 2));
    const uniqueTrigrams = new Set(toNgrams(tokens, 3));

    for (const token of tokens) {
      keywordCounts.set(token, (keywordCounts.get(token) || 0) + 1);
    }
    for (const gram of toNgrams(tokens, 2)) {
      bigramCounts.set(gram, (bigramCounts.get(gram) || 0) + 1);
    }
    for (const gram of toNgrams(tokens, 3)) {
      trigramCounts.set(gram, (trigramCounts.get(gram) || 0) + 1);
    }

    for (const term of uniqueKeywords) {
      if (!keywordCoverage.has(term)) keywordCoverage.set(term, new Set());
      keywordCoverage.get(term)!.add(row.callSessionId);
    }
    for (const term of uniqueBigrams) {
      if (!bigramCoverage.has(term)) bigramCoverage.set(term, new Set());
      bigramCoverage.get(term)!.add(row.callSessionId);
    }
    for (const term of uniqueTrigrams) {
      if (!trigramCoverage.has(term)) trigramCoverage.set(term, new Set());
      trigramCoverage.get(term)!.add(row.callSessionId);
    }
  }

  const totalCalls = rows.length;

  return {
    key,
    totalCalls,
    totalTokens,
    topKeywords: rankTerms(keywordCounts, keywordCoverage, totalCalls, opts.minCount, opts.maxKeywords),
    topBigrams: rankTerms(bigramCounts, bigramCoverage, totalCalls, opts.minCount, opts.maxPhrases),
    topTrigrams: rankTerms(trigramCounts, trigramCoverage, totalCalls, opts.minCount, opts.maxPhrases),
  };
}

export function buildDispositionPhraseInsights(
  rows: PhraseInsightInputRow[],
  options: ExtractionOptions = {},
): PhraseInsightResult {
  const opts: Required<ExtractionOptions> = {
    minCount: options.minCount ?? 3,
    maxKeywords: options.maxKeywords ?? 20,
    maxPhrases: options.maxPhrases ?? 20,
    minTokenLength: options.minTokenLength ?? 3,
  };

  const validRows = rows.filter((row) => row.callSessionId && row.disposition && row.transcript);

  const byDispositionMap = new Map<string, PhraseInsightInputRow[]>();
  const bySignalMap = new Map<DetectionSignal, PhraseInsightInputRow[]>();

  for (const row of validRows) {
    const disposition = row.disposition.trim().toLowerCase();
    const signal: DetectionSignal = row.detectionSignal || 'unknown';

    if (!byDispositionMap.has(disposition)) byDispositionMap.set(disposition, []);
    byDispositionMap.get(disposition)!.push({ ...row, disposition });

    if (!bySignalMap.has(signal)) bySignalMap.set(signal, []);
    bySignalMap.get(signal)!.push({ ...row, disposition, detectionSignal: signal });
  }

  const byDisposition = Array.from(byDispositionMap.entries())
    .map(([key, bucketRows]) => buildBucket(key, bucketRows, opts))
    .sort((a, b) => b.totalCalls - a.totalCalls);

  const byDetectionSignal = (['machine', 'human', 'unknown'] as DetectionSignal[])
    .filter((signal) => bySignalMap.has(signal))
    .map((signal) => buildBucket(signal, bySignalMap.get(signal) || [], opts));

  return {
    generatedAt: new Date().toISOString(),
    analyzedCalls: validRows.length,
    settings: {
      minCount: opts.minCount,
      maxKeywords: opts.maxKeywords,
      maxPhrases: opts.maxPhrases,
      minTokenLength: opts.minTokenLength,
    },
    byDisposition,
    byDetectionSignal,
  };
}
