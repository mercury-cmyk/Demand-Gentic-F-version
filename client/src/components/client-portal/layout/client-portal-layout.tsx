import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
} from 'lucide-react';
import { VoiceAssistant } from '../voice/voice-assistant';
import { CampaignSimulationPanel } from '../simulation/campaign-simulation-panel';

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

const navigation = [
  { name: 'Dashboard', href: '/client-portal/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/client-portal/projects', icon: FolderKanban },
  { name: 'Campaigns', href: '/client-portal/campaigns', icon: Megaphone },
  { name: 'Orders', href: '/client-portal/orders', icon: ShoppingCart },
  { name: 'Billing', href: '/client-portal/billing', icon: CreditCard },
  { name: 'Settings', href: '/client-portal/settings', icon: Settings },
];

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
    <div className="min-h-screen bg-background">
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
          {navigation.map((item) => {
            const isActive = location.startsWith(item.href);
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

          {/* Demand Assistant Button in Header */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 relative group"
                  onClick={() => handleOpenAssistant()}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Demand Assistant</span>
                  <Sparkles className="h-3 w-3 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Ask me anything about your account!</p>
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

      {/* Floating Demand Assistant FAB with Suggestions */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Suggestions Popup */}
        {showSuggestions && !voiceOpen && (
          <div className="bg-card border rounded-lg shadow-lg p-4 w-72 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Hi{user?.firstName ? `, ${user.firstName}` : ''}!</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowSuggestions(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              I can help you navigate and get insights. Try asking:
            </p>
            <div className="space-y-2">
              {getSuggestions().map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleOpenAssistant(suggestion.action)}
                  className="w-full flex items-center gap-2 p-2 text-left text-xs rounded-md hover:bg-muted transition-colors group"
                >
                  <suggestion.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  <span className="group-hover:text-primary">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FAB Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  if (showSuggestions) {
                    setShowSuggestions(false);
                    handleOpenAssistant();
                  } else if (!hasInteracted) {
                    setShowSuggestions(true);
                  } else {
                    handleOpenAssistant();
                  }
                }}
                className={cn(
                  "relative h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg",
                  "flex items-center justify-center transition-all hover:scale-105 hover:shadow-xl",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  !hasInteracted && "animate-bounce"
                )}
              >
                <MessageSquare className="h-6 w-6" />
                {!hasInteracted && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 items-center justify-center">
                      <Sparkles className="h-2.5 w-2.5 text-white" />
                    </span>
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Demand Assistant - Ask me anything!</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Campaign Simulation Panel */}
      <CampaignSimulationPanel
        open={simulationOpen}
        onOpenChange={setSimulationOpen}
      />
    </div>
  );
}
