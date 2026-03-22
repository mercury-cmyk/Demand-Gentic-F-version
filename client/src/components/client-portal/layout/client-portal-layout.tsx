/**
 * Client Portal Layout
 *
 * Matches the Super Org / Admin sidebar style:
 * - Gradient glass-morphism sidebar
 * - Collapsible nav groups with sub-items and chevron indicators
 * - Rounded-xl items with gradient active highlights
 * - Uppercase section labels with wide tracking
 * - Brand header with logo and collapse toggle
 * - Feature-gated navigation items
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Megaphone,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  Sparkles,
  HelpCircle,
  PhoneCall,
  ClipboardList,
  Brain,
  CalendarDays,
  Crown,
  ArrowLeft,
  Layers,
  Mail,
  BarChart3,
  Plus,
  Workflow,
  Inbox,
  Database,
  Building2,
  Users,
  ListFilter,
  Globe,
  FileInput,
  Headphones,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SimulationStudioPanel as CampaignSimulationPanel } from '../simulation-studio/simulation-studio-panel';
import { AgentPanelProvider, AgentSidePanel, useAgentPanelContextOptional } from '@/components/agent-panel';
import { clearClientPortalSession } from '@/lib/client-portal-session';

// ==================== Types ====================

interface ClientUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  clientAccountId: string;
  clientAccountName: string;
  isOwner?: boolean;
}

interface ClientPortalLayoutProps {
  children: React.ReactNode;
}

interface SubNavItem {
  id: string;
  title: string;
  href: string;
}

interface NavItem {
  id: string;
  title: string;
  href?: string;
  icon: LucideIcon;
  items?: SubNavItem[];
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

// ==================== Feature Gate Map ====================

const NAV_FEATURE_MAP: Record<string, string> = {
  '/client-portal/dashboard?tab=campaigns': 'campaign_reports',
  '/client-portal/create-campaign': 'campaign_reports',
  '/client-portal/dashboard?tab=unified-pipelines': 'journey_pipeline',
  '/client-portal/dashboard?tab=work-orders': 'work_orders',
  '/client-portal/dashboard?tab=bookings': 'calendar_booking',
  '/client-portal/intelligence': 'ai_studio_dashboard',
  '/client-portal/dashboard?tab=accounts': 'ai_studio_dashboard',
  '/client-portal/dashboard?tab=contacts': 'ai_studio_dashboard',
  '/client-portal/dashboard?tab=target-markets': 'ai_studio_dashboard',
  '/client-portal/dashboard?tab=campaign-planner': 'ai_campaign_planner',
  '/client-portal/generative-studio': 'ai_studio_dashboard',
  '/client-portal/preview-studio': 'voice_simulation',
  '/client-portal/campaign-planner': 'ai_campaign_planner',
  '/client-portal/reports': 'analytics_dashboard',
  '/client-portal/analytics': 'analytics_dashboard',
  '/client-portal/conversation-quality': 'analytics_dashboard',
  '/client-portal/showcase-calls': 'analytics_dashboard',
  '/client-portal/dashboard?tab=reporting': 'analytics_dashboard',
  '/client-portal/dashboard?tab=billing': 'billing_invoices',
  '/client-portal/disposition-intelligence': 'disposition_overview',
  '/client-portal/cost-tracking': 'billing_cost_tracking',
  '/client-portal/leads': 'lead_export',
  '/client-portal/recordings': 'call_recordings_playback',
  '/client-portal/reports-export': 'reports_export',
  '/client-portal/call-reports': 'campaign_reports',
  '/client-portal/email-campaigns': 'email_connect',
  '/client-portal/email-simulation': 'email_connect',
  '/client-portal/email-inbox': 'email_inbox',
};

// ==================== Navigation Config ====================

const BASE_SECTIONS: NavSection[] = [
  {
    id: 'campaigns',
    label: 'Campaigns',
    items: [
      {
        id: 'campaigns-group',
        title: 'Campaigns',
        icon: Megaphone,
        items: [
          { id: 'all-campaigns', title: 'All Campaigns', href: '/client-portal/dashboard?tab=campaigns' },
          { id: 'create-campaign', title: 'Create Campaign', href: '/client-portal/create-campaign' },
          { id: 'pipeline-engagement', title: 'Pipeline & Engagement', href: '/client-portal/dashboard?tab=unified-pipelines' },
          { id: 'work-orders', title: 'Work Orders', href: '/client-portal/dashboard?tab=work-orders' },
          { id: 'bookings', title: 'Bookings', href: '/client-portal/dashboard?tab=bookings' },
        ],
      },
    ],
  },
  {
    id: 'ai-intelligence',
    label: 'AI Studio',
    items: [
      {
        id: 'ai-studio-group',
        title: 'AI Studio',
        icon: Sparkles,
        items: [
          { id: 'org-intelligence', title: 'Org Intelligence', href: '/client-portal/intelligence' },
          { id: 'creative-studio', title: 'Creative Studio', href: '/client-portal/generative-studio' },
          { id: 'preview-studio', title: 'Preview Studio', href: '/client-portal/preview-studio' },
          { id: 'campaign-planner', title: 'Campaign Planner', href: '/client-portal/campaign-planner' },
        ],
      },
    ],
  },
  {
    id: 'data-management',
    label: 'Data Management',
    items: [
      {
        id: 'data-group',
        title: 'Data Management',
        icon: Database,
        items: [
          { id: 'dm-accounts', title: 'Accounts', href: '/client-portal/dashboard?tab=accounts' },
          { id: 'dm-contacts', title: 'Contacts', href: '/client-portal/dashboard?tab=contacts' },
          { id: 'dm-segments', title: 'Segments & Lists', href: '/client-portal/dashboard?tab=target-markets' },
          { id: 'dm-domain-sets', title: 'Domain Sets', href: '/client-portal/dashboard?tab=target-markets' },
          { id: 'dm-forms', title: 'Forms', href: '/client-portal/dashboard?tab=target-markets' },
        ],
      },
    ],
  },
  {
    id: 'communications',
    label: 'Communications',
    items: [
      { id: 'email-campaigns', title: 'Email Campaigns', icon: Mail, href: '/client-portal/email-campaigns' },
      { id: 'shared-inbox', title: 'Shared Inbox', icon: Inbox, href: '/client-portal/email-inbox' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    items: [
      { id: 'reports-analytics', title: 'Reports & Analytics', icon: BarChart3, href: '/client-portal/dashboard?tab=reporting' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'billing', title: 'Billing & Invoices', icon: CreditCard, href: '/client-portal/dashboard?tab=billing' },
      { id: 'support', title: 'Account Management', icon: HelpCircle, href: '/client-portal/services' },
    ],
  },
];

// ==================== Helpers ====================

function isSubItemActive(href: string, currentPath: string, currentSearch: string): boolean {
  const url = new URL(href, 'http://localhost');
  const itemPath = url.pathname;
  const itemTab = url.searchParams.get('tab');

  if (itemPath === '/client-portal/dashboard' && itemTab) {
    const currentTab = new URLSearchParams(currentSearch).get('tab');
    return currentPath === '/client-portal/dashboard' && currentTab === itemTab;
  }

  if (currentPath === itemPath) return true;
  if (itemPath !== '/client-portal/dashboard' && currentPath.startsWith(itemPath)) return true;
  return false;
}

function isNavItemActive(item: NavItem, currentPath: string, currentSearch: string): boolean {
  if (item.href && isSubItemActive(item.href, currentPath, currentSearch)) return true;
  if (item.items) return item.items.some((sub) => isSubItemActive(sub.href, currentPath, currentSearch));
  return false;
}

// ==================== Sub-components ====================

function SidebarNavItem({
  item,
  currentPath,
  currentSearch,
  collapsed,
  onNavClick,
}: {
  item: NavItem;
  currentPath: string;
  currentSearch: string;
  collapsed: boolean;
  onNavClick: () => void;
}) {
  const Icon = item.icon;
  const isActive = isNavItemActive(item, currentPath, currentSearch);

  // Simple item (no sub-items)
  if (!item.items || item.items.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={item.href || '#'}>
              <span
                className={cn(
                  'flex items-center gap-2.5 rounded-xl mb-1 transition-all duration-300 cursor-pointer',
                  collapsed ? 'justify-center p-2.5 mx-0' : 'px-3 py-2 mx-1',
                  isActive
                    ? 'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-white font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                    : 'text-white/80 hover:bg-white/5 font-medium'
                )}
                onClick={onNavClick}
              >
                <Icon
                  className={cn(
                    'transition-all duration-300 shrink-0',
                    isActive ? 'text-primary' : 'text-white/60',
                    collapsed ? 'h-5 w-5' : 'h-4 w-4'
                  )}
                />
                {!collapsed && <span className="text-sm truncate">{item.title}</span>}
              </span>
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">{item.title}</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Collapsed: show only icon
  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={item.items[0]?.href || '#'}>
              <span
                className={cn(
                  'flex items-center justify-center rounded-xl p-2.5 mb-1 transition-all duration-300 cursor-pointer',
                  isActive
                    ? 'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-white font-semibold'
                    : 'text-white/80 hover:bg-white/5'
                )}
                onClick={onNavClick}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-all duration-300',
                    isActive ? 'text-primary' : 'text-white/60'
                  )}
                />
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{item.title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Expanded: collapsible with sub-items
  return (
    <Collapsible defaultOpen={isActive} className="group/collapsible">
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-xl mb-1 transition-all duration-300 text-sm',
            isActive
              ? 'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-white font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
              : 'text-white/80 hover:bg-white/5 font-medium'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              isActive ? 'text-primary' : 'text-white/60'
            )}
          />
          <span className="flex-1 text-left truncate">{item.title}</span>
          <ChevronDown className="h-3 w-3 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mr-1 ml-[1.75rem] border-l border-white/10 pl-3 py-1 my-1 space-y-0.5">
          {item.items.map((sub) => {
            const subActive = isSubItemActive(sub.href, currentPath, currentSearch);
            return (
              <Link key={sub.id} href={sub.href}>
                <span
                  className={cn(
                    'block rounded-md px-2.5 py-1.5 text-[0.85rem] transition-colors cursor-pointer',
                    subActive
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  )}
                  onClick={onNavClick}
                >
                  {sub.title}
                </span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ==================== Main Layout ====================

export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);

  const storedUser = localStorage.getItem('clientPortalUser');
  const user: ClientUser | null = storedUser ? JSON.parse(storedUser) : null;
  const clientAccountId = user?.clientAccountId;

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Check Argyle events feature
  const { data: argyleFeatureStatus } = useQuery({
    queryKey: ['argyle-events-feature-status', clientAccountId],
    queryFn: async () => {
      const token = getToken();
      if (!token) return { available: false };
      try {
        const res = await fetch('/api/client-portal/argyle-events/feature-status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { available: false };
        return await res.json();
      } catch {
        return { available: false };
      }
    },
    enabled: !!clientAccountId,
    staleTime: 5 * 60 * 1000,
  });

  // Check client features for feature-gated nav items
  const { data: featuresData } = useQuery<{ enabledFeatures: string[]; visibilitySettings?: Record<string, unknown> }>({
    queryKey: ['client-portal-features', clientAccountId],
    queryFn: async () => {
      const token = getToken();
      if (!token) return { enabledFeatures: [] };
      try {
        const res = await fetch('/api/client-portal/settings/features', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { enabledFeatures: [] };
        return await res.json();
      } catch {
        return { enabledFeatures: [] };
      }
    },
    enabled: !!clientAccountId,
    staleTime: 5 * 60 * 1000,
  });

  const enabledFeatures = featuresData?.enabledFeatures || [];
  const visibilitySettings = featuresData?.visibilitySettings || {};
  const enabledSet = new Set(enabledFeatures);

  // Filter nav items by feature flags
  const filterByFeature = useCallback(
    (href: string) => {
      const required = NAV_FEATURE_MAP[href];
      if (!required) return true;
      if (enabledFeatures.length === 0) return true;
      return enabledSet.has(required);
    },
    [enabledFeatures]
  );

  // Build filtered navigation
  const navigationSections = React.useMemo(() => {
    let sections = BASE_SECTIONS.map((section) => ({
      ...section,
      items: section.items
        .map((item) => {
          if (item.href && !filterByFeature(item.href)) return null;
          if (item.items) {
            const filteredSubs = item.items.filter((sub) => filterByFeature(sub.href));
            if (filteredSubs.length === 0) return null;
            return { ...item, items: filteredSubs };
          }
          return item;
        })
        .filter(Boolean) as NavItem[],
    })).filter((s) => s.items.length > 0);

    // Hide billing if explicitly disabled
    if (visibilitySettings.showBilling === false) {
      sections = sections.map((s) =>
        s.id === 'account'
          ? { ...s, items: s.items.filter((i) => i.id !== 'billing') }
          : s
      ).filter((s) => s.items.length > 0);
    }

    // Add Upcoming Events to campaigns if Argyle enabled
    if (argyleFeatureStatus?.enabled) {
      const campaignsSection = sections.find((s) => s.id === 'campaigns');
      const campaignsGroup = campaignsSection?.items.find((i) => i.id === 'campaigns-group');
      if (campaignsGroup?.items) {
        campaignsGroup.items.push({
          id: 'upcoming-events',
          title: 'Upcoming Events',
          href: '/client-portal/argyle-events',
        });
      }
    }

    // Rename AI Studio group with client name
    const aiSection = sections.find((s) => s.id === 'ai-intelligence');
    if (aiSection) {
      const clientName = user?.clientAccountName || 'Client';
      const displayName = clientName.length > 15 ? clientName.substring(0, 15) + '...' : clientName;
      aiSection.label = `${displayName} AI Studio`;
    }

    return sections;
  }, [argyleFeatureStatus?.enabled, user?.clientAccountName, visibilitySettings.showBilling, filterByFeature]);

  const handleLogout = () => {
    clearClientPortalSession();
    setLocation('/client-portal/login');
  };

  const getInitials = () => {
    if (!user) return '?';
    const first = user.firstName?.[0] || '';
    const last = user.lastName?.[0] || '';
    return (first + last).toUpperCase() || user.email[0].toUpperCase();
  };

  const currentPageLabel = React.useMemo(() => {
    if (location === '/client-portal/dashboard') {
      const requestedTab = new URLSearchParams(searchString).get('tab') || 'overview';
      const tab = requestedTab === 'leads' ? 'unified-pipelines' : requestedTab;
      const tabLabels: Record<string, string> = {
        overview: 'Overview',
        campaigns: 'All Campaigns',
        'unified-pipelines': 'Pipeline & Engagement',
        'work-orders': 'Work Orders',
        bookings: 'Bookings',
        accounts: 'Accounts',
        contacts: 'Contacts',
        'target-markets': 'Data Management',
        'campaign-planner': 'Campaign Planner',
        settings: 'Settings',
        billing: 'Billing',
        reporting: 'Reports & Analytics',
      };
      return tabLabels[tab] || 'Dashboard';
    }
    if (location.startsWith('/client-portal/preview-studio')) return 'Preview Studio';
    if (location.startsWith('/client-portal/generative-studio')) return 'Creative Studio';
    if (location.startsWith('/client-portal/intelligence')) return 'Organization Intelligence';
    if (location.startsWith('/client-portal/analytics')) return 'Analytics';
    if (location.startsWith('/client-portal/reports')) return 'Reports & Analytics';
    if (location.startsWith('/client-portal/conversation-quality')) return 'Conversation Quality';
    if (location.startsWith('/client-portal/showcase-calls')) return 'Showcase Calls';
    if (location.startsWith('/client-portal/create-campaign')) return 'Create Campaign';
    if (location.startsWith('/client-portal/argyle-events')) return 'Upcoming Events';
    if (location.startsWith('/client-portal/email-inbox')) return 'Shared Inbox';
    if (location.startsWith('/client-portal/email-campaigns')) return 'Email Campaigns';
    if (location.startsWith('/client-portal/campaign-planner')) return 'Campaign Planner';
    return 'Client Workspace';
  }, [location, searchString]);

  const sidebarWidth = sidebarCollapsed ? 'w-[68px]' : 'w-64';
  const mainPadding = sidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-64';

  return (
    <AgentPanelProvider userRole="client" isClientPortal={true}>
      <div className="min-h-screen bg-background agentc-shell">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-col transform transition-all duration-300 ease-in-out lg:translate-x-0',
            sidebarWidth,
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            // Admin-matching gradient glass style
            'bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-900/80',
            'border-r border-white/10 backdrop-blur-xl',
            'shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)]',
            'text-white'
          )}
        >
          {/* Brand Header */}
          <div className={cn(
            'flex items-center transition-all duration-300 py-4',
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          )}>
            {sidebarCollapsed ? (
              <div
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 cursor-pointer"
                onClick={() => setSidebarCollapsed(false)}
              >
                <Layers className="h-5 w-5 text-primary" />
              </div>
            ) : (
              <>
                <Link href="/client-portal/dashboard?tab=overview">
                  <div className="flex items-center gap-2.5 cursor-pointer">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 shrink-0">
                      <Layers className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-white block truncate">DemandGentic</span>
                      <span className="text-[10px] text-white/50 block">Client Portal</span>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-white/50 hover:text-white hover:bg-white/10 p-1.5 rounded-md transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Pinned: Overview */}
          <div className={cn('px-2 mb-1', sidebarCollapsed && 'flex flex-col items-center')}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/client-portal/dashboard?tab=overview">
                    <span
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl transition-all duration-300 cursor-pointer',
                        sidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 mx-1',
                        isSubItemActive('/client-portal/dashboard?tab=overview', location, searchString)
                          ? 'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-white font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                          : 'text-white/80 hover:bg-white/5 font-medium'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <LayoutDashboard
                        className={cn(
                          'shrink-0 transition-all duration-300',
                          isSubItemActive('/client-portal/dashboard?tab=overview', location, searchString) ? 'text-primary' : 'text-white/60',
                          sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4'
                        )}
                      />
                      {!sidebarCollapsed && <span className="text-sm">Overview</span>}
                    </span>
                  </Link>
                </TooltipTrigger>
                {sidebarCollapsed && <TooltipContent side="right">Overview</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator className="opacity-20 my-2 mx-3" />

          {/* Navigation Sections */}
          <nav className="flex-1 overflow-y-auto px-2 space-y-3 pb-2">
            {navigationSections.map((section, idx) => (
              <div key={section.id}>
                {section.label && !sidebarCollapsed && !(section.items.length === 1 && section.items[0].items && section.items[0].items.length > 0) && (
                  <h4 className={cn(
                    'px-3 text-[0.72rem] font-semibold uppercase tracking-[0.22em] mb-2 transition-opacity duration-300',
                    section.id === 'ai-intelligence' ? 'text-violet-400/80' : 'text-white/40'
                  )}>
                    {section.label}
                    {section.id === 'ai-intelligence' && <Sparkles className="h-2.5 w-2.5 inline ml-1.5 -mt-0.5" />}
                  </h4>
                )}
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    item={item}
                    currentPath={location}
                    currentSearch={searchString}
                    collapsed={sidebarCollapsed}
                    onNavClick={() => setSidebarOpen(false)}
                  />
                ))}
                {idx < navigationSections.length - 1 && (
                  <Separator className={cn('opacity-10 my-2', sidebarCollapsed ? 'mx-2' : 'mx-3')} />
                )}
              </div>
            ))}
          </nav>

          {/* Owner: Back to Admin */}
          {user?.isOwner && (
            <div className="px-3 pb-1">
              <Link href="/">
                <span
                  className={cn(
                    'flex items-center gap-2 rounded-xl transition-colors cursor-pointer text-amber-400/80 hover:bg-amber-500/10',
                    sidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="text-sm font-medium">Admin Dashboard</span>}
                </span>
              </Link>
            </div>
          )}

          {/* User Footer */}
          {user && (
            <div className="border-t border-white/10 px-3 py-3">
              <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'gap-3')}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-[11px] bg-primary/20 text-primary">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{user.clientAccountName}</div>
                    <div className="text-xs text-white/40 truncate">{user.email}</div>
                  </div>
                )}
                {!sidebarCollapsed && user.isOwner && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 text-[10px] px-1.5 shrink-0 border-amber-500/20">
                    <Crown className="h-2.5 w-2.5 mr-0.5" />
                    Owner
                  </Badge>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Main content area */}
        <div className={cn('transition-all duration-300', mainPadding)}>
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/90 backdrop-blur-sm px-4 lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentPageLabel}
              </div>
            </div>

            {/* Settings */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/client-portal/dashboard?tab=settings">
                    <Button variant="ghost" size="icon" className="mr-1 text-muted-foreground hover:text-foreground">
                      <Settings className="h-5 w-5" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Account Settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-sm font-medium">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/client-portal/dashboard?tab=billing">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Billing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/client-portal/dashboard?tab=support">
                    <Headphones className="mr-2 h-4 w-4" />
                    Support
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/client-portal/dashboard?tab=settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Page content */}
          <main className="p-4 lg:p-6">{children}</main>
        </div>

        {/* AgentC Side Panel */}
        <AgentSidePanel />

        {/* Campaign Simulation Panel */}
        <CampaignSimulationPanel
          open={simulationOpen}
          onOpenChange={setSimulationOpen}
        />
      </div>
    </AgentPanelProvider>
  );
}

// Re-export for backwards compat
export function ClientPortalAgentToggle() {
  const agentPanel = useAgentPanelContextOptional();
  if (!agentPanel) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={agentPanel.togglePanel}
            className={cn(
              'relative',
              agentPanel.state.isOpen && 'bg-primary/10 text-primary'
            )}
          >
            <Sparkles className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>AgentC (Ctrl+/)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
