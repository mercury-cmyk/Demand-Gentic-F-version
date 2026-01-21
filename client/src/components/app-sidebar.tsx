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
  Database,
  Bot,
  Sparkles,
  ShieldCheck,
  FileText,
  MessageSquare,
  KanbanSquare,
  Settings,
  type LucideIcon,
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
import { useState, useEffect, useCallback } from "react";
import {
  NAVIGATION_SECTIONS,
  filterSectionsByRoles,
  getSpotlightItems,
  type NavSection,
  type NavItem,
  type SubNavItem,
} from "@/lib/navigation-config";

// ============================================
// ICON RESOLVER
// Maps string icon names to Lucide components
// ============================================
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Users,
  Megaphone,
  CheckCircle,
  BarChart3,
  Briefcase,
  Headphones,
  Database,
  Bot,
  Sparkles,
  ShieldCheck,
  FileText,
  MessageSquare,
  KanbanSquare,
  Settings,
};

function resolveIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || LayoutDashboard;
}

// ============================================
// LOCAL STORAGE KEYS
// ============================================
const STORAGE_KEY_COLLAPSED_SECTIONS = 'sidebar-collapsed-sections';

// ============================================
// HOOKS
// ============================================

/**
 * Hook to persist collapsed section state
 */
function useCollapsedSections() {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_COLLAPSED_SECTIONS);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      // Persist to localStorage
      localStorage.setItem(STORAGE_KEY_COLLAPSED_SECTIONS, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isSectionCollapsed = useCallback((sectionId: string) => {
    return collapsedSections.has(sectionId);
  }, [collapsedSections]);

  return { toggleSection, isSectionCollapsed };
}

// ============================================
// COMPONENTS
// ============================================

interface SidebarNavItemProps {
  item: NavItem;
  isActive: boolean;
  spotlightItems: Set<string>;
  location: string;
}

function SidebarNavItem({ item, isActive, spotlightItems, location }: SidebarNavItemProps) {
  const Icon = resolveIcon(item.icon);

  // Simple item without sub-items
  if (!item.items || item.items.length === 0) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip={item.title}
          isActive={isActive}
          data-testid={`nav-${item.id}`}
          className={cn(
            "transition-all duration-200 rounded-xl mx-1 mb-1",
            isActive
              ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-sidebar-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:from-primary/25"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
          )}
        >
          <a href={item.url}>
            <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-sidebar-foreground/60")} />
            <span>{item.title}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Collapsible item with sub-items
  return (
    <Collapsible
      defaultOpen={isActive}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActive}
            data-testid={`nav-${item.id}`}
            className={cn(
              "transition-all duration-200 rounded-xl mx-1 mb-1",
              isActive
                ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-sidebar-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] hover:from-primary/25"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-sidebar-foreground/60")} />
            <span>{item.title}</span>
            <ChevronDown className="ml-auto h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-180 opacity-50" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-1 ml-3 border-l border-sidebar-border/60 pl-3 py-1 my-1 space-y-1">
            {item.items.map((subItem) => (
              <SidebarSubNavItem
                key={subItem.id}
                subItem={subItem}
                location={location}
                isSpotlight={spotlightItems.has(subItem.title)}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

interface SidebarSubNavItemProps {
  subItem: SubNavItem;
  location: string;
  isSpotlight: boolean;
}

function SidebarSubNavItem({ subItem, location, isSpotlight }: SidebarSubNavItemProps) {
  const subActive = location === subItem.url;
  const hasBadge = subItem.badge?.variant === 'new' || isSpotlight;

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        isActive={subActive}
        data-testid={`nav-sub-${subItem.id}`}
        className={cn(
          "rounded-md transition-colors h-8 text-[0.85rem]",
          subActive
            ? "text-sidebar-foreground bg-sidebar-accent/60 font-semibold"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
          hasBadge && "nav-spotlight"
        )}
      >
        <a href={subItem.url}>
          <span className="pr-2">{subItem.title}</span>
          {hasBadge && (
            <div className="nav-new-badge">
              <span className="nav-new-dot" aria-hidden="true" />
              <span className="nav-new-text">New</span>
            </div>
          )}
        </a>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

interface SidebarSectionProps {
  section: NavSection;
  isLastSection: boolean;
  spotlightItems: Set<string>;
  location: string;
  isActive: (url?: string, items?: SubNavItem[]) => boolean;
}

function SidebarSection({ section, isLastSection, spotlightItems, location, isActive }: SidebarSectionProps) {
  return (
    <div className="mb-4">
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
              return (
                <SidebarNavItem
                  key={item.id}
                  item={item}
                  isActive={active}
                  spotlightItems={spotlightItems}
                  location={location}
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {!isLastSection && (
        <SidebarSeparator className="my-3 opacity-60" />
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export interface AppSidebarProps {
  userRoles?: string[];
}

export function AppSidebar({ userRoles = ["admin"] }: AppSidebarProps) {
  const [location] = useLocation();
  const { state, toggleSidebar } = useSidebar();

  // Filter sections based on user roles
  const filteredSections = filterSectionsByRoles(NAVIGATION_SECTIONS, userRoles);

  // Get spotlight items (items with "new" badge)
  const spotlightItems = getSpotlightItems();

  /**
   * Check if a navigation item or any of its sub-items is active
   */
  const isActive = useCallback((url?: string, items?: SubNavItem[]): boolean => {
    if (url) {
      const urlWithoutParams = url.split('?')[0];
      const locationWithoutParams = location.split('?')[0];

      // Exact match
      if (location === url) return true;

      // Query parameter match
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
  }, [location]);

  return (
    <Sidebar className="relative bg-gradient-to-b from-sidebar/95 via-sidebar/90 to-sidebar/80 border-r border-sidebar-border/70 backdrop-blur-xl shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)]">
      <SidebarContent className="px-3 py-4 text-sidebar-foreground/95">
        {/* Logo and Toggle */}
        <SidebarGroup className="mb-6">
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="text-lg font-semibold px-0 text-sidebar-foreground tracking-tight flex items-center gap-2">
              <img
                src="/demangent-logo.png"
                alt="DemandGentic.ai By Pivotal B2B"
                className="h-6 w-auto"
              />
              <span className="align-middle">DemandGentic.ai By Pivotal B2B</span>
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

        {/* Navigation Sections */}
        {filteredSections.map((section, sectionIndex) => (
          <SidebarSection
            key={section.id}
            section={section}
            isLastSection={sectionIndex === filteredSections.length - 1}
            spotlightItems={spotlightItems}
            location={location}
            isActive={isActive}
          />
        ))}
      </SidebarContent>

      {/* Footer */}
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
