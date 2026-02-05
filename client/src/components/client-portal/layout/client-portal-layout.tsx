/**
 * Client Portal Layout
 *
 * DESIGN PRINCIPLES (aligned with main dashboard):
 * 1. Single, centralized AgentX entry point - prominently placed at TOP
 * 2. Unified campaign management hub
 * 3. Campaign-bound templates and voice stimulation
 * 4. Clean, intentional navigation structure
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  FolderKanban,
  Megaphone,
  ShoppingCart,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  MessageSquare,
  Sparkles,
  TrendingUp,
  FileText,
  HelpCircle,
  Phone,
  BotMessageSquare,
  BarChart3,
  PhoneCall,
  Mail,
  ClipboardList,
} from 'lucide-react';
import { VoiceAssistant } from '../voice/voice-assistant';
import { SimulationStudioPanel as CampaignSimulationPanel } from '../simulation-studio/simulation-studio-panel';
import { AgentPanelProvider, AgentSidePanel, useAgentPanelContextOptional } from '@/components/agent-panel';

interface ClientUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  clientAccountId: string;
  clientAccountName: string;
}

interface ClientPortalLayoutProps {
  children: React.ReactNode;
}

/**
 * Navigation Structure
 *
 * DESIGN: Centralized AgentX at TOP, then unified campaign hub
 */

// Primary action - AgentX (centralized AI entry point)
const agenticOperator = {
  name: 'AgentX',
  href: '/client-portal/dashboard?tab=agent',
  icon: BotMessageSquare,
  badge: 'AI',
  description: 'Unified agentic operations panel',
};

// Main navigation - organized by priority
const navigation = [
  { name: 'Dashboard', href: '/client-portal/dashboard', icon: LayoutDashboard },
  { name: 'Campaigns', href: '/client-portal/campaigns', icon: Megaphone, description: 'Email & voice campaigns' },
  { name: 'Order Requests', href: '/client-portal/dashboard?tab=work-orders', icon: ClipboardList, description: 'AI-powered campaign ordering' },
  { name: 'Projects', href: '/client-portal/projects', icon: FolderKanban },
  { name: 'Preview Studio', href: '/preview-studio', icon: Sparkles },
  { name: 'Voice Simulation', href: '/client-portal/voice-simulation', icon: PhoneCall },
  { name: 'Email Simulation', href: '/client-portal/email-simulation', icon: Mail },
  { name: 'Analytics', href: '/client-portal/dashboard?tab=reports', icon: BarChart3 },
  { name: 'Billing', href: '/client-portal/billing', icon: CreditCard },
  { name: 'Settings', href: '/client-portal/settings', icon: Settings },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const storedUser = localStorage.getItem('clientPortalUser');
  const user: ClientUser | null = storedUser ? JSON.parse(storedUser) : null;

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
    
    // Page-specific suggestions
    if (location.includes('/dashboard')) {
      return [
        { icon: TrendingUp, text: "Summarize my account", action: "Give me a summary of my account status and recent activity" },
        { icon: Sparkles, text: "What leads were delivered?", action: "What leads have been delivered to me recently?" },
        ...baseSuggestions.slice(0, 1),
      ];
    }
    if (location.includes('/projects')) {
      return [
        { icon: FolderKanban, text: "Check project status", action: "What's the status of my active projects?" },
        { icon: Sparkles, text: "Request more leads", action: "I want to request additional leads for my project" },
        ...baseSuggestions.slice(0, 1),
      ];
    }
    if (location.includes('/campaigns')) {
      return [
        { icon: TrendingUp, text: "Campaign analytics", action: "Show me detailed analytics for my campaigns" },
        { icon: Megaphone, text: "Best performing campaign", action: "Which campaign is performing the best?" },
        { icon: Phone, text: "🎯 Try AI Simulation", action: "__SIMULATION__", isSimulation: true },
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
    // Check if this is a simulation action
    if (initialPrompt === '__SIMULATION__') {
      setShowSuggestions(false);
      setSimulationOpen(true);
      return;
    }
    
    setShowSuggestions(false);
    setHasInteracted(true);
    localStorage.setItem('demandAssistantInteracted', 'true');
    setVoiceOpen(true);
    // If there's an initial prompt, we could pass it - for now just open
  };

  const handleLogout = () => {
    localStorage.removeItem('clientPortalToken');
    localStorage.removeItem('clientPortalUser');
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
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <Link href="/client-portal/dashboard">
            <span className="text-lg font-semibold text-primary cursor-pointer">
              Client Portal
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {/* AGENTIC OPERATOR - Centralized AI Entry Point */}
          <div className="px-2 mb-4">
            <Link href={agenticOperator.href}>
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  handleOpenAssistant();
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
                  <span className="block">{agenticOperator.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{agenticOperator.description}</span>
                </div>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] px-1.5">
                  {agenticOperator.badge}
                </Badge>
              </button>
            </Link>
          </div>

          <Separator className="my-3 mx-2" />

          {/* Main Navigation */}
          {navigation.map((item) => {
            const isActive = location === item.href ||
              (item.href !== '/client-portal/dashboard' && location.startsWith(item.href.split('?')[0]));
            return (
              <Link key={item.name} href={item.href}>
                <span
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                </span>
              </Link>
            );
          })}
        </nav>

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

          {/* AgentX Button in Header - Opens Side Panel */}
          <ClientPortalAgentToggleButton />

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
                <Link href="/client-portal/settings">
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

      {/* Global AI Agent Side Panel */}
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
