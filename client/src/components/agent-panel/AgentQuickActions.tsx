import React, { useState } from 'react';
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
  Sparkles,
  Brain,
  Wand2,
  Mail,
  TrendingUp,
  Zap,
  Globe,
  PenTool,
  LayoutTemplate,
  MessageSquare,
  ClipboardList,
} from 'lucide-react';
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
  category: 'operate' | 'create' | 'analyze' | 'automate';
}

interface AgentQuickActionsProps {
  isClientPortal: boolean;
  userRole: string;
  onActionClick?: (prompt: string) => void;
}

// ─── Category metadata ──────────────────────────────────────────
const CATEGORIES = [
  { id: 'operate' as const, label: 'Operate', icon: Zap },
  { id: 'create' as const, label: 'Create', icon: Wand2 },
  { id: 'analyze' as const, label: 'Analyze', icon: BarChart3 },
  { id: 'automate' as const, label: 'Automate', icon: Brain },
] as const;

// ─── Client Portal actions ──────────────────────────────────────
const clientPortalActions: QuickAction[] = [
  // Operate
  { id: 'new_order', label: 'New Order', description: 'Create campaign order', icon: Package, prompt: '__enter_order_mode__', primary: true, iconColor: 'text-primary bg-primary/15', category: 'operate' },
  { id: 'campaigns', label: 'My Campaigns', description: 'Status & performance', icon: Target, prompt: 'Show me my active campaigns and their current status', iconColor: 'text-orange-600 bg-orange-500/10', category: 'operate' },
  { id: 'orders', label: 'Track Orders', description: 'Order progress', icon: FileText, prompt: 'Show me my recent orders and their status', iconColor: 'text-blue-600 bg-blue-500/10', category: 'operate' },
  { id: 'pipeline', label: 'My Pipeline', description: 'Account funnel', icon: TrendingUp, prompt: 'Show me my pipeline with account funnel stages and recent activity', iconColor: 'text-indigo-600 bg-indigo-500/10', category: 'operate' },
  // Create
  { id: 'draft_email', label: 'Draft Email', description: 'AI email copy', icon: Mail, prompt: 'Help me draft a campaign email for my target audience', iconColor: 'text-sky-600 bg-sky-500/10', category: 'create' },
  { id: 'landing_page', label: 'Landing Page', description: 'Generate LP', icon: LayoutTemplate, prompt: 'Create a landing page for my next campaign using my org intelligence', iconColor: 'text-pink-600 bg-pink-500/10', category: 'create' },
  { id: 'content_brief', label: 'Content Brief', description: 'Blog / ebook', icon: PenTool, prompt: 'Help me create a content brief for a blog post or ebook on a topic relevant to my ICP', iconColor: 'text-amber-600 bg-amber-500/10', category: 'create' },
  // Analyze
  { id: 'analytics', label: 'Performance', description: 'Campaign metrics', icon: BarChart3, prompt: 'Give me an analytics summary of my campaign performance with key metrics', iconColor: 'text-violet-600 bg-violet-500/10', category: 'analyze' },
  { id: 'billing', label: 'Billing', description: 'Invoices & spend', icon: CreditCard, prompt: 'Show me my billing summary and recent invoices', iconColor: 'text-emerald-600 bg-emerald-500/10', category: 'analyze' },
  { id: 'lead_quality', label: 'Lead Quality', description: 'Qualification insights', icon: Users, prompt: 'Analyze the quality of leads delivered to me across campaigns', iconColor: 'text-teal-600 bg-teal-500/10', category: 'analyze' },
  // Automate
  { id: 'follow_up', label: 'Follow-Up Plan', description: 'AI next steps', icon: MessageSquare, prompt: 'Create a follow-up plan for my most recent qualified leads with suggested actions', iconColor: 'text-rose-600 bg-rose-500/10', category: 'automate' },
  { id: 'campaign_plan', label: 'Campaign Plan', description: 'AI strategy', icon: Brain, prompt: 'Generate a full-funnel campaign plan based on my organization intelligence', iconColor: 'text-purple-600 bg-purple-500/10', category: 'automate' },
];

// ─── Admin actions ──────────────────────────────────────────────
const adminActions: QuickAction[] = [
  // Operate
  { id: 'campaigns', label: 'Campaigns', icon: Target, prompt: 'Show me all active campaigns with their performance metrics', iconColor: 'text-orange-600 bg-orange-500/10', category: 'operate' },
  { id: 'leads', label: 'Lead Queue', icon: Users, prompt: 'Show me recent qualified leads pending review', iconColor: 'text-blue-600 bg-blue-500/10', category: 'operate' },
  { id: 'calls', label: 'Call Activity', icon: Phone, prompt: "Show me today's call activity summary", iconColor: 'text-emerald-600 bg-emerald-500/10', category: 'operate' },
  { id: 'pipeline', label: 'Pipeline', icon: TrendingUp, prompt: 'Show pipeline summary with conversion rates by stage', iconColor: 'text-indigo-600 bg-indigo-500/10', category: 'operate' },
  { id: 'inbox', label: 'Shared Inbox', icon: Mail, prompt: 'Show unread messages in shared inbox with priority', iconColor: 'text-sky-600 bg-sky-500/10', category: 'operate' },
  // Create
  { id: 'create_campaign', label: 'New Campaign', icon: Plus, prompt: 'Help me create a new campaign with audience targeting and content', iconColor: 'text-primary bg-primary/15', category: 'create', primary: true },
  { id: 'draft_email', label: 'Email Template', icon: Mail, prompt: 'Draft a professional email template for outreach', iconColor: 'text-sky-600 bg-sky-500/10', category: 'create' },
  { id: 'landing_page', label: 'Landing Page', icon: LayoutTemplate, prompt: 'Generate a landing page for a campaign', iconColor: 'text-pink-600 bg-pink-500/10', category: 'create' },
  { id: 'content', label: 'Content Brief', icon: PenTool, prompt: 'Create a content brief for a blog or ebook', iconColor: 'text-amber-600 bg-amber-500/10', category: 'create' },
  // Analyze
  { id: 'analytics', label: 'Analytics', icon: BarChart3, prompt: 'Give me a full analytics summary across all campaigns', iconColor: 'text-violet-600 bg-violet-500/10', category: 'analyze' },
  { id: 'quality', label: 'Data Quality', icon: ShieldCheck, prompt: 'Run a data quality check across accounts and contacts', iconColor: 'text-emerald-600 bg-emerald-500/10', category: 'analyze' },
  { id: 'conversion', label: 'Conversions', icon: TrendingUp, prompt: 'Analyze conversion rates across the full funnel', iconColor: 'text-teal-600 bg-teal-500/10', category: 'analyze' },
  // Automate
  { id: 'campaign_plan', label: 'AI Campaign Plan', icon: Brain, prompt: 'Generate a full-funnel campaign plan using org intelligence', iconColor: 'text-purple-600 bg-purple-500/10', category: 'automate' },
  { id: 'followup', label: 'Follow-Up', icon: Zap, prompt: 'Generate AI follow-up actions for stale pipeline accounts', iconColor: 'text-rose-600 bg-rose-500/10', category: 'automate' },
];

// ─── Campaign Manager actions ───────────────────────────────────
const campaignManagerActions: QuickAction[] = [
  { id: 'campaigns', label: 'My Campaigns', icon: Target, prompt: 'Show me my campaigns and their current status', iconColor: 'text-orange-600 bg-orange-500/10', category: 'operate' },
  { id: 'create', label: 'New Campaign', icon: Plus, prompt: 'Help me create a new campaign', iconColor: 'text-primary bg-primary/15', category: 'create', primary: true },
  { id: 'email_draft', label: 'Draft Email', icon: Mail, prompt: 'Draft campaign email copy for my target audience', iconColor: 'text-sky-600 bg-sky-500/10', category: 'create' },
  { id: 'segments', label: 'Segments', icon: Users, prompt: 'Help me create a new audience segment', iconColor: 'text-blue-600 bg-blue-500/10', category: 'create' },
  { id: 'analytics', label: 'Performance', icon: BarChart3, prompt: 'Show campaign performance analytics', iconColor: 'text-violet-600 bg-violet-500/10', category: 'analyze' },
  { id: 'pipeline', label: 'Pipeline Health', icon: TrendingUp, prompt: 'Analyze pipeline health and stale accounts', iconColor: 'text-indigo-600 bg-indigo-500/10', category: 'analyze' },
  { id: 'plan', label: 'AI Plan', icon: Brain, prompt: 'Generate a campaign plan for next quarter', iconColor: 'text-purple-600 bg-purple-500/10', category: 'automate' },
  { id: 'followup', label: 'AI Follow-Up', icon: Zap, prompt: 'Suggest next actions for my top pipeline accounts', iconColor: 'text-rose-600 bg-rose-500/10', category: 'automate' },
];

// ─── Quality Analyst actions ────────────────────────────────────
const qualityAnalystActions: QuickAction[] = [
  { id: 'leads', label: 'Review Queue', icon: Users, prompt: 'Show me leads pending QA review', iconColor: 'text-blue-600 bg-blue-500/10', category: 'operate' },
  { id: 'calls', label: 'Call Review', icon: Phone, prompt: 'Show me recent calls that need quality review', iconColor: 'text-emerald-600 bg-emerald-500/10', category: 'operate' },
  { id: 'dispositions', label: 'Dispositions', icon: ClipboardList, prompt: "Show disposition breakdown for today's calls", iconColor: 'text-orange-600 bg-orange-500/10', category: 'analyze' },
  { id: 'qa_metrics', label: 'QA Metrics', icon: BarChart3, prompt: 'Show me QA performance metrics for today', iconColor: 'text-violet-600 bg-violet-500/10', category: 'analyze' },
  { id: 'reanalysis', label: 'AI Reanalysis', icon: Brain, prompt: 'Run AI reanalysis on flagged conversations', iconColor: 'text-purple-600 bg-purple-500/10', category: 'automate' },
];

// ─── Data Ops actions ───────────────────────────────────────────
const dataOpsActions: QuickAction[] = [
  { id: 'imports', label: 'Imports', icon: Database, prompt: "Show me today\u2019s imports, failures, and retry status", iconColor: 'text-blue-600 bg-blue-500/10', category: 'operate' },
  { id: 'suppressions', label: 'Suppressions', icon: FileText, prompt: 'Show recent suppression list changes and contacts flagged', iconColor: 'text-orange-600 bg-orange-500/10', category: 'operate' },
  { id: 'quality', label: 'Data Quality', icon: ShieldCheck, prompt: 'Run a data quality check and summarize anomalies, duplicates, or missing fields', iconColor: 'text-emerald-600 bg-emerald-500/10', category: 'analyze' },
  { id: 'dedup', label: 'Deduplication', icon: Users, prompt: 'Find and summarize duplicate accounts and contacts', iconColor: 'text-violet-600 bg-violet-500/10', category: 'analyze' },
  { id: 'enrich', label: 'AI Enrich', icon: Sparkles, prompt: 'Suggest data enrichment for accounts with missing fields', iconColor: 'text-amber-600 bg-amber-500/10', category: 'automate' },
  { id: 'search', label: 'Search Records', icon: Search, prompt: 'Help me find records where ', iconColor: 'text-sky-600 bg-sky-500/10', category: 'operate' },
];

function getActionsForRole(role: string, isClientPortal: boolean): QuickAction[] {
  if (isClientPortal) return clientPortalActions;
  switch (role) {
    case 'admin': return adminActions;
    case 'campaign_manager': return campaignManagerActions;
    case 'quality_analyst': return qualityAnalystActions;
    case 'data_ops': return dataOpsActions;
    default: return adminActions.slice(0, 8);
  }
}

export function AgentQuickActions({
  isClientPortal,
  userRole,
  onActionClick,
}: AgentQuickActionsProps) {
  const { enterOrderMode } = useAgentPanelContext();
  const allActions = getActionsForRole(userRole, isClientPortal);
  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number]['id'] | 'all'>('all');

  const filteredActions = activeCategory === 'all'
    ? allActions
    : allActions.filter(a => a.category === activeCategory);

  const handleClick = (action: QuickAction) => {
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

  return (
    <div className="px-3 pb-2">
      {/* Category filter tabs */}
      <div className="flex gap-0.5 mb-2 overflow-x-auto scrollbar-none">
        <button
          className={cn(
            'text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all whitespace-nowrap',
            activeCategory === 'all'
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50'
          )}
          onClick={() => setActiveCategory('all')}
        >
          All
        </button>
        {CATEGORIES.map(cat => {
          const count = allActions.filter(a => a.category === cat.id).length;
          if (count === 0) return null;
          const CatIcon = cat.icon;
          return (
            <button
              key={cat.id}
              className={cn(
                'flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all whitespace-nowrap',
                activeCategory === cat.id
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => setActiveCategory(cat.id)}
            >
              <CatIcon className="h-3 w-3" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Action cards — scrollable grid */}
      <ScrollArea className="max-h-[200px]">
        <div className="grid grid-cols-2 gap-1.5">
          {filteredActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border text-left transition-all duration-150 group',
                  action.primary
                    ? 'bg-gradient-to-r from-primary/8 to-primary/3 border-primary/15 hover:border-primary/30 hover:shadow-sm'
                    : 'bg-card/30 border-border/40 hover:bg-muted/30 hover:border-border/70'
                )}
                onClick={() => handleClick(action)}
              >
                <div className={cn(
                  'p-1 rounded-md shrink-0 transition-transform group-hover:scale-105',
                  action.iconColor || 'bg-muted text-muted-foreground'
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'text-[11px] font-semibold leading-none truncate',
                    action.primary ? 'text-primary' : 'text-foreground/85'
                  )}>
                    {action.label}
                  </p>
                  {action.description && (
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate leading-none">
                      {action.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}
