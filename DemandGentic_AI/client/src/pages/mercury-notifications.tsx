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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Mail, CheckCircle, XCircle, Send, Eye, RefreshCw, Users, Zap, FileText,
  Settings, AlertTriangle, Loader2, Plus, Trash2, Edit, Play, Download,
  Sparkles, Wand2, Copy, LayoutGrid, ArrowRight, Bell, Power,
  Workflow, MailCheck, MailX, UserCheck, ShieldCheck, ChevronDown,
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
  previewTemplate: (key: string, variables?: Record) =>
    apiRequest('POST', `/api/communications/mercury/templates/${key}/preview`, { variables }).then(r => r.json()),
  testSend: (key: string, data: any) =>
    apiRequest('POST', `/api/communications/mercury/templates/${key}/test-send`, data).then(r => r.json()),
  aiGenerate: (data: any) => apiRequest('POST', '/api/communications/mercury/templates/ai/generate', data).then(r => r.json()),
  aiRefine: (data: any) => apiRequest('POST', '/api/communications/mercury/templates/ai/refine', data).then(r => r.json()),
  inviteDryRun: () => apiRequest('POST', '/api/communications/mercury/invitations/dry-run').then(r => r.json()),
  inviteSend: (portalBaseUrl?: string) =>
    apiRequest('POST', '/api/communications/mercury/invitations/send', { portalBaseUrl }).then(r => r.json()),
  inviteStatus: () => apiRequest('GET', '/api/communications/mercury/invitations/status').then(r => r.json()),
  inviteSendSingle: (clientUserId: string, portalBaseUrl?: string) =>
    apiRequest('POST', '/api/communications/invitations/send-single', { clientUserId, portalBaseUrl }).then(r => r.json()),
  invitePreviewSingle: (clientUserId: string, portalBaseUrl?: string) =>
    apiRequest('POST', '/api/communications/invitations/preview', { clientUserId, portalBaseUrl }).then(r => r.json()),
  getLogs: (params?: Record) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiRequest('GET', `/api/communications/mercury/logs${qs}`).then(r => r.json());
  },
  retryLog: (id: string) => apiRequest('POST', `/api/communications/mercury/logs/${id}/retry`).then(r => r.json()),
  processOutbox: () => apiRequest('POST', '/api/communications/mercury/outbox/process').then(r => r.json()),
  getRules: () => apiRequest('GET', '/api/communications/mercury/notifications/rules').then(r => r.json()),
  createRule: (data: any) => apiRequest('POST', '/api/communications/mercury/notifications/rules', data).then(r => r.json()),
  deleteRule: (id: string) => apiRequest('DELETE', `/api/communications/mercury/notifications/rules/${id}`).then(r => r.json()),
  updateRule: (id: string, data: any) => apiRequest('PUT', `/api/communications/mercury/notifications/rules/${id}`, data).then(r => r.json()),
};

// ─── Template Gallery Data ───────────────────────────────────────────────────

const TEMPLATE_GALLERY: Array = [
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
    
      
        
          
          Mercury Bridge — Notifications
        
        
          SMTP email notifications, templates, AI template studio, and bulk client invitations.
        
      

      
        
          
             Status
          
          
             Templates
          
          
             AI Studio
          
          
             Invitations
          
          
             Email Logs
          
          
             Workflows
          
          
             Rules
          
        

        
        
        
        
        
        
        
      
    
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
    
      
        
          
            
            Mercury Bridge Status
          
        
        
          {statusQuery.isLoading ? (
            
               Loading...
            
          ) : statusQuery.error ? (
            
               Failed to load status
            
          ) : (
            
              
                
                  Version
                  {status?.mercury?.version}
                
                
                  Default Sender
                  {status?.mercury?.defaultSender}
                
                
                  SMTP Status
                  
                    {status?.smtp?.verified ? (
                      Connected
                    ) : status?.smtp?.configured ? (
                      Not Verified
                    ) : (
                      Not Configured
                    )}
                  
                
                
                  Provider
                  {status?.smtp?.providerName || '—'}
                
              

              
                
                  Feature: smtp_email_enabled
                  
                    {status?.featureFlags?.smtp_email_enabled ? (
                      ON
                    ) : (
                      OFF
                    )}
                  
                
                
                  Feature: bulk_invites_enabled
                  
                    {status?.featureFlags?.bulk_invites_enabled ? (
                      ON
                    ) : (
                      OFF
                    )}
                  
                
              

              {status?.smtp?.error && (
                
                  SMTP Error: {status.smtp.error}
                
              )}

              
                 verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending ?  : }
                  Verify Connection
                
                 seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                >
                  {seedMutation.isPending ?  : }
                  Seed Default Templates
                
              

              {seedMutation.data && (
                
                  Templates seeded: {seedMutation.data.created} created, {seedMutation.data.skipped} skipped
                
              )}
            
          )}
        
      
    
  );
}

// ─── Templates Tab ───────────────────────────────────────────────────────────

function TemplatesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({ queryKey: ['mercury-templates'], queryFn: mercuryApi.getTemplates });
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [testSendDialog, setTestSendDialog] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');

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
    
      
        
          Email Templates
          {categories.length > 0 && (
             setCategoryFilter(e.target.value)}
            >
              All Categories
              {categories.map((cat: string) => (
                {cat}
              ))}
            
          )}
          {filtered.length} templates
        
        
           setEditingTemplate({
            templateKey: '', name: '', subjectTemplate: '', htmlTemplate: '', textTemplate: '',
            description: '', category: 'notification', variables: [], isEnabled: true,
          })}>
             Blank Template
          
        
      

      {templatesQuery.isLoading ? (
         Loading...
      ) : (
        
          
            
              Template
              Key
              Category
              Status
              Variables
              Updated
              Actions
            
          
          
            {filtered.map((template: any) => (
              
                
                  
                    {template.name}
                    {template.description}
                  
                
                
                  {template.templateKey}
                
                
                  {template.category}
                
                
                  {template.isEnabled !== false ? (
                    Enabled
                  ) : (
                    Disabled
                  )}
                
                
                  {template.variables?.length || 0} vars
                
                
                  
                    {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : '—'}
                  
                
                
                  
                     previewMutation.mutate(template.templateKey)}>
                      
                    
                     { setTestSendDialog(template.templateKey); setTestResult(null); }}>
                      
                    
                     setEditingTemplate(template)}>
                      
                    
                     duplicateMutation.mutate(template)}>
                      
                    
                     {
                      if (confirm(`Delete template "${template.name}"?`)) deleteMutation.mutate(template.templateKey);
                    }}>
                      
                    
                  
                
              
            ))}
            {filtered.length === 0 && (
              
                
                  No templates yet. Click "Seed Default Templates" in the Status tab or use the AI Studio to generate templates.
                
              
            )}
          
        
      )}

      {/* Preview Dialog — Sandboxed iframe */}
       setPreviewData(null)}>
        
          
            Template Preview
            Rendered with sample data — no email sent.
          
          {previewData && (
            
              
                Subject
                {previewData.rendered?.subject}
              
              
                Variables Used
                
                  {(previewData.variables || []).map((v: any) => (
                    {v.name}={v.value}
                  ))}
                
              
              
                HTML Preview
                
              
            
          )}
        
      

      {/* Test Send Dialog */}
       { setTestSendDialog(null); setTestResult(null); }}>
        
          
            Send Test Email
            
              Template: {testSendDialog}
            
          
          
            
              Recipient Email
               setTestEmail(e.target.value)}
              />
            
            {testResult && (
              
                {testResult.success ? (
                  <>
                    
                    Test email sent! MessageID: {testResult.messageId || 'N/A'}
                  
                ) : (
                  <>
                    
                    Failed: {testResult.error}
                  
                )}
              
            )}
          
          
             { setTestSendDialog(null); setTestResult(null); }}>Cancel
             testSendDialog && testSendMutation.mutate({ key: testSendDialog, email: testEmail })}
              disabled={!testEmail || testSendMutation.isPending}
            >
              {testSendMutation.isPending ?  : }
              Send Test
            
          
        
      

      {/* Edit Template Dialog */}
       setEditingTemplate(null)}
        onSaved={() => {
          setEditingTemplate(null);
          queryClient.invalidateQueries({ queryKey: ['mercury-templates'] });
        }}
      />
    
  );
}

// ─── Sandboxed Preview Component ─────────────────────────────────────────────

function SandboxedPreview({ html }: { html: string }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`body{margin:0;padding:16px;font-family:Arial,sans-serif;}${html}`);
        doc.close();
      }
    }
  }, [html]);

  return (
    
  );
}

// ─── Template Editor Dialog ──────────────────────────────────────────────────

function TemplateEditorDialog({ template, onClose, onSaved }: {
  template: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(template || {});
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
    
      
        
          {template.id ? 'Edit Template' : 'New Template'}
          
            {template.id ? 'Modify the template fields below.' : 'Create a new Mercury email template.'}
          
        
        
          
            
              Template Key
               setForm({ ...form, templateKey: e.target.value })}
                disabled={!!template.id}
                placeholder="e.g. my_notification"
              />
            
            
              Name
               setForm({ ...form, name: e.target.value })} placeholder="Display name" />
            
          
          
            Description
             setForm({ ...form, description: e.target.value })} />
          
          
            Subject Template
             setForm({ ...form, subjectTemplate: e.target.value })} placeholder="Email subject with {{variables}}" />
          
          
            
              HTML Template
              
                 setShowPreview(!showPreview)}>
                   {showPreview ? 'Editor' : 'Preview'}
                
                {form.htmlTemplate && (
                  <>
                     refineMutation.mutate('improve')}
                      disabled={refineMutation.isPending}>
                       Improve
                    
                     refineMutation.mutate('shorten')}
                      disabled={refineMutation.isPending}>
                      Shorten
                    
                     refineMutation.mutate('formal')}
                      disabled={refineMutation.isPending}>
                      Formal
                    
                     refineMutation.mutate('friendly')}
                      disabled={refineMutation.isPending}>
                      Friendly
                    
                     refineMutation.mutate('cta')}
                      disabled={refineMutation.isPending}>
                      Better CTA
                    
                  
                )}
                {refineMutation.isPending && }
              
            
            {showPreview ? (
              No HTML content yet'} />
            ) : (
               setForm({ ...form, htmlTemplate: e.target.value })}
                rows={14}
                className="font-mono text-xs"
                placeholder="HTML email body with {{variables}}"
              />
            )}
          
          
            Text Template (optional)
             setForm({ ...form, textTemplate: e.target.value })}
              rows={4}
              className="font-mono text-xs"
              placeholder="Plain text fallback"
            />
          
          
            
              Category
               setForm({ ...form, category: e.target.value })}
              >
                Invitation
                Notification
                System
                Marketing
                Onboarding
              
            
            
              
                 setForm({ ...form, isEnabled: e.target.checked })}
                />
                Enabled
              
            
          

          {/* Variable Editor */}
          
            
              Variables
               {
                const vars = form.variables || [];
                setForm({ ...form, variables: [...vars, { name: '', description: '', required: false, exampleValue: '' }] });
              }}>
                 Add Variable
              
            
            {(form.variables || []).map((v: any, i: number) => (
              
                 {
                    const vars = [...(form.variables || [])];
                    vars[i] = { ...vars[i], name: e.target.value };
                    setForm({ ...form, variables: vars });
                  }}
                />
                 {
                    const vars = [...(form.variables || [])];
                    vars[i] = { ...vars[i], description: e.target.value };
                    setForm({ ...form, variables: vars });
                  }}
                />
                 {
                    const vars = [...(form.variables || [])];
                    vars[i] = { ...vars[i], exampleValue: e.target.value };
                    setForm({ ...form, variables: vars });
                  }}
                />
                
                   {
                      const vars = [...(form.variables || [])];
                      vars[i] = { ...vars[i], required: e.target.checked };
                      setForm({ ...form, variables: vars });
                    }}
                  />
                  Req
                
                 {
                  const vars = [...(form.variables || [])];
                  vars.splice(i, 1);
                  setForm({ ...form, variables: vars });
                }}>
                  
                
              
            ))}
          
        
        
          Cancel
           saveMutation.mutate()} disabled={saveMutation.isPending || !form.templateKey || !form.name || !form.subjectTemplate}>
            {saveMutation.isPending ?  : null}
            {template.id ? 'Update' : 'Create'}
          
        
      
    
  );
}

// ─── AI Studio Tab ───────────────────────────────────────────────────────────

function AIStudioTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('gallery');
  const [generating, setGenerating] = useState(false);
  const [generatedTemplate, setGeneratedTemplate] = useState(null);
  const [lastGalleryItem, setLastGalleryItem] = useState(null);

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
    
      
        
          
          AI Template Studio
        
        
          Generate professional email templates instantly using AI — pick from the gallery or describe what you need.
        
      

      {/* Mode Toggle */}
      
         setMode('gallery')}>
           Gallery
        
         setMode('generate')}>
           Custom Prompt
        
      

      {/* Gallery Mode */}
      {mode === 'gallery' && !generating && !generatedTemplate && (
        
          {TEMPLATE_GALLERY.map((item, i) => (
             generateFromGallery(item)}
            >
              
                
                  {item.icon}
                  
                    {item.name}
                    {item.category}
                    {item.description}
                  
                
                
                  
                  Generate with AI
                
              
            
          ))}
        
      )}

      {/* Custom Prompt Mode */}
      {mode === 'generate' && !generating && !generatedTemplate && (
        
          
            
              
              Describe Your Template
            
            Tell the AI what kind of email template you need.
          
          
            
              
                Category
                 setAiForm({ ...aiForm, category: e.target.value })}
                >
                  Invitation
                  Notification
                  System
                  Marketing
                  Onboarding
                
              
              
                Tone
                 setAiForm({ ...aiForm, tone: e.target.value })}
                >
                  Professional
                  Friendly
                  Formal
                  Casual
                  Urgent
                
              
            
            
              Audience *
               setAiForm({ ...aiForm, audience: e.target.value })}
              />
            
            
              Purpose *
               setAiForm({ ...aiForm, purpose: e.target.value })}
              />
            
            
              Required Variables (comma-separated, optional)
               setAiForm({ ...aiForm, variables: e.target.value })}
              />
            
            
              Additional Context (optional)
               setAiForm({ ...aiForm, context: e.target.value })}
              />
            
            
              
              Generate Template
            
          
        
      )}

      {/* Generated Template Preview */}
      {generatedTemplate && (
        
          
            
              
              Generated: {generatedTemplate.name}
            
            {generatedTemplate.description}
          
          
            
              
                Template Key
                {generatedTemplate.templateKey}
              
              
                Category
                {generatedTemplate.category}
              
            
            
              Subject
              {generatedTemplate.subjectTemplate}
            
            
              Variables
              
                {(generatedTemplate.variables || []).map((v: any) => (
                  
                    {'{{'}{v.name}{'}}'}{v.required ? ' *' : ''}
                  
                ))}
              
            
            
              HTML Preview
              
            
            
               saveMutation.mutate(generatedTemplate)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ?  : }
                Save to Templates
              
               setGeneratedTemplate(null)}>
                Discard
              
               {
                setGeneratedTemplate(null);
                if (lastGalleryItem) {
                  generateFromGallery(lastGalleryItem);
                } else {
                  generateFromPrompt();
                }
              }}>
                 Regenerate
              
            
          
        
      )}

      {generating && (
        
          
          Generating template with AI...
        
      )}
    
  );
}

// ─── Invitations Tab ─────────────────────────────────────────────────────────

function InvitationsTab() {
  const { toast } = useToast();
  const [dryRunData, setDryRunData] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [sendResult, setSendResult] = useState(null);

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
    
      
        
          
            
            Bulk Client Invitations
          
          
            Preview the invitation email draft, review eligible recipients, then send to all.
            Dry Run is always available. Actual send requires the bulk_invites_enabled feature flag.
          
        
        
          {/* Action buttons */}
          
             dryRunMutation.mutate()} disabled={dryRunMutation.isPending} variant="outline">
              {dryRunMutation.isPending ?  : }
              Preview Recipients & Draft
            
            {dryRunData?.templatePreview?.html && (
               setShowEmailPreview(true)} variant="outline">
                
                View Email Draft
              
            )}
            {dryRunData && dryRunData.eligibleCount > 0 && (
               setShowConfirm(true)} variant="default">
                
                Send to All ({dryRunData.eligibleCount})
              
            )}
          

          {dryRunMutation.error && (
            
              
              {String((dryRunMutation.error as any)?.message || dryRunMutation.error)}
            
          )}

          {dryRunData && (
            
              {/* Stats row */}
              
                
                  
                    {dryRunData.eligibleCount}
                    Eligible Recipients
                  
                
                
                  
                    {dryRunData.skippedCount}
                    Skipped
                  
                
              

              {/* Inline email draft preview */}
              {dryRunData.templatePreview?.html && (
                
                  
                    
                      
                      Email Draft Preview
                    
                    
                      Subject: {dryRunData.templatePreview.subject || 'N/A'}
                    
                  
                  
                    
                      
                    
                  
                
              )}

              {dryRunData.eligibleCount === 0 && dryRunData.skippedCount === 0 && (
                
                  
                  No eligible or skipped recipients found. This may mean there are no client users with email addresses, or all have already been invited.
                
              )}

              {dryRunData.eligible?.length > 0 && (
                
                  Eligible Recipients {dryRunData.eligible.length > 10 ? `(showing 10 of ${dryRunData.eligible.length})` : ''}
                  
                    
                      
                        Email
                        Name
                        Account
                        Note
                      
                    
                    
                      {dryRunData.eligible.slice(0, 10).map((c: any) => (
                        
                          {c.email}
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                          {c.clientAccountName}
                          {c.reason || ''}
                        
                      ))}
                    
                  
                  {dryRunData.eligible.length > 10 && (
                    ...and {dryRunData.eligible.length - 10} more
                  )}
                
              )}

              {dryRunData.skipped?.length > 0 && (
                
                  Skipped ({dryRunData.skipped.length})
                  
                    
                      
                        Email
                        Reason
                      
                    
                    
                      {dryRunData.skipped.slice(0, 5).map((c: any) => (
                        
                          {c.email}
                          {c.reason}
                        
                      ))}
                    
                  
                  {dryRunData.skipped.length > 5 && (
                    ...and {dryRunData.skipped.length - 5} more
                  )}
                
              )}
            
          )}

          {sendResult && (
            
              
                 Bulk Invitation Sent
              
              
                Queued: {sendResult.totalQueued} | Skipped: {sendResult.totalSkipped} | Batches: {sendResult.batchCount}
              
            
          )}

          {statusQuery.data && statusQuery.data.total > 0 && (
            
              Invitation Sending Status
              
                
                  {statusQuery.data.queued}
                  Queued
                
                
                  {statusQuery.data.sending}
                  Sending
                
                
                  {statusQuery.data.sent}
                  Sent
                
                
                  {statusQuery.data.failed}
                  Failed
                
              
            
          )}
        
      

      {/* Confirm Send Dialog */}
      
        
          
            Confirm Bulk Invitation
            
              
                
                  You are about to send invitation emails to {dryRunData?.eligibleCount || 0} client users.
                  Each user will receive a unique secure link to set up their password and access the portal.
                
                {dryRunData?.templatePreview?.subject && (
                  
                    Email subject:
                    {dryRunData.templatePreview.subject}
                  
                )}
                Links expire in 7 days. Are you sure you want to proceed?
              
            
          
          
            Cancel
             sendMutation.mutate()} disabled={sendMutation.isPending}>
              {sendMutation.isPending ?  : }
              Send Invitations
            
          
        
      

      {/* Full Email Draft Preview Dialog */}
      
        
          
            
              
              Invitation Email Draft
            
            
              This is how the invitation email will appear to recipients. Template variables (name, company, link) will be personalized per user.
            
          
          {dryRunData?.templatePreview && (
            
              
                Subject Line
                {dryRunData.templatePreview.subject}
              
              
                
              
            
          )}
          
             setShowEmailPreview(false)}>Close
            {dryRunData && dryRunData.eligibleCount > 0 && (
               { setShowEmailPreview(false); setShowConfirm(true); }}>
                
                Send to All ({dryRunData.eligibleCount})
              
            )}
          
        
      
    
  );
}

// ─── Logs Tab ────────────────────────────────────────────────────────────────

function LogsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
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
    
      
        Email Logs
        
           setStatusFilter(e.target.value)}
          >
            All Statuses
            Queued
            Sending
            Sent
            Failed
          
           processOutboxMutation.mutate()}>
             Process Outbox
          
           logsQuery.refetch()}>
             Refresh
          
        
      

      
        Total: {logsQuery.data?.total || 0} entries
      

      
        
          
            Status
            Template
            Recipient
            Subject
            Sent At
            Actions
          
        
        
          {logs.map((log: any) => (
            
              
                
                  {log.status}
                
              
              {log.templateKey}
              {log.recipientEmail}
              {log.subject}
              {log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}
              
                {log.status === 'failed' && (
                   retryMutation.mutate(log.id)}>
                    
                  
                )}
              
            
          ))}
          {logs.length === 0 && (
            
              
                No email logs yet
              
            
          )}
        
      
    
  );
}

// ─── Rules Tab ───────────────────────────────────────────────────────────────

// ─── Notification Workflow Constants ─────────────────────────────────────────

const EVENT_META: Record = {
  campaign_order_submitted: {
    label: 'Campaign Order Submitted',
    description: 'Client submits a new campaign order for approval',
    icon: MailCheck,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  campaign_order_approved: {
    label: 'Campaign Order Approved',
    description: 'Admin approves a submitted campaign order',
    icon: UserCheck,
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  campaign_order_rejected: {
    label: 'Campaign Order Rejected',
    description: 'Admin rejects a submitted campaign order',
    icon: MailX,
    color: 'bg-red-100 text-red-700 border-red-200',
  },
  project_request_approved: {
    label: 'Project Request Approved',
    description: 'Admin approves a client project request',
    icon: ShieldCheck,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  project_request_rejected: {
    label: 'Project Request Rejected',
    description: 'Admin rejects a client project request',
    icon: MailX,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  campaign_launched: {
    label: 'Campaign Launched',
    description: 'A campaign goes live and starts generating leads',
    icon: Play,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  leads_delivered: {
    label: 'Leads Delivered',
    description: 'New leads are delivered to the client',
    icon: Users,
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  },
  client_invite: {
    label: 'Client Invitation',
    description: 'New client user receives portal access invitation',
    icon: Mail,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
};

const RESOLVER_LABELS: Record = {
  requester: 'Requester (actor)',
  tenant_admins: 'Tenant Admins',
  all_tenant_users: 'All Client Users',
  custom: 'Custom Recipients',
};

// ─── Workflows Tab ──────────────────────────────────────────────────────────

function WorkflowsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({ queryKey: ['mercury-rules'], queryFn: mercuryApi.getRules });
  const templatesQuery = useQuery({ queryKey: ['mercury-templates'], queryFn: mercuryApi.getTemplates });
  const [showCreate, setShowCreate] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    eventType: '',
    templateKey: '',
    recipientResolver: 'all_tenant_users',
    customRecipients: '',
    description: '',
  });

  const rules: any[] = rulesQuery.data || [];
  const templates: any[] = templatesQuery.data || [];
  const templateMap = new Map();
  for (const t of templates) templateMap.set(t.templateKey, t);

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      mercuryApi.updateRule(id, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-rules'] });
      toast({ title: 'Workflow updated' });
    },
    onError: (err: any) => toast({ title: 'Update failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mercuryApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-rules'] });
      toast({ title: 'Workflow deleted' });
    },
    onError: (err: any) => toast({ title: 'Delete failed', description: String(err.message || err), variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: () => mercuryApi.createRule({
      eventType: newWorkflow.eventType,
      templateKey: newWorkflow.templateKey,
      channelType: 'email',
      recipientResolver: newWorkflow.recipientResolver,
      customRecipients: newWorkflow.recipientResolver === 'custom'
        ? newWorkflow.customRecipients.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      isEnabled: true,
      description: newWorkflow.description,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mercury-rules'] });
      setShowCreate(false);
      setNewWorkflow({ eventType: '', templateKey: '', recipientResolver: 'all_tenant_users', customRecipients: '', description: '' });
      toast({ title: 'Workflow created' });
    },
    onError: (err: any) => toast({ title: 'Create failed', description: String(err.message || err), variant: 'destructive' }),
  });

  // Group rules by eventType for visual grouping
  const eventTypes = Array.from(new Set(rules.map((r: any) => r.eventType)));
  const allEventTypes = Array.from(new Set([...Object.keys(EVENT_META), ...eventTypes]));

  return (
    
      
        
          Notification Workflows
          
            Visual automation pipelines — when an event fires, Mercury sends the right email to the right people.
          
        
         setShowCreate(true)}>
           Create Workflow
        
      

      {/* Active Workflows */}
      
        {rules.length === 0 && !rulesQuery.isLoading && (
          
            
              
              No workflows configured
              
                Create a workflow to automatically send email notifications when events occur.
              
               setShowCreate(true)}>
                 Create Your First Workflow
              
            
          
        )}

        {rules.map((rule: any) => {
          const meta = EVENT_META[rule.eventType] || {
            label: rule.eventType,
            description: '',
            icon: Bell,
            color: 'bg-gray-100 text-gray-700 border-gray-200',
          };
          const Icon = meta.icon;
          const template = templateMap.get(rule.templateKey);

          return (
            
              
                
                  {/* Flow visualization */}
                  
                    {/* Trigger */}
                    
                      
                      
                        {meta.label}
                        Trigger
                      
                    

                    

                    {/* Template */}
                    
                      
                      
                        
                          {template?.name || rule.templateKey}
                        
                        Template
                      
                    

                    

                    {/* Recipients */}
                    
                      
                      
                        
                          {RESOLVER_LABELS[rule.recipientResolver] || rule.recipientResolver}
                        
                        Recipients
                      
                    

                    

                    {/* Channel */}
                    
                      
                      
                        {rule.channelType || 'email'}
                        Channel
                      
                    
                  

                  {/* Controls */}
                  
                     toggleMutation.mutate({ id: rule.id, isEnabled: checked })}
                    />
                     deleteMutation.mutate(rule.id)}
                    >
                      
                    
                  
                

                {rule.description && (
                  {rule.description}
                )}

                {rule.recipientResolver === 'custom' && rule.customRecipients?.length > 0 && (
                  
                    {rule.customRecipients.map((email: string, i: number) => (
                      {email}
                    ))}
                  
                )}
              
            
          );
        })}
      

      {/* Create Workflow Dialog */}
      
        
          
            
              
              Create Notification Workflow
            
            
              When the selected event fires, Mercury will send the chosen email template to the specified recipients.
            
          

          
            {/* Event Type */}
            
              Trigger Event
               setNewWorkflow({ ...newWorkflow, eventType: v })}>
                
                  
                
                
                  {allEventTypes.map((evt) => {
                    const meta = EVENT_META[evt];
                    return (
                      
                        
                          {meta ?  : }
                          {meta?.label || evt}
                        
                      
                    );
                  })}
                
              
              {newWorkflow.eventType && EVENT_META[newWorkflow.eventType] && (
                {EVENT_META[newWorkflow.eventType].description}
              )}
            

            {/* Template */}
            
              Email Template
               setNewWorkflow({ ...newWorkflow, templateKey: v })}>
                
                  
                
                
                  {templates.map((t: any) => (
                    
                      
                        
                        {t.name}
                      
                    
                  ))}
                
              
            

            {/* Recipients */}
            
              Recipients
               setNewWorkflow({ ...newWorkflow, recipientResolver: v })}>
                
                  
                
                
                  Requester (actor who triggered)
                  Tenant Admins
                  All Client Users
                  Custom Email Recipients
                
              
            

            {newWorkflow.recipientResolver === 'custom' && (
              
                Custom Recipients (comma-separated)
                 setNewWorkflow({ ...newWorkflow, customRecipients: e.target.value })}
                  placeholder="admin@company.com, ops@company.com"
                />
              
            )}

            {/* Description */}
            
              Description (optional)
               setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                placeholder="What this workflow does"
              />
            

            {/* Preview */}
            {newWorkflow.eventType && newWorkflow.templateKey && (
              
                
                  Workflow Preview
                  
                    
                      {EVENT_META[newWorkflow.eventType]?.label || newWorkflow.eventType}
                    
                    
                    {templateMap.get(newWorkflow.templateKey)?.name || newWorkflow.templateKey}
                    
                    {RESOLVER_LABELS[newWorkflow.recipientResolver] || newWorkflow.recipientResolver}
                  
                
              
            )}
          

          
             setShowCreate(false)}>Cancel
             createMutation.mutate()}
              disabled={createMutation.isPending || !newWorkflow.eventType || !newWorkflow.templateKey}
            >
              {createMutation.isPending ?  : }
              Create Workflow
            
          
        
      
    
  );
}

// ─── Rules Tab ──────────────────────────────────────────────────────────────

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
    
      
        
          Notification Rules
          
            Map event types to templates and recipient resolvers.
          
        
         setShowNewRule(true)}>
           New Rule
        
      

      
        
          
            Event Type
            Template
            Recipients
            Channel
            Enabled
            Actions
          
        
        
          {(rulesQuery.data || []).map((rule: any) => (
            
              {rule.eventType}
              {rule.templateKey}
              
                {rule.recipientResolver}
              
              {rule.channelType}
              
                {rule.isEnabled ? On : Off}
              
              
                 deleteMutation.mutate(rule.id)}>
                  
                
              
            
          ))}
          {(rulesQuery.data || []).length === 0 && (
            
              
                No notification rules configured. Create a rule to enable automatic email notifications.
              
            
          )}
        
      

      {/* New Rule Dialog */}
      
        
          
            New Notification Rule
            Map an event type to a Mercury template + recipient resolver.
          
          
            
              Event Type
               setNewRule({ ...newRule, eventType: e.target.value })}
                placeholder="e.g. project_request_approved"
              />
            
            
              Template Key
               setNewRule({ ...newRule, templateKey: e.target.value })}
                placeholder="e.g. project_request_approved"
              />
            
            
              Recipient Resolver
               setNewRule({ ...newRule, recipientResolver: e.target.value })}
              >
                Requester (actor)
                Tenant Admins
                All Tenant Users
                Custom Recipients
              
            
            
              Description (optional)
               setNewRule({ ...newRule, description: e.target.value })}
                placeholder="What this rule does"
              />
            
          
          
             setShowNewRule(false)}>Cancel
             createMutation.mutate()} disabled={createMutation.isPending || !newRule.eventType || !newRule.templateKey}>
              {createMutation.isPending ?  : null}
              Create Rule
            
          
        
      
    
  );
}