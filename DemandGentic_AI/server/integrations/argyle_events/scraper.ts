/**
 * Argyle Events Integration — Scraper
 * 
 * Fetches and parses events from https://argyleforum.com/events-landing
 * and individual event detail pages.
 * 
 * Polite scraping:
 * - Rate limited (1 request per 1.5s)
 * - User-Agent identifies us
 * - Timeouts + retries with exponential backoff
 * - Caches results per sync run
 * - Stores minimal excerpts only
 */

import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ArgyleEventListItem, ArgyleEvent } from './types';

const EVENTS_LANDING_URL = 'https://argyleforum.com/events-landing';
const USER_AGENT = 'DemandGenticBot/1.0 (event-sync; +https://demandgentic.ai)';
const REQUEST_DELAY_MS = 1500; // 1.5s between requests
const REQUEST_TIMEOUT_MS = 15000; // 15s timeout
const MAX_RETRIES = 2;
const RETRY_BACKOFF_BASE_MS = 2000;

/** Rate-limit helper: wait between requests */
function delay(ms: number): Promise {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch a URL with timeout, retries, and polite headers */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise {
  for (let attempt = 0; attempt  controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error: any) {
      if (attempt  maxLen * 0.5) {
    return truncated.substring(0, lastPeriod + 1);
  }
  return truncated.trimEnd() + '…';
}

/**
 * Parse the events landing page to extract event list items.
 * 
 * The Argyle events page structure (from inspection):
 * Each event card contains:
 * - A link wrapping the card
 * - Community category text
 * - Event subtitle (series name)
 * - Full title
 * - Event type (Forum/Webinar)
 * - Date and location
 */
export function parseEventsListing(html: string): ArgyleEventListItem[] {
  const $ = cheerio.load(html);
  const events: ArgyleEventListItem[] = [];

  // Each event is an anchor tag linking to /events/...
  // The text structure per event card is:
  // [Community] [Subtitle] [Full Title] [EventType] [Date] | [Location]
  $('a[href*="/events/"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href || !href.startsWith('https://argyleforum.com/events/') || href === 'https://argyleforum.com/events-landing/') {
      return;
    }

    // Skip non-event links (like navigation, footer links)
    if (href.includes('events-landing') || href.includes('past=')) return;

    const rawText = $el.text().trim();
    if (!rawText || rawText.length ();
  return events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

/**
 * Parse the raw text from an event card into structured data.
 * 
 * Example raw text:
 * "Finance From Disconnected Deals to Intelligent Revenue Flow 2026 Finance
 *  Forecast Part 3: Quote-to-Cash From Disconnected Deals to Intelligent Revenue Flow
 *  Webinar February 11, 2026 | Virtual"
 */
function parseEventCardText(rawText: string, url: string): ArgyleEventListItem | null {
  // Known communities
  const communities = [
    'Finance', 'Information Technology', 'Human Resources',
    'Marketing', 'Operations', 'Legal', 'Sales',
  ];

  // Known event types with their patterns
  const eventTypes = ['Forum', 'Webinar', 'Summit', 'Expo'];

  // Normalize whitespace
  const text = rawText.replace(/\s+/g, ' ').trim();

  // Extract community (appears at the start)
  let community = '';
  for (const c of communities) {
    if (text.startsWith(c + ' ')) {
      community = c;
      break;
    }
  }

  // Extract event type and date+location from the end
  // Pattern: "{EventType} {Month} {Day}, {Year} | {Location}"
  const dateLocationPattern = /(Forum|Webinar|Summit|Expo)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\s*\|\s*(.+?)$/i;
  const dateMatch = text.match(dateLocationPattern);

  let eventType = '';
  let dateHuman = '';
  let location = '';
  let titleEndIdx = text.length;

  if (dateMatch) {
    eventType = dateMatch[1];
    dateHuman = dateMatch[2].trim();
    location = dateMatch[3].trim();
    titleEndIdx = dateMatch.index || text.length;
  }

  // The remaining text between community and the date/type is the title(s)
  let titleText = text;
  if (community) {
    titleText = titleText.substring(community.length).trim();
  }
  titleText = titleText.substring(0, titleEndIdx - (community ? community.length + 1 : 0)).trim();

  // Try to extract the subtitle (series name like "CIO Leadership Forum:")
  // It's usually a shorter phrase before the main title
  let subtitle = '';
  const parts = titleText.split(/\s{2,}|\n/);
  if (parts.length >= 2) {
    // First part may be a shorter subtitle/series name
    subtitle = parts[0].trim();
    titleText = parts.slice(1).join(' ').trim() || titleText;
  }

  // If title is still too long or contains duplicate text, clean up
  // Sometimes the listing repeats: "Short Title Long Title" — take the longest distinct part
  const title = titleText || subtitle || 'Untitled Event';

  if (!dateHuman && !title) return null;

  return {
    community,
    subtitle,
    title,
    eventType,
    dateHuman,
    location,
    url,
  };
}

/**
 * Parse an individual event detail page to extract full event information.
 */
export function parseEventDetail(html: string, url: string, listItem?: ArgyleEventListItem): ArgyleEvent {
  const $ = cheerio.load(html);

  // Extract title from H1
  const h1 = $('h1').first().text().trim();
  
  // Extract subtitle (often in an H4 above the H1)
  const subtitle = $('h4').first().text().trim();

  // Extract date and location from "#### {Date} | {Location}" pattern
  let dateHuman = listItem?.dateHuman || '';
  let locationStr = listItem?.location || '';

  // Look for date/location in h4 tags: "February 12, 2026 | Virtual"
  $('h4').each((_, el) => {
    const text = $(el).text().trim();
    const dateLocMatch = text.match(/^((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\s*\|\s*(.+)$/i);
    if (dateLocMatch) {
      dateHuman = dateLocMatch[1].trim();
      locationStr = dateLocMatch[2].trim();
    }
  });

  // Extract overview
  let overviewText = '';
  let inOverview = false;
  const overviewParts: string[] = [];

  $('h3, p, ul').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase();
    const text = $(el).text().trim();
    
    if (tag === 'h3' && /overview/i.test(text)) {
      inOverview = true;
      return;
    }
    if (tag === 'h3' && inOverview) {
      inOverview = false; // Next section
      return;
    }

    if (inOverview) {
      if (tag === 'p' && text.length > 20) {
        overviewParts.push(text);
      }
      if (tag === 'ul') {
        $(el).find('li').each((_, li) => {
          const liText = $(li).text().trim();
          if (liText) overviewParts.push('• ' + liText);
        });
      }
    }
  });

  overviewText = overviewParts.join('\n\n');
  // Take first ~1500 chars for overview
  overviewText = truncateExcerpt(redactPII(overviewText), 1500);

  // Extract speakers
  const speakerNames: string[] = [];
  let inSpeakers = false;
  $('h2, h4, h5').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase();
    const text = $(el).text().trim();

    if (tag === 'h2' && /speakers/i.test(text)) {
      inSpeakers = true;
      return;
    }
    if (tag === 'h2' && inSpeakers && !/speakers/i.test(text)) {
      inSpeakers = false;
      return;
    }

    if (inSpeakers && tag === 'h4' && text.length > 3 && text.length  0
    ? truncateExcerpt(redactPII(speakerNames.join(', ')), 500)
    : undefined;

  // Extract agenda (session titles)
  const agendaParts: string[] = [];
  let inAgenda = false;
  $('h2, h4').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase();
    const text = $(el).text().trim();

    if (tag === 'h2' && /agenda/i.test(text)) {
      inAgenda = true;
      return;
    }
    if (tag === 'h2' && inAgenda && !/agenda/i.test(text)) {
      inAgenda = false;
      return;
    }

    if (inAgenda && tag === 'h4') {
      // Skip pure time entries
      if (/^\d{1,2}:\d{2}\s*(AM|PM)/i.test(text)) return;
      if (/break/i.test(text) && text.length  10) {
        agendaParts.push(text);
      }
    }
  });

  const agendaExcerpt = agendaParts.length > 0
    ? truncateExcerpt(redactPII(agendaParts.join(' | ')), 800)
    : undefined;

  // Parse date
  const { dateIso, needsDateReview } = parseDateString(dateHuman);

  // Build external ID from URL path
  const externalId = normalizeExternalId(url);

  // Compute source hash from key content
  const hashContent = [h1, dateHuman, locationStr, overviewText].join('|');
  const sourceHash = computeHash(hashContent);

  return {
    externalId,
    sourceUrl: url,
    title: h1 || listItem?.title || 'Untitled Event',
    subtitle: subtitle || listItem?.subtitle,
    community: listItem?.community,
    eventType: listItem?.eventType,
    location: locationStr,
    dateHuman,
    dateIso,
    needsDateReview,
    overviewExcerpt: overviewText || undefined,
    agendaExcerpt,
    speakersExcerpt,
    sourceHash,
  };
}

/**
 * Parse a human date string into an ISO string.
 * Returns null + needsDateReview if parsing fails.
 */
export function parseDateString(dateStr: string): { dateIso: string | null; needsDateReview: boolean } {
  if (!dateStr) return { dateIso: null, needsDateReview: true };

  try {
    // Try parsing "February 12, 2026" style
    const cleaned = dateStr.replace(/,/g, '').trim();
    const parsed = new Date(cleaned);

    if (isNaN(parsed.getTime())) {
      return { dateIso: null, needsDateReview: true };
    }

    return { dateIso: parsed.toISOString(), needsDateReview: false };
  } catch {
    return { dateIso: null, needsDateReview: true };
  }
}

/**
 * Normalize event URL into a stable external ID.
 * E.g., "https://argyleforum.com/events/my-event/" -> "events/my-event"
 */
export function normalizeExternalId(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/+|\/+$/g, ''); // Strip leading/trailing slashes
  } catch {
    return url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, '');
  }
}

/**
 * Fetch and parse the events listing page.
 * Returns structured list items for each upcoming event.
 */
export async function fetchEventsListing(): Promise {
  console.log('[ArgyleScraper] Fetching events listing from', EVENTS_LANDING_URL);
  const html = await fetchWithRetry(EVENTS_LANDING_URL);
  const events = parseEventsListing(html);
  console.log(`[ArgyleScraper] Found ${events.length} events on listing page`);
  return events;
}

/**
 * Fetch and parse a single event detail page.
 * Includes rate limiting delay.
 */
export async function fetchEventDetail(url: string, listItem?: ArgyleEventListItem): Promise {
  await delay(REQUEST_DELAY_MS);
  console.log('[ArgyleScraper] Fetching event detail:', url);
  const html = await fetchWithRetry(url);
  return parseEventDetail(html, url, listItem);
}

/**
 * Fetch all upcoming events: listing + all detail pages.
 * This is the main entry point for a full sync.
 */
export async function fetchAllEvents(): Promise {
  const listItems = await fetchEventsListing();
  const events: ArgyleEvent[] = [];

  for (const item of listItems) {
    try {
      const detail = await fetchEventDetail(item.url, item);
      events.push(detail);
    } catch (error: any) {
      console.error(`[ArgyleScraper] Error fetching detail for ${item.url}:`, error.message);
      // Still include with list-level data
      events.push({
        externalId: normalizeExternalId(item.url),
        sourceUrl: item.url,
        title: item.title,
        subtitle: item.subtitle,
        community: item.community,
        eventType: item.eventType,
        location: item.location,
        dateHuman: item.dateHuman,
        ...parseDateString(item.dateHuman),
        sourceHash: computeHash(item.title + item.dateHuman),
      });
    }
  }

  console.log(`[ArgyleScraper] Completed: ${events.length} events fetched`);
  return events;
}