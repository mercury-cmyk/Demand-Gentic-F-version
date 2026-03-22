import { describe, expect, it } from 'vitest';
import { isWithinBusinessHours, type BusinessHoursConfig } from './business-hours';

function buildConfig(overrides: Partial = {}): BusinessHoursConfig {
  return {
    enabled: true,
    timezone: 'America/Chicago',
    operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    startTime: '09:00',
    endTime: '17:00',
    respectContactTimezone: false,
    excludedDates: [],
    ...overrides,
  };
}

describe('isWithinBusinessHours', () => {
  it('accepts non-zero-padded times like 9:00-17:00', () => {
    const config = buildConfig({ startTime: '9:00', endTime: '17:00' });
    const checkTime = new Date('2026-02-23T20:30:00Z'); // Mon 14:30 America/Chicago

    expect(isWithinBusinessHours(config, undefined, checkTime)).toBe(true);
  });

  it('accepts AM/PM times like 8:00 AM-5:00 PM', () => {
    const config = buildConfig({ startTime: '8:00 AM', endTime: '5:00 PM' });
    const checkTime = new Date('2026-02-23T20:30:00Z'); // Mon 14:30 America/Chicago

    expect(isWithinBusinessHours(config, undefined, checkTime)).toBe(true);
  });

  it('normalizes operating day casing', () => {
    const config = buildConfig({ operatingDays: ['Monday', 'Tuesday', 'WEDNESDAY'] });
    const checkTime = new Date('2026-02-23T20:30:00Z'); // Monday

    expect(isWithinBusinessHours(config, undefined, checkTime)).toBe(true);
  });
});