/**
 * AI Email Test Dialog
 * 
 * Client-facing dialog for testing AI-generated emails for a campaign.
 * Uses the same backend services as admin email testing but scoped to client campaigns.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, Mail, Sparkles, Send, Eye, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface AiEmailTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

interface GeneratedEmail {
  id: string;
  subject: string;
  preheader: string;
  body: string;
  html: string;
  variant?: string;
}

export function AiEmailTestDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName
}: AiEmailTestDialogProps) {
  const [testEmail, setTestEmail] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [generatedEmails, setGeneratedEmails] = useState([]);
  const [customContext, setCustomContext] = useState('');
  const { toast } = useToast();

  // Generate AI emails for the campaign
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/client-portal/agentic/emails/generate', {
        campaignId,
        purpose: 'sales_outreach',
        variants: 3,
        context: customContext || undefined
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate emails');
      }
      return response.json();
    },
    onSuccess: (data) => {
      const emails: GeneratedEmail[] = (data.emails || []).map((email: any, idx: number) => ({
        id: `email-${idx}`,
        subject: email.subject || 'Untitled',
        preheader: email.preheader || '',
        body: email.body || email.text || '',
        html: email.html || `${email.body || email.text || ''}`,
        variant: email.variant || `Variant ${idx + 1}`
      }));
      setGeneratedEmails(emails);
      if (emails.length > 0) {
        setSelectedEmail(emails[0]);
      }
      toast({
        title: 'Emails generated!',
        description: `Created ${emails.length} email variant(s) for your campaign`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Send test email
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmail) throw new Error('No email selected');
      const response = await apiRequest('POST', '/api/client-portal/agentic/emails/send-test', {
        to: testEmail,
        subject: selectedEmail.subject,
        html: selectedEmail.html,
        preheader: selectedEmail.preheader,
        campaignId,
        campaignName
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send test email');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Check for sandbox warning
      if (data.warning) {
        toast({
          title: 'Email Queued (Sandbox Mode)',
          description: data.warning,
          variant: 'default',
          duration: 8000, // Show longer for important warning
        });
      } else if (data.details?.messageId) {
        toast({
          title: 'Test email sent!',
          description: `Delivered to ${testEmail} (ID: ${data.details.messageId.substring(0, 20)}...)`,
        });
      } else {
        toast({
          title: 'Test email sent!',
          description: `Successfully sent to ${testEmail}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleGenerate = () => {
    generateMutation.mutate();
  };

  const handleSendTest = () => {
    if (!testEmail) {
      toast({
        title: 'Email required',
        description: 'Please enter a test email address',
        variant: 'destructive',
      });
      return;
    }
    sendTestMutation.mutate();
  };

  return (
    
      
        
          
            
            AI Email Test
          
          
            Generate and test AI-powered email templates for: {campaignName}
          
        

        
          
            
              
                
                Generate
              
              
                
                Preview & Send
              
            

            
              
                {/* Optional context */}
                
                  Additional Context (optional)
                   setCustomContext(e.target.value)}
                    rows={3}
                  />
                

                
                  {generateMutation.isPending ? (
                    <>
                      
                      Generating...
                    
                  ) : (
                    <>
                      
                      Generate AI Email Templates
                    
                  )}
                

                {/* Generated emails list */}
                {generatedEmails.length > 0 && (
                  
                    Generated Templates ({generatedEmails.length})
                    
                      
                        {generatedEmails.map((email) => (
                           setSelectedEmail(email)}
                          >
                            
                              
                                
                                  {email.subject}
                                
                                {email.variant && (
                                  
                                    {email.variant}
                                  
                                )}
                              
                            
                            
                              
                                {email.preheader || email.body.slice(0, 100)}...
                              
                            
                          
                        ))}
                      
                    
                  
                )}
              
            

            
              {selectedEmail && (
                
                  {/* Email Preview */}
                  
                    
                      Email Preview
                      
                        
                        Regenerate
                      
                    
                    
                    
                      
                        
                          Subject:
                          {selectedEmail.subject}
                        
                        {selectedEmail.preheader && (
                          
                            Preheader:
                            {selectedEmail.preheader}
                          
                        )}
                      
                      
                        
                      
                    
                  

                  {/* Send Test */}
                  
                    Send Test Email
                    
                       setTestEmail(e.target.value)}
                        className="flex-1"
                      />
                      
                        {sendTestMutation.isPending ? (
                          
                        ) : sendTestMutation.isSuccess ? (
                          
                        ) : (
                          
                        )}
                        Send Test
                      
                    
                    {sendTestMutation.isError && (
                      
                        
                        {(sendTestMutation.error as Error).message}
                      
                    )}
                  
                
              )}
            
          
        

        
           onOpenChange(false)}>
            Close
          
        
      
    
  );
}