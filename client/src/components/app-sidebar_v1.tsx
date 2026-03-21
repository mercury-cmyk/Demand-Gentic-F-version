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

// Organized navigation structure with sections
const getNavSections = (): NavSection[] => [
  // Core CRM Section
  {
    label: "CRM",
    roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"],
    items: [
      // Dashboard is visible to all authenticated users
      {
        title: "Dashboard",
        url: "/",
        icon: LayoutDashboard,
        roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user", "content_creator"],
      },
      {
        title: "Accounts",
        icon: Building2,
        roles: ["admin", "campaign_manager", "data_ops"],
        items: [
          { title: "All Accounts", url: "/accounts", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Segments & Lists", url: "/segments?entity=account", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Accounts List (TAL)", url: "/domain-sets", roles: ["admin", "data_ops"] },
        ],
      },
      {
        title: "Contacts",
        icon: Users,
        roles: ["admin", "campaign_manager", "data_ops"],
        items: [
          { title: "All Contacts", url: "/contacts", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Segments & Lists", url: "/segments?entity=contact", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Bulk Import", url: "/imports", roles: ["admin", "data_ops"] },
          { title: "Phone Bulk Editor", url: "/phone-bulk-editor", roles: ["admin", "data_ops"] },
        ],
      },
      {
        title: "Pipeline Management",
        icon: KanbanSquare,
        roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"],
        items: [
          { title: "View Pipeline", url: "/pipeline", roles: ["admin", "campaign_manager", "data_ops", "quality_analyst", "agent", "client_user"] },
          { title: "Import Opportunities", url: "/pipeline/import", roles: ["admin", "campaign_manager", "data_ops"] },
        ],
      },
    ],
  },

  // Campaigns & Outreach Section
  {
    label: "Campaigns & Outreach",
    roles: ["admin", "campaign_manager", "agent"],
    items: [
      {
        title: "Campaigns",
        icon: Megaphone,
        roles: ["admin", "campaign_manager"],
        items: [
          { title: "All Campaigns", url: "/campaigns", roles: ["admin", "campaign_manager"] },
          { title: "Email Campaigns", url: "/campaigns/email", roles: ["admin", "campaign_manager"] },
          { title: "Pipeline Dialer", url: "/phone-campaigns", roles: ["admin", "campaign_manager"] },
          { title: "Telemarketing Suppressions", url: "/telemarketing/suppressions", roles: ["admin", "campaign_manager", "data_ops"] },
          { title: "Campaign Configuration", url: "/campaigns/config", roles: ["admin", "campaign_manager"] },
        ],
      },
      {
        title: "Email Sequences",
        url: "/email-sequences",
        icon: Mail,
        roles: ["admin", "campaign_manager"],
      },
      {
        title: "Inbox",
        url: "/inbox",
        icon: Inbox,
        roles: ["admin", "campaign_manager"],
      },
      {
        title: "Agent Console",
        url: "/agent-console",
        icon: Headphones,
        roles: ["admin", "campaign_manager", "agent"],
      },
      {
        title: "QA & Leads",
        url: "/leads",
        icon: CheckCircle,
        roles: ["admin", "campaign_manager", "quality_analyst", "agent"],
      },
    ],
  },

  // Analytics & Reporting Section
  {
    label: "Analytics & Reporting",
    roles: ["admin", "campaign_manager", "quality_analyst", "client_user"],
    items: [
      {
        title: "Reports",
        icon: BarChart3, // Changed from BarChart to BarChart3
        roles: ["admin", "campaign_manager", "agent"],
        items: [
          { title: "Overview", url: "/reports", roles: ["admin", "campaign_manager"] },
        ],
      },
      {
        title: "Engagement Analytics",
        url: "/engagement-analytics",
        icon: Activity,
        roles: ["admin", "campaign_manager", "quality_analyst", "client_user"],
      },
      {
        title: "Virtual Agents",
        url: "/virtual-agents",
        icon: Bot,
        roles: ["admin"],
      },
    ],
  },

  // Data Verification Section
  {
    label: "Data Verification",
    roles: ["admin", "data_ops", "quality_analyst"],
    items: [
      {
        title: "Verification Campaigns",
        url: "/verification/campaigns",
        icon: Database,
        roles: ["admin", "data_ops", "quality_analyst"],
      },
      {
        title: "Email Validation Test",
        url: "/email-validation-test",
        icon: Mail,
        roles: ["admin", "data_ops"],
      },
      {
        title: "Client Portal",
        url: "/client-portal/admin",
        icon: Users,
        roles: ["admin"],
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
    <Sidebar className="bg-sidebar border-r border-sidebar-border">
      <SidebarContent className="px-3 py-2">
        <SidebarGroup>
          <div className="flex items-center justify-between px-2 mb-4">
            <SidebarGroupLabel className="text-lg font-medium px-0 text-sidebar-foreground tracking-tight flex items-center gap-2">
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
                className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent p-1.5 rounded-md transition-colors"
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
          <div key={section.label}>
            {sectionIndex > 0 && <SidebarSeparator className="my-2" />}
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    if (!item.items || item.items.length === 0) {
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            tooltip={item.title}
                            isActive={isActive(item.url)}
                            data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-200 rounded-md mx-1"
                          >
                            <a href={item.url}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }

                    return (
                      <Collapsible
                        key={item.title}
                        defaultOpen={isActive(undefined, item.items)}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              tooltip={item.title}
                              isActive={isActive(undefined, item.items)}
                              data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                              className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-200 rounded-md mx-1"
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                              <ChevronDown className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {item.items.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.title}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={location === subItem.url}
                                    data-testid={`nav-sub-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}
                                  >
                                    <a href={subItem.url}>
                                      <span>{subItem.title}</span>
                                    </a>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border bg-sidebar">
        <Button
          variant="ghost"
          className="w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-200"
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
