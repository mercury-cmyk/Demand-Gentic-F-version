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
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: [`/api/opportunities/${opportunityId}/conversations`],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
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
    
      
        
          
            
              
              Email Conversations
            
            
              M365 email threads related to this opportunity
            
          
          
            
            
              
              Sync
            
          
        
      
      
        {conversationsLoading ? (
          
            Loading conversations...
          
        ) : conversations.length === 0 ? (
          
            
            No email conversations found
            Send an email or sync your inbox to see conversations
          
        ) : (
          
            {/* Conversation List */}
            
              
                Threads ({conversations.length})
              
              
                
                  {conversations.map((conversation) => (
                     setSelectedConversationId(conversation.id)}
                      data-testid={`conversation-${conversation.id}`}
                    >
                      
                        
                          {conversation.subject || '(No Subject)'}
                        
                        
                          {conversation.direction === 'outbound' ? 'Sent' : 'Received'}
                        
                      
                      
                        
                        
                          {conversation.participantEmails.length} participant{conversation.participantEmails.length !== 1 ? 's' : ''}
                        
                      
                      
                        
                          {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
                        
                        
                          {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                        
                      
                    
                  ))}
                
              
            

            {/* Message View */}
            
              {selectedConversationId ? (
                <>
                  
                    
                      
                        {selectedConversation?.subject || '(No Subject)'}
                      
                      
                            
                            Reply
                          
                        }
                      />
                    
                    
                      
                      
                        {selectedConversation?.participantEmails.join(', ')}
                      
                    
                  
                  
                  {messagesLoading ? (
                    
                      Loading messages...
                    
                  ) : messages.length === 0 ? (
                    
                      No messages in this conversation
                    
                  ) : (
                    
                      
                        {messages.map((message) => (
                          
                            
                              
                                {getInitials(message.fromName || message.fromEmail)}
                              
                              
                                
                                  
                                    
                                      
                                        {message.fromName || message.fromEmail}
                                      
                                      
                                        {message.direction === 'outbound' ? 'You' : 'Them'}
                                      
                                    
                                    
                                      {message.fromEmail}
                                    
                                  
                                  
                                    {format(new Date(message.sentDateTime), 'MMM d, h:mm a')}
                                  
                                
                                
                                  To: {message.toRecipients.join(', ')}
                                
                                {message.ccRecipients && message.ccRecipients.length > 0 && (
                                  
                                    Cc: {message.ccRecipients.join(', ')}
                                  
                                )}
                                {message.hasAttachments && (
                                  
                                    
                                    Has Attachments
                                  
                                )}
                              
                            
                            {message.bodyPreview && (
                              
                                {message.bodyPreview}
                              
                            )}
                          
                        ))}
                      
                    
                  )}
                
              ) : (
                
                  
                    
                    Select a conversation to view messages
                  
                
              )}
            
          
        )}
      
    
  );
}