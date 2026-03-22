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

const eventTypeIcons: Record = {
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

const eventTypeColors: Record = {
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

const eventTypeBadges: Record = {
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
    
      
        
      
      
        
          
            {event.type}
          
          
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
          
        
        {event.type === "clicked" && event.metadata?.url && (
          
            Link: {event.metadata.url}
          
        )}
        {event.type === "bounced" && event.metadata?.bounceReason && (
          
            {event.metadata.bounceType === "hard" ? "Hard bounce" : "Soft bounce"}:{" "}
            {event.metadata.bounceReason}
          
        )}
      
    
  );
}

function EmailSendCard({ send }: { send: EmailSend }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = eventTypeIcons[send.status] || Mail;
  const colorClass = eventTypeColors[send.status] || "text-muted-foreground";

  return (
    
       setExpanded(!expanded)}
      >
        
          
        
        
          
            
              {send.campaignName || "Email Campaign"}
            
            
              {send.status}
            
          
          {/* Contact info */}
          
            
            {send.contactName || send.contactEmail || "Unknown contact"}
          
          {send.subject && (
            
              Subject: {send.subject}
            
          )}
          
            
            {send.sentAt
              ? format(new Date(send.sentAt), "MMM d, yyyy 'at' h:mm a")
              : format(new Date(send.createdAt), "MMM d, yyyy 'at' h:mm a")}
          
        
        
          
        
      

      {expanded && send.events.length > 0 && (
        
          
            Event Timeline ({send.events.length} events)
          
          
            {send.events.map((event) => (
              
            ))}
          
        
      )}
    
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
    
      
      
        {value}
        {label}
      
    
  );
}

export interface AccountEmailActivityTimelineProps {
  accountId: string;
  className?: string;
}

export function AccountEmailActivityTimeline({ accountId, className }: AccountEmailActivityTimelineProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/accounts", accountId, "email-activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/accounts/${accountId}/email-activity`);
      return await res.json();
    },
    enabled: !!accountId,
  });

  if (isLoading) {
    return (
      
        
          
            
            Email Activity
          
        
        
          
          
          
        
      
    );
  }

  if (error) {
    return (
      
        
          
            
            Email Activity
          
        
        
          Failed to load email activity
           refetch()}>
            
            Retry
          
        
      
    );
  }

  const summary = data?.summary;
  const sends = data?.sends || [];

  return (
    
      
        
          
            
            Email Activity
          
           refetch()}>
            
          
        
      
      
        {/* Summary Stats */}
        {summary && summary.totalSent > 0 && (
          
            
            
            
            
          
        )}

        {/* Email Sends Timeline */}
        {sends.length === 0 ? (
          
            
            No email activity yet
            
              Emails sent to contacts at this account will appear here
            
          
        ) : (
          
            {sends.map((send) => (
              
            ))}
          
        )}
      
    
  );
}