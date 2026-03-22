/**
 * Client Email Template Builder
 * 
 * Unified email template builder for client portal that uses the same
 * structure, design, and functionality as the main email campaigns.
 * 
 * Features:
 * - Same EmailBuilderPro design for text-first, deliverability-focused emails
 * - AI-powered email generation (same as main campaigns)
 * - Email test and simulation mode
 * - Template library with sample emails
 * - Full preview support (Gmail, Outlook, Mobile)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { RichTextEditor } from '@/components/rich-text-editor';
import {
  Mail, Send, Eye, Code2, Sparkles, Copy, Check,
  AlertTriangle, CheckCircle2, Info, ChevronDown,
  Smartphone, Monitor, FileText, Lightbulb, Zap, AlertCircle,
  User, Building2, AtSign, MousePointer, LayoutTemplate, Loader2,
  Plus, UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeHtmlForIframePreview } from '@/lib/html-preview';

const looksLikeFullHtmlDocument = (html: string) => /]/i.test(html);
const looksLikeHtmlFragment = (value: string) => /]*>/.test(value);

const normalizePlainTextToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(//g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ""))
    .join("");
  return `${paragraphs}`;
};

const ensureHtmlBody = (value: string) =>
  looksLikeHtmlFragment(value) ? value : normalizePlainTextToHtml(value);

// Types
interface Campaign {
  id: string;
  name: string;
  status?: string | null;
}

interface BusinessProfile {
  legalBusinessName: string;
  dbaName?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  customUnsubscribeUrl?: string | null;
  website?: string | null;
  phone?: string | null;
  supportEmail?: string | null;
}

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  preheader?: string;
  htmlContent: string;
  body?: string;
}

interface GeneratedEmail {
  subject: string;
  preheader?: string;
  body: string;
  bodyHtml?: string;
  cta?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  intro?: string;
  valueBullets?: string[];
  ctaLabel?: string;
  closingLine?: string;
  html?: string;
}

interface SmartNudge {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  message: string;
  field?: 'subject' | 'body' | 'cta' | 'links';
}

interface ClientEmailTemplateBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  campaignName?: string;
}

// Constants - Same as main email campaigns
const SPAM_TRIGGER_WORDS = [
  'free', 'act now', 'limited time', 'urgent', 'click here', 'winner',
  'congratulations', 'guarantee', 'no obligation', 'risk free', '100%',
  'amazing', 'incredible', 'unbelievable', 'miracle', '$$$', '!!!',
  'make money', 'earn cash', 'buy now', 'order now'
];

const EMAIL_TYPES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'First touch to new prospects' },
  { value: 'follow_up', label: 'Follow Up', description: 'Follow up after initial contact' },
  { value: 'meeting_request', label: 'Meeting Request', description: 'Request for a call or meeting' },
  { value: 'event_invitation', label: 'Event Invitation', description: 'Webinar or event invite' },
  { value: 'nurture', label: 'Nurture', description: 'Value-add content sharing' },
  { value: 'breakup', label: 'Breakup', description: 'Final outreach attempt' },
];

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
  { value: 'consultative', label: 'Consultative' },
];

// Contact Variables (from clientCrmContacts schema)
const CONTACT_TOKENS = [
  { token: '{{contact.firstName}}', label: 'First Name', icon: User, category: 'contact' },
  { token: '{{contact.lastName}}', label: 'Last Name', icon: User, category: 'contact' },
  { token: '{{contact.email}}', label: 'Email', icon: AtSign, category: 'contact' },
  { token: '{{contact.phone}}', label: 'Phone', icon: User, category: 'contact' },
  { token: '{{contact.mobile}}', label: 'Mobile', icon: User, category: 'contact' },
  { token: '{{contact.title}}', label: 'Job Title', icon: User, category: 'contact' },
  { token: '{{contact.department}}', label: 'Department', icon: User, category: 'contact' },
  { token: '{{contact.linkedinUrl}}', label: 'LinkedIn URL', icon: User, category: 'contact' },
  { token: '{{contact.company}}', label: 'Company (Contact)', icon: Building2, category: 'contact' },
];

// Account Variables (from clientCrmAccounts schema)
const ACCOUNT_TOKENS = [
  { token: '{{account.name}}', label: 'Company Name', icon: Building2, category: 'account' },
  { token: '{{account.domain}}', label: 'Domain', icon: Building2, category: 'account' },
  { token: '{{account.industry}}', label: 'Industry', icon: Building2, category: 'account' },
  { token: '{{account.employees}}', label: 'Employee Count', icon: Building2, category: 'account' },
  { token: '{{account.annualRevenue}}', label: 'Annual Revenue', icon: Building2, category: 'account' },
  { token: '{{account.city}}', label: 'City', icon: Building2, category: 'account' },
  { token: '{{account.state}}', label: 'State', icon: Building2, category: 'account' },
  { token: '{{account.country}}', label: 'Country', icon: Building2, category: 'account' },
  { token: '{{account.phone}}', label: 'Company Phone', icon: Building2, category: 'account' },
  { token: '{{account.website}}', label: 'Website', icon: Building2, category: 'account' },
  { token: '{{account.accountType}}', label: 'Account Type', icon: Building2, category: 'account' },
];

// Sender/Campaign Variables
const SENDER_TOKENS = [
  { token: '{{sender.name}}', label: 'Sender Name', icon: User, category: 'sender' },
  { token: '{{sender.title}}', label: 'Sender Title', icon: User, category: 'sender' },
  { token: '{{sender.company}}', label: 'Sender Company', icon: Building2, category: 'sender' },
  { token: '{{sender.email}}', label: 'Sender Email', icon: AtSign, category: 'sender' },
  { token: '{{campaign.name}}', label: 'Campaign Name', icon: Building2, category: 'campaign' },
];

// Combined for backward compatibility
const PERSONALIZATION_TOKENS = [...CONTACT_TOKENS, ...ACCOUNT_TOKENS, ...SENDER_TOKENS];

// Sample email templates for client reference
const SAMPLE_TEMPLATES: EmailTemplate[] = [
  {
    id: 'sample-cold-outreach',
    name: 'Cold Outreach - Professional',
    subject: 'Quick question about {{account.name}}',
    preheader: "I noticed something interesting about your team's approach...",
    htmlContent: `Hi {{contact.firstName}},

I came across {{account.name}} and was impressed by your growth in the {{account.industry}} market.

We've helped similar companies in your space achieve significant results. Would you be open to a brief conversation to explore if we might be able to help?

Best regards,{{sender.name}}{{sender.title}}`,
    body: 'Hi {{contact.firstName}},\n\nI came across {{account.name}} and was impressed by your growth...',
  },
  {
    id: 'sample-follow-up',
    name: 'Follow Up - Friendly',
    subject: 'Following up on my earlier note',
    preheader: 'Just wanted to make sure this landed in your inbox...',
    htmlContent: `Hi {{contact.firstName}},

I wanted to follow up on my earlier message. I know things get busy, so I thought I'd reach out once more.

Is there a better time for us to connect? Even 15 minutes would be great to explore if there's a fit.

Thanks!`,
    body: 'Hi {{contact.firstName}},\n\nI wanted to follow up on my earlier message...',
  },
  {
    id: 'sample-meeting-request',
    name: 'Meeting Request - Direct',
    subject: 'Can we schedule 15 minutes?',
    preheader: 'I have an idea that might help {{account.name}}...',
    htmlContent: `Hi {{contact.firstName}},

I'll be direct – I think we can help {{account.name}} improve your results significantly.

Can we schedule a quick 15-minute call this week? I'll share some specific ideas tailored to your situation.

What works best for you?`,
    body: 'Hi {{contact.firstName}},\n\nI\'ll be direct – I think we can help {{account.name}}...',
  },
];

// Email analysis utility - Same as EmailBuilderPro
const analyzeEmail = (subject: string, body: string): SmartNudge[] => {
  const nudges: SmartNudge[] = [];

  // Subject line checks
  if (subject.length === 0) {
    nudges.push({
      id: 'subject-empty',
      type: 'error',
      message: 'Subject line is required',
      field: 'subject'
    });
  } else if (subject.length  60) {
    nudges.push({
      id: 'subject-long',
      type: 'warning',
      message: 'Subject line may be truncated in mobile inboxes',
      field: 'subject'
    });
  }

  // Spam word detection
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const foundSpamWords = SPAM_TRIGGER_WORDS.filter(
    word => subjectLower.includes(word) || bodyLower.includes(word)
  );
  if (foundSpamWords.length > 0) {
    nudges.push({
      id: 'spam-words',
      type: 'warning',
      message: `Spam-risk phrases detected: ${foundSpamWords.slice(0, 3).join(', ')}`,
      field: 'body'
    });
  }

  // Check for excessive exclamation marks
  const exclamationCount = (subject + body).match(/!/g)?.length || 0;
  if (exclamationCount > 3) {
    nudges.push({
      id: 'exclamation',
      type: 'warning',
      message: 'Too many exclamation marks can trigger spam filters',
      field: 'body'
    });
  }

  // Check for ALL CAPS
  const capsWords = subject.match(/\b[A-Z]{4,}\b/g);
  if (capsWords && capsWords.length > 1) {
    nudges.push({
      id: 'caps',
      type: 'warning',
      message: 'Avoid using ALL CAPS - it triggers spam filters',
      field: 'subject'
    });
  }

  // CTA detection
  const hasCta = /]+href[^>]*>/i.test(body) || /\[CTA\]|\[BUTTON\]/i.test(body);
  if (!hasCta && body.length > 100) {
    nudges.push({
      id: 'no-cta',
      type: 'info',
      message: 'Consider adding a clear call-to-action (CTA)',
      field: 'cta'
    });
  }

  // Link count
  const linkCount = (body.match(/]+href/gi) || []).length;
  if (linkCount > 5) {
    nudges.push({
      id: 'too-many-links',
      type: 'warning',
      message: 'Too many links can hurt deliverability. Keep it under 5.',
      field: 'links'
    });
  }

  // Body length for cold outreach
  const textContent = body.replace(/]*>/g, '').trim();
  if (textContent.length > 0 && textContent.length  1500) {
    nudges.push({
      id: 'body-long',
      type: 'info',
      message: 'Long emails may reduce engagement. Consider being more concise.',
      field: 'body'
    });
  }

  // Success checks
  if (nudges.filter(n => n.type === 'error' || n.type === 'warning').length === 0) {
    if (subject.length >= 20 && subject.length = 100 && textContent.length  {
  // Build business address from profile (CAN-SPAM compliance requires physical address)
  const companyName = forceOrgName || profile?.dbaName || profile?.legalBusinessName || organizationName || '';
  const addressParts = profile ? [
    profile.addressLine1,
    profile.addressLine2,
    `${profile.city}, ${profile.state} ${profile.postalCode}`,
    profile.country !== 'United States' ? profile.country : null
  ].filter(Boolean).join('') : '';

  const unsubscribeUrl = profile?.customUnsubscribeUrl || '{{unsubscribe_url}}';

  const footer = `
    
      
        ${companyName}
        ${addressParts ? `${addressParts}` : ''}
        
          Unsubscribe
          |
          Manage Preferences
        
      
    
  `;

  return `


  
  
  
  
  
  
  
    
      
        
        96
      
    
  
  
  Email
  
    body { margin: 0; padding: 0; }
    table { border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; }
    p { margin: 0 0 16px 0; }
    h1, h2, h3 { margin: 0 0 16px 0; font-weight: 600; color: #111827; }
    h1 { font-size: 28px; }
    h2 { font-size: 24px; }
    h3 { font-size: 20px; }
    ul, ol { margin: 0 0 16px 0; padding-left: 24px; }
    li { margin: 0 0 8px 0; }
    a { color: #2563eb; text-decoration: underline; }
  


  
    
      
        
          
            
              ${bodyContent}
            
          
          ${footer}
        
      
    
  

`;
};

export function ClientEmailTemplateBuilder({
  open,
  onOpenChange,
  campaignId: initialCampaignId,
  campaignName: initialCampaignName
}: ClientEmailTemplateBuilderProps) {
  const { toast } = useToast();
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Campaign selection
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId || '');

  // Organization settings
  const [overrideOrgName, setOverrideOrgName] = useState('');

  // Email builder state - Same structure as EmailBuilderPro
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [editorMode, setEditorMode] = useState('preview');
  const [templateName, setTemplateName] = useState('');

  // AI Generation state
  const [emailType, setEmailType] = useState('cold_outreach');
  const [tone, setTone] = useState('professional');
  const [variants, setVariants] = useState(1);
  const [brandPalette, setBrandPalette] = useState('indigo');
  const [generatedEmails, setGeneratedEmails] = useState([]);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState('gmail-desktop');

  // Test email state
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['client-portal-email-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/qualified-leads/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    enabled: open,
  });

  // Fetch business profile for email footer (CAN-SPAM compliance)
  const { data: businessProfileData } = useQuery({
    queryKey: ['client-portal-business-profile'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/settings/business-profile', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch business profile');
      return res.json();
    },
    enabled: open,
  });

  const businessProfile = businessProfileData?.profile;
  const clientName = businessProfileData?.clientName || '';

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId && campaigns.length === 1) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const activeCampaignName = selectedCampaign?.name || initialCampaignName || '';
  const hasCampaign = Boolean(selectedCampaignId);

  // Smart nudges - Same analysis as main campaign
  const nudges = useMemo(() => analyzeEmail(subject, bodyContent), [subject, bodyContent]);
  const hasErrors = nudges.some(n => n.type === 'error');

  const bodyIsFullHtmlDocument = useMemo(() => looksLikeFullHtmlDocument(bodyContent), [bodyContent]);

  const bodyHasAdvancedHtml = useMemo(
    () => / (bodyIsFullHtmlDocument ? bodyContent : ensureHtmlBody(bodyContent)),
    [bodyContent, bodyIsFullHtmlDocument]
  );

  // Generate full HTML with business profile footer
  const fullHtml = useMemo(
    () =>
      bodyIsFullHtmlDocument
        ? bodyContent
        : generateCleanHtml(normalizedBodyContent, clientName, businessProfile, overrideOrgName),
    [bodyContent, clientName, businessProfile, overrideOrgName, bodyIsFullHtmlDocument, normalizedBodyContent]
  );

  // Plain text version with business profile footer
  const plainTextVersion = useMemo(() => {
    let text = bodyContent
      .replace(//gi, '\n')
      .replace(//gi, '\n\n')
      .replace(//gi, '\n')
      .replace(//gi, '- ')
      .replace(//gi, '\n')
      .replace(/]+href="([^"]*)"[^>]*>([^/gi, '$2 ($1)')
      .replace(/]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (bodyIsFullHtmlDocument) {
      return text;
    }

    // Build footer with business profile (CAN-SPAM compliance)
    const companyName = overrideOrgName || businessProfile?.dbaName || businessProfile?.legalBusinessName || clientName || '';
    const addressLine = businessProfile
      ? `${businessProfile.addressLine1}${businessProfile.addressLine2 ? ', ' + businessProfile.addressLine2 : ''}\n${businessProfile.city}, ${businessProfile.state} ${businessProfile.postalCode}${businessProfile.country !== 'United States' ? '\n' + businessProfile.country : ''}`
      : '';
    const unsubscribeUrl = businessProfile?.customUnsubscribeUrl || '{{unsubscribe_url}}';

    if (companyName || addressLine) {
      text += `\n\n---`;
      if (companyName) text += `\n${companyName}`;
      if (addressLine) text += `\n${addressLine}`;
      text += `\n\nUnsubscribe: ${unsubscribeUrl}`;
    }
    return text;
  }, [bodyContent, clientName, businessProfile, overrideOrgName, bodyIsFullHtmlDocument]);

  // Insert personalization token
  const insertToken = useCallback((token: string) => {
    setBodyContent(prev => prev + token);
  }, []);

  // AI Generate emails mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/emails/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          emailType,
          tone,
          variants,
          brandPalette,
          companyName: overrideOrgName?.trim() ? overrideOrgName.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to generate emails' }));
        throw new Error(errorData.message || 'Failed to generate emails');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        const emails = Array.isArray(data.data) ? data.data : data.data.emails || [];
        setGeneratedEmails(emails);
        toast({
          title: 'Emails Generated!',
          description: `Generated ${emails.length} email variant(s)`,
        });
      } else if (data.emails) {
        setGeneratedEmails(data.emails);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Send test email mutation
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/emails/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          to: testEmailAddress,
          subject: subject,
          html: fullHtml,
          preheader: preheader,
          campaignName: activeCampaignName,
          campaignId: selectedCampaignId,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to send test email');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Test Email Sent!',
        description: `Email sent to ${testEmailAddress}`,
      });
      setShowTestDialog(false);
      setTestEmailAddress('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Use generated email in builder - load the full branded HTML design
  const useGeneratedEmail = (email: GeneratedEmail) => {
    setSubject(email.subject);
    setPreheader(email.preheader || '');
    // Prefer the full branded HTML (email.html) which has the designed layout with brand styles
    // This preserves the gradient hero, styled CTA buttons, value bullets section, etc.
    if (email.html && looksLikeFullHtmlDocument(email.html)) {
      // Load the complete branded HTML template directly
      setBodyContent(email.html);
    } else {
      // Fallback to body fragment if no full HTML available
      setBodyContent(email.bodyHtml || email.body || email.intro || '');
    }
    setShowAiGenerate(false);
    toast({
      title: 'Email Loaded',
      description: 'Branded email template loaded into builder',
    });
  };

  // Load sample template
  const loadSampleTemplate = (template: EmailTemplate) => {
    setSubject(template.subject);
    setPreheader(template.preheader || '');
    setBodyContent(template.htmlContent);
    setTemplateName(template.name);
    setShowTemplates(false);
    toast({
      title: 'Template Loaded',
      description: `"${template.name}" loaded into builder`,
    });
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    
      
        {/* Header - Same gradient style as main campaigns */}
        
          
            
              
            
            
              Email Template Builder
              
                Create and test email templates for your campaigns
                {activeCampaignName && ` - ${activeCampaignName}`}
              
            
          
        

        
          {/* Toolbar */}
          
            
              
                {/* Campaign Select */}
                
                    Campaign
                    
                      
                        
                      
                      
                        {campaigns.map((campaign) => (
                          
                            
                              {campaign.name}
                              {campaign.status && (
                                
                                  {campaign.status}
                                
                              )}
                            
                          
                        ))}
                      
                    
                

                {/* Organization Override */}
                
                    Organization Name
                     
                         setOverrideOrgName(e.target.value)}
                            placeholder={businessProfile?.dbaName || businessProfile?.legalBusinessName || businessProfileData?.clientName || "Organization name"}
                            className="h-9 bg-white pr-8"
                        />
                        
                     
                
              

              {/* Action Buttons */}
              
                  setShowTemplates(true)} className="h-9">
                    
                    Templates
                 
                  setShowAiGenerate(true)} 
                    className="h-9 bg-gradient-to-r from-indigo-600 to-purple-600 border-0 text-white hover:from-indigo-700 hover:to-purple-700 shadow-sm"
                 >
                    
                    AI Generate
                 
              
            
          

          {/* Main Content Area */}
          
            {/* Builder Content */}
            
                  {/* Slim Top Bar - Same as EmailBuilderPro */}
                  
                    
                      
                        
                          Subject
                           setSubject(e.target.value)}
                            placeholder="Write a compelling subject line..."
                            className="text-base font-medium border-0 bg-transparent px-2 h-10 focus-visible:ring-1 focus-visible:ring-blue-500"
                          />
                          {subject.length > 0 && (
                             60 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {subject.length}/60
                            
                          )}
                        
                      
                    

                    
                       setShowPreview(true)}>
                        
                        Inbox Preview
                      
                      
                       setShowTestDialog(true)}
                        disabled={!subject || !bodyContent}
                      >
                        
                        Test Email
                      
                    
                  

                  {/* Preheader Row */}
                  
                    Preview Text
                     setPreheader(e.target.value)}
                      placeholder="Preview text shows after subject in inbox..."
                      className="text-sm border-0 bg-transparent px-2 h-8 flex-1 max-w-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                    {preheader.length}/150
                  

                  {/* Main Editor Area */}
                  
                    {/* Main Canvas */}
                    
                      {/* Editor Mode Toggle */}
                      
                        
                           setEditorMode('preview')}
                            className="text-xs"
                          >
                            
                            Visual Editor
                          
                           setEditorMode('html')}
                            className="text-xs"
                          >
                            
                            HTML Source
                          
                        

                        
                          
                          Editor on left, live preview on right
                        
                      

                      {/* Email Canvas */}
                      
                        
                          
                            
                              {/* Editor Column */}
                              
                                {editorMode === 'preview' ? (
                                  bodyIsFullHtmlDocument ? (
                                    
                                      
                                        
                                          
                                            Branded HTML template detected
                                            
                                              This template is full HTML. Use the HTML tab to edit safely without breaking layout.
                                            
                                          
                                           setEditorMode('html')}
                                            className="flex-shrink-0"
                                          >
                                            
                                            Edit HTML
                                          
                                        
                                      
                                    
                                  ) : bodyHasAdvancedHtml ? (
                                    
                                      
                                        
                                          
                                            Advanced HTML detected
                                            
                                              This content includes email-HTML elements (tables/styles) that aren&apos;t safe to edit in Preview.
                                              Use the HTML tab to avoid breaking layout.
                                            
                                          
                                           setEditorMode('html')}
                                            className="flex-shrink-0"
                                          >
                                            
                                            Edit HTML
                                          
                                        
                                      
                                    
                                  ) : (
                                    
                                  )
                                ) : (
                                   setBodyContent(e.target.value)}
                                    placeholder={bodyIsFullHtmlDocument ? 'Enter full email HTML...' : 'Enter HTML body content...'}
                                    className="w-full flex-1 min-h-[500px] p-4 font-mono text-sm border rounded-lg resize-none focus-visible:ring-1 focus-visible:ring-blue-500 bg-slate-900 text-green-400"
                                  />
                                )}
                              

                              {/* Preview Column */}
                              
                                
                                  Live Preview
                                  {!bodyIsFullHtmlDocument && (
                                    
                                      
                                      Footer + unsubscribe from Business Profile
                                    
                                  )}
                                
                                
                                  
                                
                              
                            
                          
                        
                      

                    {/* Right Panel - Same as EmailBuilderPro */}
                    
                      
                        
                          {/* Smart Nudges */}
                          
                            
                              
                              Smart Insights
                            

                            {nudges.length === 0 ? (
                              
                                Start writing to see deliverability insights
                              
                            ) : (
                              
                                {nudges.map((nudge) => (
                                  
                                    {nudge.type === 'error' && }
                                    {nudge.type === 'warning' && }
                                    {nudge.type === 'success' && }
                                    {nudge.type === 'info' && }
                                    {nudge.message}
                                  
                                ))}
                              
                            )}
                          

                          

                          {/* Personalization Variables - Contact */}
                          
                            
                              
                              
                              Contact Variables
                            
                            
                              
                                {CONTACT_TOKENS.map((item) => (
                                   insertToken(item.token)}
                                    className="justify-start text-xs h-8 px-2"
                                    title={item.token}
                                  >
                                    
                                    {item.label}
                                  
                                ))}
                              
                            
                          

                          {/* Personalization Variables - Account */}
                          
                            
                              
                              
                              Account Variables
                            
                            
                              
                                {ACCOUNT_TOKENS.map((item) => (
                                   insertToken(item.token)}
                                    className="justify-start text-xs h-8 px-2"
                                    title={item.token}
                                  >
                                    
                                    {item.label}
                                  
                                ))}
                              
                            
                          

                          {/* Personalization Variables - Sender/Campaign */}
                          
                            
                              
                              
                              Sender/Campaign
                            
                            
                              
                                {SENDER_TOKENS.map((item) => (
                                   insertToken(item.token)}
                                    className="justify-start text-xs h-8 px-2"
                                    title={item.token}
                                  >
                                    
                                    {item.label}
                                  
                                ))}
                              
                            
                          

                          

                          {/* CTA Helper */}
                          
                            
                              
                              
                              Add CTA Button
                            
                            
                              
                                CTAs should be HTML buttons, not images. Use 1 primary CTA for best results.
                              
                               {
                                  const ctaHtml = `

  
    
      
        Learn more
      
    
  
`;
                                  setBodyContent(prev => prev + ctaHtml);
                                  setEditorMode('html');
                                }}
                              >
                                
                                Insert Button
                              
                               {
                                  const ctaHtml = `

  
    
      
        Register Now
      
    
  
`;
                                  setBodyContent(prev => prev + ctaHtml);
                                  setEditorMode('html');
                                }}
                              >
                                
                                Prefilled Form Button
                              
                              
                                Prefilled buttons auto-fill the registration form with contact details (name, email, company)
                              
                            
                          

                          

                          {/* Compliance Check */}
                          
                            
                              
                              Compliance
                            
                            
                              
                                
                                Unsubscribe link auto-included
                              
                              
                                
                                Inline CSS only (email-safe)
                              
                              
                                
                                Max width 600px
                              
                            
                          
                        
                      
                    
                  
                
              
            
        
        {/* AI Generate Sheet */}
        
            
                
                    
                        
                            
                                
                                AI Email Generation
                            
                            
                                Generate professional emails using AI, then customize in the builder
                            
                        
                    
                    
                    
                        {/* Generation Form */}
                        
                            Configuration
                            
                                
                                    Email Type
                                    
                                    
                                        
                                    
                                    
                                        {EMAIL_TYPES.map(type => (
                                        
                                            {type.label}
                                        
                                        ))}
                                    
                                    
                                

                                
                                    Tone
                                    
                                    
                                        
                                    
                                    
                                        {TONES.map(t => (
                                        
                                            {t.label}
                                        
                                        ))}
                                    
                                    
                                
                            

                            
                                
                                    Variants
                                     setVariants(parseInt(v))}>
                                    
                                        
                                    
                                    
                                        1 version
                                        2 versions
                                        3 versions
                                    
                                    
                                

                                
                                    Brand Style
                                     setBrandPalette(v as any)}>
                                    
                                        
                                    
                                    
                                        
                                        
                                            
                                            Indigo (Professional)
                                        
                                        
                                        
                                        
                                            
                                            Emerald (Growth)
                                        
                                        
                                        
                                        
                                            
                                            Slate (Modern)
                                        
                                        
                                    
                                    
                                
                            

                             generateMutation.mutate()}
                            disabled={generateMutation.isPending || !hasCampaign}
                            >
                            {generateMutation.isPending ? (
                                <>
                                
                                Generating...
                                
                            ) : (
                                <>
                                
                                Generate Email
                                
                            )}
                            
                            
                            {!hasCampaign && (
                            
                                Please select a campaign above to generate emails.
                            
                            )}
                        

                        {/* Results */}
                        
                            Results
                            {generatedEmails.length > 0 ? (
                            
                                {generatedEmails.map((email, index) => {
                                const sourceHtml = email.bodyHtml || email.html || email.body || email.intro || '';
                                const previewHtml = looksLikeFullHtmlDocument(sourceHtml)
                                  ? sourceHtml
                                  : generateCleanHtml(ensureHtmlBody(sourceHtml), clientName, businessProfile, overrideOrgName);

                                return (
                                
                                    
                                    
                                        Version {index + 1}
                                        
                                             handleCopy(`Subject: ${email.subject}\n\n${email.body || email.intro}`, index)}
                                                className="h-7 px-2"
                                            >
                                                {copiedIndex === index ? (
                                                
                                                ) : (
                                                
                                                )}
                                            
                                        
                                    
                                    
                                    
                                    
                                        Subject Line
                                        {email.subject}
                                    
                                    {email.preheader && (
                                        
                                        Preheader
                                        {email.preheader}
                                        
                                    )}
                                    
                                        Body Preview
                                        
                                          
                                        
                                    
                                     useGeneratedEmail(email)}
                                    >
                                        
                                        Use This Template
                                    
                                    
                                
                                );
                                })}
                            
                            ) : (
                            
                                
                                    
                                
                                
                                {hasCampaign
                                    ? 'Configure options above and click Generate'
                                    : 'Select a campaign to start'}
                                
                            
                            )}
                        
                    
                
            
        

        {/* Templates Sheet */}
        
             
                
                    
                        
                            
                                
                                Template Library
                            
                            
                                Start from a proven template and customize for your campaign
                            
                        
                    
                
                    
                        
                            {SAMPLE_TEMPLATES.map((template) => (
                             loadSampleTemplate(template)}>
                                
                                {template.name}
                                
                                
                                
                                    Subject
                                    {template.subject}
                                
                                
                                    Preview
                                    
                                    {template.body?.substring(0, 100)}...
                                    
                                
                                
                                    
                                    Use Template
                                
                                
                            
                            ))}
                        
                    
                
             
        
        {/* Preview Modal - Same design as EmailBuilderPro */}
        
          
            
              
                Email Preview
                
                   setPreviewMode('gmail-desktop')}
                    className="text-xs"
                  >
                    
                    Gmail
                  
                   setPreviewMode('gmail-mobile')}
                    className="text-xs"
                  >
                    
                    Mobile
                  
                   setPreviewMode('outlook')}
                    className="text-xs"
                  >
                    
                    Outlook
                  
                
              
              
                Preview the email template across different email clients
              
            

            {/* Email Header Preview */}
            
              
                Subject:
                {subject || '(No subject)'}
              
              {preheader && (
                
                  Preview:
                  {preheader}
                
              )}
            

            {/* Preview Frame */}
            
              
                {/* Simulated Email Client Header */}
                
                  
                    {previewMode === 'outlook' ? 'Microsoft Outlook' : 'Gmail'}
                  
                

                
                  
                
              
            
          
        

        {/* Test Email Dialog */}
        
          
            
              
                
                Send Test Email
              
              
                Send a test email to preview how it will look in recipients' inboxes.
                {activeCampaignName && (
                  
                    Campaign: {activeCampaignName}
                  
                )}
              
            

            
              
                Email Address
                 setTestEmailAddress(e.target.value)}
                  disabled={sendTestMutation.isPending}
                />
              

              
                
                  Subject
                  {subject || '(No subject)'}
                
                {preheader && (
                  
                    Preheader
                    {preheader}
                  
                )}
              
            

            
               setShowTestDialog(false)} disabled={sendTestMutation.isPending}>
                Cancel
              
               sendTestMutation.mutate()}
                disabled={sendTestMutation.isPending || !testEmailAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddress)}
              >
                {sendTestMutation.isPending ? (
                  <>
                    
                    Sending...
                  
                ) : (
                  <>
                    
                    Send Test
                  
                )}
              
            
          
        
      
    
  );
}

export default ClientEmailTemplateBuilder;