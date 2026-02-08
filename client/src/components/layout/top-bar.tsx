import { Bell, HelpCircle, LogOut, Settings, Mail, Phone, Zap, UserCog, ShieldCheck, Database, Bot, GitBranch } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAgentPanelContextOptional } from "@/components/agent-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar({ userName = "Admin User", userRoles = ["admin"] }: { userName?: string; userRoles?: string[] }) {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase();

  const isAdmin = userRoles.includes('admin');
  const agentPanel = useAgentPanelContextOptional();

  const handleLogout = () => {
    logout();
    setLocation('/login');
  };

  return (
    <header className="flex items-center justify-between gap-2 sm:gap-4 border-b border-border/60 bg-background/70 backdrop-blur-xl px-4 py-2.5 shadow-xs">
      <div className="flex items-center gap-2 sm:gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors" />
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shrink-0">
            <div className="relative flex items-center justify-center">
              <span className="font-bold text-sm text-primary tracking-tighter">DG</span>
              <GitBranch className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5 hidden" />
              <div className="h-2 w-2 text-blue-500 absolute -top-1 -right-1.5">
               <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sparkles"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3 4 6 1 7l3 1 1 3 1-3 3-1-3-1-1-3Z"/><path d="M21 17l-1 3-3 1 3 1 1 3 1-3 3-1-3-1-1-3Z"/></svg>
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-foreground/90">
              DemandGentic.ai
            </span>
            <span className="hidden sm:inline text-[10px] text-muted-foreground leading-none">
              Human Intel, AI Execute By Pivotal B2B
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />

        {/* AgentX Toggle */}
        {agentPanel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={agentPanel.togglePanel}
                className={cn(
                  "relative hover:bg-accent/70 transition-all duration-200",
                  agentPanel.state.isOpen && "bg-primary/10 text-primary"
                )}
                data-testid="button-agent-panel"
              >
                <Bot className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>AgentX (Ctrl+/)</p>
            </TooltipContent>
          </Tooltip>
        )}

        <Button variant="ghost" size="icon" className="hidden sm:flex hover:bg-accent/70 transition-all duration-200" data-testid="button-help">
          <HelpCircle className="h-5 w-5" />
        </Button>

        <Button variant="ghost" size="icon" className="relative hover:bg-accent/70 transition-all duration-200" data-testid="button-notifications">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center p-0 text-[10px] sm:text-xs animate-pulse-glow"
          >
            3
          </Badge>
        </Button>

        {/* Settings Menu - Admin Only */}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-settings">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Settings & Administration</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* All Settings Link */}
              <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="menu-all-settings">
                <Settings className="mr-2 h-4 w-4" />
                All Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              
              {/* Infrastructure Section */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="menu-infrastructure">
                  <Zap className="mr-2 h-4 w-4" />
                  Infrastructure
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setLocation('/email-infrastructure/sender-profiles')} data-testid="menu-sender-profiles">
                    <Mail className="mr-2 h-4 w-4" />
                    Email Infrastructure
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/telephony/sip-trunks')} data-testid="menu-sip-trunks">
                    <Phone className="mr-2 h-4 w-4" />
                    Telephony
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/settings/integrations')} data-testid="menu-integrations">
                    <Zap className="mr-2 h-4 w-4" />
                    Integrations & APIs
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Organization Section */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="menu-organization">
                  <Settings className="mr-2 h-4 w-4" />
                  Organization
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setLocation('/settings/users')} data-testid="menu-users">
                    <UserCog className="mr-2 h-4 w-4" />
                    User & Role Management
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/suppressions')} data-testid="menu-suppressions">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Suppression Management
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/settings/compliance')} data-testid="menu-compliance">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Compliance Center
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-profile">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-profile">Profile</DropdownMenuItem>
            <DropdownMenuItem data-testid="menu-my-settings">My Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
