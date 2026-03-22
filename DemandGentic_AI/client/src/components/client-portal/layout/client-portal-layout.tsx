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
  icon: React.ComponentType;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

// Map nav item hrefs to required feature flags for gating.
// Items not listed are always shown (e.g. Dashboard Overview, Settings, Guide).
const NAV_FEATURE_MAP: Record = {
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
    
      
        
          
            
            AgentX
            
          
        
        
          AgentX - Your command center (Ctrl+/)
        
      
    
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
  const { data: featuresData } = useQuery }>({
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
      const tabLabels: Record = {
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
    
      
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
           setSidebarOpen(false)}
          />
        )}

      {/* Sidebar */}
      
        {/* Brand header */}
        
          
            
              
            
            
              
                DemandGentic
                Client Portal
              
            
          
          
            {user?.isOwner && (
              
                
                Owner
              
            )}
             setSidebarOpen(false)}>
              
            
          
        

        
          {/* Pinned navigation items */}
          
            {filteredPinnedItems.map((item) => {
              const isActive = isItemActive(item, location, searchString);
              return (
                
                   setSidebarOpen(false)}
                  >
                    
                    {item.name}
                    {isActive && }
                  
                
              );
            })}
          

          

          {/* Grouped navigation */}
          {navigationGroups.map((group) => {
            const isGroupActive = groupHasActiveItem(group, location, searchString);
            const isAiStudioGroup = group.id === 'ai-intelligence';

            return (
              
                
                  
                    
                       {group.label}
                       {isAiStudioGroup && }
                    
                    
                  
                
                
                  {group.items.map((item) => {
                    const isActive = isItemActive(item, location, searchString);
                    return (
                      
                         setSidebarOpen(false)}
                        >
                          
                          {item.name}
                          {isActive && }
                        
                      
                    );
                  })}
                
              
            );
          })}
        

        {/* Owner: Back to Admin Dashboard */}
        {user?.isOwner && (
          
            
               setSidebarOpen(false)}
              >
                
                Admin Dashboard
              
            
          
        )}

        {/* Account info */}
        {user && (
          
            
              
                
                  {getInitials()}
                
              
              
                {user.clientAccountName}
                {user.email}
              
            
          
        )}
      

      {/* Main content area */}
      
        {/* Header */}
        
           setSidebarOpen(true)}
          >
            
          

          
            {currentPageLabel}
          

          {/* AgentX Button in Header - REMOVED (Replaced by Dashboard Action)
          
          */}

          {/* Settings Icon - Clearly Added */}
          
            
              
                
                   
                    
                  
                
              
              
                Account Settings
              
            
          

          {/* User Menu */}
          
            
              
                
                  
                    {getInitials()}
                  
                
              
            
            
              
                
                  
                    {user?.firstName} {user?.lastName}
                  
                  {user?.email}
                
              
              
              
                
                  
                  Billing
                
              
              
                
                  
                  Support
                
              
              
                
                  
                  Settings
                
              
              
              
                
                Log out
              
            
          
        

        {/* Page content */}
        {children}
      

      {/* Voice Assistant Modal */}
      

      {/* Global AI Agent Side Panel - REMOVED per user request
      
      */}

      {/* Campaign Simulation Panel */}
      
      
    
  );
}

// Client Portal Agent Toggle Button - for use in header
export function ClientPortalAgentToggle() {
  const agentPanel = useAgentPanelContextOptional();

  if (!agentPanel) return null;

  return (
    
      
        
          
            
            
          
        
        
          AgentX (Ctrl+/)
        
      
    
  );
}