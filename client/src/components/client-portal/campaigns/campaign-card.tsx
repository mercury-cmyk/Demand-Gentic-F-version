import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target, Clock, CheckCircle, Truck,
  Play, Pause, BarChart3, Plus, Mic, List, Phone, Mail,
  PhoneCall, PhoneOff, PhoneMissed, Voicemail, UserCheck,
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
    <Card className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
      <div className={`absolute inset-y-0 left-0 w-[3px] ${statusAccent}`} />

      {/* Header */}
      <CardHeader className="pb-3 pt-5 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:text-slate-300 flex items-center justify-center">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100 truncate">
                {campaign.name}
              </CardTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {campaignTypeLabel.replace(/_/g, ' ')}
                </Badge>
                {campaign.startDate && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {new Date(campaign.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {campaign.endDate ? ` – ${new Date(campaign.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Badge variant="outline" className={`${config.tone} shrink-0 gap-1 text-[10px] font-semibold px-2 h-6`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 pb-4">
        {/* Call Stats Row — sourced from dialerCallAttempts (matches admin) */}
        <div className="grid grid-cols-4 gap-2">
          <div className="flex flex-col items-center rounded-lg border border-slate-100 bg-slate-50/80 py-2 px-1 dark:border-slate-800 dark:bg-slate-900/50">
            <PhoneCall className="h-3.5 w-3.5 text-emerald-500 mb-1" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{callsMade.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">Calls</p>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-slate-100 bg-slate-50/80 py-2 px-1 dark:border-slate-800 dark:bg-slate-900/50">
            <PhoneCall className="h-3.5 w-3.5 text-blue-500 mb-1" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{connected.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">Connected</p>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-slate-100 bg-slate-50/80 py-2 px-1 dark:border-slate-800 dark:bg-slate-900/50">
            <UserCheck className="h-3.5 w-3.5 text-violet-500 mb-1" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{qualified.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">Qualified</p>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-slate-100 bg-slate-50/80 py-2 px-1 dark:border-slate-800 dark:bg-slate-900/50">
            <Voicemail className="h-3.5 w-3.5 text-amber-500 mb-1" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{voicemail.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">Voicemail</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-400 uppercase tracking-wide">Qualified leads progress</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{leadsCount.toLocaleString()} / {targetCount.toLocaleString()}</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        {/* Queue indicator */}
        {queueCount > 0 && (
          <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <List className="h-3.5 w-3.5" />
              <span>{queueCount.toLocaleString()} contacts in queue</span>
            </div>
            {onViewQueue && (
              <button
                onClick={() => onViewQueue(campaign.id)}
                className="text-[10px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                View →
              </button>
            )}
          </div>
        )}
      </CardContent>

      {/* Actions Footer */}
      <CardFooter className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        {/* Primary actions */}
        <div className="flex gap-2 w-full">
          <Button
            variant="default"
            size="sm"
            className="flex-1 h-8 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900"
            onClick={() => onRequestMoreLeads(campaign.id)}
          >
            <Plus className="h-3.5 w-3.5" />
            Request Leads
          </Button>
          {onViewDetails && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 gap-1.5 border-slate-200 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => onViewDetails(campaign.id)}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Details
            </Button>
          )}
        </div>

        {/* Preview Studio actions */}
        {onOpenPreviewStudio && (
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 gap-1.5 border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 text-xs dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              onClick={() => onOpenPreviewStudio(campaign.id, 'phone')}
            >
              <Phone className="h-3.5 w-3.5" />
              Test Call
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 gap-1.5 border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 text-xs dark:border-blue-800/60 dark:bg-blue-950/20 dark:text-blue-400 dark:hover:bg-blue-950/40"
              onClick={() => onOpenPreviewStudio(campaign.id, 'email')}
            >
              <Mail className="h-3.5 w-3.5" />
              Test Email
            </Button>
            {onSelectVoice && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-100 text-xs dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                onClick={() => onSelectVoice(campaign.id)}
                title="Change voice"
              >
                <Mic className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
