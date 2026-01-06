import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Mail,
  Phone,
  MessageSquare,
  FileText,
  UserPlus,
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
  type: "email" | "call" | "note" | "task" | "edit" | "create" | "delete" | "qa" | "custom";
  title: string;
  description?: string;
  timestamp: Date | string;
  user?: {
    name: string;
    avatar?: string;
  };
  icon?: LucideIcon;
  status?: "success" | "warning" | "error" | "info";
  metadata?: Record<string, any>;
  children?: ReactNode;
}

export interface ActivityTimelineProps {
  items: ActivityItem[];
  className?: string;
  showAvatar?: boolean;
  compact?: boolean;
  filterTypes?: ActivityItem["type"][];
}

const activityIcons: Record<ActivityItem["type"], LucideIcon> = {
  email: Mail,
  call: Phone,
  note: MessageSquare,
  task: FileText,
  edit: Edit,
  create: UserPlus,
  delete: Trash,
  qa: Check,
  custom: Clock,
};

const activityColors: Record<ActivityItem["type"], string> = {
  email: "text-info",
  call: "text-success",
  note: "text-warning",
  task: "text-primary",
  edit: "text-accent",
  create: "text-success",
  delete: "text-destructive",
  qa: "text-primary",
  custom: "text-muted-foreground",
};

const statusColors: Record<string, string> = {
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
      <div 
        className="flex flex-col items-center justify-center py-12 text-center"
        data-testid="activity-timeline-empty"
        role="status"
        aria-label="No activity"
      >
        <Clock className="h-12 w-12 text-muted-foreground mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)} data-testid="activity-timeline">
      {filteredItems.map((item, index) => {
        const Icon = item.icon || activityIcons[item.type];
        const iconColor = statusColors[item.status || ""] || activityColors[item.type];
        const isLast = index === filteredItems.length - 1;
        const timestamp =
          typeof item.timestamp === "string"
            ? new Date(item.timestamp)
            : item.timestamp;

        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="relative"
            data-testid={`activity-item-${item.type}`}
          >
            {/* Connecting line */}
            {!isLast && (
              <div className="absolute left-4 top-10 w-0.5 h-full -ml-px bg-border" />
            )}

            <div className="flex gap-4">
              {/* Icon/Avatar */}
              <div className="relative flex-shrink-0">
                {showAvatar && item.user ? (
                  <Avatar className="h-8 w-8 border-2 border-background">
                    {item.user.avatar && <AvatarImage src={item.user.avatar} />}
                    <AvatarFallback className="text-xs">
                      {item.user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full bg-muted relative z-10",
                      iconColor
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "font-medium text-foreground",
                        compact ? "text-sm" : "text-base"
                      )}
                    >
                      {item.title}
                    </p>
                    {item.description && (
                      <p
                        className={cn(
                          "text-muted-foreground mt-1",
                          compact ? "text-xs" : "text-sm"
                        )}
                      >
                        {item.description}
                      </p>
                    )}
                    {item.user && (
                      <p className="text-xs text-muted-foreground mt-1">
                        by {item.user.name}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status && (
                      <Badge
                        variant={
                          item.status === "success"
                            ? "default"
                            : item.status === "error"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {item.status}
                      </Badge>
                    )}
                    <time
                      className="text-xs text-muted-foreground whitespace-nowrap"
                      dateTime={timestamp.toISOString()}
                      title={timestamp.toLocaleString()}
                    >
                      {formatDistanceToNow(timestamp, { addSuffix: true })}
                    </time>
                  </div>
                </div>

                {/* Metadata */}
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-3 space-y-1">
                    {Object.entries(item.metadata).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/_/g, " ")}:
                        </span>
                        <span className="font-medium text-foreground">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Custom children content */}
                {item.children && <div className="mt-3">{item.children}</div>}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
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
    <div
      className={cn(
        "flex items-center gap-2 text-sm p-2 rounded-md hover:bg-accent/50 transition-colors",
        className
      )}
      data-testid="compact-activity-item"
    >
      <div
        className={cn(
          "flex items-center justify-center w-6 h-6 rounded-full bg-muted",
          status === "success" && "text-success",
          status === "warning" && "text-warning",
          status === "error" && "text-destructive"
        )}
      >
        <Icon className="h-3 w-3" />
      </div>
      <span className="flex-1 min-w-0 truncate text-foreground">{label}</span>
      <time className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDistanceToNow(time, { addSuffix: true })}
      </time>
    </div>
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
    <div
      className={cn("flex items-center gap-4 flex-wrap", className)}
      data-testid="activity-summary"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex items-center gap-2">
            <div className={cn("flex items-center justify-center", item.color)}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-sm text-muted-foreground">
              {item.count} {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
