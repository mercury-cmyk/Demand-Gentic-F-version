
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { List as ListIcon, Users } from "lucide-react";

interface ListSegmentMembershipProps {
  entityType: 'contact' | 'account';
  entityId: string;
}

export function ListSegmentMembership({ entityType, entityId }: ListSegmentMembershipProps) {
  const [, setLocation] = useLocation();

  const { data: membership, isLoading } = useQuery<{
    lists: Array<{ id: string; name: string; sourceType: string }>;
    segments: Array<{ id: string; name: string; isActive: boolean }>;
  }>({
    queryKey: [`/api/${entityType}s/${entityId}/membership`],
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const hasLists = membership?.lists && membership.lists.length > 0;
  const hasSegments = membership?.segments && membership.segments.length > 0;

  if (!hasLists && !hasSegments) {
    return (
      <div className="py-8 text-center">
        <ListIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Not part of any lists or segments</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasLists && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ListIcon className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Static Lists ({membership.lists.length})</h4>
          </div>
          <div className="space-y-2">
            {membership.lists.map((list) => (
              <div
                key={list.id}
                className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer"
                onClick={() => setLocation(`/segments/lists/${list.id}`)}
              >
                <div>
                  <p className="font-medium">{list.name}</p>
                  <p className="text-xs text-muted-foreground">Source: {list.sourceType}</p>
                </div>
                <Badge variant="outline">List</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSegments && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Dynamic Segments ({membership.segments.length})</h4>
          </div>
          <div className="space-y-2">
            {membership.segments.map((segment) => (
              <div
                key={segment.id}
                className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer"
                onClick={() => setLocation(`/segments/${segment.id}`)}
              >
                <div>
                  <p className="font-medium">{segment.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {segment.isActive && (
                    <Badge className="bg-green-500/10 text-green-500">Active</Badge>
                  )}
                  <Badge variant="secondary">Segment</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
