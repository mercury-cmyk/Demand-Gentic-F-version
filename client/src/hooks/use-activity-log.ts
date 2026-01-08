import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ActivityLogEntry, ActivityEntityType } from "@/lib/activity-log";

export function useActivityLog(
  entityType: ActivityEntityType,
  entityId: string,
  limit = 50
) {
  return useQuery<ActivityLogEntry[]>({
    queryKey: ["activity-log", entityType, entityId, limit],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/activity-log/${entityType}/${entityId}?limit=${limit}`
      );
      return response.json();
    },
    enabled: Boolean(entityType && entityId),
  });
}
