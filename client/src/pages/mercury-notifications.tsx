/**
 * Mercury Notifications — Admin Settings Page (Phase 9)
 * 
 * Unified admin page for:
 *   - SMTP connection status and verification
 *   - Mercury template management with AI Template Studio
 *   - Template gallery + AI generation + AI refinement
 *   - Bulk client invitations (dry run + execute) — dry-run works without feature flag
 *   - Email logs / outbox viewer
 *   - Notification rules management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Mail, CheckCircle, XCircle, Send, Eye, RefreshCw, Users, Zap, FileText,
  Settings, AlertTriangle, Loader2, Plus, Trash2, Edit, Play, Download,
  Sparkles, Wand2, Copy, LayoutGrid,
} from 'lucide-react';

// ─── API Helpers ─────────────────────────────────────────────────────────────

const mercuryApi = {
  getStatus: () => apiRequest('GET', '/api/communications/mercury/status').then(r => r.json()),
  verifyConnection: () => apiRequest('POST', '/api/communications/mercury/verify-connection').then(r => r.json()),
  seedTemplates: () => apiRequest('POST', '/api/communications/mercury/templates/seed').then(r => r.json()),
  getTemplates: () => apiRequest('GET', '/api/communications/mercury/templates').then(r => r.json()),
  getTemplate: (key: string) => apiRequest('GET', `/api/communications/mercury/templates/${key}`).then(r => r.json()),
  createTemplate: (data: any) => apiRequest('POST', '/api/communications/mercury/templates', data).then(r => r.json()),
  updateTemplate: (key: string, data: any) => apiRequest('PUT', `/api/communications/mercury/templates/${key}`, data).then(r => r.json()),
  deleteTemplate: (key: string) => apiRequest('DELETE', `/api/communications/mercury/templates/${key}`).then(r => r.json()),
  previewTemplate: (key: string, variables?: Record<string, string>) =>
    apiRequest('POST', `/api/communications/mercury/templates/${key}/preview`, { variables }).then(r => r.json()),
  testSend: (key: string, data: any) =>
    apiRequest('POST', `/api/communications/mercury/templates/${key}/test-send`, data).then(r => r.json()),
  aiGenerate: (data: any) => apiRequest('POST', '/api/communications/mercury/templates/ai/generate', data).then(r => r.json()),
  aiRefine: (data: any) => apiRequest('POST', '/api/communications/mercury/templates/ai/refine', data).then(r => r.json()),
  inviteDryRun: () => apiRequest('POST', '/api/communications/mercury/invitations/dry-run').then(r => r.json()),
  inviteSend: (portalBaseUrl?: string) =>
    apiRequest('POST', '/api/communications/mercury/invitations/send', { portalBaseUrl }).then(r => r.json()),
  inviteStatus: () => apiRequest('GET', '/api/communications/mercury/invitations/status').then(r => r.json()),
  getLogs: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiRequest('GET', `/api/communications/mercury/logs${qs}`).then(r => r.json());
  },
  retryLog: (id: string) => apiRequest('POST', `/api/communications/mercury/logs/${id}/retry`).then(r => r.json()),
  processOutbox: () => apiRequest('POST', '/api/communications/mercury/outbox/process').then(r => r.json()),
  getRules: () => apiRequest('GET', '/api/communications/mercury/notifications/rules').then(r => r.json()),
  createRule: (data: any) => apiRequest('POST', '/api/communications/mercury/notifications/rules', data).then(r => r.json()),
  deleteRule: (id: string) => apiRequest('DELETE', `/api/communications/mercury/notifications/rules/${id}`).then(r => r.json()),
};

// ─── Template Gallery Data ───────────────────────────────────────────────────

const TEMPLATE_GALLERY: Array<{
  name: string;
  category: string;
  description: string;
  icon: string;
  audience: string;
  purpose: string;
}> = [
  {
    name: 'Welcome Onboarding',
    category: 'onboarding',
    description: 'Welcome new clients and guide them to set up their account.',
    icon: '👋',
    audience: 'New client users',
    purpose: 'Welcome the user, explain key features, and provide a Get Started CTA.',
  },
  {
    name: 'Weekly Lead Digest',
    category: 'notification',
    description: 'Summarize the week\'s leads delivered across all campaigns.',
    icon: '📊',
    audience: 'Client stakeholders',
    purpose: 'Weekly summary of leads generated, campaign performance highlights, and link to portal.',
  },
  {
    name: 'Campaign Milestone',
    category: 'notification',
    description: 'Notify when a campaign hits 50%, 75%, or 100% of lead goal.',
    icon: '🎯',
    audience: 'Campaign owners',
    purpose: 'Celebrate milestone, share stats, and encourage next steps.',
  },
  {
    name: 'Account Review Reminder',
    category: 'marketing',
    description: 'Prompt clients for their quarterly business review meeting.',
    icon: '📅',
    audience: 'Client decision-makers',
    purpose: 'Schedule quarterly review, highlight past results, suggest agenda items.',
  },
  {
    name: 'Invoice / Payment Receipt',
    category: 'system',
    description: 'Send payment confirmation or invoice for services.',
    icon: '💳',
    audience: 'Billing contacts',
    purpose: 'Confirm payment, provide receipt details, and link to billing portal.',
  },
  {
    name: 'Re-engagement Nudge',
    category: 'marketing',
    description: 'Reach out to inactive clients to encourage portal login.',
    icon: '🔔',
    audience: 'Dormant client users',
    purpose: 'Remind of value, share new features, and provide easy login CTA.',
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MercuryNotificationsPage() {
  const [activeTab, setActiveTab] = useState('status');

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6 text-blue-600" />
          Mercury Bridge — Notifications
        </h1>
        <p className="text-muted-foreground mt-1">
          SMTP email notifications, templates, AI template studio, and bulk client invitations.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="status">
            <Settings className="h-4 w-4 mr-1" /> Status
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText className="h-4 w-4 mr-1" /> Templates
          </TabsTrigger>
          <TabsTrigger value="ai-studio">
            <Sparkles className="h-4 w-4 mr-1" /> AI Studio
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Users className="h-4 w-4 mr-1" /> Invitations
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Mail className="h-4 w-4 mr-1" /> Email Logs
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Zap className="h-4 w-4 mr-1" /> Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status"><StatusTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="ai-studio"><AIStudioTab /></TabsContent>
        <TabsContent value="invitations"><InvitationsTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Status Tab ──────────────────────────────────────────────────────────────

function StatusTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ['mercury-status'], queryFn: mercuryApi.getStatus });
  const verifyMutation = useMutation({
    mutationFn: mercuryApi.verifyConnection,
    onSuccess: () => {
      statusQuery.refetch();
      toast({ title: 'Connection verified' });
    },
    onError: (err: any) => toast({ title: 'Verification failed', description: String(err.message || err), variant: 'destructive' }),
  });
  const seedMutation = useMutation({
    mutationFn: mercuryApi.seedTemplates,
    onSuccess: (data) => {
      // Invalidate template list so Templates tab refreshes
      queryClient.invalidateQueries({ queryKey: ['mercury-templates'] });
      toast({
        title: 'Templates seeded',
        description: `Created: ${data.created}, Skipped: ${data.skipped}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Seed failed',
        description: String(err.message || err),
        variant: 'destructive',
      });
    },
  });

  const status = statusQuery.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Mercury Bridge Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : statusQuery.error ? (
            <div className="text-red-600 flex items-center gap-2">
              <XCircle className="h-4 w-4" /> Failed to load status
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Version</Label>
                  <p className="font-mono text-sm">{status?.mercury?.version}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Default Sender</Label>
                  <p className="font-mono text-sm">{status?.mercury?.defaultSender}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SMTP Status</Label>
                  <div className="flex items-center gap-1 mt-1">
                    {status?.smtp?.verified ? (
                      <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>
                    ) : status?.smtp?.configured ? (
                      <Badge variant="secondary" className="bg-yellow-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Not Verified</Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Not Configured</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Provider</Label>
                  <p className="text-sm">{status?.smtp?.providerName || '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Feature: smtp_email_enabled</Label>
                  <div className="mt-1">
                    {status?.featureFlags?.smtp_email_enabled ? (
                      <Badge className="bg-green-600">ON</Badge>
                    ) : (
                      <Badge variant="secondary">OFF</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Feature: bulk_invites_enabled</Label>
                  <div className="mt-1">
                    {status?.featureFlags?.bulk_invites_enabled ? (
                      <Badge className="bg-green-600">ON</Badge>
                    ) : (
                      <Badge variant="secondary">OFF</Badge>
                    )}
                  </div>
                </div>
              </div>

              {status?.smtp?.error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  <strong>SMTP Error:</strong> {status.smtp.error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Verify Connection
                </Button>
                <Button
                  variant="outline"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                  Seed Default Templates
                </Button>
              </div>

              {seedMutation.data && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                  Templates seeded: {seedMutation.data.created} created, {seedMutation.data.skipped} skipped
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Templates Tab ───────────────────────────────────────────────────────────

function TemplatesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ['mercury-templates'], queryFn: mercuryApi.getTemplates });
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [testSendDialog, setTestSendDialog] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const deleteMutation = useMutation({
    mutationFn: (key: string) => mercuryApi.deleteTemplate(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: (err: any) => toast({ title: 'Delete failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const previewMutation = useMutation({
    mutationFn: (key: string) => mercuryApi.previewTemplate(key),
    onSuccess: (data) => setPreviewData(data),
    onError: (err: any) => toast({ title: 'Preview failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const testSendMutation = useMutation({
    mutationFn: (params: { key: string; email: string }) =>
      mercuryApi.testSend(params.key, { testRecipientEmail: params.email }),
    onSuccess: (data) => setTestResult(data),
    onError: (err: any) => toast({ title: 'Test send failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: any) => {
      const newTemplate = {
        ...template,
        templateKey: `${template.templateKey}_copy_${Date.now()}`.slice(0, 100),
        name: `${template.name} (Copy)`,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      };
      return mercuryApi.createTemplate(newTemplate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-templates'] });
      toast({ title: 'Template duplicated' });
    },
    onError: (err: any) => toast({ title: 'Duplicate failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const templates = templatesQuery.data || [];
  const categories = Array.from(new Set(templates.map((t: any) => t.category as string))).filter(Boolean) as string[];
  const filtered = categoryFilter
    ? templates.filter((t: any) => t.category === categoryFilter)
    : templates;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Email Templates</h2>
          {categories.length > 0 && (
            <select
              className="border rounded px-2 py-1 text-sm"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((cat: string) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
          <Badge variant="outline" className="text-xs">{filtered.length} templates</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditingTemplate({
            templateKey: '', name: '', subjectTemplate: '', htmlTemplate: '', textTemplate: '',
            description: '', category: 'notification', variables: [], isEnabled: true,
          })}>
            <Plus className="h-4 w-4 mr-1" /> Blank Template
          </Button>
        </div>
      </div>

      {templatesQuery.isLoading ? (
        <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Variables</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((template: any) => (
              <TableRow key={template.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{template.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{template.description}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">{template.templateKey}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{template.category}</Badge>
                </TableCell>
                <TableCell>
                  {template.isEnabled !== false ? (
                    <Badge className="bg-green-600 text-xs">Enabled</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{template.variables?.length || 0} vars</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" title="Preview" onClick={() => previewMutation.mutate(template.templateKey)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Test Send" onClick={() => { setTestSendDialog(template.templateKey); setTestResult(null); }}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditingTemplate(template)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Duplicate" onClick={() => duplicateMutation.mutate(template)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" title="Delete" onClick={() => {
                      if (confirm(`Delete template "${template.name}"?`)) deleteMutation.mutate(template.templateKey);
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No templates yet. Click "Seed Default Templates" in the Status tab or use the AI Studio to generate templates.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {/* Preview Dialog — Sandboxed iframe */}
      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>Rendered with sample data — no email sent.</DialogDescription>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <p className="font-medium">{previewData.rendered?.subject}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Variables Used</Label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {(previewData.variables || []).map((v: any) => (
                    <Badge key={v.name} variant="outline" className="text-xs">{v.name}={v.value}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">HTML Preview</Label>
                <SandboxedPreview html={previewData.rendered?.html || ''} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Test Send Dialog */}
      <Dialog open={!!testSendDialog} onOpenChange={() => { setTestSendDialog(null); setTestResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Template: <span className="font-mono">{testSendDialog}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Recipient Email</Label>
              <Input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
              />
            </div>
            {testResult && (
              <div className={`rounded p-3 text-sm ${testResult.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'} border`}>
                {testResult.success ? (
                  <>
                    <CheckCircle className="h-4 w-4 inline mr-1" />
                    Test email sent! MessageID: {testResult.messageId || 'N/A'}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 inline mr-1" />
                    Failed: {testResult.error}
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTestSendDialog(null); setTestResult(null); }}>Cancel</Button>
            <Button
              onClick={() => testSendDialog && testSendMutation.mutate({ key: testSendDialog, email: testEmail })}
              disabled={!testEmail || testSendMutation.isPending}
            >
              {testSendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <TemplateEditorDialog
        template={editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSaved={() => {
          setEditingTemplate(null);
          queryClient.invalidateQueries({ queryKey: ['mercury-templates'] });
        }}
      />
    </div>
  );
}

// ─── Sandboxed Preview Component ─────────────────────────────────────────────

function SandboxedPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif;}</style></head><body>${html}</body></html>`);
        doc.close();
      }
    }
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className="w-full border rounded bg-white mt-1"
      style={{ minHeight: 400 }}
      title="Email Preview"
    />
  );
}

// ─── Template Editor Dialog ──────────────────────────────────────────────────

function TemplateEditorDialog({ template, onClose, onSaved }: {
  template: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<any>(template || {});
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (template) setForm(template);
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (template?.id) {
        return mercuryApi.updateTemplate(form.templateKey, form);
      } else {
        return mercuryApi.createTemplate(form);
      }
    },
    onSuccess: () => {
      toast({ title: template?.id ? 'Template updated' : 'Template created' });
      onSaved();
    },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const refineMutation = useMutation({
    mutationFn: (action: string) => mercuryApi.aiRefine({
      action,
      htmlTemplate: form.htmlTemplate,
      subjectTemplate: form.subjectTemplate,
      textTemplate: form.textTemplate,
    }),
    onSuccess: (data) => {
      if (data.refined) {
        setForm({ ...form, ...data.refined });
        toast({ title: 'Template refined by AI' });
      }
    },
    onError: (err: any) => toast({ title: 'AI refinement failed', description: String(err.message || err), variant: 'destructive' }),
  });

  if (!template) return null;

  return (
    <Dialog open={!!template} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template.id ? 'Edit Template' : 'New Template'}</DialogTitle>
          <DialogDescription>
            {template.id ? 'Modify the template fields below.' : 'Create a new Mercury email template.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Template Key</Label>
              <Input
                value={form.templateKey || ''}
                onChange={e => setForm({ ...form, templateKey: e.target.value })}
                disabled={!!template.id}
                placeholder="e.g. my_notification"
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Display name" />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Subject Template</Label>
            <Input value={form.subjectTemplate || ''} onChange={e => setForm({ ...form, subjectTemplate: e.target.value })} placeholder="Email subject with {{variables}}" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <Label>HTML Template</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPreview(!showPreview)}>
                  <Eye className="h-3 w-3 mr-1" /> {showPreview ? 'Editor' : 'Preview'}
                </Button>
                {form.htmlTemplate && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refineMutation.mutate('improve')}
                      disabled={refineMutation.isPending}>
                      <Wand2 className="h-3 w-3 mr-1" /> Improve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refineMutation.mutate('shorten')}
                      disabled={refineMutation.isPending}>
                      Shorten
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refineMutation.mutate('formal')}
                      disabled={refineMutation.isPending}>
                      Formal
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refineMutation.mutate('friendly')}
                      disabled={refineMutation.isPending}>
                      Friendly
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refineMutation.mutate('cta')}
                      disabled={refineMutation.isPending}>
                      Better CTA
                    </Button>
                  </>
                )}
                {refineMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
            </div>
            {showPreview ? (
              <SandboxedPreview html={form.htmlTemplate || '<p>No HTML content yet</p>'} />
            ) : (
              <Textarea
                value={form.htmlTemplate || ''}
                onChange={e => setForm({ ...form, htmlTemplate: e.target.value })}
                rows={14}
                className="font-mono text-xs"
                placeholder="HTML email body with {{variables}}"
              />
            )}
          </div>
          <div>
            <Label>Text Template (optional)</Label>
            <Textarea
              value={form.textTemplate || ''}
              onChange={e => setForm({ ...form, textTemplate: e.target.value })}
              rows={4}
              className="font-mono text-xs"
              placeholder="Plain text fallback"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <select
                className="w-full border rounded px-2 py-2 text-sm"
                value={form.category || 'notification'}
                onChange={e => setForm({ ...form, category: e.target.value })}
              >
                <option value="invitation">Invitation</option>
                <option value="notification">Notification</option>
                <option value="system">System</option>
                <option value="marketing">Marketing</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isEnabled !== false}
                  onChange={e => setForm({ ...form, isEnabled: e.target.checked })}
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
          </div>

          {/* Variable Editor */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Variables</Label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                const vars = form.variables || [];
                setForm({ ...form, variables: [...vars, { name: '', description: '', required: false, exampleValue: '' }] });
              }}>
                <Plus className="h-3 w-3 mr-1" /> Add Variable
              </Button>
            </div>
            {(form.variables || []).map((v: any, i: number) => (
              <div key={i} className="flex gap-2 items-center mb-1">
                <Input
                  className="text-xs h-8"
                  placeholder="name"
                  value={v.name || ''}
                  onChange={e => {
                    const vars = [...(form.variables || [])];
                    vars[i] = { ...vars[i], name: e.target.value };
                    setForm({ ...form, variables: vars });
                  }}
                />
                <Input
                  className="text-xs h-8"
                  placeholder="description"
                  value={v.description || ''}
                  onChange={e => {
                    const vars = [...(form.variables || [])];
                    vars[i] = { ...vars[i], description: e.target.value };
                    setForm({ ...form, variables: vars });
                  }}
                />
                <Input
                  className="text-xs h-8 w-24"
                  placeholder="example"
                  value={v.exampleValue || ''}
                  onChange={e => {
                    const vars = [...(form.variables || [])];
                    vars[i] = { ...vars[i], exampleValue: e.target.value };
                    setForm({ ...form, variables: vars });
                  }}
                />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={v.required}
                    onChange={e => {
                      const vars = [...(form.variables || [])];
                      vars[i] = { ...vars[i], required: e.target.checked };
                      setForm({ ...form, variables: vars });
                    }}
                  />
                  Req
                </label>
                <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => {
                  const vars = [...(form.variables || [])];
                  vars.splice(i, 1);
                  setForm({ ...form, variables: vars });
                }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.templateKey || !form.name || !form.subjectTemplate}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {template.id ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AI Studio Tab ───────────────────────────────────────────────────────────

function AIStudioTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'gallery' | 'generate'>('gallery');
  const [generating, setGenerating] = useState(false);
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const [lastGalleryItem, setLastGalleryItem] = useState<typeof TEMPLATE_GALLERY[0] | null>(null);

  // AI prompt form
  const [aiForm, setAiForm] = useState({
    category: 'notification' as string,
    audience: '',
    tone: 'professional' as string,
    purpose: '',
    variables: '',
    context: '',
  });

  const generateFromGallery = useCallback(async (item: typeof TEMPLATE_GALLERY[0]) => {
    setLastGalleryItem(item);
    setMode('generate');
    setGenerating(true);
    setGeneratedTemplate(null);
    try {
      const result = await mercuryApi.aiGenerate({
        category: item.category,
        audience: item.audience,
        tone: 'professional',
        purpose: item.purpose,
      });
      if (result.success) {
        setGeneratedTemplate(result.template);
        toast({ title: `Template "${item.name}" generated` });
      }
    } catch (err: any) {
      toast({ title: 'Generation failed', description: String(err.message || err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [toast]);

  const generateFromPrompt = useCallback(async () => {
    if (!aiForm.audience || !aiForm.purpose) {
      toast({ title: 'Missing fields', description: 'Audience and purpose are required.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    setGeneratedTemplate(null);
    try {
      const result = await mercuryApi.aiGenerate({
        category: aiForm.category,
        audience: aiForm.audience,
        tone: aiForm.tone,
        purpose: aiForm.purpose,
        variables: aiForm.variables ? aiForm.variables.split(',').map((v: string) => v.trim()).filter(Boolean) : undefined,
        context: aiForm.context || undefined,
      });
      if (result.success) {
        setGeneratedTemplate(result.template);
        toast({ title: 'Template generated by AI' });
      }
    } catch (err: any) {
      toast({ title: 'Generation failed', description: String(err.message || err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [aiForm, toast]);

  const saveMutation = useMutation({
    mutationFn: (template: any) => mercuryApi.createTemplate(template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-templates'] });
      toast({ title: 'Template saved to Mercury' });
      setGeneratedTemplate(null);
    },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err.message || err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          AI Template Studio
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Generate professional email templates instantly using AI — pick from the gallery or describe what you need.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <Button variant={mode === 'gallery' ? 'default' : 'outline'} size="sm" onClick={() => setMode('gallery')}>
          <LayoutGrid className="h-4 w-4 mr-1" /> Gallery
        </Button>
        <Button variant={mode === 'generate' ? 'default' : 'outline'} size="sm" onClick={() => setMode('generate')}>
          <Wand2 className="h-4 w-4 mr-1" /> Custom Prompt
        </Button>
      </div>

      {/* Gallery Mode */}
      {mode === 'gallery' && !generating && !generatedTemplate && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATE_GALLERY.map((item, i) => (
            <Card
              key={i}
              className="cursor-pointer hover:border-purple-400 transition-colors"
              onClick={() => generateFromGallery(item)}
            >
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{item.name}</h3>
                    <Badge variant="outline" className="text-xs mt-1">{item.category}</Badge>
                    <p className="text-xs text-muted-foreground mt-2">{item.description}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-3 text-purple-600" disabled={generating}>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Generate with AI
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Custom Prompt Mode */}
      {mode === 'generate' && !generating && !generatedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Describe Your Template
            </CardTitle>
            <CardDescription>Tell the AI what kind of email template you need.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <select
                  className="w-full border rounded px-2 py-2 text-sm"
                  value={aiForm.category}
                  onChange={e => setAiForm({ ...aiForm, category: e.target.value })}
                >
                  <option value="invitation">Invitation</option>
                  <option value="notification">Notification</option>
                  <option value="system">System</option>
                  <option value="marketing">Marketing</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </div>
              <div>
                <Label>Tone</Label>
                <select
                  className="w-full border rounded px-2 py-2 text-sm"
                  value={aiForm.tone}
                  onChange={e => setAiForm({ ...aiForm, tone: e.target.value })}
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Audience <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Client portal users, B2B marketing managers, New signups"
                value={aiForm.audience}
                onChange={e => setAiForm({ ...aiForm, audience: e.target.value })}
              />
            </div>
            <div>
              <Label>Purpose <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Describe the email's purpose, e.g. 'Notify clients when their quarterly leads report is ready for download'"
                rows={3}
                value={aiForm.purpose}
                onChange={e => setAiForm({ ...aiForm, purpose: e.target.value })}
              />
            </div>
            <div>
              <Label>Required Variables (comma-separated, optional)</Label>
              <Input
                placeholder="e.g. recipient_name, company_name, report_url"
                value={aiForm.variables}
                onChange={e => setAiForm({ ...aiForm, variables: e.target.value })}
              />
            </div>
            <div>
              <Label>Additional Context (optional)</Label>
              <Textarea
                placeholder="Any extra instructions or constraints for the AI..."
                rows={2}
                value={aiForm.context}
                onChange={e => setAiForm({ ...aiForm, context: e.target.value })}
              />
            </div>
            <Button onClick={generateFromPrompt} disabled={generating} className="w-full">
              <Sparkles className="h-4 w-4 mr-1" />
              Generate Template
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generated Template Preview */}
      {generatedTemplate && (
        <Card className="border-purple-200 bg-purple-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              Generated: {generatedTemplate.name}
            </CardTitle>
            <CardDescription>{generatedTemplate.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Template Key</Label>
                <p className="font-mono text-xs">{generatedTemplate.templateKey}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Badge variant="outline" className="text-xs">{generatedTemplate.category}</Badge>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <p className="text-sm font-medium">{generatedTemplate.subjectTemplate}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Variables</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {(generatedTemplate.variables || []).map((v: any) => (
                  <Badge key={v.name} variant="outline" className="text-xs">
                    {'{{'}{v.name}{'}}'}{v.required ? ' *' : ''}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">HTML Preview</Label>
              <SandboxedPreview html={generatedTemplate.htmlTemplate || ''} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate(generatedTemplate)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Save to Templates
              </Button>
              <Button variant="outline" onClick={() => setGeneratedTemplate(null)}>
                Discard
              </Button>
              <Button variant="outline" onClick={() => {
                setGeneratedTemplate(null);
                if (lastGalleryItem) {
                  generateFromGallery(lastGalleryItem);
                } else {
                  generateFromPrompt();
                }
              }}>
                <RefreshCw className="h-4 w-4 mr-1" /> Regenerate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {generating && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
          <p className="text-muted-foreground">Generating template with AI...</p>
        </div>
      )}
    </div>
  );
}

// ─── Invitations Tab ─────────────────────────────────────────────────────────

function InvitationsTab() {
  const { toast } = useToast();
  const [dryRunData, setDryRunData] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  const dryRunMutation = useMutation({
    mutationFn: mercuryApi.inviteDryRun,
    onSuccess: (data) => {
      setDryRunData(data);
      toast({
        title: 'Dry run complete',
        description: `${data.eligibleCount || 0} eligible, ${data.skippedCount || 0} skipped`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Dry run failed',
        description: String(err.message || err),
        variant: 'destructive',
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => mercuryApi.inviteSend(window.location.origin),
    onSuccess: (data) => {
      setSendResult(data);
      setShowConfirm(false);
      toast({ title: 'Invitations queued', description: `${data.totalQueued} emails queued for delivery.` });
    },
    onError: (err: any) => {
      toast({
        title: 'Send failed',
        description: String(err.message || err),
        variant: 'destructive',
      });
    },
  });

  const statusQuery = useQuery({
    queryKey: ['mercury-invite-status'],
    queryFn: mercuryApi.inviteStatus,
    refetchInterval: sendResult ? 5000 : false,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Client Invitations
          </CardTitle>
          <CardDescription>
            Send invitation emails to all eligible client portal users.
            Dry Run is always available. Actual send requires the bulk_invites_enabled feature flag.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={() => dryRunMutation.mutate()} disabled={dryRunMutation.isPending} variant="outline">
              {dryRunMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              Dry Run (Preview)
            </Button>
            {dryRunData && dryRunData.eligibleCount > 0 && (
              <Button onClick={() => setShowConfirm(true)} variant="default">
                <Send className="h-4 w-4 mr-1" />
                Send {dryRunData.eligibleCount} Invitations
              </Button>
            )}
          </div>

          {dryRunMutation.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 inline mr-1" />
              {String((dryRunMutation.error as any)?.message || dryRunMutation.error)}
            </div>
          )}

          {dryRunData && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-green-600">{dryRunData.eligibleCount}</p>
                    <p className="text-sm text-muted-foreground">Eligible</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-yellow-600">{dryRunData.skippedCount}</p>
                    <p className="text-sm text-muted-foreground">Skipped</p>
                  </CardContent>
                </Card>
              </div>

              {dryRunData.eligibleCount === 0 && dryRunData.skippedCount === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-700">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  No eligible or skipped recipients found. This may mean there are no client users with email addresses, or all have already been invited.
                </div>
              )}

              {dryRunData.eligible?.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Eligible Recipients (sample)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dryRunData.eligible.slice(0, 10).map((c: any) => (
                        <TableRow key={c.clientUserId}>
                          <TableCell className="font-mono text-xs">{c.email}</TableCell>
                          <TableCell>{[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}</TableCell>
                          <TableCell>{c.clientAccountName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.reason || ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {dryRunData.eligible.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-1">...and {dryRunData.eligible.length - 10} more</p>
                  )}
                </div>
              )}

              {dryRunData.skipped?.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Skipped</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dryRunData.skipped.slice(0, 5).map((c: any) => (
                        <TableRow key={c.clientUserId}>
                          <TableCell className="font-mono text-xs">{c.email}</TableCell>
                          <TableCell className="text-xs">{c.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {sendResult && (
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <h4 className="font-medium text-green-800 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> Bulk Invitation Sent
              </h4>
              <p className="text-sm text-green-700 mt-1">
                Queued: {sendResult.totalQueued} | Skipped: {sendResult.totalSkipped} | Batches: {sendResult.batchCount}
              </p>
            </div>
          )}

          {statusQuery.data && statusQuery.data.total > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">Invitation Sending Status</h4>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 bg-blue-50 rounded">
                  <p className="text-lg font-bold text-blue-600">{statusQuery.data.queued}</p>
                  <p className="text-xs text-muted-foreground">Queued</p>
                </div>
                <div className="text-center p-2 bg-yellow-50 rounded">
                  <p className="text-lg font-bold text-yellow-600">{statusQuery.data.sending}</p>
                  <p className="text-xs text-muted-foreground">Sending</p>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <p className="text-lg font-bold text-green-600">{statusQuery.data.sent}</p>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded">
                  <p className="text-lg font-bold text-red-600">{statusQuery.data.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Send Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send invitation emails to <strong>{dryRunData?.eligibleCount || 0}</strong> client users.
              This action will queue emails for delivery. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Invitations
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Logs Tab ────────────────────────────────────────────────────────────────

function LogsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const logsQuery = useQuery({
    queryKey: ['mercury-logs', statusFilter],
    queryFn: () => mercuryApi.getLogs(statusFilter ? { status: statusFilter } : undefined),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => mercuryApi.retryLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-logs'] });
      toast({ title: 'Retry queued' });
    },
    onError: (err: any) => toast({ title: 'Retry failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const processOutboxMutation = useMutation({
    mutationFn: mercuryApi.processOutbox,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mercury-logs'] });
      toast({ title: 'Outbox processed', description: `${data?.processed || 0} entries processed.` });
    },
    onError: (err: any) => toast({ title: 'Process failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const logs = logsQuery.data?.logs || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Email Logs</h2>
        <div className="flex gap-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => processOutboxMutation.mutate()}>
            <Play className="h-4 w-4 mr-1" /> Process Outbox
          </Button>
          <Button size="sm" variant="outline" onClick={() => logsQuery.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Total: {logsQuery.data?.total || 0} entries
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Sent At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log: any) => (
            <TableRow key={log.id}>
              <TableCell>
                <Badge variant={
                  log.status === 'sent' ? 'default' :
                  log.status === 'failed' ? 'destructive' :
                  log.status === 'queued' ? 'secondary' : 'outline'
                } className={log.status === 'sent' ? 'bg-green-600' : ''}>
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{log.templateKey}</TableCell>
              <TableCell className="text-xs">{log.recipientEmail}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">{log.subject}</TableCell>
              <TableCell className="text-xs">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}</TableCell>
              <TableCell>
                {log.status === 'failed' && (
                  <Button size="sm" variant="ghost" onClick={() => retryMutation.mutate(log.id)}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No email logs yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Rules Tab ───────────────────────────────────────────────────────────────

function RulesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({ queryKey: ['mercury-rules'], queryFn: mercuryApi.getRules });
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({
    eventType: '', templateKey: '', recipientResolver: 'requester', description: '',
  });

  const createMutation = useMutation({
    mutationFn: () => mercuryApi.createRule(newRule),
    onSuccess: () => {
      setShowNewRule(false);
      queryClient.invalidateQueries({ queryKey: ['mercury-rules'] });
      toast({ title: 'Rule created' });
    },
    onError: (err: any) => toast({ title: 'Create failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mercuryApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-rules'] });
      toast({ title: 'Rule deleted' });
    },
    onError: (err: any) => toast({ title: 'Delete failed', description: String(err.message || err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Notification Rules</h2>
          <p className="text-sm text-muted-foreground">
            Map event types to templates and recipient resolvers.
          </p>
        </div>
        <Button onClick={() => setShowNewRule(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Rule
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event Type</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Recipients</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rulesQuery.data || []).map((rule: any) => (
            <TableRow key={rule.id}>
              <TableCell className="font-mono text-xs">{rule.eventType}</TableCell>
              <TableCell className="font-mono text-xs">{rule.templateKey}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">{rule.recipientResolver}</Badge>
              </TableCell>
              <TableCell className="text-xs">{rule.channelType}</TableCell>
              <TableCell>
                {rule.isEnabled ? <Badge className="bg-green-600 text-xs">On</Badge> : <Badge variant="secondary" className="text-xs">Off</Badge>}
              </TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteMutation.mutate(rule.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {(rulesQuery.data || []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No notification rules configured. Create a rule to enable automatic email notifications.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* New Rule Dialog */}
      <Dialog open={showNewRule} onOpenChange={setShowNewRule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Notification Rule</DialogTitle>
            <DialogDescription>Map an event type to a Mercury template + recipient resolver.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Event Type</Label>
              <Input
                value={newRule.eventType}
                onChange={e => setNewRule({ ...newRule, eventType: e.target.value })}
                placeholder="e.g. project_request_approved"
              />
            </div>
            <div>
              <Label>Template Key</Label>
              <Input
                value={newRule.templateKey}
                onChange={e => setNewRule({ ...newRule, templateKey: e.target.value })}
                placeholder="e.g. project_request_approved"
              />
            </div>
            <div>
              <Label>Recipient Resolver</Label>
              <select
                className="w-full border rounded px-2 py-2 text-sm"
                value={newRule.recipientResolver}
                onChange={e => setNewRule({ ...newRule, recipientResolver: e.target.value })}
              >
                <option value="requester">Requester (actor)</option>
                <option value="tenant_admins">Tenant Admins</option>
                <option value="all_tenant_users">All Tenant Users</option>
                <option value="custom">Custom Recipients</option>
              </select>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={newRule.description}
                onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                placeholder="What this rule does"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRule(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newRule.eventType || !newRule.templateKey}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
