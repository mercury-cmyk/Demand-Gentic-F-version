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

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['/api/oauth/microsoft/activities', queryParams.toString()],
    enabled: !!(accountId || contactId || mailboxAccountId),
  });

  if (isLoading) {
    return (
      
        {[1, 2, 3].map((i) => (
          
            
            
              
              
              
            
          
        ))}
      
    );
  }

  if (activities.length === 0) {
    return (
      
        
        No email activities found
        
          Email activities will appear here once Microsoft 365 sync runs
        
      
    );
  }

  return (
    
      {activities.map((activity) => {
        const isInbound = activity.direction === 'inbound';
        const timestamp = new Date(activity.receivedDateTime);
        const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

        return (
          
            
              {isInbound ? (
                
              ) : (
                
              )}
            

            
              
                
                  
                    
                      {isInbound ? 'Received' : 'Sent'}
                    
                    
                      
                      {timeAgo}
                    
                  
                  
                  
                    {activity.subject || '(No Subject)'}
                  
                
              

              
                
                  
                  From:
                  
                    {activity.fromName || activity.fromEmail}
                  
                

                {activity.toRecipients && activity.toRecipients.length > 0 && (
                  
                    
                    To:
                    
                      {activity.toRecipients.slice(0, 3).join(', ')}
                      {activity.toRecipients.length > 3 && ` +${activity.toRecipients.length - 3} more`}
                    
                  
                )}

                {activity.ccRecipients && activity.ccRecipients.length > 0 && (
                  
                    
                    CC:
                    
                      {activity.ccRecipients.slice(0, 2).join(', ')}
                      {activity.ccRecipients.length > 2 && ` +${activity.ccRecipients.length - 2} more`}
                    
                  
                )}
              

              {activity.bodyPreview && (
                
                  
                    {activity.bodyPreview}
                  
                
              )}
            
          
        );
      })}
    
  );
}