import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target, Clock, CheckCircle, Truck,
  Play, Pause, Users, BarChart3, Plus, Mic, List, Phone, Mail
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
    tone: 'text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    tone: 'text-blue-700 border-blue-300 bg-blue-50 dark:text-blue-300 dark:border-blue-800 dark:bg-blue-950/40',
    icon: CheckCircle,
  },
  active: {
    label: 'In Progress',
    tone: 'text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:bg-emerald-950/40',
    icon: Play,
  },
  progressing: {
    label: 'In Progress',
    tone: 'text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:bg-emerald-950/40',
    icon: Play,
  },
  delivering: {
    label: 'Delivering',
    tone: 'text-violet-700 border-violet-300 bg-violet-50 dark:text-violet-300 dark:border-violet-800 dark:bg-violet-950/40',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered',
    tone: 'text-violet-700 border-violet-300 bg-violet-50 dark:text-violet-300 dark:border-violet-800 dark:bg-violet-950/40',
    icon: Truck,
  },
  completed: {
    label: 'Completed',
    tone: 'text-slate-700 border-slate-300 bg-slate-50 dark:text-slate-300 dark:border-slate-700 dark:bg-slate-900/60',
    icon: CheckCircle,
  },
  paused: {
    label: 'Paused',
    tone: 'text-gray-700 border-gray-300 bg-gray-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-900/60',
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
      ? 'from-emerald-500 to-teal-500'
      : status === 'delivering' || status === 'delivered'
        ? 'from-violet-500 to-fuchsia-500'
        : status === 'approved'
          ? 'from-blue-500 to-cyan-500'
          : status === 'pending'
            ? 'from-amber-500 to-orange-500'
            : 'from-slate-500 to-slate-600';

  return (
    <Card className="group relative overflow-hidden border-slate-200/80 bg-white/95 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950/90">
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${statusAccent}`} />

      <CardHeader className="pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center shadow-sm">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base md:text-lg leading-tight truncate">
                {campaign.name}
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize">{campaignTypeLabel}</Badge>
                <Badge variant="outline" className="capitalize">{dialModeLabel}</Badge>
                {campaign.startDate && (
                  <span>
                    {new Date(campaign.startDate).toLocaleDateString()}
                    {campaign.endDate ? ` – ${new Date(campaign.endDate).toLocaleDateString()}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Badge variant="outline" className={`${config.tone} gap-1.5 whitespace-nowrap`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-[11px] text-muted-foreground">Queue</p>
            <p className="mt-1 text-sm font-semibold">{queueCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-[11px] text-muted-foreground">Remaining</p>
            <p className="mt-1 text-sm font-semibold">{remainingCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-[11px] text-muted-foreground">Attempts</p>
            <p className="mt-1 text-sm font-semibold">{attemptsCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-[11px] text-muted-foreground">Leads</p>
            <p className="mt-1 text-sm font-semibold">{leadsCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="rounded-lg border p-3 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Delivery Progress</span>
            <span className="font-semibold">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="mt-2 text-[11px] text-muted-foreground">
            {deliveredCount.toLocaleString()} delivered of {targetCount.toLocaleString()} target
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t bg-slate-50/70 pt-3 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex gap-2 w-full">
          {onViewQueue && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => onViewQueue(campaign.id)}
            >
              <List className="h-3.5 w-3.5" />
              Queue
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => onRequestMoreLeads(campaign.id)}
          >
            <Plus className="h-3.5 w-3.5" />
            Request Leads
          </Button>
          {onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
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
