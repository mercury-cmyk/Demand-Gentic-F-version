import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users,
  Building2,
  Mail,
  ListChecks,
  LayoutDashboard,
  Settings,
  Search,
  Moon,
  Sun,
  UserPlus,
  KanbanSquare,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface CommandAction {
  id: string;
  label: string;
  icon: React.ElementType;
  onSelect: () => void;
  section?: string;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { setTheme } = useTheme();

  // Toggle command palette with ⌘K (Mac) or Ctrl+K (Windows/Linux)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false);
    callback();
  }, []);

  const navigationActions: CommandAction[] = [
    {
      id: "nav-dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      onSelect: () => navigate("/"),
      section: "Navigation",
      keywords: ["home", "overview", "analytics"],
    },
    {
      id: "nav-accounts",
      label: "Accounts",
      icon: Building2,
      onSelect: () => navigate("/accounts"),
      section: "Navigation",
      keywords: ["companies", "organizations"],
    },
    {
      id: "nav-contacts",
      label: "Contacts",
      icon: Users,
      onSelect: () => navigate("/contacts"),
      section: "Navigation",
      keywords: ["people", "leads"],
    },
    {
      id: "nav-campaigns",
      label: "Campaigns",
      icon: Mail,
      onSelect: () => navigate("/campaigns"),
      section: "Navigation",
      keywords: ["email", "marketing"],
    },
    {
      id: "nav-leads",
      label: "Leads & QA",
      icon: ListChecks,
      onSelect: () => navigate("/leads"),
      section: "Navigation",
      keywords: ["quality", "review", "qa"],
    },
    {
      id: "nav-pivotal-pipeline",
      label: "Pivotal Pipeline",
      icon: KanbanSquare,
      onSelect: () => navigate("/pipeline/pivotal"),
      section: "Navigation",
      keywords: ["crm", "opportunities", "pipeline"],
    },
    {
      id: "nav-settings",
      label: "Settings",
      icon: Settings,
      onSelect: () => navigate("/settings"),
      section: "Navigation",
      keywords: ["preferences", "configuration"],
    },
  ];

  const quickActions: CommandAction[] = [
    {
      id: "action-new-campaign",
      label: "New Campaign",
      icon: Mail,
      onSelect: () => navigate("/campaigns/create"),
      section: "Quick Actions",
      keywords: ["create", "add", "email", "phone", "campaign"],
    },
    {
      id: "action-invite-user",
      label: "Invite User",
      icon: UserPlus,
      onSelect: () => navigate("/settings/users"),
      section: "Quick Actions",
      keywords: ["add", "team", "member"],
    },
    {
      id: "action-open-pipeline",
      label: "Open Pivotal Pipeline",
      icon: KanbanSquare,
      onSelect: () => navigate("/pipeline/pivotal"),
      section: "Quick Actions",
      keywords: ["crm", "opportunities", "sales"],
    },
  ];

  const themeActions: CommandAction[] = [
    {
      id: "theme-light",
      label: "Light Mode",
      icon: Sun,
      onSelect: () => setTheme("light"),
      section: "Theme",
      keywords: ["appearance"],
    },
    {
      id: "theme-dark",
      label: "Dark Mode",
      icon: Moon,
      onSelect: () => setTheme("dark"),
      section: "Theme",
      keywords: ["appearance"],
    },
  ];

  const allActions = [...navigationActions, ...quickActions, ...themeActions];

  // Group actions by section
  const actionsBySection = allActions.reduce((acc, action) => {
    const section = action.section || "Other";
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(action);
    return acc;
  }, {} as Record);

  return (
    
      
      
        No results found.
        
        {Object.entries(actionsBySection).map(([section, actions], sectionIndex) => (
          
            {sectionIndex > 0 && }
            
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                   handleSelect(action.onSelect)}
                    data-testid={`command-${action.id}`}
                  >
                    
                    {action.label}
                  
                );
              })}
            
          
        ))}
      
    
  );
}

export function CommandPaletteButton() {
  const [, setOpen] = useState(false);

  return (
     setOpen(true)}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
      data-testid="button-open-command-palette"
    >
      
      Search
      
        ⌘K
      
    
  );
}