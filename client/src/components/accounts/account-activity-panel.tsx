import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/patterns/activity-timeline";
import { EngagementSummary } from "@/components/patterns/engagement-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityLog } from "@/hooks/use-activity-log";
import {
  buildActivityTimelineItems,
  summarizeEngagement,
} from "@/lib/activity-log";

interface AccountActivityPanelProps {
  accountId: string;
}

const filters = {
  all: undefined,
  calls: "call",
  emails: "email",
  campaigns: "campaign",
} as const;

export function AccountActivityPanel({ accountId }: AccountActivityPanelProps) {
  const [filter, setFilter] = useState<keyof typeof filters>("all");
  const { data, isLoading } = useActivityLog("account", accountId, 100);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const timelineItems = buildActivityTimelineItems(data ?? []);
  const stats = summarizeEngagement(timelineItems);
  const filteredItems =
    filter === "all"
      ? timelineItems
      : timelineItems.filter((item) => item.type === filters[filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.keys(filters).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key as keyof typeof filters)}
          >
            {key === "all"
              ? "All"
              : key.charAt(0).toUpperCase() + key.slice(1)}
          </Button>
        ))}
      </div>
      <EngagementSummary
        stats={[
          {
            label: "Total Calls",
            value: stats.calls,
            subLabel: stats.lastCallAt
              ? `Last call ${new Date(stats.lastCallAt).toLocaleDateString()}`
              : "No calls yet",
          },
          { label: "Emails", value: stats.emails },
          { label: "Campaign Events", value: stats.campaignEvents },
        ]}
      />
      <ActivityTimeline items={filteredItems} />
    </div>
  );
}
