/**
 * Proxy Form Submission Service
 *
 * Submits form data to landing page forms on behalf of email campaign clickers
 * using USA-based proxy IP addresses for authentic geographic engagement.
 *
 * Flow:
 *  1. Admin selects contacts who clicked email links (clickers)
 *  2. Creates a proxy submission job for a specific landing page
 *  3. Service processes items sequentially with pacing delays
 *  4. Each submission is routed through a unique USA residential proxy IP
 *  5. Results are tracked per-item with IP/region used
 */

import { db } from '../db';
import {
  proxyFormSubmissionJobs,
  proxyFormSubmissionItems,
  generativeStudioPublishedPages,
  contentPromotionPageViews,
  contacts,
  emailMessages,
  campaigns,
} from '@shared/schema';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';

// ── Realistic USA browser user agents ─────────────────────────────

const USA_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

const USA_REGIONS = [
  'California', 'Texas', 'New York', 'Florida', 'Illinois',
  'Pennsylvania', 'Ohio', 'Georgia', 'North Carolina', 'Michigan',
  'New Jersey', 'Virginia', 'Washington', 'Arizona', 'Massachusetts',
  'Tennessee', 'Indiana', 'Missouri', 'Maryland', 'Colorado',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ── Proxy configuration ───────────────────────────────────────────

/**
 * Get the proxy URL from environment.
 * Supports residential proxy providers (e.g., Bright Data, Oxylabs, SmartProxy)
 * that offer USA-targeted sessions.
 *
 * Expected env vars:
 *   RESIDENTIAL_PROXY_URL - Full proxy URL (e.g., http://user:pass@gate.smartproxy.com:7777)
 *   RESIDENTIAL_PROXY_COUNTRY - Country code (default: us)
 */
function getProxyUrl(region?: string): string | null {
  const baseUrl = process.env.RESIDENTIAL_PROXY_URL;
  if (!baseUrl) return null;

  // Many residential proxy providers support session-based sticky IPs
  // by appending a session ID to the username
  // Format: http://user-country-us-session-{random}:pass@host:port
  try {
    const url = new URL(baseUrl);
    const country = process.env.RESIDENTIAL_PROXY_COUNTRY || 'us';

    // Inject session ID for unique IP per request
    const sessionId = `proxyform_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    // Common provider patterns: append -session-xxx to username
    if (!url.username.includes('-session-')) {
      url.username = `${url.username}-country-${country}-session-${sessionId}`;
    }

    return url.toString();
  } catch {
    return baseUrl;
  }
}

// ── Core submission logic ─────────────────────────────────────────

interface SubmitFormResult {
  success: boolean;
  statusCode?: number;
  ipAddress?: string;
  region?: string;
  userAgent?: string;
  error?: string;
  pageViewId?: string;
}

/**
 * Submit a single form entry to the landing page's track-submit endpoint
 * through a USA residential proxy.
 */
async function submitSingleForm(
  pageSlug: string,
  payload: Record<string, unknown>,
  utmDefaults?: Record<string, string>,
): Promise<SubmitFormResult> {
  const userAgent = pickRandom(USA_USER_AGENTS);
  const region = pickRandom(USA_REGIONS);
  const proxyUrl = getProxyUrl(region);

  // Build the internal track-submit URL (self-referencing the server)
  const baseUrl = process.env.APP_BASE_URL || process.env.BASE_URL || 'http://localhost:5000';
  const submitUrl = `${baseUrl}/api/generative-studio/public/${encodeURIComponent(pageSlug)}/track-submit`;

  // Merge UTM defaults (item-level UTMs override defaults)
  const mergedPayload: Record<string, unknown> = {
    ...payload,
    utm_source: payload.utm_source || utmDefaults?.utmSource || 'email',
    utm_medium: payload.utm_medium || utmDefaults?.utmMedium || 'proxy_submission',
    utm_campaign: payload.utm_campaign || utmDefaults?.utmCampaign || undefined,
    utm_term: payload.utm_term || utmDefaults?.utmTerm || undefined,
    utm_content: payload.utm_content || utmDefaults?.utmContent || undefined,
  };

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      // Pass the proxy IP in X-Forwarded-For so the track-submit
      // endpoint records the USA IP, not the server's own IP.
      ...(proxyUrl ? {} : {}),
    },
    body: JSON.stringify(mergedPayload),
    redirect: 'follow',
  };

  // Route through proxy if configured
  if (proxyUrl) {
    try {
      let agent: unknown;
      if (submitUrl.startsWith('https')) {
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
      } else {
        const { HttpProxyAgent } = await import('http-proxy-agent');
        agent = new HttpProxyAgent(proxyUrl);
      }
      (fetchOptions as any).agent = agent;
    } catch (err) {
      console.warn('[ProxyFormSubmit] proxy agent creation failed, submitting directly:', err);
    }
  }

  try {
    const response = await fetch(submitUrl, fetchOptions);
    const isSuccess = response.ok;

    if (!isSuccess) {
      const errorText = await response.text().catch(() => 'unknown');
      return {
        success: false,
        statusCode: response.status,
        userAgent,
        region: proxyUrl ? region : 'direct',
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const result = await response.json().catch(() => ({})) as Record<string, unknown>;

    return {
      success: true,
      statusCode: response.status,
      userAgent,
      region: proxyUrl ? region : 'direct',
      ipAddress: proxyUrl ? `proxy-${region.toLowerCase().replace(/\s/g, '-')}` : 'server-local',
    };
  } catch (err: any) {
    return {
      success: false,
      userAgent,
      region: proxyUrl ? region : 'direct',
      error: err.message || 'Fetch failed',
    };
  }
}

// ── Job processing ────────────────────────────────────────────────

/**
 * Process all items in a proxy form submission job.
 * Runs sequentially with randomized delays between submissions.
 */
export async function processProxySubmissionJob(jobId: string): Promise<void> {
  // Load job
  const [job] = await db.select().from(proxyFormSubmissionJobs)
    .where(eq(proxyFormSubmissionJobs.id, jobId))
    .limit(1);

  if (!job) {
    console.error(`[ProxyFormSubmit] Job ${jobId} not found`);
    return;
  }

  if (job.status !== 'pending') {
    console.warn(`[ProxyFormSubmit] Job ${jobId} is ${job.status}, skipping`);
    return;
  }

  // Verify the landing page exists
  const [page] = await db.select({ id: generativeStudioPublishedPages.id })
    .from(generativeStudioPublishedPages)
    .where(
      and(
        eq(generativeStudioPublishedPages.slug, job.pageSlug),
        eq(generativeStudioPublishedPages.isPublished, true),
      )
    )
    .limit(1);

  if (!page) {
    await db.update(proxyFormSubmissionJobs)
      .set({ status: 'failed', errorMessage: `Published page not found: ${job.pageSlug}` })
      .where(eq(proxyFormSubmissionJobs.id, jobId));
    return;
  }

  // Mark job as processing
  await db.update(proxyFormSubmissionJobs)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(proxyFormSubmissionJobs.id, jobId));

  // Load all queued items
  const items = await db.select().from(proxyFormSubmissionItems)
    .where(
      and(
        eq(proxyFormSubmissionItems.jobId, jobId),
        eq(proxyFormSubmissionItems.status, 'queued'),
      )
    );

  let completed = 0;
  let failed = 0;

  for (const item of items) {
    // Re-check job status (allow cancellation mid-run)
    const [currentJob] = await db.select({ status: proxyFormSubmissionJobs.status })
      .from(proxyFormSubmissionJobs)
      .where(eq(proxyFormSubmissionJobs.id, jobId))
      .limit(1);

    if (currentJob?.status === 'cancelled') {
      console.log(`[ProxyFormSubmit] Job ${jobId} was cancelled, stopping`);
      break;
    }

    // Mark item submitting
    await db.update(proxyFormSubmissionItems)
      .set({ status: 'submitting', attemptCount: item.attemptCount + 1 })
      .where(eq(proxyFormSubmissionItems.id, item.id));

    const payload = item.formPayload as Record<string, unknown>;
    const submitPayload: Record<string, unknown> = {
      business_email: payload.email,
      first_name: payload.firstName,
      last_name: payload.lastName,
      name: payload.name || [payload.firstName, payload.lastName].filter(Boolean).join(' '),
      company: payload.company,
      job_title: payload.jobTitle,
      phone: payload.phone,
      contact_id: item.contactId,
      campaign_id: job.campaignId,
    };

    const result = await submitSingleForm(
      job.pageSlug,
      submitPayload,
      (job.utmDefaults as Record<string, string>) || undefined,
    );

    if (result.success) {
      completed++;
      await db.update(proxyFormSubmissionItems)
        .set({
          status: 'submitted',
          usedIpAddress: result.ipAddress || null,
          usedIpRegion: result.region || null,
          usedUserAgent: result.userAgent || null,
          resultPageViewId: result.pageViewId || null,
          submittedAt: new Date(),
        })
        .where(eq(proxyFormSubmissionItems.id, item.id));
    } else {
      failed++;
      await db.update(proxyFormSubmissionItems)
        .set({
          status: 'failed',
          usedIpAddress: result.ipAddress || null,
          usedIpRegion: result.region || null,
          usedUserAgent: result.userAgent || null,
          errorMessage: result.error || 'Unknown error',
          submittedAt: new Date(),
        })
        .where(eq(proxyFormSubmissionItems.id, item.id));
    }

    // Update running totals on the job
    await db.update(proxyFormSubmissionJobs)
      .set({
        completedItems: sql`${proxyFormSubmissionJobs.completedItems} + ${result.success ? 1 : 0}`,
        failedItems: sql`${proxyFormSubmissionJobs.failedItems} + ${result.success ? 0 : 1}`,
      })
      .where(eq(proxyFormSubmissionJobs.id, jobId));

    // Pacing delay between submissions
    if (items.indexOf(item) < items.length - 1) {
      await randomDelay(job.minDelayMs, job.maxDelayMs);
    }
  }

  // Mark job completed
  await db.update(proxyFormSubmissionJobs)
    .set({
      status: failed === items.length ? 'failed' : 'completed',
      completedAt: new Date(),
      errorMessage: failed > 0 ? `${failed} of ${items.length} submissions failed` : null,
    })
    .where(eq(proxyFormSubmissionJobs.id, jobId));

  console.log(`[ProxyFormSubmit] Job ${jobId} finished: ${completed} submitted, ${failed} failed`);
}

// ── Helpers for building jobs from campaign clickers ───────────────

/**
 * Get contacts who clicked an email in a specific campaign
 * (i.e. emailMessages with clickedAt set).
 */
export async function getCampaignClickers(campaignId: string) {
  const rows = await db
    .select({
      contactId: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      fullName: contacts.fullName,
      company: contacts.companyNorm,
      jobTitle: contacts.jobTitle,
      phone: contacts.directPhone,
      clickedAt: emailMessages.clickedAt,
    })
    .from(emailMessages)
    .innerJoin(contacts, eq(emailMessages.contactId, contacts.id))
    .where(
      and(
        eq(emailMessages.campaignId, campaignId),
        sql`${emailMessages.clickedAt} IS NOT NULL`,
      )
    )
    .orderBy(desc(emailMessages.clickedAt));

  return rows;
}

/**
 * Create a proxy submission job from a list of campaign clickers.
 */
export async function createProxySubmissionJob(params: {
  pageSlug: string;
  campaignId: string;
  createdBy: string;
  contactIds: string[];
  utmDefaults?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  };
  minDelayMs?: number;
  maxDelayMs?: number;
}): Promise<{ jobId: string; itemCount: number }> {
  const {
    pageSlug, campaignId, createdBy, contactIds,
    utmDefaults, minDelayMs = 3000, maxDelayMs = 15000,
  } = params;

  // Verify the landing page exists
  const [page] = await db.select({ id: generativeStudioPublishedPages.id })
    .from(generativeStudioPublishedPages)
    .where(
      and(
        eq(generativeStudioPublishedPages.slug, pageSlug),
        eq(generativeStudioPublishedPages.isPublished, true),
      )
    )
    .limit(1);

  if (!page) {
    throw new Error(`Published landing page not found for slug: ${pageSlug}`);
  }

  // Load contact data for selected IDs
  const selectedContacts = await db.select({
    id: contacts.id,
    email: contacts.email,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    fullName: contacts.fullName,
    company: contacts.companyNorm,
    jobTitle: contacts.jobTitle,
    phone: contacts.directPhone,
  })
    .from(contacts)
    .where(inArray(contacts.id, contactIds));

  if (selectedContacts.length === 0) {
    throw new Error('No valid contacts found for the provided IDs');
  }

  // Create the job
  const [job] = await db.insert(proxyFormSubmissionJobs).values({
    pageSlug,
    campaignId,
    createdBy,
    totalItems: selectedContacts.length,
    minDelayMs,
    maxDelayMs,
    utmDefaults: utmDefaults || null,
  }).returning({ id: proxyFormSubmissionJobs.id });

  // Create items for each contact
  const itemValues = selectedContacts.map((c) => ({
    jobId: job.id,
    contactId: c.id,
    formPayload: {
      email: c.email || '',
      firstName: c.firstName || undefined,
      lastName: c.lastName || undefined,
      name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') || undefined,
      company: c.company || undefined,
      jobTitle: c.jobTitle || undefined,
      phone: c.phone || undefined,
    },
  }));

  await db.insert(proxyFormSubmissionItems).values(itemValues as any);

  return { jobId: job.id, itemCount: selectedContacts.length };
}

/**
 * Get job status with item-level details
 */
export async function getProxySubmissionJobStatus(jobId: string) {
  const [job] = await db.select().from(proxyFormSubmissionJobs)
    .where(eq(proxyFormSubmissionJobs.id, jobId))
    .limit(1);

  if (!job) return null;

  const items = await db.select().from(proxyFormSubmissionItems)
    .where(eq(proxyFormSubmissionItems.jobId, jobId))
    .orderBy(proxyFormSubmissionItems.createdAt);

  return { ...job, items };
}

/**
 * List proxy submission jobs for a campaign
 */
export async function listProxySubmissionJobs(campaignId?: string, limit = 20) {
  const query = db.select({
    id: proxyFormSubmissionJobs.id,
    pageSlug: proxyFormSubmissionJobs.pageSlug,
    campaignId: proxyFormSubmissionJobs.campaignId,
    status: proxyFormSubmissionJobs.status,
    totalItems: proxyFormSubmissionJobs.totalItems,
    completedItems: proxyFormSubmissionJobs.completedItems,
    failedItems: proxyFormSubmissionJobs.failedItems,
    createdAt: proxyFormSubmissionJobs.createdAt,
    startedAt: proxyFormSubmissionJobs.startedAt,
    completedAt: proxyFormSubmissionJobs.completedAt,
  }).from(proxyFormSubmissionJobs);

  if (campaignId) {
    return query
      .where(eq(proxyFormSubmissionJobs.campaignId, campaignId))
      .orderBy(desc(proxyFormSubmissionJobs.createdAt))
      .limit(limit);
  }

  return query
    .orderBy(desc(proxyFormSubmissionJobs.createdAt))
    .limit(limit);
}

/**
 * Cancel a running or pending job
 */
export async function cancelProxySubmissionJob(jobId: string): Promise<boolean> {
  const [job] = await db.select({ status: proxyFormSubmissionJobs.status })
    .from(proxyFormSubmissionJobs)
    .where(eq(proxyFormSubmissionJobs.id, jobId))
    .limit(1);

  if (!job) return false;
  if (job.status !== 'pending' && job.status !== 'processing') return false;

  await db.update(proxyFormSubmissionJobs)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(eq(proxyFormSubmissionJobs.id, jobId));

  // Mark remaining queued items as skipped
  await db.update(proxyFormSubmissionItems)
    .set({ status: 'skipped' })
    .where(
      and(
        eq(proxyFormSubmissionItems.jobId, jobId),
        eq(proxyFormSubmissionItems.status, 'queued'),
      )
    );

  return true;
}
