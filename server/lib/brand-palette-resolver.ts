type PaletteSource = "website-css" | "fallback";

export interface BrandPaletteOverrides {
  heroGradient: string;
  cta: string;
  accent: string;
  surface: string;
  button: string;
}

export interface ResolvedBrandPalette {
  key: string;
  source: PaletteSource;
  website: string;
  primary: string;
  secondary: string;
  neutral: string;
  overrides: BrandPaletteOverrides;
}

interface BrandResolverConfig {
  key: string;
  website: string;
  fallback: {
    primary: string;
    secondary: string;
    neutral: string;
  };
  matches: (input: { organizationName: string; website: string }) => boolean;
}

const WEBSITE_FETCH_TIMEOUT_MS = 4500;
const MAX_CSS_FILES = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;

const ARGYLE_FALLBACK = {
  primary: "#1f5f95",
  secondary: "#4e9fd1",
  neutral: "#f3f7fb",
};

const BRAND_RESOLVERS: BrandResolverConfig[] = [
  {
    key: "argyle",
    website: "https://argyleforum.com",
    fallback: ARGYLE_FALLBACK,
    matches: ({ organizationName, website }) => {
      const org = organizationName.toLowerCase();
      const site = website.toLowerCase();
      return org.includes("argyle") || site.includes("argyleforum.com");
    },
  },
];

const paletteCache = new Map<string, { expiresAt: number; value: ResolvedBrandPalette }>();

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function toCssColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/!important/gi, "").trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(cleaned)) return cleaned;
  if (/^rgba?\([^)]*\)$/i.test(cleaned)) return cleaned;
  if (/^hsla?\([^)]*\)$/i.test(cleaned)) return cleaned;
  return null;
}

function buildOverrides(primary: string, secondary: string, neutral: string): BrandPaletteOverrides {
  return {
    heroGradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 60%, ${neutral} 100%)`,
    cta: primary,
    accent: secondary,
    surface: neutral,
    button: primary,
  };
}

function parseCssVariables(input: string): Map<string, string> {
  const vars = new Map<string, string>();
  const cssVarRegex = /--([\w-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null = null;
  while ((match = cssVarRegex.exec(input)) !== null) {
    vars.set(match[1].toLowerCase(), match[2].trim());
  }
  return vars;
}

function pickFromVariables(vars: Map<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    for (const [varName, varValue] of vars.entries()) {
      if (!varName.includes(key)) continue;
      const color = toCssColor(varValue);
      if (color) return color;
    }
  }
  return null;
}

function pickCommonHexColors(css: string): string[] {
  const matches = css.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) || [];
  const counts = new Map<string, number>();

  for (const value of matches) {
    const color = value.toLowerCase();
    if (color === "#fff" || color === "#ffffff" || color === "#000" || color === "#000000") continue;
    counts.set(color, (counts.get(color) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([color]) => color);
}

function extractStyleUrls(html: string, baseUrl: string): string[] {
  const styleUrls: string[] = [];
  const linkRegex = /<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        styleUrls.push(resolved.toString());
      }
    } catch {
      // Ignore malformed URLs.
    }
  }
  return [...new Set(styleUrls)].slice(0, MAX_CSS_FILES);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "DemandGentic BrandPaletteResolver/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function detectFromWebsite(website: string, fallback: { primary: string; secondary: string; neutral: string }) {
  const html = await fetchText(website);
  if (!html) return null;

  const styleUrls = extractStyleUrls(html, website);
  const cssParts: string[] = [html];

  for (const styleUrl of styleUrls) {
    const css = await fetchText(styleUrl);
    if (css) cssParts.push(css);
  }

  const allCss = cssParts.join("\n");
  const cssVars = parseCssVariables(allCss);

  const primary =
    pickFromVariables(cssVars, ["primary", "brand-primary", "theme-primary", "global-color-primary"]) ||
    pickCommonHexColors(allCss)[0] ||
    fallback.primary;
  const secondary =
    pickFromVariables(cssVars, ["secondary", "brand-secondary", "theme-secondary", "global-color-secondary"]) ||
    pickCommonHexColors(allCss)[1] ||
    fallback.secondary;
  const neutral =
    pickFromVariables(cssVars, ["neutral", "gray", "grey", "surface", "background", "body"]) ||
    pickCommonHexColors(allCss)[2] ||
    fallback.neutral;

  return {
    primary: toCssColor(primary) || fallback.primary,
    secondary: toCssColor(secondary) || fallback.secondary,
    neutral: toCssColor(neutral) || fallback.neutral,
  };
}

export async function resolveBrandPaletteForOrganization(input: {
  clientAccountId?: string | null;
  organizationName?: string | null;
  website?: string | null;
}): Promise<ResolvedBrandPalette | null> {
  const normalizedWebsite = normalizeWebsite(input.website || "");
  const normalizedName = (input.organizationName || "").trim();

  const resolver = BRAND_RESOLVERS.find((item) =>
    item.matches({ organizationName: normalizedName, website: normalizedWebsite || item.website })
  );

  if (!resolver) return null;

  const cacheKey = `${resolver.key}:${input.clientAccountId || "none"}`;
  const cached = paletteCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const website = normalizedWebsite || resolver.website;
  const detected = await detectFromWebsite(website, resolver.fallback);

  const colors = detected || resolver.fallback;
  const source: PaletteSource = detected ? "website-css" : "fallback";
  const result: ResolvedBrandPalette = {
    key: resolver.key,
    source,
    website,
    primary: colors.primary,
    secondary: colors.secondary,
    neutral: colors.neutral,
    overrides: buildOverrides(colors.primary, colors.secondary, colors.neutral),
  };

  paletteCache.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return result;
}

export function getArgyleFallbackPalette(): ResolvedBrandPalette {
  return {
    key: "argyle",
    source: "fallback",
    website: "https://argyleforum.com",
    primary: ARGYLE_FALLBACK.primary,
    secondary: ARGYLE_FALLBACK.secondary,
    neutral: ARGYLE_FALLBACK.neutral,
    overrides: buildOverrides(ARGYLE_FALLBACK.primary, ARGYLE_FALLBACK.secondary, ARGYLE_FALLBACK.neutral),
  };
}
