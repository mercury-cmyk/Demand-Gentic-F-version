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

const STATUS_STYLES: Record = {
  active: 'bg-green-500/10 text-green-600 border-green-200',
  paused: 'bg-amber-500/10 text-amber-600 border-amber-200',
  completed: 'bg-blue-500/10 text-blue-600 border-blue-200',
  draft: 'bg-gray-500/10 text-gray-600 border-gray-200',
  scheduled: 'bg-purple-500/10 text-purple-600 border-purple-200',
};

const DIAL_MODE_LABELS: Record = {
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
    
      
        
          {/* Left: Campaign Info */}
          
            
              {isEmail ?  : }
            
            
              {campaign.name}
              
                {campaign.startDate && (
                  <>
                    Started {new Date(campaign.startDate).toLocaleDateString()}
                    -
                  
                )}
                
                  {isEmail ? 'Email' : isPhone ? 'Phone' : campaign.type}
                
                {isPhone && campaign.dialMode && (
                  <>
                    -
                    
                      {campaign.dialMode === 'ai_agent' && }
                      {DIAL_MODE_LABELS[campaign.dialMode]}
                    
                  
                )}
              
            
          

          {/* Middle: Status & Metrics */}
          
            
              
                {campaign.status}
              
              {isPhone && campaign.contactsInQueue !== undefined && campaign.contactsInQueue > 0 && (
                
                  {campaign.contactsInQueue} in queue
                
              )}
            

            
              
                
                  {isEmail ? 'Engagement Rate' : 'Connect Rate'}
                
                {getEngagementRate()}%
              
              
            
          

          {/* Right: Actions */}
          {showActions && (
            
              {/* Quick Actions */}
              {campaign.status === 'active' && onPause && (
                 onPause(campaign)}
                >
                  
                  Pause
                
              )}
              {campaign.status === 'paused' && onLaunch && (
                 onLaunch(campaign)}
                >
                  
                  Resume
                
              )}
              {campaign.status === 'draft' && onLaunch && (
                 onLaunch(campaign)}
                >
                  
                  Launch
                
              )}

              {/* More Actions Menu */}
              
                
                  
                    
                  
                
                
                   handleQuickAction('edit')}>
                    
                    Edit Campaign
                  
                   handleQuickAction('config')}>
                    
                    Configuration
                  
                  {isPhone && (
                    <>
                      
                       handleQuickAction('queue')}>
                        
                        View Queue
                      
                      {onAssignAgents && (
                         onAssignAgents(campaign)}>
                          
                          Assign Agents
                        
                      )}
                    
                  )}
                  
                   handleQuickAction('analytics')}>
                    
                    View Analytics
                  
                  
                  {onDelete && (
                     onDelete(campaign)}
                    >
                      
                      Delete
                    
                  )}
                
              
            
          )}
        
      
    
  );
}