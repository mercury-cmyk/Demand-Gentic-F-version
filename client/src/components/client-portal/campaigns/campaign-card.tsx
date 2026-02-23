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
  MoreVertical, Eye, ChevronRight,
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

const statusConfig: Record<string, {
  label: string;
  tone: string;
  icon: React.ElementType;
}> = {
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

  // Resolve call report (prefer top-level callReport, fall back to stats.callReport)
  const report = campaign.callReport || campaign.stats?.callReport;

  // Stats from callReport (true calls placed by the AI dialer)
  const callsMade = Number(report?.callsMade || 0);
  const connected = Number(report?.connected || 0);
  const qualified = Number(report?.qualified || 0);
  const voicemail = Number(report?.voicemail || 0);

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
    <div className="group relative flex items-center gap-4 rounded-lg border border-slate-200/80 bg-white px-4 py-3 transition-colors hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/95 dark:hover:bg-slate-900/80">
      {/* Status accent line */}
      <div className={`absolute inset-y-0 left-0 w-[3px] rounded-l-lg ${statusAccent}`} />

      {/* Col 1: Name + Type + Status */}
      <div className="flex items-center gap-3 min-w-0 flex-[2]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">
              {campaign.name}
            </h3>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={`${config.tone} shrink-0 gap-1 text-[10px] font-semibold px-1.5 h-5`}>
              <StatusIcon className="h-2.5 w-2.5" />
              {config.label}
            </Badge>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {campaignTypeLabel.replace(/_/g, ' ')}
            </Badge>
            {queueCount > 0 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                <List className="h-2.5 w-2.5" />
                {queueCount.toLocaleString()} queued
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Col 2: Mini 2×2 KPI Grid */}
      <div className="hidden sm:grid grid-cols-4 gap-x-5 gap-y-0 flex-[3] shrink-0">
        <div className="flex flex-col items-center">
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{callsMade.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Calls</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">{connected.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Connected</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">{qualified.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Qualified</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{voicemail.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-400">Voicemail</p>
        </div>
      </div>

      {/* Col 3: Primary Action + Overflow Menu */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="default"
          size="sm"
          className="h-7 gap-1 bg-slate-900 hover:bg-slate-800 text-white text-xs px-2.5 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900"
          onClick={(e) => { e.stopPropagation(); onRequestMoreLeads(campaign.id); }}
        >
          <Plus className="h-3 w-3" />
          <span className="hidden lg:inline">Request Leads</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onViewDetails && (
              <DropdownMenuItem onClick={() => onViewDetails(campaign.id)}>
                <BarChart3 className="mr-2 h-3.5 w-3.5" />
                View Details
              </DropdownMenuItem>
            )}
            {onOpenPreviewStudio && (
              <>
                <DropdownMenuItem onClick={() => onOpenPreviewStudio(campaign.id, 'phone')}>
                  <Phone className="mr-2 h-3.5 w-3.5" />
                  Test Call
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenPreviewStudio(campaign.id, 'email')}>
                  <Mail className="mr-2 h-3.5 w-3.5" />
                  Test Email
                </DropdownMenuItem>
              </>
            )}
            {onSelectVoice && (
              <DropdownMenuItem onClick={() => onSelectVoice(campaign.id)}>
                <Mic className="mr-2 h-3.5 w-3.5" />
                Select Voice
              </DropdownMenuItem>
            )}
            {onViewQueue && queueCount > 0 && (
              <DropdownMenuItem onClick={() => onViewQueue(campaign.id)}>
                <List className="mr-2 h-3.5 w-3.5" />
                View Queue ({queueCount})
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
