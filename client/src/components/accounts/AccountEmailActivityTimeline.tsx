import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Send,
  CheckCircle,
  Eye,
  MousePointer,
  AlertTriangle,
  Ban,
  AlertCircle,
  Clock,
  RefreshCcw,
  ChevronDown,
  Inbox,
  User,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface EmailActivityEvent {
  id: string;
  sendId: string;
  type: string;
  createdAt: string;
  metadata?: {
    campaignId?: string;
    campaignName?: string;
    subject?: string;
    url?: string;
    bounceType?: string;
    bounceReason?: string;
    provider?: string;
    contactId?: string;
    contactName?: string;
    contactEmail?: string;
  };
}

interface EmailSend {
  id: string;
  campaignId: string;
  campaignName?: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  templateName?: string;
  status: string;
  subject?: string;
  sentAt?: string;
  createdAt: string;
  events: EmailActivityEvent[];
}

interface AccountEmailActivityResponse {
  accountId: string;
  sends: EmailSend[];
  summary: {
    totalSent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    uniqueContacts: number;
  };
}

const eventTypeIcons: Record<string, React.ElementType> = {
  pending: Send,
  sent: Send,
  delivered: CheckCircle,
  opened: Eye,
  clicked: MousePointer,
  failed: AlertTriangle,
  bounced: AlertTriangle,
  complained: AlertCircle,
  unsubscribed: Ban,
};

const eventTypeColors: Record<string, string> = {
  pending: "text-slate-500",
  sent: "text-blue-500",
  delivered: "text-emerald-500",
  opened: "text-purple-500",
  clicked: "text-indigo-500",
  failed: "text-red-500",
  bounced: "text-red-500",
  complained: "text-amber-600",
  unsubscribed: "text-orange-500",
};

const eventTypeBadges: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  sent: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  opened: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  clicked: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
  bounced: "bg-red-500/10 text-red-600 border-red-500/20",
  complained: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  unsubscribed: "bg-orange-500/10 text-orange-600 border-orange-500/20",
};

function EmailEventItem({ event }: { event: EmailActivityEvent }) {
  const Icon = eventTypeIcons[event.type] || Mail;
  const colorClass = eventTypeColors[event.type] || "text-muted-foreground";

  return (
    <div className="flex items-start gap-3 py-2">
      <div className={cn("mt-0.5", colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", eventTypeBadges[event.type])}>
            {event.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
          </span>
        </div>
        {event.type === "clicked" && event.metadata?.url && (
          <div className="mt-1 text-xs text-muted-foreground truncate">
            Link: {event.metadata.url}
          </div>
        )}
        {event.type === "bounced" && event.metadata?.bounceReason && (
          <div className="mt-1 text-xs text-red-600/80">
            {event.metadata.bounceType === "hard" ? "Hard bounce" : "Soft bounce"}:{" "}
            {event.metadata.bounceReason}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailSendCard({ send }: { send: EmailSend }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = eventTypeIcons[send.status] || Mail;
  const colorClass = eventTypeColors[send.status] || "text-muted-foreground";

  return (
    <div className="border rounded-lg overflow-hidden bg-background/50">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("mt-0.5", colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {send.campaignName || "Email Campaign"}
            </span>
            <Badge variant="outline" className={cn("text-xs", eventTypeBadges[send.status])}>
              {send.status}
            </Badge>
          </div>
          {/* Contact info */}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{send.contactName || send.contactEmail || "Unknown contact"}</span>
          </div>
          {send.subject && (
            <div className="text-sm text-muted-foreground truncate mt-0.5">
              Subject: {send.subject}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {send.sentAt
              ? format(new Date(send.sentAt), "MMM d, yyyy 'at' h:mm a")
              : format(new Date(send.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
          />
        </Button>
      </div>

      {expanded && send.events.length > 0 && (
        <div className="border-t bg-muted/10 px-3 py-2">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Event Timeline ({send.events.length} events)
          </div>
          <div className="space-y-1 pl-2 border-l-2 border-border/50">
            {send.events.map((event) => (
              <EmailEventItem key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  colorClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", colorClass)} />
      <div>
        <div className="text-lg font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export interface AccountEmailActivityTimelineProps {
  accountId: string;
  className?: string;
}

export function AccountEmailActivityTimeline({ accountId, className }: AccountEmailActivityTimelineProps) {
  const { data, isLoading, error, refetch } = useQuery<AccountEmailActivityResponse>({
    queryKey: ["/api/accounts", accountId, "email-activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/accounts/${accountId}/email-activity`);
      return await res.json();
    },
    enabled: !!accountId,
  });

  if (isLoading) {
    return (
      <Card className={cn("shadow-md border-0", className)}>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("shadow-md border-0", className)}>
        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">Failed to load email activity</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const sends = data?.sends || [];

  return (
    <Card className={cn("shadow-md border-0", className)}>
      <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Activity
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Summary Stats */}
        {summary && summary.totalSent > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-4 p-3 rounded-lg bg-muted/30">
            <SummaryStat
              label="Sent"
              value={summary.totalSent}
              icon={Send}
              colorClass="text-blue-500"
            />
            <SummaryStat
              label="Contacts"
              value={summary.uniqueContacts}
              icon={User}
              colorClass="text-slate-500"
            />
            <SummaryStat
              label="Opened"
              value={summary.opened}
              icon={Eye}
              colorClass="text-purple-500"
            />
            <SummaryStat
              label="Clicked"
              value={summary.clicked}
              icon={MousePointer}
              colorClass="text-indigo-500"
            />
          </div>
        )}

        {/* Email Sends Timeline */}
        {sends.length === 0 ? (
          <div className="text-center py-8">
            <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No email activity yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Emails sent to contacts at this account will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {sends.map((send) => (
              <EmailSendCard key={send.id} send={send} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
