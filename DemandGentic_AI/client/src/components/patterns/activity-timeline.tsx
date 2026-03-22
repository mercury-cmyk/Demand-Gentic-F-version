import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  MessageSquare,
  FileText,
  UserPlus,
  Megaphone,
  Edit,
  Trash,
  Check,
  X,
  Clock,
  LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export interface ActivityItem {
  id: string;
  type: "email" | "call" | "note" | "task" | "campaign" | "edit" | "create" | "delete" | "qa" | "custom";
  title: string;
  description?: string;
  timestamp: Date | string;
  user?: {
    name: string;
    avatar?: string;
  };
  icon?: LucideIcon;
  status?: "success" | "warning" | "error" | "info";
  metadata?: Record;
  children?: ReactNode;
}

export interface ActivityTimelineProps {
  items: ActivityItem[];
  className?: string;
  showAvatar?: boolean;
  compact?: boolean;
  filterTypes?: ActivityItem["type"][];
}

const activityIcons: Record = {
  email: Mail,
  call: Phone,
  note: MessageSquare,
  task: FileText,
  campaign: Megaphone,
  edit: Edit,
  create: UserPlus,
  delete: Trash,
  qa: Check,
  custom: Clock,
};

const activityColors: Record = {
  email: "text-info",
  call: "text-success",
  note: "text-warning",
  task: "text-primary",
  campaign: "text-accent",
  edit: "text-accent",
  create: "text-success",
  delete: "text-destructive",
  qa: "text-primary",
  custom: "text-muted-foreground",
};

const statusColors: Record = {
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
  info: "text-info",
};

export function ActivityTimeline({
  items,
  className,
  showAvatar = true,
  compact = false,
  filterTypes,
}: ActivityTimelineProps) {
  const filteredItems = filterTypes
    ? items.filter((item) => filterTypes.includes(item.type))
    : items;

  if (filteredItems.length === 0) {
    return (
      
        
        No activity yet
      
    );
  }

  return (
    
      {filteredItems.map((item, index) => {
        const Icon = item.icon || activityIcons[item.type];
        const iconColor = statusColors[item.status || ""] || activityColors[item.type];
        const isLast = index === filteredItems.length - 1;
        const timestamp =
          typeof item.timestamp === "string"
            ? new Date(item.timestamp)
            : item.timestamp;

        return (
          
            {/* Connecting line */}
            {!isLast && (
              
            )}

            
              {/* Icon/Avatar */}
              
                {showAvatar && item.user ? (
                  
                    {item.user.avatar && }
                    
                      {item.user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    
                  
                ) : (
                  
                    
                  
                )}
              

              {/* Content */}
              
                
                  
                    
                      {item.title}
                    
                    {item.description && (
                      
                        {item.description}
                      
                    )}
                    {item.user && (
                      
                        by {item.user.name}
                      
                    )}
                  

                  
                    {item.status && (
                      
                        {item.status}
                      
                    )}
                    
                      {formatDistanceToNow(timestamp, { addSuffix: true })}
                    
                  
                

                {/* Metadata */}
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  
                    {Object.entries(item.metadata).map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, " ")}:
                        
                        
                          {String(value)}
                        
                      
                    ))}
                  
                )}

                {/* Custom children content */}
                {item.children && {item.children}}
              
            
          
        );
      })}
    
  );
}

// Compact activity item for inline display
export interface CompactActivityItemProps {
  icon: LucideIcon;
  label: string;
  timestamp: Date | string;
  status?: "success" | "warning" | "error";
  className?: string;
}

export function CompactActivityItem({
  icon: Icon,
  label,
  timestamp,
  status,
  className,
}: CompactActivityItemProps) {
  const time =
    typeof timestamp === "string" ? new Date(timestamp) : timestamp;

  return (
    
      
        
      
      {label}
      
        {formatDistanceToNow(time, { addSuffix: true })}
      
    
  );
}

// Activity summary component for showing counts
export interface ActivitySummaryProps {
  emailCount?: number;
  callCount?: number;
  noteCount?: number;
  taskCount?: number;
  className?: string;
}

export function ActivitySummary({
  emailCount = 0,
  callCount = 0,
  noteCount = 0,
  taskCount = 0,
  className,
}: ActivitySummaryProps) {
  const items = [
    { icon: Mail, count: emailCount, label: "Emails", color: "text-info" },
    { icon: Phone, count: callCount, label: "Calls", color: "text-success" },
    { icon: MessageSquare, count: noteCount, label: "Notes", color: "text-warning" },
    { icon: FileText, count: taskCount, label: "Tasks", color: "text-primary" },
  ].filter((item) => item.count > 0);

  if (items.length === 0) {
    return null;
  }

  return (
    
      {items.map((item) => {
        const Icon = item.icon;
        return (
          
            
              
            
            
              {item.count} {item.label}
            
          
        );
      })}
    
  );
}