import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Inbox, Mail, Star, Send, FileEdit, Clock, Trash2, Archive,
  Settings, PanelLeftClose, PanelLeft, Plus,
} from "lucide-react";

export type InboxFolder =
  | "inbox"
  | "other"
  | "starred"
  | "sent"
  | "drafts"
  | "scheduled"
  | "trash"
  | "archive";

interface FolderItem {
  id: InboxFolder;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

interface InboxSidebarProps {
  activeFolder: InboxFolder;
  onFolderChange: (folder: InboxFolder) => void;
  onCompose: () => void;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  stats: {
    primaryUnread: number;
    otherUnread: number;
    draftsCount: number;
    scheduledCount: number;
  };
  /** small coloured dots: gmail connected, m365 connected */
  gmailConnected?: boolean;
  m365Connected?: boolean;
}

export function InboxSidebar({
  activeFolder,
  onFolderChange,
  onCompose,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
  stats,
  gmailConnected,
  m365Connected,
}: InboxSidebarProps) {
  const folders: FolderItem[] = [
    { id: "inbox", label: "Inbox", icon: Inbox, badge: stats.primaryUnread || undefined },
    { id: "other", label: "Other", icon: Mail, badge: stats.otherUnread || undefined },
    { id: "starred", label: "Starred", icon: Star },
    { id: "sent", label: "Sent", icon: Send },
    { id: "drafts", label: "Drafts", icon: FileEdit, badge: stats.draftsCount || undefined },
    { id: "scheduled", label: "Scheduled", icon: Clock, badge: stats.scheduledCount || undefined },
    { id: "trash", label: "Trash", icon: Trash2 },
    { id: "archive", label: "Archive", icon: Archive },
  ];

  const FolderButton = ({ folder }: { folder: FolderItem }) => {
    const isActive = activeFolder === folder.id;
    const Icon = folder.icon;

    const button = (
       onFolderChange(folder.id)}
        className={cn(
          "flex items-center gap-2.5 w-full rounded-md text-sm font-medium transition-colors",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
          isActive
            ? "bg-accent text-accent-foreground border-l-2 border-l-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
      >
        
        {!collapsed && (
          <>
            {folder.label}
            {folder.badge != null && folder.badge > 0 && (
              
                {folder.badge > 99 ? "99+" : folder.badge}
              
            )}
          
        )}
      
    );

    if (collapsed) {
      return (
        
          
            {button}
            
              {folder.label}
              {folder.badge != null && folder.badge > 0 && (
                
                  {folder.badge}
                
              )}
            
          
        
      );
    }

    return button;
  };

  return (
    
      {/* Compose button */}
      
        {collapsed ? (
          
            
              
                
                  
                
              
              Compose
            
          
        ) : (
          
            
            Compose
          
        )}
      

      

      {/* Folder list */}
      
        {folders.map((f) => (
          
        ))}
      

      

      {/* Bottom section */}
      
        {/* Connection dots */}
        {!collapsed && (gmailConnected || m365Connected) && (
          
            {gmailConnected && (
              
                
                Gmail
              
            )}
            {m365Connected && (
              
                
                Outlook
              
            )}
          
        )}
        {collapsed && (gmailConnected || m365Connected) && (
          
            
              
                
                  {gmailConnected && }
                  {m365Connected && }
                
              
              
                {gmailConnected && "Gmail connected"}
                {gmailConnected && m365Connected && " · "}
                {m365Connected && "Outlook connected"}
              
            
          
        )}

        {/* Settings */}
        {collapsed ? (
          
            
              
                
                  
                
              
              Settings
            
          
        ) : (
          
            
            Settings
          
        )}

        {/* Collapse toggle */}
        {collapsed ? (
          
            
              
                
                  
                
              
              Expand sidebar
            
          
        ) : (
          
            
            Collapse
          
        )}
      
    
  );
}