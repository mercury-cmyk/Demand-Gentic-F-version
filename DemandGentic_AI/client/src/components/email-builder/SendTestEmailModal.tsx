import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";

interface SendTestEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  preheader?: string;
  htmlContent: string;
  senderProfileId: string;
  sampleContacts?: Array;
}

export function SendTestEmailModal({
  open,
  onOpenChange,
  subject,
  preheader = "",
  htmlContent,
  senderProfileId,
  sampleContacts = []
}: SendTestEmailModalProps) {
  const [testEmails, setTestEmails] = useState("");
  const [selectedContactId, setSelectedContactId] = useState(
    sampleContacts[0]?.id || ""
  );
  const { toast } = useToast();

  const sendTestMutation = useMutation({
    mutationFn: async (data: {
      emails: string[];
      subject: string;
      preheader?: string;
      html: string;
      senderProfileId: string;
      sampleContactId?: string;
    }) => {
      const response = await fetch("/api/campaigns/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send test email");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test email sent!",
        description: `Successfully sent to ${data.sentCount} recipient(s)`,
      });
      onOpenChange(false);
      setTestEmails("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send test email",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    // Validate email addresses
    const emails = testEmails
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      toast({
        title: "No email addresses provided",
        description: "Please enter at least one email address",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((e) => !emailRegex.test(e));

    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid email addresses",
        description: `The following emails are invalid: ${invalidEmails.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!senderProfileId) {
      toast({
        title: "No sender profile selected",
        description: "Please select a sender profile before sending test email",
        variant: "destructive",
      });
      return;
    }

    sendTestMutation.mutate({
      emails,
      subject,
      html: htmlContent,
      senderProfileId,
      preheader,
      sampleContactId: selectedContactId,
    });
  };

  const selectedContact = sampleContacts.find(c => c.id === selectedContactId);

  return (
    
      
        
          
            
            Send Test Email
          
          
            Send a test email to verify your design and content before launching the campaign.
          
        

        
          {/* Email Recipients */}
          
            
              Test Email Addresses
              
                (comma-separated)
              
            
             setTestEmails(e.target.value)}
              disabled={sendTestMutation.isPending}
            />
            
              Enter one or more email addresses separated by commas
            
          

          {/* Sample Contact for Personalization */}
          {sampleContacts.length > 0 && (
            
              
                Use Data From
                
                  (for personalization tokens)
                
              
              
                
                  
                
                
                  {sampleContacts.map((contact) => (
                    
                      {contact.firstName} {contact.lastName} - {contact.company}
                    
                  ))}
                
              
              {selectedContact && (
                
                  Preview data:
                  First Name: {selectedContact.firstName}
                  Last Name: {selectedContact.lastName}
                  Company: {selectedContact.company}
                
              )}
            
          )}

          {/* Subject Preview */}
          
            Subject Line
            
              {subject || "(No subject)"}
            
          
          
            Preview Text
            
              {preheader || "(No preview text)"}
            
          

          {/* Status Messages */}
          {sendTestMutation.isSuccess && (
            
              
              Test email sent successfully!
            
          )}

          {sendTestMutation.isError && (
            
              
              {sendTestMutation.error.message}
            
          )}
        

        
           onOpenChange(false)}
            disabled={sendTestMutation.isPending}
          >
            Cancel
          
          
            {sendTestMutation.isPending && (
              
            )}
            Send Test Email
          
        
      
    
  );
}