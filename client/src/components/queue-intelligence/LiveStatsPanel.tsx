import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Globe,
  Phone,
  PhoneOff,
  ShieldCheck,
  Users,
  Clock,
  ArrowUp,
  Zap,
  MapPin,
  TrendingUp,
} from "lucide-react";

/* ── Types ── */
export interface LiveStatsData {
  campaignId: string;
  generatedAt: string;
  queueStatus: {
    total: number;
    queued: number;
    inProgress: number;
    done: number;
    removed: number;
  };
  countryDistribution: Array<{
    country: string;
    total: number;
    queued: number;
    inProgress: number;
    done: number;
  }>;
  phoneStatus: {
    totalQueued: number;
    hasPhone: number;
    missingPhone: number;
    e164Normalized: number;
    verified: number;
    phoneRate: number;
  };
  priorityTiers: Array<{
    tier: string;
    count: number;
    avgPriority: number;
    minPriority: number;
    maxPriority: number;
  }>;
  nextInLine: Array<{
    queueId: string;
    contactId: string;
    contactName: string;
    jobTitle: string | null;
    seniorityLevel: string | null;
    accountName: string | null;
    industry: string | null;
    country: string | null;
    timezone: string | null;
    bestPhone: string | null;
    priority: number;
    aiPriorityScore: number | null;
    nextAttemptAt: string | null;
  }>;
  timezoneAnalysis: {
    totalCallableNow: number;
    totalSleeping: number;
    totalUnknownTimezone: number;
    groups: Array<{
      timezone: string;
      contactCount: number;
      isCurrentlyOpen: boolean;
      opensAt: string | null;
      suggestedPriority: number;
      country: string | null;
    }>;
  };
}

/* ── Priority tier colors ── */
const TIER_STYLE: Record<string, { bg: string; text: string; bar: string }> = {
  "Top Priority (400+)": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" },
  "High (200-399)": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", bar: "bg-blue-500" },
  "Medium (100-199)": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
  "Low (50-99)": { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", bar: "bg-orange-500" },
  "Minimal (0-49)": { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", bar: "bg-slate-400" },
};

function getTierStyle(tier: string) {
  return TIER_STYLE[tier] || TIER_STYLE["Minimal (0-49)"];
}

interface LiveStatsPanelProps {
  data: LiveStatsData;
}

export function LiveStatsPanel({ data }: LiveStatsPanelProps) {
  const { queueStatus, countryDistribution, phoneStatus, priorityTiers, nextInLine, timezoneAnalysis } = data;
  const totalPriorityContacts = priorityTiers.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Queued</span>
            </div>
            <p className="text-2xl font-bold">{queueStatus.queued.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {queueStatus.inProgress} in progress / {queueStatus.done} done
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Phone Coverage</span>
            </div>
            <p className="text-2xl font-bold">{phoneStatus.phoneRate}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {phoneStatus.hasPhone.toLocaleString()} have phone / {phoneStatus.missingPhone.toLocaleString()} missing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Callable Now</span>
            </div>
            <p className="text-2xl font-bold">{timezoneAnalysis.totalCallableNow.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {timezoneAnalysis.totalSleeping} sleeping / {timezoneAnalysis.totalUnknownTimezone} unknown TZ
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-indigo-500" />
              <span className="text-xs text-muted-foreground">Countries</span>
            </div>
            <p className="text-2xl font-bold">{countryDistribution.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {timezoneAnalysis.groups.length} timezone{timezoneAnalysis.groups.length !== 1 ? "s" : ""} detected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Country Distribution + Phone Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Country Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-indigo-500" />
              Country Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
            {countryDistribution.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No queued contacts</p>
            ) : (
              countryDistribution.map((row) => {
                const pct = queueStatus.queued > 0 ? Math.round((row.queued / queueStatus.queued) * 100) : 0;
                return (
                  <div key={row.country} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-[100px] truncate" title={row.country}>
                      {row.country}
                    </span>
                    <div className="flex-1">
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 min-w-[100px] justify-end">
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {row.queued.toLocaleString()}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground w-[30px] text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Phone Status Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-500" />
              Phone Number Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phone rate bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Phone coverage</span>
                <span className="font-medium">{phoneStatus.phoneRate}%</span>
              </div>
              <Progress value={phoneStatus.phoneRate} className="h-2.5" />
            </div>

            {/* Breakdown rows */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-green-500" />
                  <span>Has Phone Number</span>
                </div>
                <span className="font-medium">{phoneStatus.hasPhone.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <PhoneOff className="h-3.5 w-3.5 text-red-500" />
                  <span>Missing Phone</span>
                </div>
                <span className="font-medium text-red-600 dark:text-red-400">{phoneStatus.missingPhone.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                  <span>E.164 Normalized</span>
                </div>
                <span className="font-medium">{phoneStatus.e164Normalized.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Verified</span>
                </div>
                <span className="font-medium">{phoneStatus.verified.toLocaleString()}</span>
              </div>
            </div>

            {/* Timezone callable breakdown */}
            <div className="pt-3 border-t space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Business Hours Status
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-green-50 dark:bg-green-900/20">
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">
                    {timezoneAnalysis.totalCallableNow}
                  </p>
                  <p className="text-[10px] text-green-600 dark:text-green-500">Callable</p>
                </div>
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {timezoneAnalysis.totalSleeping}
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500">Sleeping</p>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800">
                  <p className="text-lg font-bold text-slate-600 dark:text-slate-400">
                    {timezoneAnalysis.totalUnknownTimezone}
                  </p>
                  <p className="text-[10px] text-slate-500">Unknown</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Priority Tiers + Next In Line */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Priority Tier Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowUp className="h-4 w-4 text-emerald-500" />
              Priority Distribution
              <Badge variant="outline" className="text-[10px] ml-auto">
                {totalPriorityContacts.toLocaleString()} queued
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {priorityTiers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No priority data available</p>
            ) : (
              priorityTiers.map((tier) => {
                const style = getTierStyle(tier.tier);
                const pct = totalPriorityContacts > 0 ? Math.round((tier.count / totalPriorityContacts) * 100) : 0;
                return (
                  <div key={tier.tier} className={`p-3 rounded-lg ${style.bg}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-semibold ${style.text}`}>{tier.tier}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {tier.count.toLocaleString()}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-white/50 dark:bg-slate-900/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${style.bar} rounded-full transition-all`}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Avg priority: {tier.avgPriority} (range: {tier.minPriority}–{tier.maxPriority})
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Next In Line */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Next In Line
              <span className="text-[10px] text-muted-foreground font-normal ml-1">
                (top {nextInLine.length} by priority)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextInLine.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No contacts ready to dial</p>
            ) : (
              <div className="space-y-1 max-h-[340px] overflow-y-auto">
                {nextInLine.map((contact, idx) => (
                  <div
                    key={contact.queueId}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Rank */}
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      idx === 0 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                      idx < 3 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}>
                      {idx + 1}
                    </span>

                    {/* Contact info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{contact.contactName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {[contact.jobTitle, contact.accountName].filter(Boolean).join(" @ ")}
                      </p>
                    </div>

                    {/* Country */}
                    {contact.country && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[60px]" title={contact.country}>
                        {contact.country}
                      </span>
                    )}

                    {/* Phone indicator */}
                    {contact.bestPhone ? (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0">
                        {contact.bestPhone}
                      </Badge>
                    ) : (
                      <PhoneOff className="h-3 w-3 text-red-400 flex-shrink-0" />
                    )}

                    {/* Priority */}
                    <Badge
                      variant="secondary"
                      className={`text-[10px] h-4 px-1.5 flex-shrink-0 ${
                        contact.priority >= 400 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                        contact.priority >= 200 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                        contact.priority >= 100 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" :
                        ""
                      }`}
                    >
                      P{contact.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Timezone Groups */}
      {timezoneAnalysis.groups.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              Active Timezones
              <Badge variant="outline" className="text-[10px] ml-auto">
                {timezoneAnalysis.groups.length} zone{timezoneAnalysis.groups.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {timezoneAnalysis.groups.map((group) => (
                <div
                  key={group.timezone}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                    group.isCurrentlyOpen
                      ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      group.isCurrentlyOpen ? "bg-green-500" :
                      group.timezone === "Unknown" ? "bg-slate-400" :
                      "bg-amber-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {group.timezone === "Unknown" ? "Unknown" : group.timezone.replace(/_/g, " ")}
                    </p>
                    {group.country && (
                      <p className="text-[10px] text-muted-foreground truncate">{group.country}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                    {group.contactCount.toLocaleString()}
                  </Badge>
                  {group.opensAt && !group.isCurrentlyOpen && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0" title={`Opens at ${group.opensAt}`}>
                      {new Date(group.opensAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer: Generated timestamp */}
      <p className="text-[10px] text-muted-foreground text-center">
        Stats generated at {new Date(data.generatedAt).toLocaleString()} — refreshes when tab is viewed
      </p>
    </div>
  );
}
