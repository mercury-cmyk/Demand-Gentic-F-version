import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Loader2,
  Brain,
  AlertTriangle
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
import { QueueIntelligenceView } from "@/components/queue-intelligence";
import { InvalidRecordsModal } from "@/components/campaigns/invalid-records-modal";

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
  const { id: campaignId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  // Support deep-linking via ?tab=intelligence URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') === 'intelligence' ? 'intelligence' : 'queue';
  const [pageTab, setPageTab] = useState(initialTab);
  const [invalidModalOpen, setInvalidModalOpen] = useState(false);
  const rawRoles = (user as any)?.roles ?? user?.role;
  const roleList = Array.isArray(rawRoles) ? rawRoles : rawRoles ? [rawRoles] : [];
  const normalizedRoles = roleList
    .flatMap((role) => (typeof role === 'string' ? role.split(/[,\s]+/) : []))
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
  const isClientUser = normalizedRoles.includes('client_user');
  const queueQueryKey = isClientUser
    ? ["/api/campaigns", campaignId, "queue"]
    : ["/api/agents/me/queue", campaignId];

  const { data: campaign } = useQuery({
    queryKey: ["/api/campaigns", campaignId],
  });

  const { data: queueItems = [], isLoading: queueLoading } = useQuery({
    queryKey: queueQueryKey,
    queryFn: async () => {
      const response = isClientUser
        ? await apiRequest('GET', `/api/campaigns/${campaignId}/queue`)
        : await apiRequest('GET', `/api/agents/me/queue?campaignId=${campaignId}`);
      return response.json();
    },
    enabled: !!campaignId && !!user?.id,
  });

  const { data: accountStats = [] } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: queueQueryKey });
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
      queryClient.invalidateQueries({ queryKey: queueQueryKey });
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

  // Fetch server-side stats which include the invalid count
  const { data: serverStats } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/queue/stats`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/campaigns/${campaignId}/queue/stats`);
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const invalidCount = serverStats?.invalid ?? 0;

  return (
    
      {/* Header */}
      
        
           setLocation("/phone-campaigns")}
            data-testid="button-back"
          >
            
          
          
            {campaign?.name || "Campaign Queue"}
            Manage calling queue and account caps
          
        
        
          {!isClientUser && pageTab === "queue" && (
             refillQueueMutation.mutate()}
              disabled={refillQueueMutation.isPending}
              data-testid="button-refill-queue"
            >
              {refillQueueMutation.isPending ? (
                <>
                  
                  Adding Contacts...
                
              ) : (
                <>
                  
                  Refill Queue
                
              )}
            
          )}
        
      

      {/* Page-Level Tabs */}
       setPageTab(v as "queue" | "intelligence")}>
        
          
            
            Queue
          
          
            
            Intelligence
          
        
      

      {/* Intelligence Tab */}
      {pageTab === "intelligence" && campaignId && (
        
      )}

      {/* Queue Tab Content */}
      {pageTab === "queue" && <>

      {/* Account Cap Settings */}
      {campaign?.accountCapEnabled && (
        
          
            
              
              Account Lead Cap Settings
            
            Active cap enforcement for this campaign
          
          
            
              Cap Value
              {campaign.accountCapValue}
              contacts per account
            
            
              Enforcement Mode
              
                {campaign.accountCapMode === 'queue_size' && 'Queue Size'}
                {campaign.accountCapMode === 'connected_calls' && 'Connected Calls'}
                {campaign.accountCapMode === 'positive_disp' && 'Positive Dispositions'}
              
            
            
              Total Accounts
              {accountStats.length}
              in this campaign
            
          
        
      )}

      {/* Queue Statistics */}
      
        
          
            Total
          
          
            {queueStats.total}
          
        
        
          
            Queued
          
          
            {queueStats.queued}
          
        
        
          
            In Progress
          
          
            {queueStats.inProgress}
          
        
        
          
            Completed
          
          
            {queueStats.done}
          
        
        
          
            Skipped
          
          
            {queueStats.skipped}
          
        
        
          
            Removed
          
          
            {queueStats.removed}
          
        
         0 ? 'border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/20' : ''}`}
          onClick={() => invalidCount > 0 && setInvalidModalOpen(true)}
          title={invalidCount > 0 ? 'Click to view and manage invalid records' : 'No invalid records'}
        >
          
            
              
              Invalid
            
          
          
            {invalidCount}
          
        
      

      {/* Queue Items Table */}
      
        
          
            
            Calling Queue
          
          
            {queueLoading ? "Loading queue..." : `${queueItems.length} contact(s) in queue`}
          
        
        
          
            
              
                Contact
                Account
                Phone
                Status
                Queued At
                Actions
              
            
            
              {queueItems.length === 0 ? (
                
                  
                    No contacts in queue
                  
                
              ) : (
                queueItems.map((item) => {
                  const StatusIcon = statusConfig[item.status].icon;
                  return (
                    
                      
                        {item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : "Unknown Contact"}
                      
                      {item.account?.name || "Unknown Account"}
                      {item.contact?.phoneNumber || "-"}
                      
                        
                          
                          {statusConfig[item.status].label}
                        
                      
                      
                        {new Date(item.queuedAt).toLocaleString()}
                      
                      
                        {!isClientUser && item.status === "queued" && (
                           handleRemoveFromQueue(item.id)}
                            data-testid={`button-remove-${item.id}`}
                          >
                            
                          
                        )}
                      
                    
                  );
                })
              )}
            
          
        
      

      {/* Account Statistics */}
      {campaign?.accountCapEnabled && accountStats.length > 0 && (
        
          
            
              
              Account Statistics
            
            Cap enforcement status by account
          
          
            
              
                
                  Account
                  Queued
                  Connected Calls
                  Positive Dispositions
                  Cap Status
                
              
              
                {accountStats.map((stat) => {
                  const capValue = campaign.accountCapValue || 0;
                  const relevantCount =
                    campaign.accountCapMode === 'queue_size' ? stat.queuedCount :
                    campaign.accountCapMode === 'connected_calls' ? stat.connectedCount :
                    stat.positiveDispCount;
                  const isAtCap = relevantCount >= capValue;

                  return (
                    
                      {stat.accountName}
                      {stat.queuedCount}
                      {stat.connectedCount}
                      {stat.positiveDispCount}
                      
                        
                          {isAtCap ? `At Cap (${relevantCount}/${capValue})` : `Under Cap (${relevantCount}/${capValue})`}
                        
                      
                    
                  );
                })}
              
            
          
        
      )}

      }

      {/* Invalid Records Modal */}
      {campaignId && (
        
      )}
    
  );
}