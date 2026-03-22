import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, X, AlertCircle, Send, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
}

interface MailboxAccount {
  id: string;
  mailboxEmail: string;
  displayName?: string;
  isActive: boolean;
}

interface SendEmailDialogProps {
  opportunityId: string;
  trigger?: React.ReactNode;
  conversationId?: string;
  threadId?: string;
  replyToSubject?: string;
}

export function SendEmailDialog({ 
  opportunityId, 
  trigger, 
  conversationId,
  threadId,
  replyToSubject
}: SendEmailDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toRecipients, setToRecipients] = useState([]);
  const [ccRecipients, setCcRecipients] = useState([]);
  const [newTo, setNewTo] = useState("");
  const [newCc, setNewCc] = useState("");

  const { data: contacts = [] } = useQuery({
    queryKey: [`/api/opportunities/${opportunityId}/contacts`],
    enabled: open,
  });

  const { data: mailboxes = [] } = useQuery({
    queryKey: ['/api/m365/mailboxes'],
    enabled: open,
  });

  const activeMailboxes = mailboxes.filter(m => m.isActive);

  useEffect(() => {
    if (open && contacts.length > 0 && toRecipients.length === 0) {
      const primaryContact = contacts.find(c => c.email);
      if (primaryContact?.email) {
        setToRecipients([primaryContact.email]);
      }
    }
  }, [open, contacts, toRecipients.length]);

  useEffect(() => {
    if (open && activeMailboxes.length > 0 && !selectedMailbox) {
      setSelectedMailbox(activeMailboxes[0].id);
    }
  }, [open, activeMailboxes, selectedMailbox]);

  useEffect(() => {
    if (replyToSubject && open) {
      const hasRe = replyToSubject.toLowerCase().startsWith('re:');
      setSubject(hasRe ? replyToSubject : `Re: ${replyToSubject}`);
    }
  }, [replyToSubject, open]);

  const sendMutation = useMutation({
    mutationFn: async (data: {
      to: string[];
      cc?: string[];
      subject: string;
      body: string;
      mailboxAccountId: string;
      threadId?: string;
    }) => {
      return await apiRequest("POST", `/api/opportunities/${opportunityId}/emails/send`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/conversations`] });
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${conversationId}/messages`] });
      }
      toast({
        title: "Email sent",
        description: "Your email has been sent successfully",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error.message || "An error occurred while sending the email",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setSubject("");
    setBody("");
    setToRecipients([]);
    setCcRecipients([]);
    setNewTo("");
    setNewCc("");
  };

  const addToRecipient = (email: string) => {
    const trimmed = email.trim();
    if (trimmed && !toRecipients.includes(trimmed)) {
      setToRecipients([...toRecipients, trimmed]);
      setNewTo("");
    }
  };

  const addCcRecipient = (email: string) => {
    const trimmed = email.trim();
    if (trimmed && !ccRecipients.includes(trimmed)) {
      setCcRecipients([...ccRecipients, trimmed]);
      setNewCc("");
    }
  };

  const removeToRecipient = (email: string) => {
    setToRecipients(toRecipients.filter(e => e !== email));
  };

  const removeCcRecipient = (email: string) => {
    setCcRecipients(ccRecipients.filter(e => e !== email));
  };

  const handleSubmit = () => {
    if (toRecipients.length === 0) {
      toast({
        title: "No recipients",
        description: "Please add at least one recipient",
        variant: "destructive",
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        title: "No subject",
        description: "Please enter an email subject",
        variant: "destructive",
      });
      return;
    }

    if (!selectedMailbox) {
      toast({
        title: "No mailbox selected",
        description: "Please select a mailbox to send from",
        variant: "destructive",
      });
      return;
    }

    sendMutation.mutate({
      to: toRecipients,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      subject: subject.trim(),
      body: body.trim(),
      mailboxAccountId: selectedMailbox,
      threadId: threadId || undefined,
    });
  };

  return (
    
      
        {trigger || (
          
            
            Send Email
          
        )}
      
      
        
          
            {threadId ? 'Reply to Email' : 'Send Email'}
          
          
            {threadId 
              ? 'Reply to this email thread and track it in this opportunity'
              : 'Send an email and automatically track it in this opportunity'
            }
          
        

        
          {activeMailboxes.length === 0 ? (
            
              
              
                No connected mailbox found. Please connect your Microsoft 365 account first.
              
            
          ) : (
            <>
              
                From
                
                  
                    
                  
                  
                    {activeMailboxes.map((mailbox) => (
                      
                        {mailbox.displayName || mailbox.mailboxEmail}
                      
                    ))}
                  
                
              

              
                To
                
                  {contacts.length > 0 && (
                    
                      
                        
                        Suggested:
                      
                      {contacts
                        .filter(c => c.email && !toRecipients.includes(c.email))
                        .map(contact => (
                           addToRecipient(contact.email)}
                            data-testid={`suggestion-to-${contact.id}`}
                          >
                            {contact.firstName} {contact.lastName}
                            {contact.jobTitle && ` (${contact.jobTitle})`}
                          
                        ))}
                    
                  )}
                  
                    {toRecipients.map((email) => (
                      
                        {email}
                         removeToRecipient(email)}
                          data-testid={`remove-to-${email}`}
                        />
                      
                    ))}
                     setNewTo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addToRecipient(newTo);
                        }
                      }}
                      onBlur={() => newTo && addToRecipient(newTo)}
                      className="border-0 focus-visible:ring-0 flex-1 min-w-[200px] h-auto py-1"
                      data-testid="input-to-recipient"
                    />
                  
                
              

              
                Cc (optional)
                
                  {ccRecipients.map((email) => (
                    
                      {email}
                       removeCcRecipient(email)}
                        data-testid={`remove-cc-${email}`}
                      />
                    
                  ))}
                   setNewCc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addCcRecipient(newCc);
                      }
                    }}
                    onBlur={() => newCc && addCcRecipient(newCc)}
                    className="border-0 focus-visible:ring-0 flex-1 min-w-[200px] h-auto py-1"
                    data-testid="input-cc-recipient"
                  />
                
              

              
                Subject
                 setSubject(e.target.value)}
                  placeholder="Enter subject..."
                  data-testid="input-subject"
                />
              

              
                Message
                 setBody(e.target.value)}
                  placeholder="Compose your message..."
                  rows={12}
                  data-testid="input-body"
                />
              

              

              
                
                  Cancel
                
                
                  
                  {sendMutation.isPending ? 'Sending...' : 'Send Email'}
                
              
            
          )}
        
      
    
  );
}