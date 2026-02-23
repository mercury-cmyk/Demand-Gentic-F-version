import { pool } from "../db";
import {
  detectContactTimezone,
  isWithinBusinessHours,
  getNextAvailableTime,
  getBusinessHoursForCountry,
} from "../utils/business-hours";

const LOG_PREFIX = "[TZ-Analyzer]";

/* ── Timezone Priority Override types ── */
export interface TimezonePriorityOverride {
  timezone: string;       // IANA timezone string, or "__unknown__"
  country?: string;       // Human-readable label for UI
  priorityBoost: number;  // Additive: positive=boost, negative=deprioritize
}

export interface TimezonePriorityConfig {
  enabled: boolean;
  overrides: TimezonePriorityOverride[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface TimezoneGroupAnalysis {
  timezone: string;
  contactCount: number;
  isCurrentlyOpen: boolean;
  opensAt: string | null;
  suggestedPriority: number; // 200=open, 100=<2h, 50=<6h, 25=later, 10=unknown
  country: string | null;
}

export interface CampaignTimezoneAnalysis {
  campaignId: string;
  analyzedAt: string;
  totalQueued: number;
  totalCallableNow: number;
  totalSleeping: number;
  totalUnknownTimezone: number;
  timezoneGroups: TimezoneGroupAnalysis[];
  countryDistribution: Record<string, number>;
}

/**
 * Analyze timezone distribution for a campaign's queued contacts.
 * Single aggregate query grouped by (timezone, country, state).
 */
export async function analyzeCampaignTimezones(
  campaignId: string
): Promise<CampaignTimezoneAnalysis> {
  const rows = await pool.query(
    `
    SELECT
      c.timezone,
      c.country,
      c.state,
      COUNT(*)::int AS contact_count
    FROM campaign_queue cq
    INNER JOIN contacts c ON c.id = cq.contact_id
    WHERE cq.campaign_id = $1
      AND cq.status = 'queued'
    GROUP BY c.timezone, c.country, c.state
    ORDER BY contact_count DESC
  `,
    [campaignId]
  );

  const now = new Date();
  const timezoneMap = new Map<string, TimezoneGroupAnalysis>();
  let totalCallableNow = 0;
  let totalSleeping = 0;
  let totalUnknownTimezone = 0;
  let totalQueued = 0;
  const countryDistribution: Record<string, number> = {};

  for (const row of rows.rows) {
    const cnt = row.contact_count as number;
    totalQueued += cnt;

    const country = row.country || "Unknown";
    countryDistribution[country] = (countryDistribution[country] || 0) + cnt;

    const tz = detectContactTimezone({
      timezone: row.timezone,
      state: row.state,
      country: row.country,
    });

    if (!tz) {
      totalUnknownTimezone += cnt;
      const key = "__unknown__";
      const existing = timezoneMap.get(key);
      if (existing) {
        existing.contactCount += cnt;
      } else {
        timezoneMap.set(key, {
          timezone: "Unknown",
          contactCount: cnt,
          isCurrentlyOpen: false,
          opensAt: null,
          suggestedPriority: 10,
          country: null,
        });
      }
      continue;
    }

    const config = getBusinessHoursForCountry(row.country);
    config.timezone = tz;
    config.respectContactTimezone = false;
    const isOpen = isWithinBusinessHours(config, undefined, now);

    let opensAt: string | null = null;
    let suggestedPriority = 10;

    if (isOpen) {
      suggestedPriority = 200;
      totalCallableNow += cnt;
    } else {
      const nextOpen = getNextAvailableTime(config, undefined, now);
      opensAt = nextOpen.toISOString();
      const hoursUntilOpen =
        (nextOpen.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilOpen <= 2) {
        suggestedPriority = 100;
      } else if (hoursUntilOpen <= 6) {
        suggestedPriority = 50;
      } else {
        suggestedPriority = 25;
      }
      totalSleeping += cnt;
    }

    // Merge into timezone map (multiple state/country combos may resolve to same tz)
    const existing = timezoneMap.get(tz);
    if (existing) {
      existing.contactCount += cnt;
      if (suggestedPriority > existing.suggestedPriority) {
        existing.suggestedPriority = suggestedPriority;
        existing.isCurrentlyOpen = isOpen;
        existing.opensAt = opensAt;
      }
    } else {
      timezoneMap.set(tz, {
        timezone: tz,
        contactCount: cnt,
        isCurrentlyOpen: isOpen,
        opensAt,
        suggestedPriority,
        country: row.country,
      });
    }
  }

  return {
    campaignId,
    analyzedAt: now.toISOString(),
    totalQueued,
    totalCallableNow,
    totalSleeping,
    totalUnknownTimezone,
    timezoneGroups: Array.from(timezoneMap.values()).sort(
      (a, b) =>
        b.suggestedPriority - a.suggestedPriority ||
        b.contactCount - a.contactCount
    ),
    countryDistribution,
  };
}

/**
 * Pre-seed priority values and nextAttemptAt in campaign_queue based on each
 * contact's timezone and current business-hours status.
 *
 * Priority tiers:
 *   200 = timezone currently in business hours (call NOW)
 *   100 = timezone opens within 2 hours
 *    50 = timezone opens within 6 hours
 *    25 = timezone opens later
 *    10 = unknown timezone
 */
export async function seedQueuePriorities(
  campaignId: string,
  priorityConfig?: TimezonePriorityConfig | null
): Promise<{ updated: number }> {
  // Auto-load config from campaign if not explicitly provided
  if (priorityConfig === undefined) {
    const campaignRow = await pool.query(
      `SELECT timezone_priority_config FROM campaigns WHERE id = $1`,
      [campaignId]
    );
    priorityConfig = (campaignRow.rows[0]?.timezone_priority_config as TimezonePriorityConfig | null) ?? null;
  }

  const analysis = await analyzeCampaignTimezones(campaignId);
  let totalUpdated = 0;

  /** Look up the additive boost for a timezone key (IANA string or "__unknown__") */
  function getBoost(tzKey: string): number {
    if (!priorityConfig?.enabled || !priorityConfig.overrides?.length) return 0;
    const override = priorityConfig.overrides.find(o => o.timezone === tzKey);
    return override?.priorityBoost ?? 0;
  }

  for (const group of analysis.timezoneGroups) {
    if (group.timezone === "Unknown") {
      const basePriority = 10;
      const effectivePriority = Math.max(0, basePriority + getBoost("__unknown__"));
      // Unknown timezone: low priority (unless boosted), delay 2 hours
      const result = await pool.query(
        `
        UPDATE campaign_queue cq
        SET priority = $2,
            next_attempt_at = NOW() + INTERVAL '2 hours',
            updated_at = NOW()
        FROM contacts c
        WHERE cq.contact_id = c.id
          AND cq.campaign_id = $1
          AND cq.status = 'queued'
          AND c.timezone IS NULL
          AND c.country IS NULL
          AND c.state IS NULL
      `,
        [campaignId, effectivePriority]
      );
      totalUpdated += result.rowCount || 0;
      continue;
    }

    const basePriority = group.suggestedPriority;
    const effectivePriority = Math.max(0, basePriority + getBoost(group.timezone));

    if (group.isCurrentlyOpen) {
      // Currently open: high priority, clear any delay
      const result = await pool.query(
        `
        UPDATE campaign_queue cq
        SET priority = $2,
            next_attempt_at = NULL,
            updated_at = NOW()
        FROM contacts c
        WHERE cq.contact_id = c.id
          AND cq.campaign_id = $1
          AND cq.status = 'queued'
          AND (
            c.timezone = $3
            OR (c.timezone IS NULL AND c.country IS NOT NULL AND UPPER(TRIM(c.country)) = ANY($4::text[]))
          )
      `,
        [
          campaignId,
          effectivePriority,
          group.timezone,
          getCountryKeysForTimezone(group.timezone, group.country),
        ]
      );
      totalUpdated += result.rowCount || 0;
    } else if (group.opensAt) {
      // Sleeping: set precise nextAttemptAt to when business hours open
      const result = await pool.query(
        `
        UPDATE campaign_queue cq
        SET priority = $2,
            next_attempt_at = $3::timestamp,
            updated_at = NOW()
        FROM contacts c
        WHERE cq.contact_id = c.id
          AND cq.campaign_id = $1
          AND cq.status = 'queued'
          AND (
            c.timezone = $4
            OR (c.timezone IS NULL AND c.country IS NOT NULL AND UPPER(TRIM(c.country)) = ANY($5::text[]))
          )
      `,
        [
          campaignId,
          effectivePriority,
          group.opensAt,
          group.timezone,
          getCountryKeysForTimezone(group.timezone, group.country),
        ]
      );
      totalUpdated += result.rowCount || 0;
    }
  }

  const hasOverrides = priorityConfig?.enabled && (priorityConfig.overrides?.length ?? 0) > 0;
  console.log(
    `${LOG_PREFIX} Seeded priorities for campaign ${campaignId}: ${totalUpdated} items updated across ${analysis.timezoneGroups.length} timezone groups${hasOverrides ? ` (with ${priorityConfig!.overrides.length} user overrides)` : ''}`
  );
  return { updated: totalUpdated };
}

/**
 * Build an array of uppercase country strings that map to a given timezone,
 * used as a fallback match for contacts without an explicit timezone field.
 */
function getCountryKeysForTimezone(
  timezone: string,
  primaryCountry: string | null
): string[] {
  // Reverse lookup: which country names map to this timezone
  const tzToCountries: Record<string, string[]> = {
    "America/New_York": ["US", "USA", "UNITED STATES", "AMERICA"],
    "America/Chicago": ["US", "USA", "UNITED STATES", "AMERICA"],
    "America/Denver": ["US", "USA", "UNITED STATES", "AMERICA"],
    "America/Los_Angeles": ["US", "USA", "UNITED STATES", "AMERICA"],
    "America/Phoenix": ["US", "USA", "UNITED STATES", "AMERICA"],
    "America/Anchorage": ["US", "USA", "UNITED STATES", "AMERICA"],
    "Pacific/Honolulu": ["US", "USA", "UNITED STATES", "AMERICA"],
    "America/Toronto": ["CA", "CANADA"],
    "America/Vancouver": ["CA", "CANADA"],
    "America/Edmonton": ["CA", "CANADA"],
    "America/Winnipeg": ["CA", "CANADA"],
    "America/Halifax": ["CA", "CANADA"],
    "America/St_Johns": ["CA", "CANADA"],
    "America/Regina": ["CA", "CANADA"],
    "Australia/Sydney": ["AU", "AUSTRALIA"],
    "Australia/Melbourne": ["AU", "AUSTRALIA"],
    "Australia/Brisbane": ["AU", "AUSTRALIA"],
    "Australia/Perth": ["AU", "AUSTRALIA"],
    "Australia/Adelaide": ["AU", "AUSTRALIA"],
    "Australia/Darwin": ["AU", "AUSTRALIA"],
    "Australia/Hobart": ["AU", "AUSTRALIA"],
    "Europe/London": ["GB", "UK", "UNITED KINGDOM", "ENGLAND", "SCOTLAND", "WALES"],
    "Asia/Dubai": ["AE", "UNITED ARAB EMIRATES", "UAE", "DUBAI"],
    "Asia/Riyadh": ["SA", "SAUDI ARABIA"],
    "Asia/Jerusalem": ["IL", "ISRAEL"],
    "Asia/Qatar": ["QA", "QATAR"],
    "Asia/Kuwait": ["KW", "KUWAIT"],
    "Asia/Bahrain": ["BH", "BAHRAIN"],
    "Asia/Muscat": ["OM", "OMAN"],
  };

  const keys = tzToCountries[timezone];
  if (keys) return keys;

  // Fallback: use the primary country if available
  if (primaryCountry) {
    return [primaryCountry.toUpperCase().trim()];
  }
  return [];
}
