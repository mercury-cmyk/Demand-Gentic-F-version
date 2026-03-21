/**
 * Client Portal Layout
 *
 * DESIGN PRINCIPLES:
 * 1. Minimal sidebar: pinned Overview + 5 collapsible groups
 * 2. Clean navigation: Campaigns / AI Studio / Communications / Analytics / Account
 * 3. Collapsible sections with auto-expand for active items
 * 4. Enterprise-grade, distraction-free UI
 */
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
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
  ChevronRight,
  ChevronDown,
  Sparkles,
  TrendingUp,
  FileText,
  HelpCircle,
  Phone,
  BotMessageSquare,
  PhoneCall,
  ClipboardList,
  Brain,
  CalendarDays,
  Crown,
  ArrowLeft,
  Target,
  Headphones,
  Layers,
  Mail,
  BarChart3,
  Plus,
  Wand2,
  Workflow,
  Inbox,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { VoiceAssistant } from '../voice/voice-assistant';
import { SimulationStudioPanel as CampaignSimulationPanel } from '../simulation-studio/simulation-studio-panel';
import { AgentPanelProvider, useAgentPanelContextOptional } from '@/components/agent-panel';
import { clearClientPortalSession } from '@/lib/client-portal-session';

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

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// Map nav item hrefs to required feature flags for gating.
// Items not listed are always shown (e.g. Dashboard Overview, Settings, Guide).
const NAV_FEATURE_MAP: Record<string, string> = {
  '/client-portal/dashboard?tab=campaigns': 'campaign_reports',
  '/client-portal/create-campaign': 'campaign_reports',
  '/client-portal/dashboard?tab=unified-pipelines': 'journey_pipeline',
  '/client-portal/dashboard?tab=work-orders': 'work_orders',
  '/client-portal/dashboard?tab=bookings': 'calendar_booking',
  '/client-portal/intelligence': 'ai_studio_dashboard',
  '/client-portal/dashboard?tab=target-markets': 'ai_studio_dashboard',
  '/client-portal/dashboard?tab=campaign-planner': 'ai_campaign_planner',
  '/client-portal/generative-studio': 'ai_studio_dashboard',
  '/client-portal/preview-studio': 'voice_simulation',
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

// Pinned top-level items (shown above groups without a section header)
const pinnedNavItems: NavItem[] = [
  { name: 'Overview', href: '/client-portal/dashboard?tab=overview', icon: LayoutDashboard },
];

// Grouped navigation structure
const baseNavigationGroups: NavGroup[] = [
  {
    id: 'campaigns',
    label: 'Campaigns',
    items: [
      { name: 'All Campaigns', href: '/client-portal/dashboard?tab=campaigns', icon: Megaphone },
      { name: 'Create Campaign', href: '/client-portal/create-campaign', icon: Plus },
      { name: 'Pipeline & Engagement', href: '/client-portal/dashboard?tab=unified-pipelines', icon: Workflow },
      { name: 'Work Orders', href: '/client-portal/dashboard?tab=work-orders', icon: ClipboardList },
      { name: 'Bookings', href: '/client-portal/dashboard?tab=bookings', icon: CalendarDays },
    ],
  },
  {
    id: 'ai-intelligence',
    label: 'AI Studio',
    items: [
      { name: 'Org Intelligence', href: '/client-portal/intelligence', icon: Brain },
      { name: 'Target Markets', href: '/client-portal/dashboard?tab=target-markets', icon: Target },
      { name: 'Creative Studio', href: '/client-portal/generative-studio', icon: Sparkles },
      { name: 'Preview Studio', href: '/client-portal/preview-studio', icon: PhoneCall },
    ],
  },
  {
    id: 'communications',
    label: 'Communications',
    items: [
      { name: 'Email Campaigns', href: '/client-portal/email-campaigns', icon: Mail },
      { name: 'Email Studio', href: '/client-portal/email-simulation', icon: Wand2 },
      { name: 'Shared Inbox', href: '/client-portal/email-inbox', icon: Inbox },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    items: [
      { name: 'Reports & Analytics', href: '/client-portal/dashboard?tab=reporting', icon: BarChart3 },
    ],
  },
  {
    id: 'billing',
    label: 'Account',
    items: [
      { name: 'Billing & Invoices', href: '/client-portal/dashboard?tab=billing', icon: CreditCard },
      { name: 'Client Guide', href: '/client-portal/services', icon: HelpCircle },
    ],
  },
];

function isItemActive(item: NavItem, currentPath: string, currentSearch: string): boolean {
  const itemUrl = new URL(item.href, 'http://localhost');
  const itemPath = itemUrl.pathname;
  const itemTab = itemUrl.searchParams.get('tab');

  // For dashboard tab items, check both path and tab param
  if (itemPath === '/client-portal/dashboard' && itemTab) {
    const currentTab = new URLSearchParams(currentSearch).get('tab');
    return currentPath === '/client-portal/dashboard' && currentTab === itemTab;
  }

  // For separate pages, check path match
  if (currentPath === itemPath) return true;
  if (itemPath !== '/client-portal/dashboard' && currentPath.startsWith(itemPath)) return true;

  return false;
}

function groupHasActiveItem(group: NavGroup, currentPath: string, currentSearch: string): boolean {
  return group.items.some(item => isItemActive(item, currentPath, currentSearch));
}

// Toggle button for the header - must be inside AgentPanelProvider
function ClientPortalAgentToggleButton() {
  const agentPanel = useAgentPanelContextOptional();

  if (!agentPanel) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="sm"
            className={cn(
              "gap-2 relative group",
              agentPanel.state.isOpen
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            )}
            onClick={agentPanel.togglePanel}
          >
            <BotMessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">AgentX</span>
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>AgentX - Your command center (Ctrl+/)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const storedUser = localStorage.getItem('clientPortalUser');
  const user: ClientUser | null = storedUser ? JSON.parse(storedUser) : null;
  const clientAccountId = user?.clientAccountId;

  // Check if Argyle events feature is available for this client
  const getToken = () => localStorage.getItem('clientPortalToken');
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
    // Probe safely; non-Argyle tenants return disabled without surfacing errors.
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

  // Build navigation dynamically based on feature availability
  const filterByFeature = React.useCallback((item: NavItem) => {
    const requiredFeature = NAV_FEATURE_MAP[item.href];
    if (!requiredFeature) return true;
    if (enabledFeatures.length === 0) return true;
    return new Set(enabledFeatures).has(requiredFeature);
  }, [enabledFeatures]);

  const navigationGroups = React.useMemo(() => {
    let groups = baseNavigationGroups.map(group => ({
      ...group,
      items: group.items.filter(filterByFeature),
    }));

    // Hide billing item (not entire Account group) if showBilling is explicitly false
    if (visibilitySettings.showBilling === false) {
      groups = groups.map(g => {
        if (g.id === 'billing') {
          return { ...g, items: g.items.filter(item => !item.href.includes('billing')) };
        }
        return g;
      });
    }

    // Remove empty groups after filtering
    groups = groups.filter(g => g.items.length > 0);

    // Rename AI Studio group with client name
    const aiGroup = groups.find(g => g.id === 'ai-intelligence');
    if (aiGroup) {
      const clientName = user?.clientAccountName || 'Client';
      const displayName = clientName.length > 15 ? clientName.substring(0, 15) + '...' : clientName;
      aiGroup.label = `${displayName} AI Studio`;
    }

    // Add Upcoming Events to Campaigns if Argyle is enabled
    const campaignsGroup = groups.find(g => g.id === 'campaigns');
    if (campaignsGroup && argyleFeatureStatus?.enabled) {
      campaignsGroup.items.push({
        name: 'Upcoming Events',
        href: '/client-portal/argyle-events',
        icon: CalendarDays,
      });
    }

    return groups;
  }, [argyleFeatureStatus?.enabled, user?.clientAccountName, visibilitySettings.showBilling, filterByFeature]);

  // Filter pinned items by feature flags
  const filteredPinnedItems = React.useMemo(() => {
    return pinnedNavItems.filter(filterByFeature);
  }, [filterByFeature]);

  // Show suggestions bubble after a delay if user hasn't interacted
  useEffect(() => {
    const interacted = localStorage.getItem('demandAssistantInteracted');
    if (interacted) {
      setHasInteracted(true);
      return;
    }

    const timer = setTimeout(() => {
      if (!voiceOpen) {
        setShowSuggestions(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [voiceOpen]);

  // Context-aware suggestions based on current page and user
  const getSuggestions = () => {
    const baseSuggestions = [
      { icon: TrendingUp, text: "What's my campaign performance?", action: "What's my campaign performance this month?" },
      { icon: FileText, text: "Show my pending invoices", action: "Show my pending invoices" },
      { icon: HelpCircle, text: "How do I create a new order?", action: "How do I create a new order?" },
    ];

    if (location.includes('/dashboard')) {
      return [
        { icon: TrendingUp, text: "Summarize my account", action: "Give me a summary of my account status and recent activity" },
        { icon: Sparkles, text: "What leads were delivered?", action: "What leads have been delivered to me recently?" },
        ...baseSuggestions.slice(0, 1),
      ];
    }
    if (location.includes('/campaigns')) {
      return [
        { icon: TrendingUp, text: "Campaign analytics", action: "Show me detailed analytics for my campaigns" },
        { icon: Megaphone, text: "Best performing campaign", action: "Which campaign is performing the best?" },
        { icon: Phone, text: "Try AI Simulation", action: "__SIMULATION__", isSimulation: true },
      ];
    }
    if (location.includes('/billing')) {
      return [
        { icon: CreditCard, text: "Billing summary", action: "Give me a summary of my billing and payments" },
        { icon: FileText, text: "Download invoices", action: "How do I download my invoices?" },
        ...baseSuggestions.slice(0, 1),
      ];
    }

    return baseSuggestions;
  };

  const handleOpenAssistant = (initialPrompt?: string) => {
    if (initialPrompt === '__SIMULATION__') {
      setShowSuggestions(false);
      setSimulationOpen(true);
      return;
    }

    setShowSuggestions(false);
    setHasInteracted(true);
    localStorage.setItem('demandAssistantInteracted', 'true');
    setVoiceOpen(true);
  };

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

  const handleVoiceNavigation = (path: string) => {
    setVoiceOpen(false);
    setLocation(path);
  };

  const currentPageLabel = React.useMemo(() => {
    if (location === '/client-portal/dashboard') {
      const requestedTab = new URLSearchParams(searchString).get('tab') || 'overview';
      const tab = requestedTab === 'leads' ? 'unified-pipelines' : requestedTab;
      const tabLabels: Record<string, string> = {
        overview: 'Overview',
        campaigns: 'All Campaigns',
        leads: 'Lead Pipeline',
        'unified-pipelines': 'Pipeline & Engagement',
        'work-orders': 'Work Orders',
        bookings: 'Bookings',
        'target-markets': 'Target Markets',
        'campaign-planner': 'Campaign Planner',
        settings: 'Settings',
        billing: 'Billing',
        support: 'Support',
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
    return 'Client Workspace';
  }, [location, searchString]);

  return (
    <AgentPanelProvider userRole="client" isClientPortal={true}>
      <div className="min-h-screen bg-background agentx-shell">
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
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand header */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shrink-0">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <Link href="/client-portal/dashboard?tab=overview">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer truncate block">
                DemandGentic
                <span className="block text-[10px] font-normal text-slate-400 dark:text-slate-500">Client Portal</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {user?.isOwner && (
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px] px-1.5 gap-0.5 shrink-0 border-amber-200/50">
                <Crown className="h-2.5 w-2.5" />
                Owner
              </Badge>
            )}
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {/* Pinned navigation items */}
          <div className="space-y-0.5 mb-1">
            {filteredPinnedItems.map((item) => {
              const isActive = isItemActive(item, location, searchString);
              return (
                <Link key={item.name} href={item.href}>
                  <span
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer',
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className={cn('h-[18px] w-[18px]', isActive ? 'text-indigo-600' : 'text-slate-400')} />
                    {item.name}
                    {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-indigo-400" />}
                  </span>
                </Link>
              );
            })}
          </div>

          <Separator className="my-2 bg-slate-100 dark:bg-slate-800" />

          {/* Grouped navigation */}
          {navigationGroups.map((group) => {
            const isGroupActive = groupHasActiveItem(group, location, searchString);
            const isAiStudioGroup = group.id === 'ai-intelligence';

            return (
              <Collapsible key={group.id} defaultOpen={isGroupActive || group.id === 'campaigns' || isAiStudioGroup}>
                <CollapsibleTrigger asChild>
                  <button className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors",
                    isAiStudioGroup && "text-violet-500 dark:text-violet-400"
                  )}>
                    <span className="flex items-center gap-1.5">
                       {group.label}
                       {isAiStudioGroup && <Sparkles className="h-3 w-3" />}
                    </span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 pb-2">
                  {group.items.map((item) => {
                    const isActive = isItemActive(item, location, searchString);
                    return (
                      <Link key={item.name} href={item.href}>
                        <span
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer',
                            isActive
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                          )}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-indigo-600' : 'text-slate-400')} />
                          <span className="truncate">{item.name}</span>
                          {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-indigo-400 shrink-0" />}
                        </span>
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>

        {/* Owner: Back to Admin Dashboard */}
        {user?.isOwner && (
          <div className="px-3 pb-2">
            <Link href="/">
              <span
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                onClick={() => setSidebarOpen(false)}
              >
                <ArrowLeft className="h-4 w-4" />
                Admin Dashboard
              </span>
            </Link>
          </div>
        )}

        {/* Account info */}
        {user && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-[11px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.clientAccountName}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{user.email}</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="lg:pl-64">
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
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{currentPageLabel}</div>
          </div>

          {/* AgentX Button in Header - REMOVED (Replaced by Dashboard Action)
          <ClientPortalAgentToggleButton />
          */}

          {/* Settings Icon - Clearly Added */}
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

      {/* Voice Assistant Modal */}
      <VoiceAssistant
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        onNavigate={handleVoiceNavigation}
      />

      {/* Global AI Agent Side Panel - REMOVED per user request
      <AgentSidePanel />
      */}

      {/* Campaign Simulation Panel */}
      <CampaignSimulationPanel
        open={simulationOpen}
        onOpenChange={setSimulationOpen}
      />
      </div>
    </AgentPanelProvider>
  );
}

// Client Portal Agent Toggle Button - for use in header
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
              "relative",
              agentPanel.state.isOpen && "bg-primary/10 text-primary"
            )}
          >
            <BotMessageSquare className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>AgentX (Ctrl+/)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
