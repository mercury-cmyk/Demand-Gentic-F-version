import React from 'react';
import {
  Target,
  FileText,
  CreditCard,
  BarChart3,
  Users,
  Phone,
  Mail,
  Search,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
}

interface AgentQuickActionsProps {
  isClientPortal: boolean;
  userRole: string;
  onActionClick?: (prompt: string) => void;
}

const clientPortalActions: QuickAction[] = [
  {
    id: 'campaigns',
    label: 'My Campaigns',
    icon: Target,
    prompt: 'Show me my active campaigns and their current status',
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: FileText,
    prompt: 'Show me my recent orders and their status',
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: CreditCard,
    prompt: 'Show me my billing summary and recent invoices',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    prompt: 'Give me an analytics summary of my campaign performance',
  },
];

const adminActions: QuickAction[] = [
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: Target,
    prompt: 'Show me all active campaigns with their performance metrics',
  },
  {
    id: 'leads',
    label: 'Leads',
    icon: Users,
    prompt: 'Show me recent qualified leads pending review',
  },
  {
    id: 'calls',
    label: 'Calls',
    icon: Phone,
    prompt: 'Show me today\'s call activity summary',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    prompt: 'Give me a pipeline summary with conversion rates',
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
    prompt: 'Help me search for ',
  },
];

const campaignManagerActions: QuickAction[] = [
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: Target,
    prompt: 'Show me my campaigns and their current status',
  },
  {
    id: 'create',
    label: 'Create',
    icon: Plus,
    prompt: 'Help me create a new campaign',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    prompt: 'Show campaign performance analytics',
  },
  {
    id: 'segments',
    label: 'Segments',
    icon: Users,
    prompt: 'Help me create a new audience segment',
  },
];

const qualityAnalystActions: QuickAction[] = [
  {
    id: 'leads',
    label: 'Review Queue',
    icon: Users,
    prompt: 'Show me leads pending QA review',
  },
  {
    id: 'calls',
    label: 'Call Review',
    icon: Phone,
    prompt: 'Show me recent calls that need quality review',
  },
  {
    id: 'analytics',
    label: 'QA Metrics',
    icon: BarChart3,
    prompt: 'Show me QA performance metrics for today',
  },
];

function getActionsForRole(role: string, isClientPortal: boolean): QuickAction[] {
  if (isClientPortal) {
    return clientPortalActions;
  }

  switch (role) {
    case 'admin':
      return adminActions;
    case 'campaign_manager':
      return campaignManagerActions;
    case 'quality_analyst':
      return qualityAnalystActions;
    default:
      return adminActions.slice(0, 4); // Default subset
  }
}

export function AgentQuickActions({
  isClientPortal,
  userRole,
  onActionClick,
}: AgentQuickActionsProps) {
  const actions = getActionsForRole(userRole, isClientPortal);

  const handleClick = (action: QuickAction) => {
    if (onActionClick) {
      onActionClick(action.prompt);
    } else {
      // Dispatch custom event for chat interface to pick up
      window.dispatchEvent(
        new CustomEvent('agent-quick-action', { detail: { prompt: action.prompt } })
      );
    }
  };

  return (
    <div className="px-3 py-2 border-b border-border">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs shrink-0 hover:bg-primary/5 hover:border-primary/30"
                onClick={() => handleClick(action)}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {action.label}
              </Button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  );
}
