/**
 * UKEF Campaign Reports Module
 * 
 * Provides campaign reports with lead evidence, recordings, transcripts,
 * and QA data for the UKEF (Lightcast) client.
 * 
 * Gating:
 * - Feature flag: ukef_campaign_reports
 * - Hard client gate: Lightcast account ID only
 * 
 * No audio storage — only signed URL links to existing recordings.
 */

export { default as ukefReportsRouter } from './routes';
export { UKEF_CLIENT_ACCOUNT_ID, UKEF_CLIENT_NAME } from './types';
