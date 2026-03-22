/**
 * Argyle Events Integration — Module Index
 * 
 * Re-exports all public APIs from the Argyle events integration.
 */

export * from './types';
export { fetchAllEvents, fetchEventsListing, fetchEventDetail, parseEventsListing, parseEventDetail, parseDateString, normalizeExternalId } from './scraper';
export { generateSourceFields, enrichWithLLM, buildEnrichmentPrompt } from './draft-generator';
export { runArgyleEventSync, resolveArgyleClientId, isArgyleClient } from './sync-runner';
export { createProjectFromDraft, getProjectForEvent } from './project-bridge';
export { submitDraftAsWorkOrder, normalizeToStringArray, toPgTextArray } from './work-order-adapter';