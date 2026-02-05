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
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeHtmlForIframePreview } from '@/lib/html-preview';

const looksLikeFullHtmlDocument = (html: string) => /<!doctype html|<html[\s>]/i.test(html);
const looksLikeHtmlFragment = (value: string) => /<\w+[^>]*>/.test(value);

const normalizePlainTextToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, "<br />"))
    .join("</p><p>");
  return `<p>${paragraphs}</p>`;
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
    htmlContent: `<p>Hi {{contact.firstName}},</p>

<p>I came across {{account.name}} and was impressed by your growth in the {{account.industry}} market.</p>

<p>We've helped similar companies in your space achieve significant results. Would you be open to a brief conversation to explore if we might be able to help?</p>

<p>Best regards,<br/>{{sender.name}}<br/>{{sender.title}}</p>`,
    body: 'Hi {{contact.firstName}},\n\nI came across {{account.name}} and was impressed by your growth...',
  },
  {
    id: 'sample-follow-up',
    name: 'Follow Up - Friendly',
    subject: 'Following up on my earlier note',
    preheader: 'Just wanted to make sure this landed in your inbox...',
    htmlContent: `<p>Hi {{contact.firstName}},</p>

<p>I wanted to follow up on my earlier message. I know things get busy, so I thought I'd reach out once more.</p>

<p>Is there a better time for us to connect? Even 15 minutes would be great to explore if there's a fit.</p>

<p>Thanks!</p>`,
    body: 'Hi {{contact.firstName}},\n\nI wanted to follow up on my earlier message...',
  },
  {
    id: 'sample-meeting-request',
    name: 'Meeting Request - Direct',
    subject: 'Can we schedule 15 minutes?',
    preheader: 'I have an idea that might help {{account.name}}...',
    htmlContent: `<p>Hi {{contact.firstName}},</p>

<p>I'll be direct – I think we can help {{account.name}} improve your results significantly.</p>

<p>Can we schedule a quick 15-minute call this week? I'll share some specific ideas tailored to your situation.</p>

<p>What works best for you?</p>`,
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
  } else if (subject.length < 20) {
    nudges.push({
      id: 'subject-short',
      type: 'info',
      message: 'Subject line might be too short. Aim for 30-60 characters.',
      field: 'subject'
    });
  } else if (subject.length > 60) {
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
  const hasCta = /<a[^>]+href[^>]*>/i.test(body) || /\[CTA\]|\[BUTTON\]/i.test(body);
  if (!hasCta && body.length > 100) {
    nudges.push({
      id: 'no-cta',
      type: 'info',
      message: 'Consider adding a clear call-to-action (CTA)',
      field: 'cta'
    });
  }

  // Link count
  const linkCount = (body.match(/<a[^>]+href/gi) || []).length;
  if (linkCount > 5) {
    nudges.push({
      id: 'too-many-links',
      type: 'warning',
      message: 'Too many links can hurt deliverability. Keep it under 5.',
      field: 'links'
    });
  }

  // Body length for cold outreach
  const textContent = body.replace(/<[^>]*>/g, '').trim();
  if (textContent.length > 0 && textContent.length < 50) {
    nudges.push({
      id: 'body-short',
      type: 'info',
      message: 'Email body seems too short for engagement',
      field: 'body'
    });
  } else if (textContent.length > 1500) {
    nudges.push({
      id: 'body-long',
      type: 'info',
      message: 'Long emails may reduce engagement. Consider being more concise.',
      field: 'body'
    });
  }

  // Success checks
  if (nudges.filter(n => n.type === 'error' || n.type === 'warning').length === 0) {
    if (subject.length >= 20 && subject.length <= 60) {
      nudges.push({
        id: 'subject-optimal',
        type: 'success',
        message: 'Subject line length is optimal',
        field: 'subject'
      });
    }
    if (textContent.length >= 100 && textContent.length <= 500) {
      nudges.push({
        id: 'body-optimal',
        type: 'success',
        message: 'Email length is optimal for cold outreach',
        field: 'body'
      });
    }
  }

  return nudges;
};

// Generate email-safe HTML with business profile footer (CAN-SPAM compliance)
const generateCleanHtml = (
  bodyContent: string,
  organizationName: string = '',
  profile?: BusinessProfile | null,
  forceOrgName?: string
): string => {
  // Build business address from profile (CAN-SPAM compliance requires physical address)
  const companyName = forceOrgName || profile?.dbaName || profile?.legalBusinessName || organizationName || '';
  const addressParts = profile ? [
    profile.addressLine1,
    profile.addressLine2,
    `${profile.city}, ${profile.state} ${profile.postalCode}`,
    profile.country !== 'United States' ? profile.country : null
  ].filter(Boolean).join('<br>') : '';

  const unsubscribeUrl = profile?.customUnsubscribeUrl || '{{unsubscribe_url}}';

  const footer = `
    <tr>
      <td style="padding: 24px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
        <div style="margin-bottom: 8px; font-weight: 600; color: #374151;">${companyName}</div>
        ${addressParts ? `<div style="margin-bottom: 12px; font-size: 11px; line-height: 1.5;">${addressParts}</div>` : ''}
        <div>
          <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
          <span style="margin: 0 8px; color: #d1d5db;">|</span>
          <a href="{{preferences_url}}" style="color: #6b7280; text-decoration: underline;">Manage Preferences</a>
        </div>
      </td>
    </tr>
  `;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <title>Email</title>
  <style type="text/css">
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
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 32px; font-size: 16px; line-height: 1.6; color: #1f2937;">
              ${bodyContent}
            </td>
          </tr>
          ${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');

  // Organization settings
  const [overrideOrgName, setOverrideOrgName] = useState<string>('');

  // Email builder state - Same structure as EmailBuilderPro
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [editorMode, setEditorMode] = useState<'preview' | 'html'>('preview');
  const [templateName, setTemplateName] = useState('');

  // AI Generation state
  const [emailType, setEmailType] = useState('cold_outreach');
  const [tone, setTone] = useState('professional');
  const [variants, setVariants] = useState(1);
  const [brandPalette, setBrandPalette] = useState<'indigo' | 'emerald' | 'slate'>('indigo');
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'gmail-desktop' | 'gmail-mobile' | 'outlook'>('gmail-desktop');

  // Test email state
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
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
  const { data: businessProfileData } = useQuery<{ profile: BusinessProfile | null; clientName: string }>({
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
    () => /<table\b|<img\b|style=|<script\b|<iframe\b/i.test(bodyContent),
    [bodyContent]
  );

  const normalizedBodyContent = useMemo(
    () => (bodyIsFullHtmlDocument ? bodyContent : ensureHtmlBody(bodyContent)),
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
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
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

  // Use generated email in builder
  const useGeneratedEmail = (email: GeneratedEmail) => {
    setSubject(email.subject);
    setPreheader(email.preheader || '');
    setBodyContent(email.bodyHtml || email.html || email.body || email.intro || '');
    setShowAiGenerate(false);
    toast({
      title: 'Email Loaded',
      description: 'Generated email loaded into builder',
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] h-[100vh] p-0 overflow-hidden flex flex-col rounded-none border-none">
        {/* Header - Same gradient style as main campaigns */}
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Mail className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl text-white">Email Template Builder</DialogTitle>
              <DialogDescription className="text-blue-100">
                Create and test email templates for your campaigns
                {activeCampaignName && ` - ${activeCampaignName}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b bg-slate-50 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                {/* Campaign Select */}
                <div className="flex-1 max-w-xs">
                    <Label className="text-xs font-medium text-slate-500 mb-1">Campaign</Label>
                    <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                      <SelectTrigger className="h-9 bg-white">
                        <SelectValue placeholder={campaignsLoading ? 'Loading...' : 'Select a campaign'} />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.map((campaign) => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            <div className="flex items-center gap-2">
                              <span>{campaign.name}</span>
                              {campaign.status && (
                                <Badge variant="outline" className="text-xs">
                                  {campaign.status}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>

                {/* Organization Override */}
                <div className="flex-1 max-w-xs">
                    <Label className="text-xs font-medium text-slate-500 mb-1">Organization Name</Label>
                     <div className="relative">
                        <Input 
                            value={overrideOrgName} 
                            onChange={(e) => setOverrideOrgName(e.target.value)}
                            placeholder={businessProfile?.dbaName || businessProfile?.legalBusinessName || businessProfileData?.clientName || "Organization name"}
                            className="h-9 bg-white pr-8"
                        />
                        <Building2 className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                     </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-auto">
                 <Button variant="outline" onClick={() => setShowTemplates(true)} className="h-9">
                    <LayoutTemplate className="h-4 w-4 mr-2" />
                    Templates
                 </Button>
                 <Button 
                    onClick={() => setShowAiGenerate(true)} 
                    className="h-9 bg-gradient-to-r from-indigo-600 to-purple-600 border-0 text-white hover:from-indigo-700 hover:to-purple-700 shadow-sm"
                 >
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI Generate
                 </Button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden">
            {/* Builder Content */}
            <div className="h-full flex flex-col">
                  {/* Slim Top Bar - Same as EmailBuilderPro */}
                  <div className="border-b bg-white px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1 max-w-2xl">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Subject</Label>
                          <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Write a compelling subject line..."
                            className="text-base font-medium border-0 bg-transparent px-2 h-10 focus-visible:ring-1 focus-visible:ring-blue-500"
                          />
                          {subject.length > 0 && (
                            <span className={`text-xs whitespace-nowrap ${subject.length > 60 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {subject.length}/60
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)}>
                        <Eye className="w-4 h-4 mr-1" />
                        Inbox Preview
                      </Button>
                      <Separator orientation="vertical" className="h-6" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTestDialog(true)}
                        disabled={!subject || !bodyContent}
                      >
                        <Send className="w-4 h-4 mr-1" />
                        Test Email
                      </Button>
                    </div>
                  </div>

                  {/* Preheader Row */}
                  <div className="border-b bg-white/50 px-6 py-2 flex items-center gap-4">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Preview Text</Label>
                    <Input
                      value={preheader}
                      onChange={(e) => setPreheader(e.target.value)}
                      placeholder="Preview text shows after subject in inbox..."
                      className="text-sm border-0 bg-transparent px-2 h-8 flex-1 max-w-xl focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                    <span className="text-xs text-slate-400">{preheader.length}/150</span>
                  </div>

                  {/* Main Editor Area */}
                  <div className="flex-1 flex min-h-0 bg-slate-50">
                    {/* Main Canvas */}
                    <div className="flex-1 flex flex-col min-h-0 p-4">
                      {/* Editor Mode Toggle */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm border">
                          <Button
                            variant={editorMode === 'preview' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setEditorMode('preview')}
                            className="text-xs"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Visual Editor
                          </Button>
                          <Button
                            variant={editorMode === 'html' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setEditorMode('html')}
                            className="text-xs"
                          >
                            <Code2 className="w-3.5 h-3.5 mr-1" />
                            HTML Source
                          </Button>
                        </div>

                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" />
                          Editor on left, live preview on right
                        </div>
                      </div>

                      {/* Email Canvas */}
                      <div className="flex-1 overflow-auto pb-4">
                        <div className="w-full h-full">
                          <div className="bg-white rounded-lg shadow-lg border overflow-hidden h-full">
                            <div className="grid grid-cols-2 h-full" style={{ minHeight: '600px' }}>
                              {/* Editor Column */}
                              <div className="p-3 border-r min-w-0 flex flex-col">
                                {editorMode === 'preview' ? (
                                  bodyIsFullHtmlDocument ? (
                                    <div className="flex-1 flex flex-col">
                                      <div className="p-6 bg-slate-50 rounded-lg">
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="min-w-0">
                                            <div className="text-sm font-medium text-slate-700">Branded HTML template detected</div>
                                            <p className="text-sm text-slate-500 mt-1">
                                              This template is full HTML. Use the HTML tab to edit safely without breaking layout.
                                            </p>
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setEditorMode('html')}
                                            className="flex-shrink-0"
                                          >
                                            <Code2 className="w-4 h-4 mr-2" />
                                            Edit HTML
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : bodyHasAdvancedHtml ? (
                                    <div className="flex-1 flex flex-col">
                                      <div className="p-6 bg-slate-50 rounded-lg">
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="min-w-0">
                                            <div className="text-sm font-medium text-slate-700">Advanced HTML detected</div>
                                            <p className="text-sm text-slate-500 mt-1">
                                              This content includes email-HTML elements (tables/styles) that aren&apos;t safe to edit in Preview.
                                              Use the HTML tab to avoid breaking layout.
                                            </p>
                                          </div>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setEditorMode('html')}
                                            className="flex-shrink-0"
                                          >
                                            <Code2 className="w-4 h-4 mr-2" />
                                            Edit HTML
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <RichTextEditor
                                      content={bodyContent}
                                      onChange={setBodyContent}
                                      className="flex-1 min-h-[500px]"
                                      placeholder={`Hi {{firstName}},

Write your email content here. Keep it concise and focused.

Best regards,
${overrideOrgName || businessProfile?.dbaName || 'Your Name'}`}
                                    />
                                  )
                                ) : (
                                  <Textarea
                                    value={bodyContent}
                                    onChange={(e) => setBodyContent(e.target.value)}
                                    placeholder={bodyIsFullHtmlDocument ? 'Enter full email HTML...' : 'Enter HTML body content...'}
                                    className="w-full flex-1 min-h-[500px] p-4 font-mono text-sm border rounded-lg resize-none focus-visible:ring-1 focus-visible:ring-blue-500 bg-slate-900 text-green-400"
                                  />
                                )}
                              </div>

                              {/* Preview Column */}
                              <div className="p-3 bg-slate-50 min-w-0 flex flex-col">
                                <div className="flex items-center justify-between gap-3 mb-2 flex-shrink-0">
                                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Live Preview</div>
                                  {!bodyIsFullHtmlDocument && (
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                      <Info className="w-3.5 h-3.5 text-slate-400" />
                                      Footer + unsubscribe from Business Profile
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 rounded-lg border bg-white overflow-hidden" style={{ minHeight: '500px' }}>
                                  <iframe
                                    title="Email Preview"
                                    srcDoc={sanitizeHtmlForIframePreview(fullHtml)}
                                    className="w-full h-full border-0"
                                    sandbox="allow-same-origin"
                                    style={{ minHeight: '500px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    {/* Right Panel - Same as EmailBuilderPro */}
                    <div className="w-72 border-l bg-white flex flex-col">
                      <ScrollArea className="flex-1">
                        <div className="p-4 space-y-6">
                          {/* Smart Nudges */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <Lightbulb className="w-4 h-4 text-amber-500" />
                              <h3 className="text-sm font-semibold text-slate-700">Smart Insights</h3>
                            </div>

                            {nudges.length === 0 ? (
                              <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-lg">
                                Start writing to see deliverability insights
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {nudges.map((nudge) => (
                                  <div
                                    key={nudge.id}
                                    className={cn(
                                      'text-xs p-2.5 rounded-lg flex items-start gap-2',
                                      nudge.type === 'error' && 'bg-red-50 text-red-700 border border-red-200',
                                      nudge.type === 'warning' && 'bg-amber-50 text-amber-700 border border-amber-200',
                                      nudge.type === 'success' && 'bg-green-50 text-green-700 border border-green-200',
                                      nudge.type === 'info' && 'bg-blue-50 text-blue-700 border border-blue-200'
                                    )}
                                  >
                                    {nudge.type === 'error' && <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                                    {nudge.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                                    {nudge.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                                    {nudge.type === 'info' && <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                                    <span>{nudge.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <Separator />

                          {/* Personalization Variables - Contact */}
                          <Collapsible defaultOpen>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full">
                              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                              <User className="w-4 h-4 text-blue-500" />
                              <h3 className="text-sm font-semibold text-slate-700">Contact Variables</h3>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-3">
                              <div className="grid grid-cols-2 gap-1.5">
                                {CONTACT_TOKENS.map((item) => (
                                  <Button
                                    key={item.token}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => insertToken(item.token)}
                                    className="justify-start text-xs h-8 px-2"
                                    title={item.token}
                                  >
                                    <item.icon className="w-3 h-3 mr-1.5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          {/* Personalization Variables - Account */}
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full">
                              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                              <Building2 className="w-4 h-4 text-purple-500" />
                              <h3 className="text-sm font-semibold text-slate-700">Account Variables</h3>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-3">
                              <div className="grid grid-cols-2 gap-1.5">
                                {ACCOUNT_TOKENS.map((item) => (
                                  <Button
                                    key={item.token}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => insertToken(item.token)}
                                    className="justify-start text-xs h-8 px-2"
                                    title={item.token}
                                  >
                                    <item.icon className="w-3 h-3 mr-1.5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          {/* Personalization Variables - Sender/Campaign */}
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full">
                              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                              <AtSign className="w-4 h-4 text-green-500" />
                              <h3 className="text-sm font-semibold text-slate-700">Sender/Campaign</h3>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-3">
                              <div className="grid grid-cols-2 gap-1.5">
                                {SENDER_TOKENS.map((item) => (
                                  <Button
                                    key={item.token}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => insertToken(item.token)}
                                    className="justify-start text-xs h-8 px-2"
                                    title={item.token}
                                  >
                                    <item.icon className="w-3 h-3 mr-1.5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>

                          <Separator />

                          {/* CTA Helper */}
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full">
                              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform [[data-state=closed]_&]:-rotate-90" />
                              <MousePointer className="w-4 h-4 text-green-500" />
                              <h3 className="text-sm font-semibold text-slate-700">Add CTA Button</h3>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-3 space-y-3">
                              <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
                                CTAs should be HTML buttons, not images. Use 1 primary CTA for best results.
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => {
                                  const ctaHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
  <tr>
    <td style="background-color: #2563eb; border-radius: 6px;">
      <a href="{{campaign.landing_page}}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px;">
        Learn more
      </a>
    </td>
  </tr>
</table>`;
                                  setBodyContent(prev => prev + ctaHtml);
                                  setEditorMode('html');
                                }}
                              >
                                <Zap className="w-3 h-3 mr-1" />
                                Insert Button
                              </Button>
                            </CollapsibleContent>
                          </Collapsible>

                          <Separator />

                          {/* Compliance Check */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <h3 className="text-sm font-semibold text-slate-700">Compliance</h3>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs text-green-600">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Unsubscribe link auto-included</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-green-600">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Inline CSS only (email-safe)</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-green-600">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Max width 600px</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
        {/* AI Generate Sheet */}
        <Sheet open={showAiGenerate} onOpenChange={setShowAiGenerate}>
            <SheetContent side="right" className="w-[100vw] sm:w-[480px] md:w-[520px] lg:w-[560px] p-0 border-l shadow-2xl">
                <div className="h-full flex flex-col">
                    <div className="p-6 border-b bg-slate-50">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-indigo-600" />
                                AI Email Generation
                            </SheetTitle>
                            <SheetDescription>
                                Generate professional emails using AI, then customize in the builder
                            </SheetDescription>
                        </SheetHeader>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        {/* Generation Form */}
                        <div className="space-y-6 bg-white p-4 rounded-lg border shadow-sm">
                            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">Configuration</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Email Type</Label>
                                    <Select value={emailType} onValueChange={setEmailType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EMAIL_TYPES.map(type => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                        ))}
                                    </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Tone</Label>
                                    <Select value={tone} onValueChange={setTone}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TONES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>
                                            {t.label}
                                        </SelectItem>
                                        ))}
                                    </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Variants</Label>
                                    <Select value={variants.toString()} onValueChange={(v) => setVariants(parseInt(v))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 version</SelectItem>
                                        <SelectItem value="2">2 versions</SelectItem>
                                        <SelectItem value="3">3 versions</SelectItem>
                                    </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Brand Style</Label>
                                    <Select value={brandPalette} onValueChange={(v) => setBrandPalette(v as any)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="indigo">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-indigo-500" />
                                            Indigo (Professional)
                                        </div>
                                        </SelectItem>
                                        <SelectItem value="emerald">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                            Emerald (Growth)
                                        </div>
                                        </SelectItem>
                                        <SelectItem value="slate">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-slate-700" />
                                            Slate (Modern)
                                        </div>
                                        </SelectItem>
                                    </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Button
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                            onClick={() => generateMutation.mutate()}
                            disabled={generateMutation.isPending || !hasCampaign}
                            >
                            {generateMutation.isPending ? (
                                <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Generating...
                                </>
                            ) : (
                                <>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate Email
                                </>
                            )}
                            </Button>
                            
                            {!hasCampaign && (
                            <p className="text-xs text-amber-600">
                                Please select a campaign above to generate emails.
                            </p>
                            )}
                        </div>

                        {/* Results */}
                        <div>
                            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Results</h3>
                            {generatedEmails.length > 0 ? (
                            <div className="space-y-4">
                                {generatedEmails.map((email, index) => {
                                const sourceHtml = email.bodyHtml || email.html || email.body || email.intro || '';
                                const previewHtml = looksLikeFullHtmlDocument(sourceHtml)
                                  ? sourceHtml
                                  : generateCleanHtml(ensureHtmlBody(sourceHtml), clientName, businessProfile, overrideOrgName);

                                return (
                                <Card key={index} className="overflow-hidden border-indigo-100 shadow-md">
                                    <CardHeader className="pb-2 bg-indigo-50/50 border-b border-indigo-100">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-semibold text-indigo-900">Version {index + 1}</CardTitle>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleCopy(`Subject: ${email.subject}\n\n${email.body || email.intro}`, index)}
                                                className="h-7 px-2"
                                            >
                                                {copiedIndex === index ? (
                                                <Check className="h-3.5 w-3.5 text-green-600" />
                                                ) : (
                                                <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    </CardHeader>
                                    <CardContent className="p-4 space-y-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Subject Line</Label>
                                        <p className="font-medium text-sm mt-1">{email.subject}</p>
                                    </div>
                                    {email.preheader && (
                                        <div>
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Preheader</Label>
                                        <p className="text-sm text-slate-600 mt-1">{email.preheader}</p>
                                        </div>
                                    )}
                                    <div>
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Body Preview</Label>
                                        <div className="bg-white mt-1 rounded border overflow-hidden h-40">
                                          <iframe
                                            title={`Generated Email Preview ${index + 1}`}
                                            srcDoc={sanitizeHtmlForIframePreview(previewHtml)}
                                            className="w-full h-full border-0"
                                            sandbox="allow-same-origin"
                                          />
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full mt-2"
                                        onClick={() => useGeneratedEmail(email)}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Use This Template
                                    </Button>
                                    </CardContent>
                                </Card>
                                );
                                })}
                            </div>
                            ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-lg border border-dashed">
                                <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                                    <Sparkles className="h-6 w-6 text-indigo-300" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                {hasCampaign
                                    ? 'Configure options above and click Generate'
                                    : 'Select a campaign to start'}
                                </p>
                            </div>
                            )}
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>

        {/* Templates Sheet */}
        <Sheet open={showTemplates} onOpenChange={setShowTemplates}>
             <SheetContent side="right" className="w-[100vw] sm:w-[900px] overflow-y-auto p-0 border-l shadow-2xl">
                <div className="h-full flex flex-col">
                    <div className="p-6 border-b bg-slate-50">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2">
                                <LayoutTemplate className="h-5 w-5 text-indigo-600" />
                                Template Library
                            </SheetTitle>
                            <SheetDescription>
                                Start from a proven template and customize for your campaign
                            </SheetDescription>
                        </SheetHeader>
                    </div>
                
                    <div className="p-6 overflow-y-auto">
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {SAMPLE_TEMPLATES.map((template) => (
                            <Card key={template.id} className="hover:shadow-lg transition-shadow border-slate-200 cursor-pointer group" onClick={() => loadSampleTemplate(template)}>
                                <CardHeader className="pb-3 border-b bg-slate-50/50 group-hover:bg-indigo-50/30 transition-colors">
                                <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Subject</Label>
                                    <p className="text-sm font-medium truncate mt-0.5">{template.subject}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-muted-foreground">Preview</Label>
                                    <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded max-h-20 overflow-hidden mt-1 border">
                                    {template.body?.substring(0, 100)}...
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full text-xs group-hover:border-indigo-300 group-hover:text-indigo-600"
                                >
                                    <Plus className="h-3 w-3 mr-2" />
                                    Use Template
                                </Button>
                                </CardContent>
                            </Card>
                            ))}
                        </div>
                    </div>
                </div>
             </SheetContent>
        </Sheet>
        {/* Preview Modal - Same design as EmailBuilderPro */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Email Preview</DialogTitle>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <Button
                    variant={previewMode === 'gmail-desktop' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setPreviewMode('gmail-desktop')}
                    className="text-xs"
                  >
                    <Monitor className="w-3.5 h-3.5 mr-1" />
                    Gmail
                  </Button>
                  <Button
                    variant={previewMode === 'gmail-mobile' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setPreviewMode('gmail-mobile')}
                    className="text-xs"
                  >
                    <Smartphone className="w-3.5 h-3.5 mr-1" />
                    Mobile
                  </Button>
                  <Button
                    variant={previewMode === 'outlook' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setPreviewMode('outlook')}
                    className="text-xs"
                  >
                    <Mail className="w-3.5 h-3.5 mr-1" />
                    Outlook
                  </Button>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Preview the email template across different email clients
              </DialogDescription>
            </DialogHeader>

            {/* Email Header Preview */}
            <div className="border-b pb-4 space-y-2">
              <div>
                <span className="text-xs text-slate-500">Subject:</span>
                <p className="font-medium">{subject || '(No subject)'}</p>
              </div>
              {preheader && (
                <div>
                  <span className="text-xs text-slate-500">Preview:</span>
                  <p className="text-sm text-slate-600">{preheader}</p>
                </div>
              )}
            </div>

            {/* Preview Frame */}
            <div className="flex-1 overflow-hidden bg-slate-100 rounded-lg flex items-center justify-center p-4">
              <div
                className={cn(
                  'bg-white shadow-xl overflow-hidden rounded-lg h-full',
                  previewMode === 'gmail-mobile' ? 'w-[375px]' : 'w-full max-w-[700px]'
                )}
              >
                {/* Simulated Email Client Header */}
                <div className={cn(
                  'border-b px-4 py-3',
                  previewMode === 'outlook' ? 'bg-[#0078d4]' : 'bg-white'
                )}>
                  <div className={cn(
                    'text-xs',
                    previewMode === 'outlook' ? 'text-white' : 'text-slate-500'
                  )}>
                    {previewMode === 'outlook' ? 'Microsoft Outlook' : 'Gmail'}
                  </div>
                </div>

                <div className="h-[calc(100%-52px)] overflow-y-auto">
                  <iframe
                    title="Email Preview"
                    srcDoc={sanitizeHtmlForIframePreview(fullHtml)}
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Test Email Dialog */}
        <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Test Email
              </DialogTitle>
              <DialogDescription>
                Send a test email to preview how it will look in recipients' inboxes.
                {activeCampaignName && (
                  <span className="block mt-1 text-sm font-medium text-primary">
                    Campaign: {activeCampaignName}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="test-email">Email Address</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="your@email.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  disabled={sendTestMutation.isPending}
                />
              </div>

              <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <p className="font-medium text-sm">{subject || '(No subject)'}</p>
                </div>
                {preheader && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Preheader</Label>
                    <p className="text-xs text-muted-foreground">{preheader}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTestDialog(false)} disabled={sendTestMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => sendTestMutation.mutate()}
                disabled={sendTestMutation.isPending || !testEmailAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddress)}
              >
                {sendTestMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Test
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default ClientEmailTemplateBuilder;
