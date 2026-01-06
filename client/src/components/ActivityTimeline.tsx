import { useQuery } from "@tanstack/react-query";
import { Mail, ArrowUpRight, ArrowDownLeft, Calendar, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export interface M365Activity {
  id: string;
  messageId: string;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toRecipients: string[] | null;
  ccRecipients: string[] | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  direction: 'inbound' | 'outbound';
  mailboxAccountId: string;
  accountId: string | null;
  contactId: string | null;
}

interface ActivityTimelineProps {
  accountId?: string;
  contactId?: string;
  mailboxAccountId?: string;
  limit?: number;
}

export function ActivityTimeline({ 
  accountId, 
  contactId, 
  mailboxAccountId,
  limit = 50 
}: ActivityTimelineProps) {
  const queryParams = new URLSearchParams();
  if (accountId) queryParams.set('accountId', accountId);
  if (contactId) queryParams.set('contactId', contactId);
  if (mailboxAccountId) queryParams.set('mailboxAccountId', mailboxAccountId);
  if (limit) queryParams.set('limit', limit.toString());

  const { data: activities = [], isLoading } = useQuery<M365Activity[]>({
    queryKey: ['/api/oauth/microsoft/activities', queryParams.toString()],
    enabled: !!(accountId || contactId || mailboxAccountId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center">
        <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
        <p className="text-muted-foreground font-medium">No email activities found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Email activities will appear here once Microsoft 365 sync runs
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const isInbound = activity.direction === 'inbound';
        const timestamp = new Date(activity.receivedDateTime);
        const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

        return (
          <div
            key={activity.id}
            className="flex gap-4 p-4 border rounded-lg hover-elevate"
            data-testid={`activity-${activity.id}`}
          >
            <div 
              className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isInbound 
                  ? 'bg-blue-500/10 text-blue-500' 
                  : 'bg-teal-500/10 text-teal-500'
              }`}
            >
              {isInbound ? (
                <ArrowDownLeft className="h-5 w-5" />
              ) : (
                <ArrowUpRight className="h-5 w-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={isInbound ? "default" : "secondary"} className="text-xs">
                      {isInbound ? 'Received' : 'Sent'}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {timeAgo}
                    </span>
                  </div>
                  
                  <h4 className="font-medium text-sm mb-1 truncate" title={activity.subject || '(No Subject)'}>
                    {activity.subject || '(No Subject)'}
                  </h4>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-medium text-xs">From:</span>
                  <span className="truncate">
                    {activity.fromName || activity.fromEmail}
                  </span>
                </div>

                {activity.toRecipients && activity.toRecipients.length > 0 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Users className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span className="font-medium text-xs">To:</span>
                    <span className="truncate flex-1">
                      {activity.toRecipients.slice(0, 3).join(', ')}
                      {activity.toRecipients.length > 3 && ` +${activity.toRecipients.length - 3} more`}
                    </span>
                  </div>
                )}

                {activity.ccRecipients && activity.ccRecipients.length > 0 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Users className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span className="font-medium text-xs">CC:</span>
                    <span className="truncate flex-1">
                      {activity.ccRecipients.slice(0, 2).join(', ')}
                      {activity.ccRecipients.length > 2 && ` +${activity.ccRecipients.length - 2} more`}
                    </span>
                  </div>
                )}
              </div>

              {activity.bodyPreview && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {activity.bodyPreview}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
