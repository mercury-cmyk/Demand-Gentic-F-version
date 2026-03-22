/**
 * Argyle Events Integration — Type Definitions
 * 
 * Shared types for the Argyle event-sourced campaign drafts feature.
 */

/** Parsed event from the Argyle website */
export interface ArgyleEvent {
  /** Stable external ID (canonical URL path) */
  externalId: string;
  /** Full URL to the event page */
  sourceUrl: string;
  /** Event title */
  title: string;
  /** Event subtitle / series name (e.g., "CIO Leadership Forum") */
  subtitle?: string;
  /** Community/category: Finance, Information Technology, Human Resources, Marketing, etc. */
  community?: string;
  /** Event type: Forum, Webinar, Summit, Expo */
  eventType?: string;
  /** Location string (often "Virtual") */
  location?: string;
  /** Raw human-readable date string from the page */
  dateHuman?: string;
  /** Parsed ISO date (null if unparseable) */
  dateIso?: string | null;
  /** Whether the date couldn't be parsed and needs manual review */
  needsDateReview?: boolean;
  /** Overview excerpt (2-5 sentences) */
  overviewExcerpt?: string;
  /** Agenda excerpt (summary of agenda items) */
  agendaExcerpt?: string;
  /** Speakers excerpt (names + titles) */
  speakersExcerpt?: string;
  /** SHA-256 hash of the source content for change detection */
  sourceHash?: string;
}

/** Event item from the events listing page (before detail fetch) */
export interface ArgyleEventListItem {
  /** Community/category */
  community: string;
  /** Event subtitle (series name) */
  subtitle: string;
  /** Full event title */
  title: string;
  /** Event type: Forum, Webinar, etc. */
  eventType: string;
  /** Date string from listing */
  dateHuman: string;
  /** Location from listing (e.g., "Virtual") */
  location: string;
  /** Link to event detail page */
  url: string;
}

/** LLM-generated campaign brief */
export interface CampaignBrief {
  /** Campaign title */
  title: string;
  /** Context summary (2-5 sentences) */
  context: string;
  /** Objective statement */
  objective: string;
  /** Suggested target audience (job titles, seniority, departments) */
  targetAudience: string[];
  /** Suggested target industries */
  targetIndustries: string[];
  /** Targeting notes for the campaign team */
  targetingNotes: string;
  /** Suggested outreach timing notes */
  timingNotes: string;
  /** Order type recommendation */
  orderType: string;
}

/** Draft fields stored in work_order_drafts.draft_fields / source_fields */
export interface DraftFieldsPayload {
  title: string;
  description: string;
  context: string;
  objective: string;
  targetAudience: string[];
  targetIndustries: string[];
  targetingNotes: string;
  timingNotes: string;
  orderType: string;
  eventDate: string;
  eventType: string;
  eventCommunity: string;
  eventLocation: string;
  sourceUrl: string;
}

/** Sync result for a single event */
export interface EventSyncResult {
  externalId: string;
  title: string;
  action: 'created' | 'updated' | 'unchanged' | 'error';
  draftAction?: 'created' | 'updated' | 'unchanged';
  error?: string;
}

/** Overall sync run result */
export interface SyncRunResult {
  provider: string;
  clientId: string;
  startedAt: string;
  completedAt: string;
  eventsFound: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsUnchanged: number;
  eventsErrored: number;
  draftsCreated: number;
  draftsUpdated: number;
  results: EventSyncResult[];
}