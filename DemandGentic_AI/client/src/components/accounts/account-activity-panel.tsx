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
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useActivityLog("account", accountId, 100);

  if (isLoading) {
    return ;
  }

  const timelineItems = buildActivityTimelineItems(data ?? []);
  const stats = summarizeEngagement(timelineItems);
  const filteredItems =
    filter === "all"
      ? timelineItems
      : timelineItems.filter((item) => item.type === filters[filter]);

  return (
    
      
        {Object.keys(filters).map((key) => (
           setFilter(key as keyof typeof filters)}
          >
            {key === "all"
              ? "All"
              : key.charAt(0).toUpperCase() + key.slice(1)}
          
        ))}
      
      
      
    
  );
}