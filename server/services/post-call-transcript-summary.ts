export interface SummaryTranscriptTurn {
  role: 'agent' | 'contact';
  text: string;
  timeOffset?: number;
}

interface BuildSummaryOptions {
  durationSec?: number;
  maxWords?: number;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function countWords(value: string): number {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function trimToWords(value: string, maxWords: number): string {
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

function ensureSentence(value: string): string {
  const cleaned = normalizeText(value);
  if (!cleaned) return '';
  if (/[.!?]$/.test(cleaned)) return cleaned;
  return `${cleaned}.`;
}

function inferOutcome(contactText: string): string {
  const text = normalizeText(contactText).toLowerCase();
  if (!text) return 'Outcome remains inconclusive from available transcript evidence';

  if (/(not interested|stop calling|do not call|don't call|remove me|take me off)/.test(text)) {
    return 'Contact signaled disinterest or suppression request';
  }
  if (/(send|email|follow up|call me back|next week|tomorrow|book|schedule)/.test(text)) {
    return 'Contact showed follow-up or next-step intent';
  }
  if (/(wrong number|not the right person|not me|bad number|invalid)/.test(text)) {
    return 'Contact indicated routing or data-quality mismatch';
  }
  if (/(yes|sure|okay|sounds good|interested|that works)/.test(text)) {
    return 'Contact response included positive engagement signals';
  }

  return 'Conversation ended without a strong explicit outcome signal';
}

function enforceSummaryLimit(lines: string[], maxWords: number): string[] {
  const limited: string[] = [];

  for (const line of lines) {
    const candidate = [...limited, line];
    const words = countWords(candidate.join(' '));
    if (words <= maxWords) {
      limited.push(line);
      continue;
    }

    const remaining = maxWords - countWords(limited.join(' '));
    if (remaining > 6) {
      limited.push(trimToWords(line, remaining));
    }
    break;
  }

  while (limited.length < 3) {
    limited.push('Additional context was limited in this recording segment.');
  }

  return limited.slice(0, 4);
}

export function buildPostCallTranscriptWithSummary(
  transcript: string,
  turns: SummaryTranscriptTurn[],
  options?: BuildSummaryOptions
): string {
  const cleanedTranscript = normalizeText(transcript);
  if (!cleanedTranscript) return transcript;

  const maxWords = Math.max(60, Math.min(200, options?.maxWords || 200));
  const normalizedTurns = (turns || [])
    .map((t) => ({
      role: t.role,
      text: normalizeText(t.text),
      timeOffset: typeof t.timeOffset === 'number' ? t.timeOffset : undefined,
    }))
    .filter((t) => t.text.length > 0);

  const agentTurns = normalizedTurns.filter((t) => t.role === 'agent');
  const contactTurns = normalizedTurns.filter((t) => t.role === 'contact');
  const totalTurns = normalizedTurns.length;

  const estimatedDuration =
    typeof options?.durationSec === 'number' && Number.isFinite(options.durationSec)
      ? Math.max(0, Math.round(options.durationSec))
      : Math.max(
          0,
          Math.round(
            normalizedTurns.reduce((max, t) => Math.max(max, t.timeOffset || 0), 0)
          )
        );

  const firstAgent = agentTurns[0]?.text || '';
  const contactReference = contactTurns[contactTurns.length - 1]?.text || contactTurns[0]?.text || '';
  const transcriptExcerpt = trimToWords(cleanedTranscript, 30);

  const candidateLines = [
    ensureSentence(
      `Call overview: ${totalTurns || 0} total turns (${agentTurns.length || 0} agent, ${contactTurns.length || 0} contact)${estimatedDuration > 0 ? ` across ~${estimatedDuration}s` : ''}`
    ),
    ensureSentence(
      `Agent focus: ${trimToWords(firstAgent || transcriptExcerpt, 24)}`
    ),
    ensureSentence(
      `Contact response: ${trimToWords(contactReference || transcriptExcerpt, 24)}`
    ),
    ensureSentence(`Outcome signal: ${inferOutcome(contactReference)}`),
  ].filter(Boolean);

  const summaryLines = enforceSummaryLimit(candidateLines, maxWords);
  const summaryBlock = `[Call Summary]\n${summaryLines.join('\n')}`;

  return `${summaryBlock}\n\n[Call Transcript]\n${transcript.trim()}`;
}
