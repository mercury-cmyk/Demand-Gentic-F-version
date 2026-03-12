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
      <button
        onClick={() => onFolderChange(folder.id)}
        className={cn(
          "flex items-center gap-2.5 w-full rounded-md text-sm font-medium transition-colors",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
          isActive
            ? "bg-accent text-accent-foreground border-l-2 border-l-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
      >
        <Icon className={cn("h-4 w-4 flex-shrink-0", isActive && "text-primary")} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{folder.label}</span>
            {folder.badge != null && folder.badge > 0 && (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 px-1.5 text-[10px] font-semibold"
              >
                {folder.badge > 99 ? "99+" : folder.badge}
              </Badge>
            )}
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              {folder.label}
              {folder.badge != null && folder.badge > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {folder.badge}
                </Badge>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r bg-muted/30 transition-all duration-200",
        collapsed ? "w-[52px]" : "w-[200px]"
      )}
    >
      {/* Compose button */}
      <div className={cn("p-2", collapsed && "flex justify-center")}>
        {collapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" className="h-9 w-9" onClick={onCompose}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Compose</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button className="w-full justify-start gap-2" size="sm" onClick={onCompose}>
            <Plus className="h-4 w-4" />
            Compose
          </Button>
        )}
      </div>

      <Separator />

      {/* Folder list */}
      <nav className="flex-1 p-1.5 space-y-0.5 overflow-y-auto">
        {folders.map((f) => (
          <FolderButton key={f.id} folder={f} />
        ))}
      </nav>

      <Separator />

      {/* Bottom section */}
      <div className={cn("p-2 space-y-1", collapsed && "flex flex-col items-center")}>
        {/* Connection dots */}
        {!collapsed && (gmailConnected || m365Connected) && (
          <div className="flex items-center gap-2 px-3 py-1">
            {gmailConnected && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Gmail
              </div>
            )}
            {m365Connected && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                Outlook
              </div>
            )}
          </div>
        )}
        {collapsed && (gmailConnected || m365Connected) && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex gap-1 py-1">
                  {gmailConnected && <div className="h-2 w-2 rounded-full bg-green-500" />}
                  {m365Connected && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {gmailConnected && "Gmail connected"}
                {gmailConnected && m365Connected && " · "}
                {m365Connected && "Outlook connected"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Settings */}
        {collapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}>
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        )}

        {/* Collapse toggle */}
        {collapsed ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleCollapse}>
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose className="h-4 w-4" />
            Collapse
          </Button>
        )}
      </div>
    </div>
  );
}
