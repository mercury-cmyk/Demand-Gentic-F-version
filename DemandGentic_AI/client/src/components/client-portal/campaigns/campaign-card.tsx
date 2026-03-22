import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Target, Clock, CheckCircle, Truck,
  Play, Pause, BarChart3, Plus, Mic, List, Phone, Mail,
  PhoneCall, PhoneOff, PhoneMissed, Voicemail, UserCheck,
  MoreVertical, Eye, ChevronRight, Ban, Users,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status?: string;
  eligibleCount?: number;
  verifiedCount?: number;
  deliveredCount?: number;
  targetCount?: number;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  // New fields
  type?: string;
  campaignType?: string;
  dialMode?: string;
  startDate?: string;
  endDate?: string;
  targetQualifiedLeads?: number;
  costPerLead?: string;
  orderNumber?: string;
  estimatedBudget?: string;
  approvedBudget?: string;
  totalContacts?: number;
  callReport?: {
    callsMade: number;
    connected: number;
    qualified: number;
    voicemail: number;
    noAnswer: number;
    invalid: number;
  };
  emailReport?: {
    totalRecipients: number;
    delivered: number;
    opens: number;
    clicks: number;
    unsubscribes: number;
  };
  callSnapshot?: {
    contactsInQueue: number;
    callsMade: number;
    callsConnected: number;
    leadsQualified: number;
    dncRequests: number;
  };
  emailSnapshot?: {
    totalRecipients: number;
    delivered: number;
    opens: number;
    clicks: number;
    unsubscribes: number;
  };
  stats?: {
    attempts: number;
    impressions: number;
    leads: number;
    targetAchieved: number;
    remaining: number;
    callReport?: {
      callsMade: number;
      connected: number;
      qualified: number;
      voicemail: number;
      noAnswer: number;
      invalid: number;
    };
    queueStats?: {
      total: number;
      remaining: number;
      completed: number;
      failed: number;
    };
  };
}

interface CampaignCardProps {
  campaign: Campaign;
  onRequestMoreLeads: (campaignId: string) => void;
  onViewDetails?: (campaignId: string) => void;
  onOpenPreviewStudio?: (campaignId: string, mode?: 'voice' | 'phone' | 'email') => void;
  onSelectVoice?: (campaignId: string) => void;
  onViewQueue?: (campaignId: string) => void;
}

const statusConfig: Record = {
  pending: {
    label: 'Pending Review',
    tone: 'border-amber-300/80 bg-amber-50/80 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    tone: 'border-blue-300/80 bg-blue-50/80 text-blue-800 dark:border-blue-800/70 dark:bg-blue-950/40 dark:text-blue-300',
    icon: CheckCircle,
  },
  active: {
    label: 'In Progress',
    tone: 'border-emerald-300/80 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: Play,
  },
  progressing: {
    label: 'In Progress',
    tone: 'border-emerald-300/80 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: Play,
  },
  delivering: {
    label: 'Delivering',
    tone: 'border-violet-300/80 bg-violet-50/80 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered',
    tone: 'border-violet-300/80 bg-violet-50/80 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300',
    icon: Truck,
  },
  completed: {
    label: 'Completed',
    tone: 'border-slate-300/80 bg-slate-100/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200',
    icon: CheckCircle,
  },
  paused: {
    label: 'Paused',
    tone: 'border-gray-300/80 bg-gray-100/70 text-gray-700 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-200',
    icon: Pause,
  },
};

export function CampaignCard({ campaign, onRequestMoreLeads, onViewDetails, onOpenPreviewStudio, onSelectVoice, onViewQueue }: CampaignCardProps) {
  const status = campaign.status || 'active';
  const config = statusConfig[status] || statusConfig.active;
  const StatusIcon = config.icon;

  // Determine channel type
  const PHONE_TYPES = ['call', 'telemarketing', 'sql', 'content_syndication', 'appointment_generation', 'appointment_setting',
    'high_quality_leads', 'live_webinar', 'on_demand_webinar', 'executive_dinner',
    'leadership_forum', 'conference'];
  const rawType = (campaign.campaignType || campaign.type || '').toLowerCase();
  const isEmail = rawType === 'email';
  const isPhone = PHONE_TYPES.includes(rawType) || campaign.dialMode === 'ai_agent';

  // Resolve call stats (prefer snapshot, then callReport, then stats.callReport)
  const report = campaign.callReport || campaign.stats?.callReport;
  const cs = campaign.callSnapshot;
  const recipients = cs?.contactsInQueue ?? campaign.stats?.queueStats?.total ?? campaign.totalContacts ?? campaign.eligibleCount ?? 0;
  const callAttempts = cs?.callsMade ?? Number(report?.callsMade || 0);
  const rpc = cs?.callsConnected ?? Number(report?.connected || 0);
  const qualifiedLeads = cs?.leadsQualified ?? Number(report?.qualified || 0);
  const dnc = cs?.dncRequests ?? 0;

  // Resolve email stats (prefer snapshot, then emailReport)
  const es = campaign.emailSnapshot || campaign.emailReport;
  const emailRecipients = es?.totalRecipients ?? 0;
  const emailDelivered = es?.delivered ?? 0;
  const emailOpens = es?.opens ?? 0;
  const emailClicks = es?.clicks ?? 0;
  const emailUnsubs = es?.unsubscribes ?? 0;

  const leadsCount = campaign.stats?.leads ?? campaign.verifiedCount ?? 0;
  const queueCount = campaign.stats?.queueStats?.total ?? campaign.totalContacts ?? campaign.eligibleCount ?? 0;

  // Progress towards target qualified leads
  const targetCount = campaign.targetQualifiedLeads || campaign.targetCount || campaign.eligibleCount || 100;
  const progressPercent = Math.min(Math.round((leadsCount / targetCount) * 100), 100);

  const campaignTypeLabel = campaign.type || campaign.campaignType || 'campaign';

  const statusAccent =
    status === 'active'
      ? 'bg-emerald-500'
      : status === 'delivering' || status === 'delivered'
        ? 'bg-violet-500'
        : status === 'approved'
          ? 'bg-blue-500'
          : status === 'pending'
            ? 'bg-amber-500'
            : 'bg-slate-400';

  return (
    
      {/* Status accent line */}
      

      {/* Col 1: Name + Type + Status */}
      
        
          
            
              {campaign.name}
            
          
          
            
              
              {config.label}
            
            
              {campaignTypeLabel.replace(/_/g, ' ')}
            
            {queueCount > 0 && (
              
                
                {queueCount.toLocaleString()} queued
              
            )}
          
        
      

      {/* Col 2: 5-column KPI Grid — aligned for phone & email */}
      
        {isEmail ? (
          <>
            
              {emailRecipients.toLocaleString()}
              Recipients
            
            
              {emailDelivered.toLocaleString()}
              Delivered
            
            
              {emailOpens.toLocaleString()}
              Opened
            
            
              {emailClicks.toLocaleString()}
              Clicked
            
            
              {emailUnsubs.toLocaleString()}
              Unsub
            
          
        ) : (
          <>
            
              {recipients.toLocaleString()}
              Recipients
            
            
              {callAttempts.toLocaleString()}
              Attempts
            
            
              {rpc.toLocaleString()}
              RPC
            
            
              {qualifiedLeads.toLocaleString()}
              Qualified
            
            
              {dnc.toLocaleString()}
              DNC
            
          
        )}
      

      {/* Col 3: Primary Action + Overflow Menu */}
      
         { e.stopPropagation(); onRequestMoreLeads(campaign.id); }}
        >
          
          Request Leads
        

        
          
            
              
            
          
          
            {onViewDetails && (
               onViewDetails(campaign.id)}>
                
                View Details
              
            )}
            {onOpenPreviewStudio && (
              <>
                 onOpenPreviewStudio(campaign.id, 'phone')}>
                  
                  Test Call
                
                 onOpenPreviewStudio(campaign.id, 'email')}>
                  
                  Test Email
                
              
            )}
            {onSelectVoice && (
               onSelectVoice(campaign.id)}>
                
                Select Voice
              
            )}
            {onViewQueue && queueCount > 0 && (
               onViewQueue(campaign.id)}>
                
                View Queue ({queueCount})
              
            )}
          
        
      
    
  );
}