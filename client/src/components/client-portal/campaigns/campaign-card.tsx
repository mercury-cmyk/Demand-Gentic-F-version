import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target, ChevronRight, Clock, CheckCircle, Truck,
  AlertCircle, Play, Pause, Users, BarChart3, Plus, Bot, Mic
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
}

interface CampaignCardProps {
  campaign: Campaign;
  onRequestMoreLeads: (campaignId: string) => void;
  onViewDetails?: (campaignId: string) => void;
  onTestAgent?: (campaignId: string) => void;
  onSelectVoice?: (campaignId: string) => void;
}

const statusConfig: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
  step: number;
}> = {
  pending: {
    label: 'Pending Review',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    icon: Clock,
    step: 1
  },
  approved: {
    label: 'Approved',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    icon: CheckCircle,
    step: 2
  },
  active: {
    label: 'In Progress',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: Play,
    step: 3
  },
  progressing: {
    label: 'In Progress',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: Play,
    step: 3
  },
  delivering: {
    label: 'Delivering',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    icon: Truck,
    step: 4
  },
  delivered: {
    label: 'Delivered',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    icon: Truck,
    step: 4
  },
  completed: {
    label: 'Completed',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    icon: CheckCircle,
    step: 5
  },
  paused: {
    label: 'Paused',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    icon: Pause,
    step: 3
  },
};

const statusSteps = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'In Progress' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

export function CampaignCard({ campaign, onRequestMoreLeads, onViewDetails, onTestAgent, onSelectVoice }: CampaignCardProps) {
  const status = campaign.status || 'active';
  const config = statusConfig[status] || statusConfig.active;
  const StatusIcon = config.icon;

  // Calculate progress
  const targetCount = campaign.targetCount || campaign.eligibleCount || 100;
  const deliveredCount = campaign.deliveredCount || 0;
  const progressPercent = Math.min(Math.round((deliveredCount / targetCount) * 100), 100);

  return (
    <Card className="hover:shadow-lg transition-all duration-300 overflow-hidden group">
      {/* Status Banner */}
      <div className={`h-1.5 ${
        status === 'active' ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
        status === 'delivering' ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
        status === 'completed' ? 'bg-gradient-to-r from-slate-400 to-slate-500' :
        status === 'approved' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
        status === 'pending' ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
        'bg-gradient-to-r from-gray-400 to-gray-500'
      }`} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Target className="h-6 w-6 text-white" />
          </div>
          <Badge className={`${config.bgColor} ${config.color} border-0 gap-1`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
        <CardTitle className="mt-3 text-lg group-hover:text-primary transition-colors">
          {campaign.name}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Timeline */}
        <div className="relative">
          <div className="flex justify-between items-center mb-2">
            {statusSteps.map((step, index) => {
              const isCompleted = config.step > index + 1;
              const isCurrent = config.step === index + 1;
              const isPaused = status === 'paused' && step.key === 'active';

              return (
                <div key={step.key} className="flex flex-col items-center relative z-10">
                  <div className={`h-3 w-3 rounded-full transition-all ${
                    isCompleted
                      ? 'bg-green-500'
                      : isCurrent
                        ? isPaused
                          ? 'bg-gray-400 ring-2 ring-gray-300 ring-offset-2'
                          : 'bg-blue-500 ring-2 ring-blue-300 ring-offset-2'
                        : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                  <span className={`text-[10px] mt-1 ${
                    isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Progress Line */}
          <div className="absolute top-1.5 left-0 right-0 h-[2px] bg-gray-200 dark:bg-gray-700 -z-0">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.min((config.step - 1) / (statusSteps.length - 1) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <Users className="h-4 w-4 mx-auto text-blue-500 mb-1" />
            <p className="text-xs text-muted-foreground">Eligible</p>
            <p className="font-semibold text-sm">{campaign.eligibleCount?.toLocaleString() || 0}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <CheckCircle className="h-4 w-4 mx-auto text-green-500 mb-1" />
            <p className="text-xs text-muted-foreground">Verified</p>
            <p className="font-semibold text-sm">{campaign.verifiedCount?.toLocaleString() || 0}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <Truck className="h-4 w-4 mx-auto text-purple-500 mb-1" />
            <p className="text-xs text-muted-foreground">Delivered</p>
            <p className="font-semibold text-sm">{deliveredCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
             <div className="flex justify-between items-center">
                 <span className="text-muted-foreground">Type:</span>
                 <span className="font-medium capitalize text-right truncate pl-2">{campaign.type || campaign.campaignType || 'N/A'}</span>
             </div>
             <div className="flex justify-between items-center">
                 <span className="text-muted-foreground">Dial Mode:</span>
                 <span className="font-medium capitalize text-right truncate pl-2">{campaign.dialMode ? campaign.dialMode.replace('_', ' ') : 'Standard'}</span>
             </div>
             {campaign.startDate && (
              <div className="flex justify-between items-center col-span-2">
                 <span className="text-muted-foreground whitespace-nowrap">Dates:</span>
                 <span className="font-medium text-right truncate pl-2">
                  {new Date(campaign.startDate).toLocaleDateString()}
                  {campaign.endDate ? ` - ${new Date(campaign.endDate).toLocaleDateString()}` : ''}
                 </span>
             </div>
             )}
              {(campaign.approvedBudget && campaign.approvedBudget !== '0' && campaign.approvedBudget !== '$0') && (
              <div className="flex justify-between items-center col-span-2">
                 <span className="text-muted-foreground">Budget:</span>
                 <span className="font-medium text-right truncate pl-2">{campaign.approvedBudget}</span>
             </div>
             )}
        </div>

        {/* Progress Bar */}
        {(status === 'active' || status === 'delivering') && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Delivery Progress</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t bg-slate-50/50 dark:bg-slate-900/50 flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1"
            onClick={() => onRequestMoreLeads(campaign.id)}
          >
            <Plus className="h-3.5 w-3.5" />
            Request Leads
          </Button>
          {onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(campaign.id)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {(onTestAgent || onSelectVoice) && (
          <div className="flex gap-2 w-full">
            {onTestAgent && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/30"
                onClick={() => onTestAgent(campaign.id)}
              >
                <Bot className="h-3.5 w-3.5" />
                Test AI Agent
              </Button>
            )}
            {onSelectVoice && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30"
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
