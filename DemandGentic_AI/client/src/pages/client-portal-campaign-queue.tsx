import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Users,
  Phone,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Brain,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientQueueIntelligenceView } from "@/components/client-portal/ClientQueueIntelligenceView";

const getToken = () => localStorage.getItem('clientPortalToken');

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

const statusConfig: Record = {
  queued: { label: "Queued", icon: Clock, color: "border-blue-300/80 bg-blue-50/80 text-blue-700 dark:border-blue-800/70 dark:bg-blue-950/30 dark:text-blue-300" },
  in_progress: { label: "In Progress", icon: RefreshCw, color: "border-amber-300/80 bg-amber-50/80 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300" },
  done: { label: "Completed", icon: CheckCircle, color: "border-emerald-300/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300" },
  skipped: { label: "Skipped", icon: XCircle, color: "border-slate-300/80 bg-slate-100/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300" },
  removed: { label: "Removed", icon: XCircle, color: "border-rose-300/80 bg-rose-50/80 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300" },
};

export default function ClientPortalCampaignQueue() {
  const { id: campaignId } = useParams();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("queue");

  const { data: campaign } = useQuery({
    queryKey: ['client-portal-campaign', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!campaignId,
  });

  const { data: queueItems = [], isLoading } = useQuery({
    queryKey: ['client-portal-queue', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/campaigns/${campaignId}/queue`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch queue');
      return res.json();
    },
    enabled: !!campaignId,
  });

  const queueStats = {
    total: queueItems.length,
    queued: queueItems.filter(i => i.status === "queued").length,
    inProgress: queueItems.filter(i => i.status === "in_progress").length,
    done: queueItems.filter(i => i.status === "done").length,
    skipped: queueItems.filter(i => i.status === "skipped").length,
    removed: queueItems.filter(i => i.status === "removed").length,
  };

  const statCards = [
    { key: "total", label: "Total", value: queueStats.total, icon: Users, iconTone: "text-slate-600 dark:text-slate-300" },
    { key: "queued", label: "Queued", value: queueStats.queued, icon: Clock, iconTone: "text-blue-600 dark:text-blue-400" },
    { key: "inProgress", label: "In Progress", value: queueStats.inProgress, icon: RefreshCw, iconTone: "text-amber-600 dark:text-amber-400" },
    { key: "done", label: "Completed", value: queueStats.done, icon: CheckCircle, iconTone: "text-emerald-600 dark:text-emerald-400" },
    { key: "skipped", label: "Skipped", value: queueStats.skipped, icon: XCircle, iconTone: "text-slate-600 dark:text-slate-300" },
    { key: "removed", label: "Removed", value: queueStats.removed, icon: XCircle, iconTone: "text-rose-600 dark:text-rose-400" },
  ] as const;

  return (
    
      
        {/* Header */}
        
          
            
               setLocation("/client-portal/dashboard?tab=campaigns")}
              >
                
              
              
                Campaign Queue
                
                  {campaign?.name || "Campaign Queue"}
                
                Live operational view of queued and processed contacts.
              
            
          
        

        {/* Tabs: Queue + Intelligence */}
        
          
            
              
              Queue
            
            
              
              Intelligence
            
          

          
        {/* Queue Statistics */}
        
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              
                
                  
                    
                      {card.label}
                      {card.value}
                    
                    
                      
                    
                  
                
              
            );
          })}
        

        {/* Queue Items Table */}
        
          
            
              
              Calling Queue
            
            
              {isLoading ? "Loading queue..." : `${queueItems.length} contact(s) currently tracked in queue`}
            
          
          
            {isLoading ? (
              
                
              
            ) : (
              
                
                  
                    
                      Contact
                      Account
                      Phone
                      Status
                      Queued At
                    
                  
                  
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
                            
                          
                        );
                      })
                    )}
                  
                
              
            )}
          
        
          

          
            
          
        
      
    
  );
}