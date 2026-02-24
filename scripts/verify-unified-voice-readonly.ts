/**
 * Read-only endpoint verification for Unified Voice prompt outputs.
 *
 * Checks that deprecated virtual-agent custom-prompt guidance text is absent.
 *
 * Usage:
 *   tsx scripts/verify-unified-voice-readonly.ts [baseUrl]
 *
 * Env:
 *   VERIFY_AUTH_BEARER=<jwt>   Optional. Added as Authorization: Bearer <jwt>.
 *   VERIFY_ENDPOINTS=/a,/b     Optional comma-separated endpoint override.
 */

const cliBaseUrl = process.argv[2];
const baseUrl = (cliBaseUrl || process.env.VERIFY_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const bearerToken = process.env.VERIFY_AUTH_BEARER?.trim();

const endpoints = (process.env.VERIFY_ENDPOINTS
  ? process.env.VERIFY_ENDPOINTS.split(",").map((value) => value.trim()).filter(Boolean)
  : [
      "/api/unified-agents/voice/prompt-sections",
      "/api/unified-agents/voice/assembled-prompt",
      "/api/unified-agents/voice/assembled-prompt-with-oi",
    ]) as string[];

const bannedSnippets = [
  "If your campaign uses Virtual Agent custom prompt: edit virtualAgents.systemPrompt (this wins first).",
  "virtualAgents.systemPrompt (this wins first)",
  "virtualAgents.systemPrompt",
] as const;

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  return headers;
}

function extractPayloadText(payload: unknown): string {
  if (typeof payload === "string") return payload;

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

async function fetchJson(endpoint: string): Promise<{ url: string; payload: unknown }> {
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
  });
  const body = await response.text();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Auth required for ${url} (status ${response.status}). Set VERIFY_AUTH_BEARER and retry.`
      );
    }
    throw new Error(`Request failed for ${url} (status ${response.status}): ${body.slice(0, 500)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `Expected JSON from ${url} but received non-JSON response (${(error as Error).message}).`
    );
  }

  return { url, payload };
}

async function main(): Promise<void> {
  console.log(`[verify-unified-voice-readonly] Base URL: ${baseUrl}`);
  console.log(`[verify-unified-voice-readonly] Endpoints: ${endpoints.join(", ")}`);

  const failures: string[] = [];

  for (const endpoint of endpoints) {
    const { url, payload } = await fetchJson(endpoint);
    const text = extractPayloadText(payload);

    for (const snippet of bannedSnippets) {
      if (text.includes(snippet)) {
        failures.push(`Found banned snippet in ${url}: "${snippet}"`);
      }
    }

    console.log(`[ok] ${url} (${text.length} chars checked)`);
  }

  if (failures.length > 0) {
    console.error("[verify-unified-voice-readonly] FAILED");
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    process.exit(1);
  }

  console.log("[verify-unified-voice-readonly] PASS - deprecated virtual-agent custom prompt guidance not found.");
}

main().catch((error) => {
  console.error(`[verify-unified-voice-readonly] ERROR: ${(error as Error).message}`);
  process.exit(1);
});
