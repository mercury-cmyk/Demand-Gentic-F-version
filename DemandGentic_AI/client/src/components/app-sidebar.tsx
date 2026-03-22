import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  Briefcase,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bot,
  Sparkles,
  MessageSquare,
  Inbox,
  Settings,
  Phone,
  Mail,
  Building,
  Database,
  FolderKanban,
  CheckCircle,
  FileText,
  KanbanSquare,
  Wand2,
  PanelTop,
  Target,
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
const ICON_MAP: Record = {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  Briefcase,
  Bot,
  Sparkles,
  MessageSquare,
  Inbox,
  Settings,
  Phone,
  Mail,
  Building,
  Database,
  FolderKanban,
  CheckCircle,
  FileText,
  KanbanSquare,
  Wand2,
  PanelTop,
  Target,
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
  const [collapsedSections, setCollapsedSections] = useState>(() => {
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
  spotlightItems: Set;
  location: string;
}

function SidebarNavItem({ item, isActive, spotlightItems, location }: SidebarNavItemProps) {
  const Icon = resolveIcon(item.icon);
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  // Simple item without sub-items
  if (!item.items || item.items.length === 0) {
    return (
      
        
          
            
            {item.title}
          
        
      
    );
  }

  // Collapsible item with sub-items - when collapsed, just show as regular button with tooltip
  if (isCollapsed) {
    return (
      
        
          
            
          
        
      
    );
  }

  // Expanded: Collapsible item with sub-items
  return (
    
      
        
          
            
            {item.title}
            
          
        
        
          
            {item.items.map((subItem) => (
              
            ))}
          
        
      
    
  );
}

interface SidebarSubNavItemProps {
  subItem: SubNavItem;
  location: string;
  isSpotlight: boolean;
}

function SidebarSubNavItem({ subItem, location, isSpotlight }: SidebarSubNavItemProps) {
  const subActive = (() => {
    if (location === subItem.url) return true;
    // Handle query param URLs (e.g. /disposition-intelligence?tab=conversation-quality)
    if (subItem.url.includes('?')) {
      const [basePath, queryPart] = subItem.url.split('?');
      const locationBase = location.split('?')[0];
      if (locationBase === basePath && location.includes(queryPart)) return true;
    }
    return false;
  })();
  const hasBadge = subItem.badge?.variant === 'new' || isSpotlight;

  return (
    
      
        
          {subItem.title}
          {hasBadge && (
            
              
              New
            
          )}
        
      
    
  );
}

interface SidebarSectionProps {
  section: NavSection;
  isLastSection: boolean;
  spotlightItems: Set;
  location: string;
  isActive: (url?: string, items?: SubNavItem[]) => boolean;
  isCollapsed: boolean;
}

function SidebarSection({ section, isLastSection, spotlightItems, location, isActive, isCollapsed }: SidebarSectionProps) {
  return (
    
      {section.label && !isCollapsed && (
        
          {section.label}
        
      )}
      
        
          
            {section.items.map((item) => {
              const active = isActive(item.url, item.items);
              return (
                
              );
            })}
          
        
      
      {!isLastSection && (
        
      )}
    
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
    
      
        {/* Logo and Toggle */}
        
          
            {state === 'collapsed' ? (
              // Collapsed: Show only logo icon
              
                
                  PB
                  
                
              
            ) : (
              // Expanded: Show full logo with text
              <>
                
                  
                    
                      
                        PB
                        
                      
                    
                    
                      Pivotal B2B
                    
                  
                  
                    DemandGentic---Human-Led Strategy.AI-Powered Execution.
                  
                

                
                   toggleSidebar()}
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 p-1.5 rounded-md transition-colors"
                    title={state === 'expanded' ? 'Collapse' : 'Expand'}
                  >
                    
                  
                
              
            )}
          
        

        {/* Navigation Sections */}
        {filteredSections.map((section, sectionIndex) => (
          
        ))}
      

      {/* Footer */}
      
        
          
          {state !== 'collapsed' && Logout}
        
      
    
  );
}