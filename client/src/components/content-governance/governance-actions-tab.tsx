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

const ACTION_TYPE_ICONS: Record<string, any> = {
  refresh_recommended: RefreshCw,
  refresh_in_progress: RefreshCw,
  refresh_completed: CheckCircle,
  design_update: Paintbrush,
  rollback: RotateCcw,
  coverage_gap_detected: AlertTriangle,
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  refresh_recommended: "Refresh Recommended",
  refresh_in_progress: "Refresh In Progress",
  refresh_completed: "Refresh Completed",
  design_update: "Design Update",
  rollback: "Rollback",
  coverage_gap_detected: "Coverage Gap",
};

const STATUS_BADGES: Record<string, { color: string; label: string }> = {
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
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading governance actions...
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mb-3 opacity-50" />
          <p className="text-sm">No governance actions yet.</p>
          <p className="text-xs mt-1">Actions are created when features are updated or coverage gaps are detected.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-3 pb-3 px-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium">{pendingCount} pending action{pendingCount > 1 ? "s" : ""} require review</span>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {actions.map((action) => {
          const Icon = ACTION_TYPE_ICONS[action.actionType] || ClipboardList;
          const statusInfo = STATUS_BADGES[action.status] || STATUS_BADGES.pending;

          return (
            <Card key={action.id}>
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{ACTION_TYPE_LABELS[action.actionType] || action.actionType}</span>
                        <Badge className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</Badge>
                      </div>
                      {action.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.description}</p>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(action.createdAt).toLocaleDateString()} {new Date(action.createdAt).toLocaleTimeString()}
                        {action.resolvedAt && ` — resolved ${new Date(action.resolvedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  {action.status === "pending" && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => updateMutation.mutate({ id: action.id, status: "approved" })}
                        disabled={updateMutation.isPending}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-muted-foreground"
                        onClick={() => updateMutation.mutate({ id: action.id, status: "dismissed" })}
                        disabled={updateMutation.isPending}
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
