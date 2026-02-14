/**
 * Client Portal Layout
 *
 * DESIGN PRINCIPLES:
 * 1. Single, centralized AgentX entry point - prominently placed at TOP
 * 2. Grouped sidebar navigation: Dashboard / Campaigns / AI & Intelligence / Account
 * 3. Collapsible sections with auto-expand for active items
 * 4. Clean, intentional navigation structure
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
  Package,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Sparkles,
  TrendingUp,
  FileText,
  HelpCircle,
  Phone,
  Bot,
  BotMessageSquare,
  PhoneCall,
  ClipboardList,
  Brain,
  CalendarDays,
  Crown,
  ArrowLeft,
  Target,
  UserCheck,
  Headphones,
  Layers,
  AlertTriangle,
  Crosshair,
  MessageSquareText,
  Mail,
  Users,
  BarChart3,
  Mic,
  TestTube,
  Building2,
  Plus,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { VoiceAssistant } from '../voice/voice-assistant';
import { SimulationStudioPanel as CampaignSimulationPanel } from '../simulation-studio/simulation-studio-panel';
import { AgenticReportsPanel } from '@/components/client-portal/reports/agentic-reports-panel';
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
  highlighted?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// Primary action - AgentX (centralized AI entry point)
const agenticOperator = {
  name: 'AgentX',
  href: '#', // Changed from navigation to action
  icon: BotMessageSquare,
  badge: 'COMING SOON',
  description: 'Unified agentic operations panel',
};

// Grouped navigation structure
const baseNavigationGroups: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [
      { name: 'Overview', href: '/client-portal/dashboard?tab=overview', icon: LayoutDashboard },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    items: [
      { name: 'All Campaigns', href: '/client-portal/dashboard?tab=campaigns', icon: Megaphone },
      { name: 'Create Campaign', href: '/client-portal/create-campaign', icon: Plus, highlighted: true },
      { name: 'Leads', href: '/client-portal/dashboard?tab=leads', icon: UserCheck },
      { name: 'Work Orders', href: '/client-portal/dashboard?tab=work-orders', icon: ClipboardList },
      // { name: 'Accounts', href: '/client-portal/dashboard?tab=accounts', icon: Building2 },
      // { name: 'Contacts', href: '/client-portal/dashboard?tab=contacts', icon: Users },
      { name: 'Bookings', href: '/client-portal/dashboard?tab=bookings', icon: CalendarDays },
    ],
  },
  {
    id: 'ai-intelligence',
    label: 'AI & Intelligence',
    items: [
      { name: 'The Agentic Council', href: '/client-portal/agents', icon: Bot, highlighted: true },
      { name: 'Organization Intelligence', href: '/client-portal/intelligence', icon: Brain },
      { name: 'Target Markets', href: '/client-portal/dashboard?tab=target-markets', icon: Target },
      { name: 'Creative Studio', href: '/client-portal/generative-studio', icon: Sparkles },
      { name: 'Preview Studio', href: '/client-portal/preview-studio', icon: PhoneCall },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics & Insights',
    items: [
      { name: 'Analytics', href: '/client-portal/analytics', icon: BarChart3 },
      { name: 'Conversation Quality', href: '/client-portal/conversation-quality', icon: MessageSquareText },
    ],
  },
  {
    id: 'resources',
    label: 'How it Works',
    items: [
      { name: 'Client Guide', href: '/client-portal/services', icon: Package },
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
    enabled: !!clientAccountId,
    staleTime: 5 * 60 * 1000,
  });

  // Check client features for feature-gated nav items
  const { data: featuresData } = useQuery<{ enabledFeatures: string[] }>({
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

  // Build navigation dynamically based on feature availability
  const navigationGroups = React.useMemo(() => {
    const groups = baseNavigationGroups.map(group => ({ ...group, items: [...group.items] }));

    // Rename AI & Intelligence group to [Client Name] AI Studio
    const aiGroup = groups.find(g => g.id === 'ai-intelligence');
    if (aiGroup) {
      const clientName = user?.clientAccountName || 'Client';
      // Truncate if too long to prevent layout breaking
      const displayName = clientName.length > 15 ? clientName.substring(0, 15) + '...' : clientName;
      aiGroup.label = `${displayName} AI Studio`;
    }

    // Add conditional items to Campaigns group
    const campaignsGroup = groups.find(g => g.id === 'campaigns');
    if (campaignsGroup) {
      // Add Upcoming Events if Argyle enabled (client-specific integration)
      if (argyleFeatureStatus?.enabled) {
        campaignsGroup.items.push({
          name: 'Upcoming Events',
          href: '/client-portal/argyle-events',
          icon: CalendarDays,
        });
      }
    }

    return groups;
  }, [argyleFeatureStatus?.enabled, user?.clientAccountName]);

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

  return (
    <AgentPanelProvider userRole="client" isClientPortal={true}>
      <div className="min-h-screen bg-background agentx-shell">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <div className="flex items-center gap-2">
            <Link href="/client-portal/dashboard?tab=overview">
              <span className="text-lg font-semibold text-primary cursor-pointer">
                Client Portal
              </span>
            </Link>
            {user?.isOwner && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] px-1.5 gap-1">
                <Crown className="h-3 w-3" />
                Owner
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {/* AGENTIC OPERATOR - Centralized AI Entry Point */}
          <div className="px-2 mb-4">
            <Link href="/client-portal/dashboard?tab=overview">
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  // handleOpenAssistant(); 
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold cursor-pointer transition-all',
                  'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent',
                  'border border-primary/20 hover:border-primary/40',
                  'text-primary hover:shadow-md hover:scale-[1.02]',
                  'group'
                )}
              >
                <div className="p-1.5 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <agenticOperator.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 text-left">
                  <span className="block flex items-center gap-2">
                    {agenticOperator.name}
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{agenticOperator.description}</span>
                </div>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] px-1.5 whitespace-nowrap">
                  {agenticOperator.badge}
                </Badge>
              </button>
            </Link>
          </div>

          <Separator className="my-3 mx-2" />

          {/* Grouped Navigation */}
          {navigationGroups.map((group) => {
            const isGroupActive = groupHasActiveItem(group, location, searchString);
            const isAiStudioGroup = group.id === 'ai-intelligence';

            return (
              <Collapsible key={group.id} defaultOpen={isGroupActive || group.id === 'dashboard' || isAiStudioGroup}>
                <CollapsibleTrigger asChild>
                  <button className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors group/trigger",
                    isAiStudioGroup && "text-violet-600 dark:text-violet-400 font-bold bg-violet-50/50 dark:bg-violet-900/10 rounded-sm mb-1 mt-1"
                  )}>
                    <span className="flex items-center gap-2">
                       {group.label}
                       {isAiStudioGroup && <Sparkles className="h-3 w-3 animate-pulse" />}
                    </span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-0.5 pb-2">
                  {group.items.map((item) => {
                    const isActive = isItemActive(item, location, searchString);
                    const isHighlighted = !!(item as any).highlighted;

                    return (
                      <Link key={item.name} href={item.href}>
                        <span
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors relative overflow-hidden',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            isHighlighted && !isActive && 'bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent text-violet-700 border border-violet-200/50 shadow-sm',
                            isHighlighted && isActive && 'bg-gradient-to-r from-violet-100 to-indigo-50 text-violet-800 border-violet-200 font-semibold'
                          )}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <item.icon className={cn("h-4 w-4", isHighlighted && "text-violet-600")} />
                          <span className={cn(isHighlighted && "font-semibold tracking-tight")}>{item.name}</span>
                          
                          {isHighlighted && (
                             <Badge className="ml-auto h-4 px-1.5 text-[9px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-0 shadow-sm animate-pulse">
                               HOT
                             </Badge>
                          )}
                          
                          {isActive && !isHighlighted && <ChevronRight className="h-4 w-4 ml-auto" />}
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
          <div className="px-2 pb-2">
            <Link href="/">
              <span
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
                onClick={() => setSidebarOpen(false)}
              >
                <ArrowLeft className="h-4 w-4" />
                Admin Dashboard
              </span>
            </Link>
          </div>
        )}

        {/* Account info at bottom */}
        {user && (
          <div className="border-t p-4">
            <div className="text-xs text-muted-foreground mb-1">Organization</div>
            <div className="text-sm font-medium truncate">{user.clientAccountName}</div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1" />

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
