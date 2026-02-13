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
  BotMessageSquare,
  Sparkles,
  ShieldCheck,
  FileText,
  MessageSquare,
  KanbanSquare,
  Settings,
  Brain,
  FolderKanban,
  Wand2,
  Trophy,
  RefreshCw,
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
  BotMessageSquare,
  Sparkles,
  ShieldCheck,
  FileText,
  MessageSquare,
  KanbanSquare,
  Settings,
  Brain,
  FolderKanban,
  Wand2,
  Trophy,
  RefreshCw,
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
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

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
            "transition-all duration-300 rounded-xl mb-1",
            isCollapsed ? "mx-0" : "mx-1",
            isActive
              ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-sidebar-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:from-primary/25"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
          )}
        >
          <a href={item.url}>
            <Icon className={cn(
              "transition-all duration-300",
              isActive ? "text-primary" : "text-sidebar-foreground/60",
              isCollapsed ? "h-6 w-6" : "h-4 w-4"
            )} />
            <span className={cn(
              "transition-all duration-300",
              isCollapsed && "opacity-0 w-0 overflow-hidden"
            )}>{item.title}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Collapsible item with sub-items - when collapsed, just show as regular button with tooltip
  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip={item.title}
          isActive={isActive}
          data-testid={`nav-${item.id}`}
          className={cn(
            "transition-all duration-300 rounded-xl mb-1 mx-0",
            isActive
              ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-sidebar-foreground font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] hover:from-primary/25"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-medium"
          )}
        >
          <a href={item.items[0]?.url || item.url || '#'}>
            <Icon className={cn(
              "h-6 w-6 transition-all duration-300",
              isActive ? "text-primary" : "text-sidebar-foreground/60"
            )} />
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Expanded: Collapsible item with sub-items
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
              "transition-all duration-300 rounded-xl mx-1 mb-1",
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
  isCollapsed: boolean;
}

function SidebarSection({ section, isLastSection, spotlightItems, location, isActive, isCollapsed }: SidebarSectionProps) {
  return (
    <div className={cn("transition-all duration-300", isCollapsed ? "mb-2" : "mb-4")}>
      {section.label && !isCollapsed && (
        <h4 className="px-4 text-[0.72rem] font-semibold text-sidebar-foreground/70 uppercase tracking-[0.22em] mb-2 transition-opacity duration-300">
          {section.label}
        </h4>
      )}
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className={cn(isCollapsed && "items-center")}>
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
        <SidebarSeparator className={cn("opacity-60 transition-all duration-300", isCollapsed ? "my-2 mx-3" : "my-3")} />
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
      <SidebarContent className={cn(
        "py-4 text-sidebar-foreground/95 transition-all duration-300",
        state === 'collapsed' ? "px-2" : "px-3"
      )}>
        {/* Logo and Toggle */}
        <SidebarGroup className="mb-4">
          <div className={cn(
            "flex items-center transition-all duration-300",
            state === 'collapsed' ? "justify-center" : "justify-between px-2"
          )}>
            {state === 'collapsed' ? (
              // Collapsed: Show only logo icon
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 hover:bg-primary/20 transition-all duration-300 cursor-pointer group border border-primary/10">
                <div className="relative flex items-center justify-center">
                  <span className="font-bold text-xl text-primary tracking-tighter">PB</span>
                  <Sparkles className="h-2.5 w-2.5 text-blue-500 absolute -top-1 -right-2 animate-pulse" />
                </div>
              </div>
            ) : (
              // Expanded: Show full logo with text
              <>
                <div className="flex flex-col gap-0.5 px-0 max-w-[85%]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shrink-0">
                      <div className="relative flex items-center justify-center">
                        <span className="font-bold text-base text-primary tracking-tighter">PB</span>
                        <Sparkles className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5" />
                      </div>
                    </div>
                    <span className="text-lg font-bold tracking-tight text-sidebar-foreground whitespace-nowrap">
                      Pivotal B2B
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-3 font-medium pl-1 opacity-80 mt-1">
                    DemandGentic---Human-Led Strategy.<br/>AI-Powered Execution.
                  </span>
                </div>

                <SidebarGroupAction asChild className="self-start mt-1.5">
                  <button
                    aria-label={state === 'expanded' ? 'Collapse sidebar' : 'Expand sidebar'}
                    aria-expanded={state === 'expanded'}
                    onClick={() => toggleSidebar()}
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 p-1.5 rounded-md transition-colors"
                    title={state === 'expanded' ? 'Collapse' : 'Expand'}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </SidebarGroupAction>
              </>
            )}
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
            isCollapsed={state === 'collapsed'}
          />
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className={cn(
        "border-t border-sidebar-border/70 bg-sidebar/80 backdrop-blur-sm transition-all duration-300",
        state === 'collapsed' ? "p-2" : "p-4"
      )}>
        <Button
          variant="ghost"
          className={cn(
            "text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/15 transition-all duration-300",
            state === 'collapsed'
              ? "w-12 h-12 p-0 justify-center rounded-xl"
              : "w-full justify-start"
          )}
          data-testid="button-logout"
          title="Logout"
        >
          <LogOut className={cn(
            "transition-all duration-300",
            state === 'collapsed' ? "h-5 w-5" : "mr-2 h-4 w-4"
          )} />
          {state !== 'collapsed' && <span>Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
