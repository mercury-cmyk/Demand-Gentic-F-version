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
  const [selectedEmail, setSelectedEmail] = useState<GeneratedEmail | null>(null);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
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
        html: email.html || `<div style="font-family: sans-serif; padding: 20px;">${email.body || email.text || ''}</div>`,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-600" />
            AI Email Test
          </DialogTitle>
          <DialogDescription>
            Generate and test AI-powered email templates for: {campaignName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <Tabs defaultValue="generate">
            <TabsList className="grid w-full grid-cols-2 sticky top-0 bg-background z-10">
              <TabsTrigger value="generate">
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </TabsTrigger>
              <TabsTrigger value="preview" disabled={!selectedEmail}>
                <Eye className="h-4 w-4 mr-2" />
                Preview & Send
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="mt-4">
              <div className="space-y-4 py-4">
                {/* Optional context */}
                <div className="space-y-2">
                  <Label>Additional Context (optional)</Label>
                  <Textarea
                    placeholder="Add any specific instructions, talking points, or context for the AI to use when generating emails..."
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="w-full gap-2"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate AI Email Templates
                    </>
                  )}
                </Button>

                {/* Generated emails list */}
                {generatedEmails.length > 0 && (
                  <div className="space-y-3 mt-4">
                    <Label className="text-sm font-medium">Generated Templates ({generatedEmails.length})</Label>
                    <ScrollArea className="h-[300px] pr-4">
                      <div className="space-y-3">
                        {generatedEmails.map((email) => (
                          <Card 
                            key={email.id}
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedEmail?.id === email.id 
                                ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' 
                                : ''
                            }`}
                            onClick={() => setSelectedEmail(email)}
                          >
                            <CardHeader className="py-3 px-4">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium truncate flex-1">
                                  {email.subject}
                                </CardTitle>
                                {email.variant && (
                                  <Badge variant="outline" className="ml-2 shrink-0">
                                    {email.variant}
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="py-2 px-4">
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {email.preheader || email.body.slice(0, 100)}...
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              {selectedEmail && (
                <div className="space-y-4 py-4">
                  {/* Email Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Email Preview</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGenerate}
                        disabled={generateMutation.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
                        Regenerate
                      </Button>
                    </div>
                    
                    <Card>
                      <CardHeader className="py-3 border-b">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Subject:</p>
                          <p className="font-medium">{selectedEmail.subject}</p>
                        </div>
                        {selectedEmail.preheader && (
                          <div className="space-y-1 mt-2">
                            <p className="text-xs text-muted-foreground">Preheader:</p>
                            <p className="text-sm text-muted-foreground italic">{selectedEmail.preheader}</p>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="py-4">
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Send Test */}
                  <div className="space-y-3 pt-4 border-t">
                    <Label className="text-sm font-medium">Send Test Email</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="Enter your email address"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleSendTest}
                        disabled={!testEmail || sendTestMutation.isPending}
                        className="gap-2"
                      >
                        {sendTestMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : sendTestMutation.isSuccess ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Test
                      </Button>
                    </div>
                    {sendTestMutation.isError && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {(sendTestMutation.error as Error).message}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="shrink-0 border-t pt-4 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
