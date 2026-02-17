import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target, Clock, CheckCircle, Truck,
  Play, Pause, BarChart3, Plus, Mic, List, Phone, Mail
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
  stats?: {
    attempts: number;
    impressions: number;
    leads: number;
    targetAchieved: number;
    remaining: number;
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

  // Calculate progress
  const targetCount = campaign.targetCount || campaign.eligibleCount || 100;
  const deliveredCount = campaign.deliveredCount || 0;
  const progressPercent = Math.min(Math.round((deliveredCount / targetCount) * 100), 100);
  const queueCount = campaign.stats?.queueStats?.total ?? campaign.totalContacts ?? campaign.eligibleCount ?? 0;
  const remainingCount = campaign.stats?.remaining ?? Math.max(targetCount - deliveredCount, 0);
  const attemptsCount = campaign.stats?.attempts ?? campaign.deliveredCount ?? 0;
  const leadsCount = campaign.stats?.leads ?? campaign.verifiedCount ?? 0;
  const campaignTypeLabel = campaign.type || campaign.campaignType || 'campaign';
  const dialModeLabel = campaign.dialMode ? campaign.dialMode.replace('_', ' ') : 'standard';
  const statusAccent =
    status === 'active'
      ? 'bg-emerald-500'
      : status === 'delivering' || status === 'delivered'
        ? 'bg-violet-500'
        : status === 'approved'
          ? 'bg-blue-500'
          : status === 'pending'
            ? 'bg-amber-500'
            : 'bg-slate-500';

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/95">
      <div className={`absolute inset-y-0 left-0 w-1 ${statusAccent}`} />

      <CardHeader className="pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 flex items-center justify-center">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base md:text-lg leading-tight truncate text-slate-900 dark:text-slate-100">
                {campaign.name}
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize border-slate-300/80 bg-slate-100/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{campaignTypeLabel}</Badge>
                <Badge variant="outline" className="capitalize border-slate-300/80 bg-slate-100/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{dialModeLabel}</Badge>
                {campaign.startDate && (
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    {new Date(campaign.startDate).toLocaleDateString()}
                    {campaign.endDate ? ` – ${new Date(campaign.endDate).toLocaleDateString()}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Badge variant="outline" className={`${config.tone} gap-1.5 whitespace-nowrap text-xs font-semibold`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Queue</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{queueCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{remainingCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Attempts</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{attemptsCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Leads</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{leadsCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground uppercase tracking-wide">Delivery Progress</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="mt-2 text-[11px] text-muted-foreground">
            {deliveredCount.toLocaleString()} delivered of {targetCount.toLocaleString()} target
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/80 pt-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex gap-2 w-full">
          {onViewQueue && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
              onClick={() => onViewQueue(campaign.id)}
            >
              <List className="h-3.5 w-3.5" />
              Queue
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
            onClick={() => onRequestMoreLeads(campaign.id)}
          >
            <Plus className="h-3.5 w-3.5" />
            Request Leads
          </Button>
          {onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              className="px-2 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              onClick={() => onViewDetails(campaign.id)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {(onOpenPreviewStudio || onSelectVoice) && (
          <div className="flex gap-2 w-full">
            {onOpenPreviewStudio && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  onClick={() => onOpenPreviewStudio(campaign.id, 'phone')}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Test Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
                  onClick={() => onOpenPreviewStudio(campaign.id, 'email')}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Test Email
                </Button>
              </>
            )}
            {onSelectVoice && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => onSelectVoice(campaign.id)}
              >
                <Mic className="h-3.5 w-3.5" />
                Voice
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
