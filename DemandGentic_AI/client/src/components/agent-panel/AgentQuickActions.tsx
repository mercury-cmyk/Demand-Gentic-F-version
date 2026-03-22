import React from 'react';
import {
  Target,
  FileText,
  CreditCard,
  BarChart3,
  Users,
  Phone,
  Search,
  Plus,
  Database,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAgentPanelContext } from './AgentPanelProvider';

interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  prompt: string;
  primary?: boolean;
  iconColor?: string;
}

interface AgentQuickActionsProps {
  isClientPortal: boolean;
  userRole: string;
  onActionClick?: (prompt: string) => void;
}

const clientPortalActions: QuickAction[] = [
  {
    id: 'new_order',
    label: 'New Order',
    description: 'Create campaign',
    icon: Package,
    prompt: '__enter_order_mode__',
    primary: true,
    iconColor: 'text-primary bg-primary/15',
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    description: 'Active status',
    icon: Target,
    prompt: 'Show me my active campaigns and their current status',
    iconColor: 'text-orange-600 bg-orange-500/10',
  },
  {
    id: 'orders',
    label: 'Orders',
    description: 'Track progress',
    icon: FileText,
    prompt: 'Show me my recent orders and their status',
    iconColor: 'text-blue-600 bg-blue-500/10',
  },
  {
    id: 'billing',
    label: 'Billing',
    description: 'Invoices',
    icon: CreditCard,
    prompt: 'Show me my billing summary and recent invoices',
    iconColor: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Performance',
    icon: BarChart3,
    prompt: 'Give me an analytics summary of my campaign performance',
    iconColor: 'text-violet-600 bg-violet-500/10',
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

const dataOpsActions: QuickAction[] = [
  {
    id: 'imports',
    label: 'Imports',
    icon: Database,
    prompt: 'Show me today\u2019s imports, failures, and retry status',
  },
  {
    id: 'quality',
    label: 'Data Quality',
    icon: ShieldCheck,
    prompt: 'Run a data quality check and summarize anomalies, duplicates, or missing fields',
  },
  {
    id: 'suppressions',
    label: 'Suppressions',
    icon: FileText,
    prompt: 'Show recent suppression list changes and contacts flagged for suppression',
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
    prompt: 'Help me find records where ',
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
    case 'data_ops':
      return dataOpsActions;
    default:
      return adminActions.slice(0, 4);
  }
}

export function AgentQuickActions({
  isClientPortal,
  userRole,
  onActionClick,
}: AgentQuickActionsProps) {
  const { enterOrderMode } = useAgentPanelContext();
  const actions = getActionsForRole(userRole, isClientPortal);

  const handleClick = (action: QuickAction) => {
    // Special handling for order mode trigger
    if (action.prompt === '__enter_order_mode__') {
      enterOrderMode();
      return;
    }

    if (onActionClick) {
      onActionClick(action.prompt);
    } else {
      window.dispatchEvent(
        new CustomEvent('agent-quick-action', { detail: { prompt: action.prompt } })
      );
    }
  };

  // Card-style grid for client portal
  if (isClientPortal) {
    return (
      
        
          {actions.map((action) => {
            const Icon = action.icon;
            return (
               handleClick(action)}
              >
                
                  
                
                
                  
                    {action.label}
                  
                  {action.description && (
                    
                      {action.description}
                    
                  )}
                
              
            );
          })}
        
      
    );
  }

  // Horizontal scroll pills for admin/internal
  return (
    
      
        
          {actions.map((action) => {
            const Icon = action.icon;
            return (
               handleClick(action)}
              >
                
                {action.label}
              
            );
          })}
        
        
      
    
  );
}