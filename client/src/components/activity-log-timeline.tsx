import { useQuery } from "@tanstack/react-query";
import { ActivityTimeline, type ActivityItem } from "@/components/patterns/activity-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";

interface ActivityLog {
  id: string;
  entityType: 'contact' | 'account' | 'campaign' | 'call_job' | 'call_session' | 'lead' | 'user' | 'email_message';
  entityId: string;
  eventType: string;
  title: string;
  description: string | null;
  metadata: Record<string, any> | null;
  createdBy: string | null;
  createdAt: string;
}

interface ActivityLogTimelineProps {
  entityType: ActivityLog['entityType'];
  entityId: string;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

// Map event types to activity types for the timeline
function mapEventTypeToActivityType(eventType: string): ActivityItem['type'] {
  if (eventType.includes('email')) return 'email';
  if (eventType.includes('call')) return 'call';
  if (eventType.includes('note')) return 'note';
  if (eventType.includes('task')) return 'task';
  if (eventType.includes('edit') || eventType.includes('update')) return 'edit';
  if (eventType.includes('create')) return 'create';
  if (eventType.includes('delete')) return 'delete';
  if (eventType.includes('qa') || eventType.includes('review')) return 'qa';
  return 'custom';
}

// Map event types to status
function mapEventTypeToStatus(eventType: string, metadata: Record<string, any> | null): ActivityItem['status'] | undefined {
  if (eventType === 'call_ended' && metadata?.disposition) {
    if (metadata.disposition === 'qualified') return 'success';
    if (metadata.disposition === 'not_interested' || metadata.disposition === 'dnc-request') return 'warning';
    if (metadata.disposition === 'no-answer' || metadata.disposition === 'busy') return 'info';
  }
  if (eventType.includes('success') || eventType.includes('qualified')) return 'success';
  if (eventType.includes('error') || eventType.includes('failed')) return 'error';
  if (eventType.includes('warning') || eventType.includes('rejected')) return 'warning';
  return undefined;
}

export function ActivityLogTimeline({
  entityType,
  entityId,
  limit = 50,
  autoRefresh = false,
  refreshInterval = 30000, // 30 seconds default
}: ActivityLogTimelineProps) {
  const { data: activityLogs, isLoading, refetch } = useQuery<ActivityLog[]>({
    queryKey: ['/api/activity-log', entityType, entityId],
    enabled: !!entityType && !!entityId,
  });

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refetch();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refetch]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="activity-log-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activityLogs || activityLogs.length === 0) {
    return <ActivityTimeline items={[]} />;
  }

  // Map activity logs to timeline items
  const timelineItems: ActivityItem[] = activityLogs.map((log) => ({
    id: log.id,
    type: mapEventTypeToActivityType(log.eventType),
    title: log.title,
    description: log.description || undefined,
    timestamp: log.createdAt,
    status: mapEventTypeToStatus(log.eventType, log.metadata),
    metadata: log.metadata ? {
      ...log.metadata,
      // Filter out redundant metadata
      campaignName: log.metadata.campaignName,
      disposition: log.metadata.disposition,
      duration: log.metadata.duration ? `${Math.round(log.metadata.duration)}s` : undefined,
    } : undefined,
  }));

  return <ActivityTimeline items={timelineItems} data-testid="activity-log-timeline" />;
}
