/**
 * Client Notification Center Panel
 * 
 * Admin-facing notification panel that lives inside the client management page.
 * Allows admins to:
 * - Generate AI-powered email templates (pipeline updates, campaign launches, etc.)
 * - Preview beautiful email templates before sending
 * - Send client-specific, campaign-specific notifications via Mercury Bridge
 * - Track notification history per client
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  Sparkles,
  Send,
  Eye,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  FileEdit,
  RefreshCw,
  Plus,
  ChevronRight,
  Zap,
  Target,
  BarChart3,
  Megaphone,
  Users,
  Star,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeneratedTemplate {
  subject: string;
  htmlContent: string;
  textContent: string;
}

interface ClientNotification {
  id: string;
  clientAccountId: string;
  campaignId: string | null;
  notificationType: string;
  subject: string;
  htmlContent: string;
  textContent: string | null;
  recipientEmails: string[];
  status: string;
  sentAt: string | null;
  sentBy: string | null;
  errorMessage: string | null;
  aiGenerated: boolean;
  createdAt: string;
}

interface Recipient {
  email: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  type: string;
}

const NOTIFICATION_TYPES = [
  { value: 'pipeline_update', label: 'Pipeline Update', icon: Target, description: 'Inform client about pipeline progress' },
  { value: 'campaign_launch', label: 'Campaign Launched', icon: Megaphone, description: 'Notify about a new campaign going live' },
  { value: 'leads_delivered', label: 'Leads Delivered', icon: Users, description: 'Share new qualified leads delivery' },
  { value: 'weekly_report', label: 'Weekly Report', icon: BarChart3, description: 'Weekly performance summary' },
  { value: 'milestone', label: 'Milestone Achieved', icon: Star, description: 'Celebrate a project milestone' },
  { value: 'custom', label: 'Custom Notification', icon: Mail, description: 'Custom content with AI generation' },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function ClientNotificationCenter({
  clientAccountId,
  clientName,
  campaigns,
}: {
  clientAccountId: string;
  clientName: string;
  campaigns?: Campaign[];
}) {
  const { toast } = useToast();
  const [showComposer, setShowComposer] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<ClientNotification | null>(null);

  // Composer state
  const [notificationType, setNotificationType] = useState<string>('pipeline_update');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedTemplate, setGeneratedTemplate] = useState<GeneratedTemplate | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [customRecipientInput, setCustomRecipientInput] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: notifications, isLoading: notificationsLoading } = useQuery<{
    notifications: ClientNotification[];
    total: number;
  }>({
    queryKey: ['/api/admin/client-notifications/client', clientAccountId],
    enabled: !!clientAccountId,
  });

  const { data: recipientsData } = useQuery<{ recipients: Recipient[] }>({
    queryKey: ['/api/admin/client-notifications/client', clientAccountId, 'recipients'],
    enabled: !!clientAccountId,
  });

  const recipients = recipientsData?.recipients || [];

  // ── Mutations ────────────────────────────────────────────────────────────

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/client-notifications/generate-template', {
        clientAccountId,
        campaignId: selectedCampaignId || undefined,
        notificationType,
        customPrompt: customPrompt || undefined,
      }, { timeout: 60000 });
      return res.json();
    },
    onSuccess: (data: { success: boolean; template: GeneratedTemplate }) => {
      if (data.success && data.template) {
        setGeneratedTemplate(data.template);
        setEditedSubject(data.template.subject);
        setEditedHtml(data.template.htmlContent);
        toast({ title: 'Template generated', description: 'AI has created your email template. Review and edit before sending.' });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Generation failed', description: error.message, variant: 'destructive' });
    },
  });

  const createAndSendMutation = useMutation({
    mutationFn: async (action: 'draft' | 'send') => {
      // Merge custom recipients
      const allRecipients = [...selectedRecipients];
      if (customRecipientInput.trim()) {
        const extras = customRecipientInput.split(',').map(e => e.trim()).filter(e => e.includes('@'));
        allRecipients.push(...extras);
      }

      if (allRecipients.length === 0) throw new Error('At least one recipient is required');

      const createRes = await apiRequest('POST', '/api/admin/client-notifications', {
        clientAccountId,
        campaignId: selectedCampaignId || undefined,
        notificationType,
        subject: editedSubject,
        htmlContent: editedHtml,
        textContent: generatedTemplate?.textContent,
        recipientEmails: [...new Set(allRecipients)],
        status: action === 'send' ? 'queued' : 'draft',
        aiGenerated: !!generatedTemplate,
        aiPrompt: customPrompt || undefined,
      });
      const result = await createRes.json();
      
      if (action === 'send' && result.success && result.notification?.id) {
        const sendRes = await apiRequest('POST', `/api/admin/client-notifications/${result.notification.id}/send`);
        return sendRes.json();
      }
      return result;
    },
    onSuccess: (data: any, action: 'draft' | 'send') => {
      toast({
        title: action === 'send' ? 'Notification sent!' : 'Draft saved',
        description: action === 'send'
          ? `Successfully sent to ${data.sentCount || 'all'} recipients`
          : 'Notification saved as draft',
      });
      resetComposer();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/client-notifications/client', clientAccountId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/admin/client-notifications/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Deleted', description: 'Notification removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/client-notifications/client', clientAccountId] });
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function resetComposer() {
    setShowComposer(false);
    setNotificationType('pipeline_update');
    setSelectedCampaignId('');
    setCustomPrompt('');
    setGeneratedTemplate(null);
    setEditedSubject('');
    setEditedHtml('');
    setSelectedRecipients([]);
    setCustomRecipientInput('');
  }

  function toggleRecipient(email: string) {
    setSelectedRecipients(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  }

  function selectAllRecipients() {
    setSelectedRecipients(recipients.map(r => r.email));
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent': return <Badge variant="default" className="bg-emerald-600"><CheckCircle className="h-3 w-3 mr-1" />Sent</Badge>;
      case 'failed': return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'queued': return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Queued</Badge>;
      default: return <Badge variant="outline"><FileEdit className="h-3 w-3 mr-1" />Draft</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    const found = NOTIFICATION_TYPES.find(t => t.value === type);
    if (found) {
      const Icon = found.icon;
      return <Icon className="h-4 w-4" />;
    }
    return <Mail className="h-4 w-4" />;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Notification Center
          </h3>
          <p className="text-sm text-muted-foreground">
            Send beautiful, AI-generated email notifications to {clientName}
          </p>
        </div>
        <Button onClick={() => setShowComposer(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Notification
        </Button>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {NOTIFICATION_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              onClick={() => {
                setNotificationType(type.value);
                setShowComposer(true);
              }}
              className="group flex items-start gap-3 p-4 rounded-xl border bg-card hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all text-left"
            >
              <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{type.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Notification History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Notifications</CardTitle>
            <Badge variant="outline" className="font-normal">
              {notifications?.total || 0} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {notificationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications?.notifications && notifications.notifications.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {notifications.notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="shrink-0 text-muted-foreground">
                        {getTypeIcon(n.notificationType)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{n.subject}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {getStatusBadge(n.status)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(n.createdAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          {n.aiGenerated && (
                            <Badge variant="outline" className="text-xs gap-1 px-1.5 py-0">
                              <Sparkles className="h-2.5 w-2.5" /> AI
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {n.recipientEmails?.length || 0} recipients
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedNotification(n);
                          setShowPreview(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {n.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteMutation.mutate(n.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12">
              <Mail className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No notifications sent yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click "New Notification" to compose your first one</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Composer Dialog ──────────────────────────────────────────── */}
      <Dialog open={showComposer} onOpenChange={(open) => { if (!open) resetComposer(); else setShowComposer(true); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              Compose Client Notification
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4 px-1">
            {/* Step 1: Configure */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                Configure Notification
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Notification Type</Label>
                  <Select value={notificationType} onValueChange={setNotificationType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTIFICATION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            <t.icon className="h-3.5 w-3.5" />
                            {t.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Campaign (optional)</Label>
                  <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a campaign..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All campaigns</SelectItem>
                      {campaigns?.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Custom Instructions for AI</Label>
                <Textarea
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder="e.g., Include specific metrics: 45 leads generated, 12 qualified meetings. Mention the new pipeline stage we created for enterprise accounts..."
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Describe what you want to communicate. The AI will generate a professional, conversion-friendly email template.
                </p>
              </div>

              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Template with AI
                  </>
                )}
              </Button>
            </div>

            {/* Step 2: Preview & Edit */}
            {generatedTemplate && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                    Review & Edit Template
                  </div>

                  <div className="space-y-2">
                    <Label>Subject Line</Label>
                    <Input
                      value={editedSubject}
                      onChange={e => setEditedSubject(e.target.value)}
                      className="font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Email Preview</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Regenerate
                      </Button>
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-900">
                      <div className="bg-white dark:bg-gray-950 border-b px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="font-medium">To:</span> {clientName}
                        <span className="ml-auto"><Sparkles className="h-3 w-3 inline" /> AI Generated</span>
                      </div>
                      <div className="p-2 max-h-[400px] overflow-y-auto">
                        <iframe
                          srcDoc={editedHtml}
                          className="w-full min-h-[360px] border-0 rounded-lg bg-white"
                          title="Email preview"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3: Recipients & Send */}
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">3</div>
                    Select Recipients & Send
                  </div>

                  {recipients.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Client Portal Users</Label>
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={selectAllRecipients}>
                          Select all
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recipients.map(r => (
                          <button
                            key={r.email}
                            onClick={() => toggleRecipient(r.email)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                              selectedRecipients.includes(r.email)
                                ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300'
                                : 'bg-card border-border hover:bg-accent'
                            }`}
                          >
                            {selectedRecipients.includes(r.email) && <CheckCircle className="h-3 w-3" />}
                            <span className="font-medium">{r.name}</span>
                            <span className="text-xs text-muted-foreground">{r.email}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Additional Recipients</Label>
                    <Input
                      value={customRecipientInput}
                      onChange={e => setCustomRecipientInput(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated emails for any additional recipients</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          {generatedTemplate && (
            <DialogFooter className="border-t pt-4 gap-2">
              <Button variant="outline" onClick={resetComposer}>Cancel</Button>
              <Button
                variant="outline"
                onClick={() => createAndSendMutation.mutate('draft')}
                disabled={createAndSendMutation.isPending}
              >
                <FileEdit className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button
                onClick={() => createAndSendMutation.mutate('send')}
                disabled={createAndSendMutation.isPending || (selectedRecipients.length === 0 && !customRecipientInput.trim())}
                className="gap-2"
              >
                {createAndSendMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send via Mercury Bridge
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Preview Dialog ───────────────────────────────────────────── */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Notification Preview
            </DialogTitle>
          </DialogHeader>
          {selectedNotification && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                {getStatusBadge(selectedNotification.status)}
                {selectedNotification.aiGenerated && (
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3" /> AI Generated
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {new Date(selectedNotification.createdAt).toLocaleString()}
                </span>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="font-medium">{selectedNotification.subject}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Recipients</p>
                <div className="flex flex-wrap gap-1">
                  {selectedNotification.recipientEmails?.map(e => (
                    <Badge key={e} variant="outline" className="text-xs">{e}</Badge>
                  ))}
                </div>
              </div>

              {selectedNotification.errorMessage && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                    {selectedNotification.errorMessage}
                  </p>
                </div>
              )}

              <div className="border rounded-xl overflow-hidden">
                <iframe
                  srcDoc={selectedNotification.htmlContent}
                  className="w-full min-h-[400px] border-0 bg-white"
                  title="Email preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
