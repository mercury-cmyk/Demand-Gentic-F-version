import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  User,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  PhoneCall,
  TrendingUp,
  Shield,
  RefreshCw,
  ClipboardList,
  BarChart3,
  Settings2,
} from "lucide-react";
import { format } from "date-fns";
import { AIReasoning } from "@/components/ui/ai-reasoning";
import { ConfidenceIndicator } from "@/components/ui/confidence-indicator";
import { AgentState } from "@/components/ui/agent-state";

interface DashboardStats {
  qcQueue: Array;
  recycleJobs: Array;
  producerPerformance: Array;
}

interface ProducerMetric {
  id: string;
  campaignId: string;
  campaignName: string;
  producerType: 'human' | 'ai';
  humanAgentId: string | null;
  humanAgentName: string | null;
  virtualAgentId: string | null;
  virtualAgentName: string | null;
  metricDate: string;
  totalCalls: number;
  connectedCalls: number;
  qualifiedLeads: number;
  qcPassedLeads: number;
  qcFailedLeads: number;
  dncRequests: number;
  optOutRequests: number;
  handoffsToHuman: number;
  avgCallDuration: string | null;
  avgQualityScore: string | null;
  conversionRate: string | null;
  contactabilityRate: string | null;
  recycledContacts: number;
}

interface QcQueueItem {
  id: string;
  callSessionId: string | null;
  leadId: string | null;
  campaignId: string;
  campaignName: string;
  producerType: 'human' | 'ai';
  status: string;
  priority: number;
  assignedTo: string | null;
  assignedToName: string | null;
  reviewNotes: string | null;
  qcOutcome: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface RecycleJob {
  id: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  status: string;
  attemptNumber: number;
  maxAttempts: number;
  scheduledAt: string;
  eligibleAt: string;
  targetAgentType: string;
  createdAt: string;
}

interface GovernanceLog {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  actionType: string;
  producerType: string | null;
  result: string | null;
  executedBy: string;
  createdAt: string;
}

interface DispositionRule {
  id: string;
  name: string;
  description: string | null;
  dispositionId: string;
  dispositionLabel: string | null;
  producerType: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ElementType; 
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    
      
        
          
            {title}
            {value}
            {subtitle && (
              {subtitle}
            )}
          
          
            
          
        
      
    
  );
}

function ProducerComparisonCard({ metrics }: { metrics: DashboardStats['producerPerformance'] }) {
  const aiMetrics = metrics.find(m => m.producerType === 'ai') || { totalCalls: 0, qualifiedLeads: 0, qcPassedLeads: 0 };
  const humanMetrics = metrics.find(m => m.producerType === 'human') || { totalCalls: 0, qualifiedLeads: 0, qcPassedLeads: 0 };

  const total = (aiMetrics.totalCalls || 0) + (humanMetrics.totalCalls || 0);
  const aiPercent = total > 0 ? Math.round((aiMetrics.totalCalls || 0) / total * 100) : 0;
  const humanPercent = 100 - aiPercent;

  return (
    
      
        Producer Distribution
        AI vs Human call volume
      
      
        
          
            
              
              AI
            
            
              
            
            {aiPercent}%
          
          
            
              
              Human
            
            
              
            
            {humanPercent}%
          
        

        
          
            
              
              AI Performance
            
            
              
                Total Calls
                {aiMetrics.totalCalls || 0}
              
              
                Qualified
                {aiMetrics.qualifiedLeads || 0}
              
              
                QC Passed
                {aiMetrics.qcPassedLeads || 0}
              
            
          
          
            
              
              Human Performance
            
            
              
                Total Calls
                {humanMetrics.totalCalls || 0}
              
              
                Qualified
                {humanMetrics.qualifiedLeads || 0}
              
              
                QC Passed
                {humanMetrics.qcPassedLeads || 0}
              
            
          
        
      
    
  );
}

function QcStatusBadge({ status }: { status: string }) {
  const variants: Record = {
    pending: { color: 'bg-warning/10 text-warning', label: 'Pending' },
    in_review: { color: 'bg-info/10 text-info', label: 'In Review' },
    approved: { color: 'bg-success/10 text-success', label: 'Approved' },
    rejected: { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
    escalated: { color: 'bg-primary/10 text-primary', label: 'Escalated' },
    returned: { color: 'bg-accent/60 text-foreground', label: 'Returned' },
  };
  const variant = variants[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return {variant.label};
}

function RecycleStatusBadge({ status }: { status: string }) {
  const variants: Record = {
    scheduled: { color: 'bg-info/10 text-info', label: 'Scheduled' },
    eligible: { color: 'bg-success/10 text-success', label: 'Eligible' },
    processing: { color: 'bg-warning/10 text-warning', label: 'Processing' },
    completed: { color: 'bg-muted text-muted-foreground', label: 'Completed' },
    expired: { color: 'bg-destructive/10 text-destructive', label: 'Expired' },
    cancelled: { color: 'bg-accent/60 text-foreground', label: 'Cancelled' },
  };
  const variant = variants[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return {variant.label};
}

function ProducerBadge({ type }: { type: 'ai' | 'human' | string }) {
  if (type === 'ai') {
    return (
      
    );
  }
  return (
    
      
      Human Agent
    
  );
}

export default function UnifiedAgentConsolePage() {
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
  });

  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/unified-console/dashboard-stats', selectedCampaign !== 'all' ? selectedCampaign : null],
    queryFn: async () => {
      const url = selectedCampaign !== 'all' 
        ? `/api/unified-console/dashboard-stats?campaignId=${selectedCampaign}`
        : '/api/unified-console/dashboard-stats';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  const { data: qcQueue = [], isLoading: isLoadingQc } = useQuery({
    queryKey: ['/api/unified-console/qc-queue', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      const response = await fetch(`/api/unified-console/qc-queue?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch QC queue');
      return response.json();
    },
  });

  const { data: recycleJobs = [], isLoading: isLoadingRecycle } = useQuery({
    queryKey: ['/api/unified-console/recycle-jobs', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      const response = await fetch(`/api/unified-console/recycle-jobs?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch recycle jobs');
      return response.json();
    },
  });

  const { data: governanceLog = [], isLoading: isLoadingGov } = useQuery({
    queryKey: ['/api/unified-console/governance-log', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      params.set('limit', '50');
      const response = await fetch(`/api/unified-console/governance-log?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch governance log');
      return response.json();
    },
  });

  const { data: dispositionRules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ['/api/unified-console/disposition-rules'],
  });

  const qcPending = dashboardStats?.qcQueue.find(q => q.status === 'pending')?.count || 0;
  const qcInReview = dashboardStats?.qcQueue.find(q => q.status === 'in_review')?.count || 0;
  const recycleScheduled = dashboardStats?.recycleJobs.find(r => r.status === 'scheduled')?.count || 0;
  const recycleEligible = dashboardStats?.recycleJobs.find(r => r.status === 'eligible')?.count || 0;

  return (
    
      
        
          Unified Agent Console
          
            Manage AI and human agents in a unified queue with shared governance
          
        
        
          
            
              
            
            
              All Campaigns
              {campaigns.map((campaign) => (
                
                  {campaign.name}
                
              ))}
            
          
        
      

      {isLoadingStats ? (
        
          {[1, 2, 3, 4].map((i) => (
            
              
                
              
            
          ))}
        
      ) : (
        
          
          
           sum + (p.totalCalls || 0), 0)}
            subtitle="AI + Human combined"
            icon={PhoneCall}
          />
           sum + (p.qualifiedLeads || 0), 0)}
            subtitle="Pending QC review"
            icon={TrendingUp}
          />
        
      )}

      
        
          
            
            Overview
          
          
            
            QC Queue
          
          
            
            Recycle Jobs
          
          
            
            Governance Log
          
          
            
            Disposition Rules
          
        

        
          
            
            
            
              
                QC Queue Summary
                Items awaiting quality review
              
              
                
                  {(dashboardStats?.qcQueue || []).map((item) => (
                    
                      
                        
                      
                      {item.count}
                    
                  ))}
                  {(dashboardStats?.qcQueue || []).length === 0 && (
                    
                      No QC items in queue
                    
                  )}
                
              
            
          

          
            
              Recycle Jobs Status
              Contacts scheduled for redial
            
            
              
                {(dashboardStats?.recycleJobs || []).map((item) => (
                  
                    
                    {item.count}
                  
                ))}
                {(dashboardStats?.recycleJobs || []).length === 0 && (
                  No recycle jobs
                )}
              
            
          
        

        
          
            
              QC Work Queue
              
                Unified quality control queue for both AI and human produced calls
              
            
            
              {isLoadingQc ? (
                
              ) : qcQueue.length === 0 ? (
                
                  
                  No items in QC queue
                
              ) : (
                
                  
                    
                      
                        Campaign
                        Producer
                        Status
                        Confidence
                        Reasoning
                        Priority
                        Assigned To
                        Created
                      
                    
                    
                      {qcQueue.map((item) => (
                        
                          {item.campaignName}
                          
                            
                          
                          
                            
                          
                          
                            
                          
                          
                            
                          
                          {item.priority}
                          {item.assignedToName || '-'}
                          
                            {format(new Date(item.createdAt), 'MMM d, HH:mm')}
                          
                        
                      ))}
                    
                  
                
              )}
            
          
        

        
          
            
              Recycle Jobs
              
                Contacts scheduled for redial with configurable wait windows
              
            
            
              {isLoadingRecycle ? (
                
              ) : recycleJobs.length === 0 ? (
                
                  
                  No recycle jobs scheduled
                
              ) : (
                
                  
                    
                      
                        Campaign
                        Contact
                        Status
                        Attempt
                        Target Agent
                        Eligible At
                      
                    
                    
                      {recycleJobs.map((job) => (
                        
                          {job.campaignName}
                          
                            {[job.contactFirstName, job.contactLastName].filter(Boolean).join(' ') || 'Unknown'}
                          
                          
                            
                          
                          {job.attemptNumber} / {job.maxAttempts}
                          
                            
                              {job.targetAgentType === 'ai' ? 'AI' : job.targetAgentType === 'human' ? 'Human' : 'Any'}
                            
                          
                          
                            {format(new Date(job.eligibleAt), 'MMM d, HH:mm')}
                          
                        
                      ))}
                    
                  
                
              )}
            
          
        

        
          
            
              Governance Actions Log
              
                Audit trail for all automated governance actions
              
            
            
              {isLoadingGov ? (
                
              ) : governanceLog.length === 0 ? (
                
                  
                  No governance actions recorded
                
              ) : (
                
                  
                    
                      
                        Action
                        Campaign
                        Contact
                        Producer
                        Result
                        Executed By
                        Time
                      
                    
                    
                      {governanceLog.map((log) => (
                        
                          
                            {log.actionType.replace(/_/g, ' ')}
                          
                          {log.campaignName || '-'}
                          
                            {log.contactFirstName || log.contactLastName 
                              ? [log.contactFirstName, log.contactLastName].filter(Boolean).join(' ')
                              : '-'}
                          
                          
                            {log.producerType ?  : '-'}
                          
                          
                            {log.result === 'success' ? (
                              Success
                            ) : log.result === 'failed' ? (
                              Failed
                            ) : (
                              {log.result || '-'}
                            )}
                          
                          {log.executedBy}
                          
                            {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                          
                        
                      ))}
                    
                  
                
              )}
            
          
        

        
          
            
              
                Disposition Rules Engine
                
                  Configure governance rules triggered by disposition codes
                
              
              
                Create Rule
              
            
            
              {isLoadingRules ? (
                
              ) : dispositionRules.length === 0 ? (
                
                  
                  No disposition rules configured
                  Create rules to automate QC, DNC, and retry workflows
                
              ) : (
                
                  
                    
                      
                        Name
                        Disposition
                        Producer
                        Priority
                        Status
                        Created
                      
                    
                    
                      {dispositionRules.map((rule) => (
                        
                          {rule.name}
                          {rule.dispositionLabel || rule.dispositionId}
                          
                            {rule.producerType ? (
                              
                            ) : (
                              All
                            )}
                          
                          {rule.priority}
                          
                            {rule.isActive ? (
                              Active
                            ) : (
                              Inactive
                            )}
                          
                          
                            {format(new Date(rule.createdAt), 'MMM d, yyyy')}
                          
                        
                      ))}
                    
                  
                
              )}
            
          
        
      
    
  );
}