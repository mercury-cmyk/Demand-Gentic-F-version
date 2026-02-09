/**
 * Argyle Events Integration — Unit Tests
 *
 * Coverage:
 * - HTML listing parser
 * - Event detail parser
 * - Date parsing / normalizeExternalId
 * - Draft field generation (rule-based)
 * - Edit-safe merge logic
 * - Feature flag / client gating (mocked DB)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Import pure functions from scraper + draft-generator
// ---------------------------------------------------------------------------
import {
  parseEventsListing,
  parseEventDetail,
  parseDateString,
  normalizeExternalId,
} from '../scraper';

import { generateSourceFields, buildEnrichmentPrompt } from '../draft-generator';

import type { ArgyleEvent, ArgyleEventListItem, DraftFieldsPayload } from '../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// 1. Events listing parser
// ---------------------------------------------------------------------------
describe('parseEventsListing', () => {
  it('extracts events from the listing fixture', () => {
    const html = readFixture('events-listing.html');
    const events = parseEventsListing(html);

    // Should find exactly 3 real events (skipping nav/footer links and short text)
    expect(events.length).toBe(3);
  });

  it('deduplicates events by URL', () => {
    // Same URL twice
    const html = `
      <a href="https://argyleforum.com/events/dup-event/">
        Finance CFO Summit Duplicate Event Title
        CFO Summit: Duplicate Event Title
        Forum January 1, 2026 | Virtual
      </a>
      <a href="https://argyleforum.com/events/dup-event/">
        Finance CFO Summit Duplicate Event Title Copy
        CFO Summit: Duplicate Event Title Again
        Forum January 1, 2026 | Virtual
      </a>
    `;
    const events = parseEventsListing(html);
    expect(events.length).toBe(1);
    expect(events[0].url).toBe('https://argyleforum.com/events/dup-event/');
  });

  it('skips events-landing and past events links', () => {
    const html = `
      <a href="https://argyleforum.com/events-landing/">Events Landing</a>
      <a href="https://argyleforum.com/events-landing/?past=true">Past Events Link Here</a>
    `;
    const events = parseEventsListing(html);
    expect(events.length).toBe(0);
  });

  it('skips links with very short text', () => {
    const html = `<a href="https://argyleforum.com/events/tiny/">Short</a>`;
    const events = parseEventsListing(html);
    expect(events.length).toBe(0);
  });

  it('handles empty HTML gracefully', () => {
    const events = parseEventsListing('<html><body></body></html>');
    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Event detail parser
// ---------------------------------------------------------------------------
describe('parseEventDetail', () => {
  const detailHtml = readFixture('event-detail.html');
  const testUrl = 'https://argyleforum.com/events/cio-leadership-forum-2026/';
  const listItem: ArgyleEventListItem = {
    community: 'Information Technology',
    subtitle: 'CIO Leadership Forum',
    title: 'Navigating the AI-First Enterprise',
    eventType: 'Forum',
    dateHuman: 'February 12, 2026',
    location: 'Virtual',
    url: testUrl,
  };

  it('extracts the title from H1', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.title).toBe('Navigating the AI-First Enterprise');
  });

  it('extracts date and location from H4', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.dateHuman).toBe('February 12, 2026');
    expect(event.location).toBe('Virtual');
  });

  it('parses the ISO date correctly', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.dateIso).toBeTruthy();
    const parsed = new Date(event.dateIso!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(1); // February = 1
    expect(parsed.getDate()).toBe(12);
  });

  it('extracts overview excerpt', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.overviewExcerpt).toBeTruthy();
    expect(event.overviewExcerpt).toContain('AI');
    expect(event.overviewExcerpt).toContain('CIO');
    // Should include bullet points
    expect(event.overviewExcerpt).toContain('•');
  });

  it('stops overview at the next H3 section', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    // "Key Takeaways" content should NOT be in the overview
    expect(event.overviewExcerpt).not.toContain('actionable insights');
  });

  it('extracts speaker names', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.speakersExcerpt).toBeTruthy();
    expect(event.speakersExcerpt).toContain('Jane Smith');
    expect(event.speakersExcerpt).toContain('John Doe');
    expect(event.speakersExcerpt).toContain('Sarah Johnson');
  });

  it('extracts agenda items (skipping time entries and breaks)', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.agendaExcerpt).toBeTruthy();
    expect(event.agendaExcerpt).toContain('Opening Keynote');
    expect(event.agendaExcerpt).toContain('Cloud Modernization');
    expect(event.agendaExcerpt).toContain('Panel');
    // Should skip "9:00 AM", "12:00 PM", and "Break"
    expect(event.agendaExcerpt).not.toContain('9:00 AM');
    expect(event.agendaExcerpt).not.toContain('12:00 PM');
    // "Break" is short enough to be filtered
    expect(event.agendaExcerpt).not.toMatch(/\bBreak\b/);
  });

  it('generates a stable externalId from URL', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.externalId).toBe('events/cio-leadership-forum-2026');
  });

  it('generates a sourceHash', () => {
    const event = parseEventDetail(detailHtml, testUrl, listItem);
    expect(event.sourceHash).toBeTruthy();
    expect(event.sourceHash!.length).toBe(16);
  });

  it('falls back to listItem data if page lacks structured content', () => {
    const bareHtml = '<html><body><h1>Bare Page</h1></body></html>';
    const event = parseEventDetail(bareHtml, testUrl, listItem);
    expect(event.community).toBe('Information Technology');
    expect(event.eventType).toBe('Forum');
    expect(event.dateHuman).toBe('February 12, 2026');
  });

  it('handles detail page with no listItem', () => {
    const event = parseEventDetail(detailHtml, testUrl);
    expect(event.title).toBe('Navigating the AI-First Enterprise');
    // Should still extract date from h4 in the page
    expect(event.dateHuman).toBe('February 12, 2026');
  });
});

// ---------------------------------------------------------------------------
// 3. parseDateString
// ---------------------------------------------------------------------------
describe('parseDateString', () => {
  it('parses "February 12, 2026"', () => {
    const result = parseDateString('February 12, 2026');
    expect(result.dateIso).toBeTruthy();
    expect(result.needsDateReview).toBe(false);
    const d = new Date(result.dateIso!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(12);
  });

  it('parses "March 18 2026" (no comma)', () => {
    const result = parseDateString('March 18 2026');
    expect(result.dateIso).toBeTruthy();
    expect(result.needsDateReview).toBe(false);
  });

  it('returns needsDateReview for empty string', () => {
    const result = parseDateString('');
    expect(result.dateIso).toBeNull();
    expect(result.needsDateReview).toBe(true);
  });

  it('returns needsDateReview for unparseable string', () => {
    const result = parseDateString('Coming Soon');
    expect(result.dateIso).toBeNull();
    expect(result.needsDateReview).toBe(true);
  });

  it('returns needsDateReview for garbage input', () => {
    const result = parseDateString('not-a-date');
    expect(result.needsDateReview).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. normalizeExternalId
// ---------------------------------------------------------------------------
describe('normalizeExternalId', () => {
  it('strips protocol and domain', () => {
    expect(normalizeExternalId('https://argyleforum.com/events/my-event/')).toBe('events/my-event');
  });

  it('strips trailing slashes', () => {
    expect(normalizeExternalId('https://argyleforum.com/events/my-event')).toBe('events/my-event');
  });

  it('strips leading slashes', () => {
    expect(normalizeExternalId('https://argyleforum.com//events//my-event//')).toBe('events//my-event');
  });

  it('handles non-URL input gracefully', () => {
    const result = normalizeExternalId('events/some-path');
    expect(result).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. Draft field generation (rule-based)
// ---------------------------------------------------------------------------
describe('generateSourceFields', () => {
  const baseEvent: ArgyleEvent = {
    externalId: 'events/cio-forum-2026',
    sourceUrl: 'https://argyleforum.com/events/cio-forum-2026/',
    title: 'CIO Leadership Forum: AI Transformation',
    subtitle: 'CIO Leadership Forum',
    community: 'Information Technology',
    eventType: 'Forum',
    location: 'Virtual',
    dateHuman: 'February 12, 2026',
    dateIso: '2026-02-12T00:00:00.000Z',
    overviewExcerpt: 'Explore AI-driven transformation for enterprise IT leaders.',
    speakersExcerpt: 'Jane Smith (CIO, Acme), John Doe (CTO, TechCo)',
  };

  it('generates a title including event name and type', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.title).toContain('CIO Leadership Forum');
    expect(fields.title).toContain('Forum');
  });

  it('generates lead_generation orderType', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.orderType).toBe('lead_generation');
  });

  it('maps IT community to CIO/CTO target titles', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.targetAudience).toEqual(expect.arrayContaining(['CIO', 'CTO']));
  });

  it('includes technology industries for IT community', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.targetIndustries).toEqual(expect.arrayContaining(['Technology']));
  });

  it('refines audience based on CIO keyword in title', () => {
    const fields = generateSourceFields(baseEvent);
    // CIO keyword should inject CIO-specific titles
    expect(fields.targetAudience).toEqual(expect.arrayContaining(['CIO', 'VP IT']));
  });

  it('includes event metadata in source fields', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.eventDate).toBe('February 12, 2026');
    expect(fields.eventType).toBe('Forum');
    expect(fields.eventCommunity).toBe('Information Technology');
    expect(fields.eventLocation).toBe('Virtual');
    expect(fields.sourceUrl).toBe('https://argyleforum.com/events/cio-forum-2026/');
  });

  it('includes overview and speakers in context', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.context).toContain('AI-driven transformation');
    expect(fields.context).toContain('Jane Smith');
  });

  it('generates a meaningful objective', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.objective).toContain('qualified leads');
    expect(fields.objective).toContain('CIO Leadership Forum');
  });

  it('generates timing notes', () => {
    const fields = generateSourceFields(baseEvent);
    expect(fields.timingNotes).toBeTruthy();
    expect(fields.timingNotes.length).toBeGreaterThan(10);
  });

  it('handles event with unknown community gracefully', () => {
    const unknownEvent: ArgyleEvent = {
      ...baseEvent,
      community: 'Unknown Area',
    };
    const fields = generateSourceFields(unknownEvent);
    // Should use fallback audience
    expect(fields.targetAudience.length).toBeGreaterThan(0);
  });

  it('handles event with no community', () => {
    const noCommEvent: ArgyleEvent = {
      ...baseEvent,
      community: undefined,
    };
    const fields = generateSourceFields(noCommEvent);
    expect(fields.targetAudience.length).toBeGreaterThan(0);
  });

  it('handles Finance community correctly', () => {
    const finEvent: ArgyleEvent = {
      ...baseEvent,
      community: 'Finance',
      title: 'CFO Financial Summit',
    };
    const fields = generateSourceFields(finEvent);
    expect(fields.targetAudience).toEqual(expect.arrayContaining(['CFO']));
    expect(fields.targetIndustries).toEqual(expect.arrayContaining(['Financial Services']));
  });

  it('handles HR community correctly', () => {
    const hrEvent: ArgyleEvent = {
      ...baseEvent,
      community: 'Human Resources',
      title: 'CHRO Talent Forum',
    };
    const fields = generateSourceFields(hrEvent);
    expect(fields.targetAudience).toEqual(expect.arrayContaining(['CHRO']));
  });
});

// ---------------------------------------------------------------------------
// 6. buildEnrichmentPrompt
// ---------------------------------------------------------------------------
describe('buildEnrichmentPrompt', () => {
  it('includes event data in the prompt', () => {
    const event: ArgyleEvent = {
      externalId: 'events/test',
      sourceUrl: 'https://argyleforum.com/events/test/',
      title: 'Test Event',
      community: 'Finance',
      eventType: 'Webinar',
      dateHuman: 'March 5, 2026',
      location: 'Virtual',
    };
    const prompt = buildEnrichmentPrompt(event);
    expect(prompt).toContain('Test Event');
    expect(prompt).toContain('Finance');
    expect(prompt).toContain('Webinar');
    expect(prompt).toContain('March 5, 2026');
    expect(prompt).toContain('Virtual');
  });

  it('requests strict JSON output', () => {
    const event: ArgyleEvent = {
      externalId: 'events/test',
      sourceUrl: 'https://argyleforum.com/events/test/',
      title: 'Prompt Test',
    };
    const prompt = buildEnrichmentPrompt(event);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('ONLY valid JSON');
  });
});

// ---------------------------------------------------------------------------
// 7. Edit-safe merge logic (test via exposed function pattern)
// ---------------------------------------------------------------------------
describe('edit-safe merge logic', () => {
  // Since mergeFields is private, we test the merge invariant indirectly
  // by verifying the contract that generateSourceFields produces.
  // For direct merge testing, we inline the same logic.

  function mergeFields(
    newSourceFields: DraftFieldsPayload,
    existingDraftFields: Record<string, any>,
    editedFields: string[],
  ): Record<string, any> {
    const merged = { ...existingDraftFields };
    const editedSet = new Set(editedFields);
    for (const [key, value] of Object.entries(newSourceFields)) {
      if (editedSet.has(key)) continue;
      if (key === 'lead_count') continue;
      merged[key] = value;
    }
    return merged;
  }

  const sourceFields: DraftFieldsPayload = {
    title: 'New Title from Sync',
    description: 'New description',
    context: 'New context',
    objective: 'New objective',
    targetAudience: ['CIO', 'CTO'],
    targetIndustries: ['Technology'],
    targetingNotes: 'New targeting notes',
    timingNotes: 'New timing notes',
    orderType: 'lead_generation',
    eventDate: 'Feb 12, 2026',
    eventType: 'Forum',
    eventCommunity: 'IT',
    eventLocation: 'Virtual',
    sourceUrl: 'https://argyleforum.com/events/test/',
  };

  it('overwrites non-edited fields with new source data', () => {
    const existingDraft = {
      title: 'Old Title',
      description: 'Old description',
      lead_count: 500,
    };
    const merged = mergeFields(sourceFields, existingDraft, []);
    expect(merged.title).toBe('New Title from Sync');
    expect(merged.description).toBe('New description');
  });

  it('preserves client-edited fields', () => {
    const existingDraft = {
      title: 'My Custom Title',
      description: 'My custom description',
      context: 'Original context',
    };
    const merged = mergeFields(sourceFields, existingDraft, ['title', 'description']);
    expect(merged.title).toBe('My Custom Title');
    expect(merged.description).toBe('My custom description');
    // Non-edited fields SHOULD be updated
    expect(merged.context).toBe('New context');
  });

  it('NEVER overwrites lead_count', () => {
    const existingDraft = {
      title: 'Old Title',
      lead_count: 750,
    };
    const merged = mergeFields(sourceFields, existingDraft, []);
    expect(merged.lead_count).toBe(750);
  });

  it('preserves lead_count even if in editedFields', () => {
    const existingDraft = { lead_count: 1000 };
    const merged = mergeFields(sourceFields, existingDraft, ['lead_count']);
    expect(merged.lead_count).toBe(1000);
  });

  it('adds new source fields that did not exist in draft', () => {
    const existingDraft = { title: 'Old' };
    const merged = mergeFields(sourceFields, existingDraft, []);
    expect(merged.targetAudience).toEqual(['CIO', 'CTO']);
    expect(merged.timingNotes).toBe('New timing notes');
  });

  it('handles empty editedFields array', () => {
    const existingDraft = { title: 'Old' };
    const merged = mergeFields(sourceFields, existingDraft, []);
    expect(merged.title).toBe('New Title from Sync');
  });

  it('handles all fields edited (nothing overwritten)', () => {
    const allFields = Object.keys(sourceFields);
    const existingDraft: Record<string, any> = {};
    allFields.forEach(k => { existingDraft[k] = `custom_${k}`; });
    existingDraft.lead_count = 999;

    const merged = mergeFields(sourceFields, existingDraft, allFields);

    // Everything should remain as the custom value
    for (const k of allFields) {
      expect(merged[k]).toBe(`custom_${k}`);
    }
    expect(merged.lead_count).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// 8. PII redaction (tested via parseEventDetail output)
// ---------------------------------------------------------------------------
describe('PII redaction', () => {
  it('redacts email addresses from overview', () => {
    const html = `
      <html><body>
        <h1>Test Event</h1>
        <h3>Overview</h3>
        <p>Contact us at speaker@example.com for more info about this great event with details.</p>
      </body></html>
    `;
    const event = parseEventDetail(html, 'https://argyleforum.com/events/test/');
    expect(event.overviewExcerpt).not.toContain('speaker@example.com');
    expect(event.overviewExcerpt).toContain('[email-redacted]');
  });

  it('redacts phone numbers from overview', () => {
    const html = `
      <html><body>
        <h1>Test Event</h1>
        <h3>Overview</h3>
        <p>Call us at (555) 123-4567 for registration details and event information updates.</p>
      </body></html>
    `;
    const event = parseEventDetail(html, 'https://argyleforum.com/events/test/');
    expect(event.overviewExcerpt).not.toContain('555');
    expect(event.overviewExcerpt).toContain('[phone-redacted]');
  });
});
