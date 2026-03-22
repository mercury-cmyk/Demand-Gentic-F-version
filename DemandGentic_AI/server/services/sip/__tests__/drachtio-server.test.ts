import { describe, expect, it } from 'vitest';

import { formatSipInitiationError, normalizeSipDialNumber } from '../drachtio-server';

describe('drachtio-server SIP helpers', () => {
  it('preserves E.164 plus prefix while stripping punctuation', () => {
    expect(normalizeSipDialNumber('+44 20 7608 9100')).toBe('+442076089100');
    expect(normalizeSipDialNumber('+1 (289) 914-2727')).toBe('+12899142727');
  });

  it('normalizes non-E.164 input to digits', () => {
    expect(normalizeSipDialNumber('020 7608 9100')).toBe('02076089100');
  });

  it('includes SIP status and reason in formatted initiation errors', () => {
    const error = {
      status: 403,
      reason: 'Forbidden',
      res: {
        get(header: string) {
          if (header.toLowerCase() === 'warning') {
            return '399 telnyx "invalid caller id"';
          }
          return '';
        },
      },
    };

    expect(formatSipInitiationError(error)).toBe('SIP 403 Forbidden: 399 telnyx "invalid caller id"');
  });

  it('falls back to the original error message when no SIP status exists', () => {
    expect(formatSipInitiationError(new Error('socket hang up'))).toBe('socket hang up');
  });
});