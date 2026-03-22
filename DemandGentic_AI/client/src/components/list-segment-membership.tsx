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

  const { data: membership, isLoading } = useQuery;
    segments: Array;
  }>({
    queryKey: [`/api/${entityType}s/${entityId}/membership`],
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      
        
        
      
    );
  }

  const hasLists = membership?.lists && membership.lists.length > 0;
  const hasSegments = membership?.segments && membership.segments.length > 0;

  if (!hasLists && !hasSegments) {
    return (
      
        
        Not part of any lists or segments
      
    );
  }

  return (
    
      {hasLists && (
        
          
            
            Static Lists ({membership.lists.length})
          
          
            {membership.lists.map((list) => (
               setLocation(`/segments/lists/${list.id}`)}
              >
                
                  {list.name}
                  Source: {list.sourceType}
                
                List
              
            ))}
          
        
      )}

      {hasSegments && (
        
          
            
            Dynamic Segments ({membership.segments.length})
          
          
            {membership.segments.map((segment) => (
               setLocation(`/segments/${segment.id}`)}
              >
                
                  {segment.name}
                
                
                  {segment.isActive && (
                    Active
                  )}
                  Segment
                
              
            ))}
          
        
      )}
    
  );
}