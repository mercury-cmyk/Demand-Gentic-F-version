import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { campaigns } from "@shared/schema";
import { 
  ArrowLeft, 
  Users, 
  Phone, 
  CheckCircle, 
  XCircle, 
  Clock,
  Trash2,
  RefreshCw,
  Loader2
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type Campaign = typeof campaigns.$inferSelect;
type QueueStatus = "queued" | "in_progress" | "done" | "skipped" | "removed";

interface QueueItem {
  id: string;
  campaignId: string;
  contactId: string;
  accountId: string;
  status: QueueStatus;
  queuedAt: string;
  processedAt?: string;
  contact?: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  account?: {
    name: string;
  };
}

interface AccountStats {
  accountId: string;
  accountName: string;
  queuedCount: number;
  connectedCount: number;
  positiveDispCount: number;
}

const statusConfig = {
  queued: { label: "Queued", icon: Clock, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  in_progress: { label: "In Progress", icon: RefreshCw, color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  done: { label: "Completed", icon: CheckCircle, color: "bg-green-500/10 text-green-600 border-green-500/20" },
  skipped: { label: "Skipped", icon: XCircle, color: "bg-gray-500/10 text-gray-600 border-gray-500/20" },
  removed: { label: "Removed", icon: Trash2, color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

export default function CampaignQueuePage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
  });

  const { data: queueItems = [], isLoading: queueLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/agents/me/queue", campaignId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/agents/me/queue?campaignId=${campaignId}`);
      return response.json();
    },
    enabled: !!campaignId && !!user?.id,
  });

  const { data: accountStats = [] } = useQuery<AccountStats[]>({
    queryKey: ["/api/campaigns", campaignId, "account-stats"],
    enabled: !!campaignId,
  });

  // Add more contacts to queue mutation
  const refillQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        'POST',
        `/api/campaigns/${campaignId}/queues/set`,
        {
          agent_id: user?.id,
          filters: undefined,
          per_account_cap: null,
          max_queue_size: 5000,
          keep_in_progress: true,
          allow_sharing: true,
        }
      );
      return response.json();
    },
    onSuccess: (data: any) => {
      const totalSkipped = (data.skipped_due_to_collision || 0) + (data.skipped_no_phone || 0);
      const descriptionParts = [
        `Assigned: ${data.assigned}`,
        `Released: ${data.released}`,
      ];
      
      if (totalSkipped > 0) {
        descriptionParts.push(`Filtered out: ${totalSkipped}`);
        if (data.skipped_no_phone > 0) {
          descriptionParts.push(`  - No valid phone: ${data.skipped_no_phone}`);
        }
        if (data.skipped_due_to_collision > 0) {
          descriptionParts.push(`  - Already assigned: ${data.skipped_due_to_collision}`);
        }
      }
      
      toast({
        title: data.assigned > 0 ? "Queue Refilled Successfully" : "Queue Refilled - Low Results",
        description: descriptionParts.join('\n'),
        variant: data.assigned === 0 ? "destructive" : "default",
        duration: 8000,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agents/me/queue", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "account-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refill queue",
        variant: "destructive",
      });
    },
  });

  const handleRemoveFromQueue = async (queueItemId: string) => {
    try {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}/queue/${queueItemId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/agents/me/queue", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId, "account-stats"] });
      toast({
        title: "Contact Removed",
        description: "Contact has been removed from the calling queue.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to remove contact from queue.",
        variant: "destructive",
      });
    }
  };

  const queueStats = {
    total: queueItems.length,
    queued: queueItems.filter(i => i.status === "queued").length,
    inProgress: queueItems.filter(i => i.status === "in_progress").length,
    done: queueItems.filter(i => i.status === "done").length,
    skipped: queueItems.filter(i => i.status === "skipped").length,
    removed: queueItems.filter(i => i.status === "removed").length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/campaigns/telemarketing")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{campaign?.name || "Campaign Queue"}</h1>
            <p className="text-muted-foreground">Manage calling queue and account caps</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refillQueueMutation.mutate()}
            disabled={refillQueueMutation.isPending}
            data-testid="button-refill-queue"
          >
            {refillQueueMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding Contacts...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refill Queue
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Account Cap Settings */}
      {campaign?.accountCapEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="w-5 h-5 inline mr-2" />
              Account Lead Cap Settings
            </CardTitle>
            <CardDescription>Active cap enforcement for this campaign</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Cap Value</div>
              <div className="text-2xl font-bold text-primary">{campaign.accountCapValue}</div>
              <div className="text-xs text-muted-foreground mt-1">contacts per account</div>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Enforcement Mode</div>
              <Badge variant="secondary" className="mt-1 capitalize">
                {campaign.accountCapMode === 'queue_size' && 'Queue Size'}
                {campaign.accountCapMode === 'connected_calls' && 'Connected Calls'}
                {campaign.accountCapMode === 'positive_disp' && 'Positive Dispositions'}
              </Badge>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Total Accounts</div>
              <div className="text-2xl font-bold">{accountStats.length}</div>
              <div className="text-xs text-muted-foreground mt-1">in this campaign</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue Statistics */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queueStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-600">Queued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{queueStats.queued}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-600">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{queueStats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{queueStats.done}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Skipped</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{queueStats.skipped}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-600">Removed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{queueStats.removed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Phone className="w-5 h-5 inline mr-2" />
            Calling Queue
          </CardTitle>
          <CardDescription>
            {queueLoading ? "Loading queue..." : `${queueItems.length} contact(s) in queue`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queued At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queueItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No contacts in queue
                  </TableCell>
                </TableRow>
              ) : (
                queueItems.map((item) => {
                  const StatusIcon = statusConfig[item.status].icon;
                  return (
                    <TableRow key={item.id} data-testid={`row-queue-${item.id}`}>
                      <TableCell className="font-medium">
                        {item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : "Unknown Contact"}
                      </TableCell>
                      <TableCell>{item.account?.name || "Unknown Account"}</TableCell>
                      <TableCell className="font-mono text-sm">{item.contact?.phoneNumber || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig[item.status].color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig[item.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(item.queuedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {item.status === "queued" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFromQueue(item.id)}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Account Statistics */}
      {campaign?.accountCapEnabled && accountStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="w-5 h-5 inline mr-2" />
              Account Statistics
            </CardTitle>
            <CardDescription>Cap enforcement status by account</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Queued</TableHead>
                  <TableHead>Connected Calls</TableHead>
                  <TableHead>Positive Dispositions</TableHead>
                  <TableHead>Cap Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountStats.map((stat) => {
                  const capValue = campaign.accountCapValue || 0;
                  const relevantCount = 
                    campaign.accountCapMode === 'queue_size' ? stat.queuedCount :
                    campaign.accountCapMode === 'connected_calls' ? stat.connectedCount :
                    stat.positiveDispCount;
                  const isAtCap = relevantCount >= capValue;

                  return (
                    <TableRow key={stat.accountId} data-testid={`row-account-${stat.accountId}`}>
                      <TableCell className="font-medium">{stat.accountName}</TableCell>
                      <TableCell>{stat.queuedCount}</TableCell>
                      <TableCell>{stat.connectedCount}</TableCell>
                      <TableCell>{stat.positiveDispCount}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={isAtCap ? "bg-red-500/10 text-red-600 border-red-500/20" : "bg-green-500/10 text-green-600 border-green-500/20"}
                        >
                          {isAtCap ? `At Cap (${relevantCount}/${capValue})` : `Under Cap (${relevantCount}/${capValue})`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
