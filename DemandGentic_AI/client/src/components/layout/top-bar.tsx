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
    
      
        
        
          
            
              PB
              
              
               
              
            
          
          
            
              Pivotal B2B
            
            
              Human-Led Strategy. AI-Powered Execution.
            
          
        
      

      
        

        {/* AgentX Toggle */}
        {agentPanel && (
          
            
              
                
                
              
            
            
              AgentX (Ctrl+/)
            
          
        )}

        
          
        

        
          
          
            3
          
        

        {/* Settings Menu - Admin Only */}
        {isAdmin && (
          
            
              
                
              
            
            
              Settings & Administration
              

              {/* All Settings Link */}
               setLocation('/settings')} data-testid="menu-all-settings">
                
                All Settings
              
              
              
              {/* Infrastructure Section */}
              
                
                  
                  Infrastructure
                
                
                   setLocation('/settings/email-management')} data-testid="menu-sender-profiles">
                    
                    Campaign Email
                  
                   setLocation('/settings/telephony')} data-testid="menu-sip-trunks">
                    
                    Telephony Settings
                  
                   setLocation('/settings/integrations')} data-testid="menu-integrations">
                    
                    Integrations & APIs
                  
                
              

              {/* Organization Section */}
              
                
                  
                  Organization
                
                
                   setLocation('/settings/users')} data-testid="menu-users">
                    
                    User & Role Management
                  
                   setLocation('/suppressions')} data-testid="menu-suppressions">
                    
                    Suppression Management
                  
                   setLocation('/settings/compliance')} data-testid="menu-compliance">
                    
                    Compliance Center
                  
                
              
            
          
        )}

        {/* User Profile Menu */}
        
          
            
              
                {initials}
              
            
          
          
            My Account
            
            Profile
            My Settings
            
            
              
              Log out
            
          
        
      
    
  );
}