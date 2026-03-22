import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, Paintbrush, RotateCcw, AlertTriangle, ClipboardList } from "lucide-react";

interface GovernanceActionsTabProps {
  organizationId: string;
}

interface GovernanceAction {
  id: string;
  organizationId: string;
  actionType: string;
  publishedPageId: string | null;
  featureId: string | null;
  description: string | null;
  aiAnalysis: any;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const ACTION_TYPE_ICONS: Record = {
  refresh_recommended: RefreshCw,
  refresh_in_progress: RefreshCw,
  refresh_completed: CheckCircle,
  design_update: Paintbrush,
  rollback: RotateCcw,
  coverage_gap_detected: AlertTriangle,
};

const ACTION_TYPE_LABELS: Record = {
  refresh_recommended: "Refresh Recommended",
  refresh_in_progress: "Refresh In Progress",
  refresh_completed: "Refresh Completed",
  design_update: "Design Update",
  rollback: "Rollback",
  coverage_gap_detected: "Coverage Gap",
};

const STATUS_BADGES: Record = {
  pending: { color: "bg-yellow-100 text-yellow-700", label: "Pending" },
  approved: { color: "bg-blue-100 text-blue-700", label: "Approved" },
  applied: { color: "bg-green-100 text-green-700", label: "Applied" },
  dismissed: { color: "bg-gray-100 text-gray-500", label: "Dismissed" },
};

export default function GovernanceActionsTab({ organizationId }: GovernanceActionsTabProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["content-governance", "actions", organizationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-governance/actions?organizationId=${organizationId}`);
      return res.json();
    },
    enabled: !!organizationId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/content-governance/actions/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-governance", "actions"] });
    },
  });

  const actions: GovernanceAction[] = data?.actions || [];
  const pendingCount = actions.filter(a => a.status === "pending").length;

  if (isLoading) {
    return (
      
         Loading governance actions...
      
    );
  }

  if (actions.length === 0) {
    return (
      
        
          
          No governance actions yet.
          Actions are created when features are updated or coverage gaps are detected.
        
      
    );
  }

  return (
    
      {pendingCount > 0 && (
        
          
            
            {pendingCount} pending action{pendingCount > 1 ? "s" : ""} require review
          
        
      )}

      
        {actions.map((action) => {
          const Icon = ACTION_TYPE_ICONS[action.actionType] || ClipboardList;
          const statusInfo = STATUS_BADGES[action.status] || STATUS_BADGES.pending;

          return (
            
              
                
                  
                    
                    
                      
                        {ACTION_TYPE_LABELS[action.actionType] || action.actionType}
                        {statusInfo.label}
                      
                      {action.description && (
                        {action.description}
                      )}
                      
                        {new Date(action.createdAt).toLocaleDateString()} {new Date(action.createdAt).toLocaleTimeString()}
                        {action.resolvedAt && ` — resolved ${new Date(action.resolvedAt).toLocaleDateString()}`}
                      
                    
                  
                  {action.status === "pending" && (
                    
                       updateMutation.mutate({ id: action.id, status: "approved" })}
                        disabled={updateMutation.isPending}
                      >
                         Approve
                      
                       updateMutation.mutate({ id: action.id, status: "dismissed" })}
                        disabled={updateMutation.isPending}
                      >
                         Dismiss
                      
                    
                  )}
                
              
            
          );
        })}
      
    
  );
}