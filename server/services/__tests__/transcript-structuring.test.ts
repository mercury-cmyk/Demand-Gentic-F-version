import { describe, expect, it } from 'vitest';

import {
  formatTranscriptTurns,
  mergeTranscriptTurns,
  normalizeTranscriptTurns,
} from '../transcript-structuring';

describe('transcript-structuring', () => {
  it('normalizes mixed live callback turns into canonical agent/contact roles', () => {
    const turns = normalizeTranscriptTurns([
      { role: 'assistant', text: 'Hello, this is Sarah.' },
      { speaker: 'user', text: 'Hi there.' },
      { role: 'agent', text: 'Quick question for you.' },
      { role: 'contact', text: 'Sure.', timestamp: 1710000000000 },
    ]);

    expect(turns).toMatchObject([
      { role: 'agent', text: 'Hello, this is Sarah.' },
      { role: 'contact', text: 'Hi there.' },
      { role: 'agent', text: 'Quick question for you.' },
      {
        role: 'contact',
        text: 'Sure.',
        timestamp: new Date(1710000000000).toISOString(),
      },
    ]);
  });

  it('merges adjacent same-speaker fragments and formats the transcript with labels', () => {
    const merged = mergeTranscriptTurns([
      { role: 'agent', text: 'Hello there' },
      { role: 'agent', text: 'hello there' },
      { role: 'contact', text: 'No thanks' },
      { role: 'contact', text: 'not interested today' },
    ]);

    expect(merged).toEqual([
      { role: 'agent', text: 'Hello there' },
      { role: 'contact', text: 'No thanks not interested today' },
    ]);

    expect(formatTranscriptTurns(merged)).toBe(
      'Agent: Hello there\nContact: No thanks not interested today'
    );
  });

  it('parses labeled plain-text transcripts into structured turns', () => {
    const turns = normalizeTranscriptTurns(
      'Agent: Good morning\nContact: Not a good time\nAgent: Understood'
    );

    expect(turns).toEqual([
      { role: 'agent', text: 'Good morning' },
      { role: 'contact', text: 'Not a good time' },
      { role: 'agent', text: 'Understood' },
    ]);
  });
});
