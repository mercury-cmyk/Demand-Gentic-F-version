import { createHash } from "crypto";
import { asc, eq } from "drizzle-orm";

import { db } from "../db";
import { telephonyProviders } from "@shared/schema";

export type TelephonyExecutionPath = "telnyx" | "sip";
export type TelephonyRoutingMode = "disabled" | "shadow" | "active";

type ProviderRow = typeof telephonyProviders.$inferSelect;

export interface TelephonyRoutingDecision {
  executionPath: TelephonyExecutionPath;
  routingMode: TelephonyRoutingMode;
  providerId: string | null;
  providerType: string;
  providerName: string;
  selectionReason: string;
  providerCallId?: string;
  costPerMinute?: number | null;
  costPerCall?: number | null;
  currency?: string | null;
  telnyxOverride?: {
    apiKey?: string;
    texmlAppId?: string;
    webhookUrl?: string;
  };
  sipOverride?: {
    sipDomain?: string;
    sipProxy?: string;
    sipPort?: number;
    sipTransport?: "udp" | "tcp" | "tls" | "wss";
    sipUsername?: string;
    sipPassword?: string;
  };
}

interface ResolveTelephonyProviderInput {
  destination: string;
  executionPath: TelephonyExecutionPath;
  campaignId?: string;
  contactId?: string;
  preferredProviderId?: string;
}

const PROVIDER_CACHE_TTL_MS = 30_000;

let providerCache: { loadedAt: number; rows: ProviderRow[] } | null = null;

function getRoutingMode(): TelephonyRoutingMode {
  const raw = (process.env.MULTI_TELEPHONY_ROUTING_MODE || "disabled").trim().toLowerCase();
  if (raw === "active" || raw === "shadow") {
    return raw;
  }
  return "disabled";
}

function getLegacyDecision(
  executionPath: TelephonyExecutionPath,
  reason: string,
): TelephonyRoutingDecision {
  return {
    executionPath,
    routingMode: getRoutingMode(),
    providerId: null,
    providerType: executionPath === "sip" ? "sip_trunk" : "telnyx",
    providerName: executionPath === "sip" ? "Legacy SIP trunk" : "Legacy Telnyx",
    selectionReason: reason,
  };
}

function matchesPattern(destination: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return destination.startsWith(pattern.slice(0, -1));
  }
  return destination === pattern;
}

function isAllowedDestination(provider: ProviderRow, destination: string): boolean {
  const blocked = Array.isArray(provider.blockedDestinations) ? provider.blockedDestinations : [];
  for (const pattern of blocked) {
    if (matchesPattern(destination, String(pattern))) {
      return false;
    }
  }

  const allowed = Array.isArray(provider.allowedDestinations) ? provider.allowedDestinations : [];
  if (allowed.length === 0) {
    return true;
  }

  return allowed.some((pattern) => matchesPattern(destination, String(pattern)));
}

function getEligibleType(executionPath: TelephonyExecutionPath): ProviderRow["type"] {
  return executionPath === "sip" ? "sip_trunk" : "telnyx";
}

function getRoutingWeight(provider: ProviderRow): number {
  const raw = Number((provider.providerMetadata as Record<string, unknown> | null)?.routingWeight ?? 1);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1;
  }
  return raw;
}

function deterministicUnitInterval(seed: string): number {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const value = Number.parseInt(digest, 16);
  return value / 0xffffffff;
}

function selectWeightedProvider(providers: ProviderRow[], seed: string): ProviderRow {
  const weights = providers.map((provider) => getRoutingWeight(provider));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return providers[0];
  }

  const target = deterministicUnitInterval(seed) * totalWeight;
  let running = 0;

  for (let i = 0; i < providers.length; i += 1) {
    running += weights[i];
    if (target <= running) {
      return providers[i];
    }
  }

  return providers[providers.length - 1];
}

async function getEnabledProviders(): Promise<ProviderRow[]> {
  const now = Date.now();
  if (providerCache && now - providerCache.loadedAt < PROVIDER_CACHE_TTL_MS) {
    return providerCache.rows;
  }

  const rows = await db
    .select()
    .from(telephonyProviders)
    .where(eq(telephonyProviders.enabled, true))
    .orderBy(asc(telephonyProviders.priority), asc(telephonyProviders.createdAt));

  providerCache = { loadedAt: now, rows };
  return rows;
}

function buildDecision(
  provider: ProviderRow,
  executionPath: TelephonyExecutionPath,
  routingMode: TelephonyRoutingMode,
  selectionReason: string,
): TelephonyRoutingDecision {
  const metadata = (provider.providerMetadata || {}) as Record<string, unknown>;
  const decision: TelephonyRoutingDecision = {
    executionPath,
    routingMode,
    providerId: provider.id,
    providerType: provider.type,
    providerName: provider.name,
    selectionReason,
    costPerMinute: provider.costPerMinute ?? null,
    costPerCall: provider.costPerCall ?? null,
    currency: provider.currency ?? null,
  };

  if (executionPath === "telnyx") {
    const texmlAppId = typeof metadata.texmlAppId === "string" ? metadata.texmlAppId.trim() : "";
    const webhookUrl = typeof metadata.webhookUrl === "string" ? metadata.webhookUrl.trim() : "";
    if (routingMode === "active" && provider.apiKey && texmlAppId) {
      decision.telnyxOverride = {
        apiKey: provider.apiKey,
        texmlAppId,
        webhookUrl: webhookUrl || undefined,
      };
    }
    return decision;
  }

  const sipHost = provider.sipProxy || provider.sipDomain || "";
  if (routingMode === "active" && sipHost) {
    decision.sipOverride = {
      sipDomain: provider.sipDomain || undefined,
      sipProxy: provider.sipProxy || undefined,
      sipPort: provider.sipPort || undefined,
      sipTransport: provider.sipTransport || undefined,
      sipUsername: provider.sipUsername || undefined,
      sipPassword: provider.sipPassword || undefined,
    };
  }

  return decision;
}

export async function resolveTelephonyProvider(
  input: ResolveTelephonyProviderInput,
): Promise<TelephonyRoutingDecision> {
  const routingMode = getRoutingMode();
  if (routingMode === "disabled") {
    return getLegacyDecision(input.executionPath, "routing_mode_disabled");
  }

  let enabledProviders: ProviderRow[];
  try {
    enabledProviders = await getEnabledProviders();
  } catch (error) {
    console.warn("[TelephonyRouting] Failed to load provider configs, using legacy path:", error);
    return getLegacyDecision(input.executionPath, "provider_config_load_failed");
  }

  const eligibleType = getEligibleType(input.executionPath);
  const candidates = enabledProviders
    .filter((provider) => provider.type === eligibleType)
    .filter((provider) => isAllowedDestination(provider, input.destination));

  if (candidates.length === 0) {
    return getLegacyDecision(input.executionPath, "no_enabled_provider_match");
  }

  if (input.preferredProviderId) {
    const preferred = candidates.find((provider) => provider.id === input.preferredProviderId);
    if (preferred) {
      if (routingMode === "shadow") {
        return getLegacyDecision(input.executionPath, `shadow_mode_would_select:${preferred.id}`);
      }
      const decision = buildDecision(preferred, input.executionPath, routingMode, "preferred_provider");
      if (routingMode === "active" && input.executionPath === "telnyx" && !decision.telnyxOverride) {
        return getLegacyDecision(input.executionPath, "preferred_provider_missing_telnyx_runtime_config");
      }
      if (routingMode === "active" && input.executionPath === "sip" && !decision.sipOverride) {
        return getLegacyDecision(input.executionPath, "preferred_provider_missing_sip_runtime_config");
      }
      return decision;
    }
  }

  const topPriority = Math.min(...candidates.map((provider) => provider.priority));
  const priorityTier = candidates.filter((provider) => provider.priority === topPriority);
  const seed = [input.campaignId || "none", input.contactId || "none", input.destination].join(":");
  const selected = selectWeightedProvider(priorityTier, seed);
  if (routingMode === "shadow") {
    return getLegacyDecision(input.executionPath, `shadow_mode_would_select:${selected.id}`);
  }
  const decision = buildDecision(
    selected,
    input.executionPath,
    routingMode,
    priorityTier.length > 1 ? "weighted_priority_tier_selection" : "priority_selection",
  );

  if (routingMode === "active" && input.executionPath === "telnyx" && !decision.telnyxOverride) {
    return getLegacyDecision(input.executionPath, "selected_provider_missing_telnyx_runtime_config");
  }

  if (routingMode === "active" && input.executionPath === "sip" && !decision.sipOverride) {
    return getLegacyDecision(input.executionPath, "selected_provider_missing_sip_runtime_config");
  }

  return decision;
}

export function invalidateTelephonyProviderCache(): void {
  providerCache = null;
}
