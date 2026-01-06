/**
 * Website Research Helper
 * Crawls a company's public website and extracts concise, relevant content.
 */

export interface WebsitePageSummary {
  url: string;
  title: string | null;
  description: string | null;
  headings: string[];
  excerpt: string;
}

export interface WebsiteResearchResult {
  baseUrl: string | null;
  pages: WebsitePageSummary[];
  errors: string[];
}

interface FetchOptions {
  timeoutMs: number;
  maxChars: number;
  accept: string;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_PAGES = 25;
const DEFAULT_MAX_CHARS_PER_PAGE = 4000;
const DEFAULT_MAX_SITEMAPS = 5;
const DEFAULT_MAX_SITEMAP_URLS = 300;

const USER_AGENT = "OrgIntelligenceBot/1.0 (+https://demangent.ai)";

const PRIORITY_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /about|company|who-we-are|mission|vision|leadership|team|our-story/i, score: 10 },
  { pattern: /product|platform|feature|solution|service|technology|how-it-works/i, score: 10 },
  { pattern: /use-cases?|industr(y|ies)|sectors|markets|vertical/i, score: 8 },
  { pattern: /pricing|plans|packages|compare/i, score: 7 },
  { pattern: /customer|case-stud(y|ies)|testimonial|success-stor(y|ies)|portfolio/i, score: 8 },
  { pattern: /security|compliance|trust|privacy|certifications/i, score: 5 },
  { pattern: /blog|resource|whitepaper|guide|ebook/i, score: 3 },
  { pattern: /partner|integration|ecosystem|api/i, score: 6 },
  { pattern: /demo|trial|contact|request/i, score: 4 },
  { pattern: /careers|jobs|culture|values/i, score: 5 },
  { pattern: /press|news|media|announcement/i, score: 4 },
  { pattern: /comparison|vs|alternative|competitor/i, score: 7 },
];

const EXCLUDED_PATHS = [
  /\/privacy/i,
  /\/terms/i,
  /\/cookie/i,
  /\/login/i,
  /\/signin/i,
  /\/signup/i,
  /\/auth/i,
  /\/cart/i,
  /\/checkout/i,
];

const BLOCKED_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".zip",
  ".rar",
  ".7z",
  ".gz",
  ".mp4",
  ".mp3",
  ".mov",
  ".avi",
  ".json",
  ".xml",
  ".css",
  ".js",
];

function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    let normalized = url.toString();
    if (normalized.endsWith("/") && url.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
}

function isSameDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`) || hostname === `www.${domain}`;
}

function isBlockedExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function shouldExcludePath(pathname: string): boolean {
  return EXCLUDED_PATHS.some((pattern) => pattern.test(pathname));
}

function scoreUrl(pathname: string): number {
  let score = 0;
  for (const { pattern, score: value } of PRIORITY_PATTERNS) {
    if (pattern.test(pathname)) {
      score += value;
    }
  }
  return score;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function extractMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const pattern = new RegExp(`<meta[^>]+(?:name|property)=[\"']${key}[\"'][^>]*>`, "i");
    const tagMatch = html.match(pattern);
    if (!tagMatch) continue;
    const contentMatch = tagMatch[0].match(/content=[\"']([^\"']+)[\"']/i);
    if (contentMatch?.[1]) {
      return decodeHtmlEntities(contentMatch[1].trim());
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return decodeHtmlEntities(stripTags(match[1]).trim());
}

function extractHeadings(html: string, limit = 20): string[] {
  const matches = [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
  const headings = matches
    .map((match) => decodeHtmlEntities(stripTags(match[1]).replace(/\s+/g, " ").trim()))
    .filter((value) => value.length > 0 && value.length < 200);
  return Array.from(new Set(headings)).slice(0, limit);
}

function extractReadableText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");

  const withBreaks = withoutScripts.replace(
    /<(br|p|div|li|section|article|h[1-6]|tr|td|th|ul|ol)[^>]*>/gi,
    "\n"
  );

  const text = decodeHtmlEntities(stripTags(withBreaks))
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function extractLinks(html: string, baseUrl: string, domain: string): string[] {
  const links: string[] = [];
  const linkMatches = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)];

  for (const match of linkMatches) {
    const href = match[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    try {
      const resolved = new URL(href, baseUrl);
      if (!isSameDomain(resolved.hostname, domain)) continue;
      if (shouldExcludePath(resolved.pathname)) continue;
      if (isBlockedExtension(resolved.pathname)) continue;

      const normalized = normalizeUrl(resolved.toString());
      if (normalized) links.push(normalized);
    } catch {
      continue;
    }
  }

  return links;
}

async function fetchText(url: string, options: FetchOptions): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": options.accept,
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text") && !contentType.includes("xml") && !contentType.includes("html")) {
      return null;
    }

    const text = await response.text();
    if (!text) return null;
    return text.length > options.maxChars ? text.slice(0, options.maxChars) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHomepage(domain: string, timeoutMs: number): Promise<{ url: string; html: string } | null> {
  const candidates = [`https://${domain}`, `http://${domain}`];
  for (const candidate of candidates) {
    const html = await fetchText(candidate, {
      timeoutMs,
      maxChars: 200000,
      accept: "text/html,application/xhtml+xml",
    });
    if (html) {
      return { url: candidate, html };
    }
  }
  return null;
}

async function extractSitemapLinks(baseUrl: string, domain: string, timeoutMs: number): Promise<string[]> {
  const sitemapCandidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap-index.xml`,
  ];

  const robotsTxt = await fetchText(`${baseUrl}/robots.txt`, {
    timeoutMs,
    maxChars: 200000,
    accept: "text/plain",
  });

  if (robotsTxt) {
    const sitemapMatches = [...robotsTxt.matchAll(/^sitemap:\s*(.+)$/gim)];
    for (const match of sitemapMatches) {
      const sitemapUrl = match[1].trim();
      if (sitemapUrl) sitemapCandidates.push(sitemapUrl);
    }
  }

  const seenSitemaps = new Set<string>();
  const pageUrls: string[] = [];
  const sitemapQueue = Array.from(new Set(sitemapCandidates));

  while (sitemapQueue.length > 0 && seenSitemaps.size < DEFAULT_MAX_SITEMAPS) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    const xml = await fetchText(sitemapUrl, {
      timeoutMs,
      maxChars: 500000,
      accept: "application/xml,text/xml",
    });

    if (!xml) continue;

    const locMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
      .map((match) => match[1].trim())
      .filter(Boolean);

    for (const loc of locMatches) {
      try {
        const url = new URL(loc);
        if (!isSameDomain(url.hostname, domain)) continue;
        if (url.pathname.toLowerCase().endsWith(".xml")) {
          if (seenSitemaps.size < DEFAULT_MAX_SITEMAPS) {
            sitemapQueue.push(url.toString());
          }
          continue;
        }
        if (shouldExcludePath(url.pathname) || isBlockedExtension(url.pathname)) continue;
        const normalized = normalizeUrl(url.toString());
        if (normalized) pageUrls.push(normalized);
        if (pageUrls.length >= DEFAULT_MAX_SITEMAP_URLS) break;
      } catch {
        continue;
      }
    }
  }

  return Array.from(new Set(pageUrls));
}

export async function collectWebsiteContent(domain: string, options?: {
  maxPages?: number;
  maxCharsPerPage?: number;
  timeoutMs?: number;
}): Promise<WebsiteResearchResult> {
  const requestedTimeout = options?.timeoutMs;
  const requestedMaxPages = options?.maxPages;
  const requestedMaxChars = options?.maxCharsPerPage;

  const timeoutMs = Number.isFinite(requestedTimeout) && (requestedTimeout ?? 0) > 0
    ? requestedTimeout
    : DEFAULT_TIMEOUT_MS;
  const maxPages = Number.isFinite(requestedMaxPages) && (requestedMaxPages ?? 0) > 0
    ? requestedMaxPages
    : DEFAULT_MAX_PAGES;
  const maxCharsPerPage = Number.isFinite(requestedMaxChars) && (requestedMaxChars ?? 0) > 200
    ? requestedMaxChars
    : DEFAULT_MAX_CHARS_PER_PAGE;

  const errors: string[] = [];
  const homepage = await fetchHomepage(domain, timeoutMs);

  if (!homepage) {
    errors.push("Homepage fetch failed");
    return { baseUrl: null, pages: [], errors };
  }

  const baseUrl = new URL(homepage.url).origin;
  const homepageUrl = normalizeUrl(homepage.url) || baseUrl;

  const sitemapLinks = await extractSitemapLinks(baseUrl, domain, timeoutMs);
  const homepageLinks = extractLinks(homepage.html, baseUrl, domain);

  const candidateUrls = Array.from(new Set([homepageUrl, baseUrl, ...sitemapLinks, ...homepageLinks]))
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => Boolean(url));

  console.log(`[Website-Research] Found ${sitemapLinks.length} sitemap URLs and ${homepageLinks.length} homepage links`);
  console.log(`[Website-Research] Total candidate URLs: ${candidateUrls.length}`);

  const prioritized = candidateUrls
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return isSameDomain(parsed.hostname, domain) &&
          !shouldExcludePath(parsed.pathname) &&
          !isBlockedExtension(parsed.pathname);
      } catch {
        return false;
      }
    })
    .map((url) => ({ url, score: scoreUrl(new URL(url).pathname) }))
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, maxPages);

  console.log(`[Website-Research] Prioritized ${prioritized.length} URLs (max: ${maxPages})`);

  const pages: WebsitePageSummary[] = [];

  for (const { url } of prioritized) {
    const html = (url === baseUrl || url === homepageUrl) ? homepage.html : await fetchText(url, {
      timeoutMs,
      maxChars: 200000,
      accept: "text/html,application/xhtml+xml",
    });

    if (!html) continue;

    const title = extractTitle(html) || extractMetaContent(html, ["og:title"]);
    const description = extractMetaContent(html, ["description", "og:description"]);
    const headings = extractHeadings(html);
    const text = extractReadableText(html);
    const excerpt = text.slice(0, maxCharsPerPage);

    if (!excerpt) continue;

    pages.push({
      url,
      title,
      description,
      headings,
      excerpt,
    });
  }

  return {
    baseUrl,
    pages,
    errors,
  };
}
