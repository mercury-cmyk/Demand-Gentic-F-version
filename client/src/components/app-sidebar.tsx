import {
  LayoutDashboard,
  Building2,
  Users,
  Megaphone,
  CheckCircle,
  BarChart3,
  Briefcase,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Activity,
  Database,
  Phone,
  Mail,
  KanbanSquare,
  Inbox,
  Bot,
  Sparkles,
  BrainCircuit,
  ShieldCheck,
  FileText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url?: string;
  icon: any;
  roles: string[];
  items?: SubNavItem[];
}

interface SubNavItem {
  title: string;
  url: string;
  roles: string[];
}

interface NavSection {
  label: string;
  items: NavItem[];
  roles: string[];
}

const spotlightSubItems = new Set([
  "Organization Intelligence",
  "AI Agents",
]);

// Organized navigation structure with sections
const getNavSections = (): NavSection[] => [
  // AI & Intelligence
  {
    label: "AI & Intelligence",
    roles: ["admin", "campaign_manager"],
    items: [
      {
        title: "AI Studio",
        icon: Sparkles,
        roles: ["admin", "campaign_manager"],
        items: [
          { title: "Organization Intelligence", url: "/ai-studio/intelligence", roles: ["admin", "campaign_manager"] },
          { title: "AI Agents", url: "/ai-studio/agents", roles: ["admin", "campaign_manager"] },
          { title: "Agentic Operator", url: "/ai-studio/operator", roles: ["admin", "campaign_manager"] },
        ],
      },
    ],
  },

  // Core CRM
  {
    label: "Core CRM",
    roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"],
    items: [
      {
        title: "Dashboard",
        icon: LayoutDashboard,
        roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"],
        items: [
          { title: "Overview", url: "/", roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"] },
        ],
      },
      {
        title: "Accounts",
        icon: Building2,
        roles: ["admin", "campaign_manager", "data_ops"],
        items: [
          { title: "All Accounts", url: "/accounts", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Target Accounts (TAL)", url: "/domain-sets", roles: ["admin", "data_ops"] },
          { title: "Account Segments & Lists", url: "/segments?entity=account", roles: ["admin", "campaign_manager", "data_ops"] },
        ],
      },
      {
        title: "Contacts",
        icon: Users,
        roles: ["admin", "campaign_manager", "data_ops"],
        items: [
          { title: "All Contacts", url: "/contacts", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Contact Segments & Lists", url: "/segments?entity=contact", roles: ["admin", "campaign_manager", "data_ops"] },
        ],
      },
      {
        title: "Revenue & Pipeline",
        icon: KanbanSquare,
        roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"],
        items: [
          { title: "Pipeline", url: "/pipeline", roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"] },
          { title: "Opportunities", url: "/pipeline", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Import Opportunities", url: "/pipeline/import", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Revenue Inbox", url: "/inbox", roles: ["admin", "campaign_manager"] },
          { title: "Email Sequences", url: "/email-sequences", roles: ["admin", "campaign_manager"] },
        ],
      },
    ],
  },

  // Campaigns & Execution
  {
    label: "Campaigns & Execution",
    roles: ["admin", "campaign_manager", "agent"],
    items: [
      {
        title: "Campaigns",
        url: "/campaigns",
        icon: Megaphone,
        roles: ["admin", "campaign_manager"],
      },
      {
        title: "Agent Console",
        url: "/agent-console",
        icon: Headphones,
        roles: ["admin", "campaign_manager", "agent"],
      },
      {
        title: "QA & Lead Review",
        url: "/leads",
        icon: CheckCircle,
        roles: ["admin", "campaign_manager", "quality_analyst", "agent"],
      },
    ],
  },

  // Data Trust & Validation
  {
    label: "Data Trust & Validation",
    roles: ["admin", "data_ops", "quality_analyst"],
    items: [
      {
        title: "Data Integrity",
        url: "/data-integrity",
        icon: ShieldCheck,
        roles: ["admin", "data_ops"],
      },
      {
        title: "Validation Campaigns",
        url: "/verification/campaigns",
        icon: Database,
        roles: ["admin", "data_ops", "quality_analyst"],
      },
    ],
  },

  // Analytics & Insights
  {
    label: "Analytics & Insights",
    roles: ["admin", "campaign_manager", "quality_analyst", "client_user"],
    items: [
      {
        title: "Analytics",
        url: "/engagement-analytics",
        icon: BarChart3,
        roles: ["admin", "campaign_manager", "quality_analyst", "client_user"],
      },
      {
        title: "AI Call Analytics",
        url: "/ai-call-analytics",
        icon: Bot,
        roles: ["admin", "campaign_manager"],
      },
      {
        title: "Reports",
        url: "/reports",
        icon: FileText,
        roles: ["admin", "campaign_manager", "quality_analyst", "client_user"],
      },
    ],
  },

  // Projects & Operations
  {
    label: "Projects & Operations",
    roles: ["admin", "campaign_manager", "client_user"],
    items: [
      {
        title: "Projects",
        url: "/orders",
        icon: Briefcase,
        roles: ["admin", "campaign_manager", "client_user"],
      },
    ],
  },
];

// Filter sections and items based on user roles
const filterSectionsByRoles = (sections: NavSection[], userRoles: string[]): NavSection[] => {
  // If user has admin role, show everything
  if (userRoles.includes('admin')) {
    return sections;
  }

  return sections
    .filter(section => section.roles.some(role => userRoles.includes(role)))
    .map(section => ({
      ...section,
      items: section.items
        .filter(item => item.roles.some(role => userRoles.includes(role)))
        .map(item => ({
          ...item,
          items: item.items?.filter(subItem => subItem.roles.some(role => userRoles.includes(role))),
        })),
    }))
    .filter(section => section.items.length > 0);
};

export function AppSidebar({ userRoles = ["admin"] }: { userRoles?: string[] }) {
  const [location] = useLocation();
  const filteredSections = filterSectionsByRoles(getNavSections(), userRoles);

  const isActive = (url?: string, items?: SubNavItem[]) => {
    if (url) {
      const urlWithoutParams = url.split('?')[0];
      const locationWithoutParams = location.split('?')[0];

      if (location === url) return true;

      if (url.includes('?') && locationWithoutParams === urlWithoutParams) {
        return location.includes(url.split('?')[1]);
      }

      return false;
    }
    if (items) {
      return items.some(item => {
        const itemUrlWithoutParams = item.url.split('?')[0];
        const locationWithoutParams = location.split('?')[0];

        if (location === item.url) return true;
        if (item.url.includes('?') && locationWithoutParams === itemUrlWithoutParams) {
          return location.includes(item.url.split('?')[1]);
        }
        return false;
      });
    }
    return false;
  };

  const { state, toggleSidebar } = useSidebar();

  return (
    <Sidebar className="relative bg-gradient-to-b from-sidebar/95 via-sidebar/90 to-sidebar/80 border-r border-sidebar-border/70 backdrop-blur-xl shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)]">
      <SidebarContent className="px-3 py-4 text-sidebar-foreground/95">
        <SidebarGroup className="mb-6">
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="text-lg font-semibold px-0 text-sidebar-foreground tracking-tight flex items-center gap-2">
              <img
                src="/demangent-logo.png"
                alt="DemanGent.ai"
                className="h-6 w-auto"
              />
              <span className="align-middle">DemanGent.ai</span>
            </SidebarGroupLabel>

            <SidebarGroupAction asChild>
              <button
                aria-label={state === 'expanded' ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-expanded={state === 'expanded'}
                onClick={() => toggleSidebar()}
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 p-1.5 rounded-md transition-colors"
                title={state === 'expanded' ? 'Collapse' : 'Expand'}
              >
                {state === 'expanded' ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </SidebarGroupAction>
          </div>
        </SidebarGroup>

        {filteredSections.map((section, sectionIndex) => (
          <div key={section.label} className="mb-4">
            {section.label && (
              <h4 className="px-4 text-[0.72rem] font-semibold text-sidebar-foreground/70 uppercase tracking-[0.22em] mb-2">
                {section.label}
              </h4>
            )}
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const active = isActive(item.url, item.items);
                    
                    if (!item.items || item.items.length === 0) {
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            tooltip={item.title}
                            isActive={active}
                            data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                            className={cn(
                              "transition-all duration-200 rounded-xl mx-1 mb-1",
                              active 
                                ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-sidebar-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:from-primary/25" 
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
                            )}
                          >
                            <a href={item.url}>
                              <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-sidebar-foreground/60")} />
                              <span>{item.title}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }

                    return (
                      <Collapsible
                        key={item.title}
                        defaultOpen={active}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              tooltip={item.title}
                              isActive={active}
                              data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                              className={cn(
                                "transition-all duration-200 rounded-xl mx-1 mb-1",
                              active 
                                ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-sidebar-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] hover:from-primary/25" 
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
                            )}
                            >
                              <item.icon className={cn("h-4 w-4", active ? "text-primary" : "text-sidebar-foreground/60")} />
                              <span>{item.title}</span>
                              <ChevronDown className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-180 opacity-50" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub className="mr-1 ml-3 border-l border-sidebar-border/60 pl-3 py-1 my-1 space-y-1">
                              {item.items.map((subItem) => {
                                const subActive = location === subItem.url;
                                const isSpotlight = spotlightSubItems.has(subItem.title);
                                return (
                                  <SidebarMenuSubItem key={subItem.title}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={subActive}
                                      data-testid={`nav-sub-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}
                                      className={cn(
                                        "rounded-md transition-colors h-8 text-[0.85rem]",
                                        subActive 
                                          ? "text-sidebar-foreground bg-sidebar-accent/60 font-semibold" 
                                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
                                        isSpotlight && "nav-spotlight"
                                      )}
                                    >
                                      <a href={subItem.url}>
                                        <span className="pr-2">{subItem.title}</span>
                                        {isSpotlight && (
                                          <div className="nav-new-badge">
                                            <span className="nav-new-dot" aria-hidden="true" />
                                            <span className="nav-new-text">New</span>
                                          </div>
                                        )}
                                      </a>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {sectionIndex < filteredSections.length - 1 && (
              <SidebarSeparator className="my-3 opacity-60" />
            )}
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border/70 bg-sidebar/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/15 transition-colors duration-200"
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
