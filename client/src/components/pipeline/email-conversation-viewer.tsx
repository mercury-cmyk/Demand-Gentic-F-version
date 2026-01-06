import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Mail, RefreshCw, User, Paperclip, Reply
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SendEmailDialog } from "./send-email-dialog";

interface DealMessage {
  id: string;
  conversationId: string;
  opportunityId: string;
  m365MessageId: string;
  subject: string;
  fromEmail: string;
  fromName: string | null;
  toRecipients: string[];
  ccRecipients: string[] | null;
  bodyPreview: string | null;
  sentDateTime: string;
  direction: "inbound" | "outbound";
  hasAttachments: boolean;
  createdAt: string;
}

interface DealConversation {
  id: string;
  opportunityId: string;
  subject: string;
  threadId: string | null;
  participantEmails: string[];
  messageCount: number;
  lastMessageAt: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
}

interface EmailConversationViewerProps {
  opportunityId: string;
}

export function EmailConversationViewer({ opportunityId }: EmailConversationViewerProps) {
  const { toast } = useToast();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<DealConversation[]>({
    queryKey: [`/api/opportunities/${opportunityId}/conversations`],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<DealMessage[]>({
    queryKey: [`/api/conversations/${selectedConversationId}/messages`],
    enabled: !!selectedConversationId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/m365/sync`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/conversations`] });
      toast({
        title: "Sync initiated",
        description: "Email sync has been triggered. This may take a few minutes.",
      });
    },
    onError: () => {
      toast({
        title: "Sync failed",
        description: "Failed to trigger email sync",
        variant: "destructive",
      });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Conversations
            </CardTitle>
            <CardDescription>
              M365 email threads related to this opportunity
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <SendEmailDialog opportunityId={opportunityId} />
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleSync}
              disabled={syncMutation.isPending}
              data-testid="button-sync-emails"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", syncMutation.isPending && "animate-spin")} />
              Sync
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {conversationsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading conversations...</div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No email conversations found</p>
            <p className="text-sm mt-2">Send an email or sync your inbox to see conversations</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Conversation List */}
            <div className="md:col-span-1">
              <h3 className="text-sm font-medium mb-3">
                Threads ({conversations.length})
              </h3>
              <ScrollArea className="h-[500px] pr-2">
                <div className="space-y-2">
                  {conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer hover-elevate",
                        selectedConversationId === conversation.id && "bg-muted/50 border-primary"
                      )}
                      onClick={() => setSelectedConversationId(conversation.id)}
                      data-testid={`conversation-${conversation.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-sm line-clamp-2">
                          {conversation.subject || '(No Subject)'}
                        </h4>
                        <Badge 
                          variant={conversation.direction === 'outbound' ? 'default' : 'secondary'}
                          className="flex-shrink-0"
                        >
                          {conversation.direction === 'outbound' ? 'Sent' : 'Received'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <User className="h-3 w-3" />
                        <span className="truncate">
                          {conversation.participantEmails.length} participant{conversation.participantEmails.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">
                          {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
                        </Badge>
                        <span>
                          {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Message View */}
            <div className="md:col-span-2">
              {selectedConversationId ? (
                <>
                  <div className="mb-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-medium">
                        {selectedConversation?.subject || '(No Subject)'}
                      </h3>
                      <SendEmailDialog
                        opportunityId={opportunityId}
                        conversationId={selectedConversation?.id}
                        threadId={selectedConversation?.threadId || undefined}
                        replyToSubject={selectedConversation?.subject}
                        trigger={
                          <Button size="sm" variant="outline" data-testid="button-reply-email">
                            <Reply className="h-3 w-3 mr-2" />
                            Reply
                          </Button>
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">
                        {selectedConversation?.participantEmails.join(', ')}
                      </span>
                    </div>
                  </div>
                  <Separator className="mb-4" />
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-muted-foreground">Loading messages...</div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No messages in this conversation</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <div
                            key={message.id}
                            className={cn(
                              "p-4 rounded-lg border",
                              message.direction === 'outbound' && "bg-primary/5 border-primary/20"
                            )}
                            data-testid={`message-${message.id}`}
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                                message.direction === 'outbound' 
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {getInitials(message.fromName || message.fromEmail)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-sm">
                                        {message.fromName || message.fromEmail}
                                      </p>
                                      <Badge 
                                        variant={message.direction === 'outbound' ? 'default' : 'secondary'}
                                        className="text-xs"
                                      >
                                        {message.direction === 'outbound' ? 'You' : 'Them'}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {message.fromEmail}
                                    </p>
                                  </div>
                                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                                    {format(new Date(message.sentDateTime), 'MMM d, h:mm a')}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                  <span>To: {message.toRecipients.join(', ')}</span>
                                </div>
                                {message.ccRecipients && message.ccRecipients.length > 0 && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                    <span>Cc: {message.ccRecipients.join(', ')}</span>
                                  </div>
                                )}
                                {message.hasAttachments && (
                                  <Badge variant="outline" className="text-xs mb-2">
                                    <Paperclip className="h-3 w-3 mr-1" />
                                    Has Attachments
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {message.bodyPreview && (
                              <div className="text-sm pl-11">
                                {message.bodyPreview}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-[500px] text-muted-foreground">
                  <div className="text-center">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a conversation to view messages</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
