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
  const [selectedNotification, setSelectedNotification] = useState(null);

  // Composer state
  const [notificationType, setNotificationType] = useState('pipeline_update');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedTemplate, setGeneratedTemplate] = useState(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [customRecipientInput, setCustomRecipientInput] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: ['/api/admin/client-notifications/client', clientAccountId],
    enabled: !!clientAccountId,
  });

  const { data: recipientsData } = useQuery({
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
      case 'sent': return Sent;
      case 'failed': return Failed;
      case 'queued': return Queued;
      default: return Draft;
    }
  };

  const getTypeIcon = (type: string) => {
    const found = NOTIFICATION_TYPES.find(t => t.value === type);
    if (found) {
      const Icon = found.icon;
      return ;
    }
    return ;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    
      {/* Header */}
      
        
          
            
            Notification Center
          
          
            Send beautiful, AI-generated email notifications to {clientName}
          
        
         setShowComposer(true)} className="gap-2">
          
          New Notification
        
      

      {/* Quick Actions Grid */}
      
        {NOTIFICATION_TYPES.map((type) => {
          const Icon = type.icon;
          return (
             {
                setNotificationType(type.value);
                setShowComposer(true);
              }}
              className="group flex items-start gap-3 p-4 rounded-xl border bg-card hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all text-left"
            >
              
                
              
              
                {type.label}
                {type.description}
              
            
          );
        })}
      

      {/* Notification History */}
      
        
          
            Recent Notifications
            
              {notifications?.total || 0} total
            
          
        
        
          {notificationsLoading ? (
            
              
            
          ) : notifications?.notifications && notifications.notifications.length > 0 ? (
            
              
                {notifications.notifications.map((n) => (
                  
                    
                      
                        {getTypeIcon(n.notificationType)}
                      
                      
                        {n.subject}
                        
                          {getStatusBadge(n.status)}
                          
                            {new Date(n.createdAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          
                          {n.aiGenerated && (
                            
                               AI
                            
                          )}
                          
                            {n.recipientEmails?.length || 0} recipients
                          
                        
                      
                    
                    
                       {
                          setSelectedNotification(n);
                          setShowPreview(true);
                        }}
                      >
                        
                      
                      {n.status === 'draft' && (
                         deleteMutation.mutate(n.id)}
                        >
                          
                        
                      )}
                    
                  
                ))}
              
            
          ) : (
            
              
              No notifications sent yet
              Click "New Notification" to compose your first one
            
          )}
        
      

      {/* ─── Composer Dialog ──────────────────────────────────────────── */}
       { if (!open) resetComposer(); else setShowComposer(true); }}>
        
          
            
              
              Compose Client Notification
            
          

          
            {/* Step 1: Configure */}
            
              
                1
                Configure Notification
              
              
              
                
                  Notification Type
                  
                    
                      
                    
                    
                      {NOTIFICATION_TYPES.map(t => (
                        
                          
                            
                            {t.label}
                          
                        
                      ))}
                    
                  
                
                
                
                  Campaign (optional)
                  
                    
                      
                    
                    
                      All campaigns
                      {campaigns?.map(c => (
                        
                          {c.name}
                        
                      ))}
                    
                  
                
              

              
                Custom Instructions for AI
                 setCustomPrompt(e.target.value)}
                  placeholder="e.g., Include specific metrics: 45 leads generated, 12 qualified meetings. Mention the new pipeline stage we created for enterprise accounts..."
                  rows={3}
                  className="resize-none"
                />
                
                  Describe what you want to communicate. The AI will generate a professional, conversion-friendly email template.
                
              

               generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    
                    Generating with AI...
                  
                ) : (
                  <>
                    
                    Generate Template with AI
                  
                )}
              
            

            {/* Step 2: Preview & Edit */}
            {generatedTemplate && (
              <>
                
                
                  
                    2
                    Review & Edit Template
                  

                  
                    Subject Line
                     setEditedSubject(e.target.value)}
                      className="font-medium"
                    />
                  

                  
                    
                      Email Preview
                       generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                      >
                        
                        Regenerate
                      
                    
                    
                      
                        
                        To: {clientName}
                         AI Generated
                      
                      
                        
                      
                    
                  
                

                {/* Step 3: Recipients & Send */}
                
                
                  
                    3
                    Select Recipients & Send
                  

                  {recipients.length > 0 && (
                    
                      
                        Client Portal Users
                        
                          Select all
                        
                      
                      
                        {recipients.map(r => (
                           toggleRecipient(r.email)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                              selectedRecipients.includes(r.email)
                                ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300'
                                : 'bg-card border-border hover:bg-accent'
                            }`}
                          >
                            {selectedRecipients.includes(r.email) && }
                            {r.name}
                            {r.email}
                          
                        ))}
                      
                    
                  )}

                  
                    Additional Recipients
                     setCustomRecipientInput(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                    />
                    Comma-separated emails for any additional recipients
                  
                
              
            )}
          

          {/* Footer Actions */}
          {generatedTemplate && (
            
              Cancel
               createAndSendMutation.mutate('draft')}
                disabled={createAndSendMutation.isPending}
              >
                
                Save Draft
              
               createAndSendMutation.mutate('send')}
                disabled={createAndSendMutation.isPending || (selectedRecipients.length === 0 && !customRecipientInput.trim())}
                className="gap-2"
              >
                {createAndSendMutation.isPending ? (
                  <>
                    
                    Sending...
                  
                ) : (
                  <>
                    
                    Send via Mercury Bridge
                  
                )}
              
            
          )}
        
      

      {/* ─── Preview Dialog ───────────────────────────────────────────── */}
      
        
          
            
              
              Notification Preview
            
          
          {selectedNotification && (
            
              
                {getStatusBadge(selectedNotification.status)}
                {selectedNotification.aiGenerated && (
                  
                     AI Generated
                  
                )}
                
                  {new Date(selectedNotification.createdAt).toLocaleString()}
                
              
              
              
                Subject
                {selectedNotification.subject}
              

              
                Recipients
                
                  {selectedNotification.recipientEmails?.map(e => (
                    {e}
                  ))}
                
              

              {selectedNotification.errorMessage && (
                
                  
                    
                    {selectedNotification.errorMessage}
                  
                
              )}

              
                
              
            
          )}
        
      
    
  );
}