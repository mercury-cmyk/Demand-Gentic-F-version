/**
 * Unified Campaign Card Component
 *
 * A reusable card component that displays campaign information
 * with type-specific actions and metrics.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Mail,
  Phone,
  MoreVertical,
  Edit,
  Trash2,
  Play,
  Pause,
  Settings,
  Users,
  ListOrdered,
  BarChart,
  Bot,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CampaignCardProps {
  campaign: {
    id: string | number;
    name: string;
    type: 'email' | 'call' | 'telemarketing' | 'combo';
    status: 'draft' | 'active' | 'paused' | 'completed' | 'scheduled';
    startDate?: string;
    dialMode?: 'manual' | 'hybrid' | 'ai_agent' | 'power';
    // Email metrics
    sent?: number;
    opened?: number;
    clicked?: number;
    // Call metrics
    calls?: number;
    connected?: number;
    contactsInQueue?: number;
  };
  onEdit?: (campaign: any) => void;
  onDelete?: (campaign: any) => void;
  onLaunch?: (campaign: any) => void;
  onPause?: (campaign: any) => void;
  onViewQueue?: (campaign: any) => void;
  onAssignAgents?: (campaign: any) => void;
  showActions?: boolean;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 border-green-200',
  paused: 'bg-amber-500/10 text-amber-600 border-amber-200',
  completed: 'bg-blue-500/10 text-blue-600 border-blue-200',
  draft: 'bg-gray-500/10 text-gray-600 border-gray-200',
  scheduled: 'bg-purple-500/10 text-purple-600 border-purple-200',
};

const DIAL_MODE_LABELS: Record<string, string> = {
  manual: 'Manual Dial',
  hybrid: 'Hybrid Mode',
  ai_agent: 'AI Agent',
  power: 'Power Dial',
};

export function UnifiedCampaignCard({
  campaign,
  onEdit,
  onDelete,
  onLaunch,
  onPause,
  onViewQueue,
  onAssignAgents,
  showActions = true,
  className,
}: CampaignCardProps) {
  const [, setLocation] = useLocation();
  const isPhone = campaign.type === 'call' || campaign.type === 'telemarketing';
  const isEmail = campaign.type === 'email';
  const isCombo = campaign.type === 'combo';

  // Calculate engagement rate
  const getEngagementRate = () => {
    if (isEmail && campaign.sent && campaign.opened) {
      return Math.round((campaign.opened / campaign.sent) * 100);
    }
    if (isPhone && campaign.calls && campaign.connected) {
      return Math.round((campaign.connected / campaign.calls) * 100);
    }
    return 0;
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'edit':
        if (isPhone) {
          setLocation(`/campaigns/phone/${campaign.id}/edit`);
        } else {
          setLocation(`/campaigns/email/${campaign.id}/edit`);
        }
        break;
      case 'queue':
        setLocation(`/campaigns/${campaign.id}/queue`);
        break;
      case 'config':
        setLocation(`/campaigns/${campaign.id}/config`);
        break;
      case 'analytics':
        setLocation(`/reports?campaignId=${campaign.id}`);
        break;
    }
  };

  return (
    <Card className={cn('group transition-all duration-200 hover:shadow-md', className)}>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Left: Campaign Info */}
          <div className="flex items-start gap-4 min-w-[250px]">
            <div
              className={cn(
                'p-2.5 rounded-lg',
                isEmail ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
              )}
            >
              {isEmail ? <Mail className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">{campaign.name}</h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {campaign.startDate && (
                  <>
                    <span>Started {new Date(campaign.startDate).toLocaleDateString()}</span>
                    <span>-</span>
                  </>
                )}
                <span className="capitalize">
                  {isEmail ? 'Email' : isPhone ? 'Phone' : campaign.type}
                </span>
                {isPhone && campaign.dialMode && (
                  <>
                    <span>-</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                      {campaign.dialMode === 'ai_agent' && <Bot className="h-3 w-3 mr-1" />}
                      {DIAL_MODE_LABELS[campaign.dialMode]}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Middle: Status & Metrics */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full md:w-auto items-center">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={STATUS_STYLES[campaign.status]}>
                {campaign.status}
              </Badge>
              {isPhone && campaign.contactsInQueue !== undefined && campaign.contactsInQueue > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {campaign.contactsInQueue} in queue
                </Badge>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {isEmail ? 'Engagement Rate' : 'Connect Rate'}
                </span>
                <span className="font-medium">{getEngagementRate()}%</span>
              </div>
              <Progress value={getEngagementRate()} className="h-2" />
            </div>
          </div>

          {/* Right: Actions */}
          {showActions && (
            <div className="flex items-center gap-2">
              {/* Quick Actions */}
              {campaign.status === 'active' && onPause && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPause(campaign)}
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pause
                </Button>
              )}
              {campaign.status === 'paused' && onLaunch && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onLaunch(campaign)}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </Button>
              )}
              {campaign.status === 'draft' && onLaunch && (
                <Button
                  size="sm"
                  onClick={() => onLaunch(campaign)}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Launch
                </Button>
              )}

              {/* More Actions Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleQuickAction('edit')}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Campaign
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleQuickAction('config')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Configuration
                  </DropdownMenuItem>
                  {isPhone && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleQuickAction('queue')}>
                        <ListOrdered className="mr-2 h-4 w-4" />
                        View Queue
                      </DropdownMenuItem>
                      {onAssignAgents && (
                        <DropdownMenuItem onClick={() => onAssignAgents(campaign)}>
                          <Users className="mr-2 h-4 w-4" />
                          Assign Agents
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleQuickAction('analytics')}>
                    <BarChart className="mr-2 h-4 w-4" />
                    View Analytics
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(campaign)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
