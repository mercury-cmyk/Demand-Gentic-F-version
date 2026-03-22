/**
 * Email Template Generator Panel
 * AI-powered email template generation for client campaigns
 */
import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Mail, Send, Loader2, Sparkles, Copy, Check,
  AlertTriangle, CheckCircle, Zap, ChevronRight,
  FileText, Eye, Lightbulb
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHtmlForIframePreview } from '@/lib/html-preview';

interface GeneratedEmail {
  subject: string;
  preheader?: string;
  body: string;
  cta?: string;
  // Structured fields from DeepSeek
  heroTitle?: string;
  heroSubtitle?: string;
  intro?: string;
  valueBullets?: string[];
  ctaLabel?: string;
  closingLine?: string;
  // Pre-built HTML from server
  html?: string;
}

interface EmailAnalysis {
  scores: {
    subjectLine: number;
    personalization: number;
    valueProposition: number;
    callToAction: number;
    overall: number;
  };
  spamRisk: {
    score: number;
    triggers: string[];
  };
  improvements: Array;
  rewrittenSubject?: string;
  keyStrengths: string[];
}

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

interface EmailTemplateGeneratorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  campaignName?: string;
}

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

export function EmailTemplateGeneratorPanel({
  open,
  onOpenChange,
  campaignId: initialCampaignId,
  campaignName: initialCampaignName
}: EmailTemplateGeneratorPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('generate');

  // Campaign selection state
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId || '');

  // Generation form state
  const [emailType, setEmailType] = useState('cold_outreach');
  const [tone, setTone] = useState('professional');
  const [variants, setVariants] = useState(1);
  const [brandPalette, setBrandPalette] = useState('indigo');
  
  // Sequence form state
  const [sequenceLength, setSequenceLength] = useState(5);
  const [sequenceType, setSequenceType] = useState('cold');
  
  // Analyze form state
  const [analyzeSubject, setAnalyzeSubject] = useState('');
  const [analyzeBody, setAnalyzeBody] = useState('');
  
  // Results state
  const [generatedEmails, setGeneratedEmails] = useState([]);
  const [generatedSequence, setGeneratedSequence] = useState([]);
  const [emailAnalysis, setEmailAnalysis] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  
  // Test email state
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);
  const [selectedEmailForTest, setSelectedEmailForTest] = useState(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

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

  // Fetch business profile for email footer
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

  useEffect(() => {
    if (!selectedCampaignId && campaigns.length === 1) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const activeCampaignName = selectedCampaign?.name || initialCampaignName || '';
  const hasCampaign = Boolean(selectedCampaignId);

  // Generate emails
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
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to generate emails' }));
        throw new Error(errorData.message || 'Failed to generate emails');
      }
      return res.json();
    },
    onSuccess: (data) => {
      console.log('[EmailGenerator] Response:', data);
      if (data.success && data.data) {
        // Handle the case where emails are in data.data (array directly or in emails property)
        const emails = Array.isArray(data.data) ? data.data : data.data.emails || [];
        setGeneratedEmails(emails);
      } else if (data.emails) {
        setGeneratedEmails(data.emails);
      } else if (data.success === false) {
        toast({
          title: 'Generation Failed',
          description: data.message || 'Could not generate emails',
          variant: 'destructive',
        });
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

  // Generate sequence
  const sequenceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/emails/sequence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          sequenceLength,
          sequenceType,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate sequence');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data?.sequence) {
        setGeneratedSequence(data.data.sequence);
      } else if (data.sequence) {
        setGeneratedSequence(data.sequence);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Sequence Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Analyze email
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/agentic/emails/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          subject: analyzeSubject,
          body: analyzeBody,
        }),
      });
      if (!res.ok) throw new Error('Failed to analyze email');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setEmailAnalysis(data.data);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Send test email mutation
  const sendTestEmailMutation = useMutation({
    mutationFn: async (email: GeneratedEmail) => {
      // Use server-provided branded HTML if available, otherwise build simple version
      const htmlContent = email.html || buildSimpleEmailHtml(email, activeCampaignName);
      
      const res = await fetch('/api/client-portal/agentic/emails/send-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          to: testEmailAddress,
          subject: email.subject,
          html: htmlContent,
          preheader: email.preheader,
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
      setShowTestEmailDialog(false);
      setTestEmailAddress('');
      setSelectedEmailForTest(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Build simple, professional email HTML with campaign context and business profile footer
  const buildSimpleEmailHtml = (email: GeneratedEmail, campaign?: string): string => {
    const preheaderHtml = email.preheader
      ? `${email.preheader}`
      : '';

    // Convert newlines to  tags and paragraphs
    const formattedBody = email.body
      .split('\n\n')
      .map(para => `${para.replace(/\n/g, '')}`)
      .join('');

    // Build business address from profile (CAN-SPAM compliance)
    const companyName = businessProfile?.dbaName || businessProfile?.legalBusinessName || campaign || 'DemandEarn';
    const addressParts = businessProfile ? [
      businessProfile.addressLine1,
      businessProfile.addressLine2,
      `${businessProfile.city}, ${businessProfile.state} ${businessProfile.postalCode}`,
      businessProfile.country !== 'United States' ? businessProfile.country : null
    ].filter(Boolean).join('') : '';

    const unsubscribeUrl = businessProfile?.customUnsubscribeUrl || '{{unsubscribe_url}}';

    return `


  
  
  
  ${email.subject}
  
  
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  
  


  ${preheaderHtml}
  
    
      
        
          
          
            
              
                ${companyName}
              
            
          
          
          
            
              ${formattedBody}
            
          
          
          
            
              
                
                  ${companyName}
                
                ${addressParts ? `${addressParts}` : ''}
                
                  Unsubscribe
                  |
                  Manage Preferences
                
              
            
          
        
      
    
  

`;
  };

  const handleSendTestEmail = (email: GeneratedEmail) => {
    setSelectedEmailForTest(email);
    setShowTestEmailDialog(true);
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-amber-600 bg-amber-100';
    return 'text-red-600 bg-red-100';
  };

  const getImpactBadge = (impact: string) => {
    if (impact === 'high') return High Impact;
    if (impact === 'medium') return Medium;
    return Low;
  };

  return (
    
      
        
          
            
              
            
            
              Email Template Generator
              
                AI-powered email templates for your campaigns
                {activeCampaignName && ` - ${activeCampaignName}`}
              
            
          
        

         setActiveTab(v as any)} className="flex-1 flex flex-col">
          
            
              Campaign
              
                
                  
                
                
                  {campaigns.map((campaign) => (
                    
                      
                        {campaign.name}
                        {campaign.status && (
                          
                            {campaign.status}
                          
                        )}
                      
                    
                  ))}
                
              
              {!campaignsLoading && campaigns.length === 0 && (
                
                  No campaigns assigned yet. Contact your account manager to add one.
                
              )}
            

            
              
                
                Generate Email
              
              
                
                Email Sequence
              
              
                
                Analyze Email
              
            
          

          
            {/* Generate Single Email Tab */}
            
              {/* Form Panel */}
              
                

                  
                    
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
                       setBrandPalette(v as 'indigo' | 'emerald' | 'slate')}>
                        
                          
                        
                        
                          
                            
                              
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
                  
                
              

              {/* Results Panel */}
              
                Generated Emails (Branded Design)
                {generatedEmails.length > 0 ? (
                  
                    {generatedEmails.map((email, index) => (
                      
                        
                          
                            Version {index + 1}
                            
                               handleSendTestEmail(email)}
                                title="Send test email"
                              >
                                
                              
                               handleCopy(`Subject: ${email.subject}\n\n${email.body}`, index)}
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
                            {/* Show branded HTML preview if available */}
                            {email.html ? (
                              
                                Email Preview (Branded Design)
                                
                                  
                                
                              
                            ) : (
                              <>
                                {/* Fallback to text display if no HTML */}
                                {email.heroTitle && (
                                  
                                    Hero Title
                                    {email.heroTitle}
                                  
                                )}
                                {email.heroSubtitle && (
                                  
                                    Hero Subtitle
                                    {email.heroSubtitle}
                                  
                                )}
                                {email.intro && (
                                  
                                    Introduction
                                    {email.intro}
                                  
                                )}
                                {email.valueBullets && email.valueBullets.length > 0 && (
                                  
                                    Key Value Points
                                    
                                      {email.valueBullets.map((bullet, i) => (
                                        {bullet}
                                      ))}
                                    
                                  
                                )}
                                {email.ctaLabel && (
                                  
                                    Call to Action
                                    {email.ctaLabel}
                                  
                                )}
                                {email.closingLine && (
                                  
                                    Closing
                                    {email.closingLine}
                                  
                                )}
                                {!email.heroTitle && email.body && (
                                  
                                    Body
                                    
                                      {email.body}
                                    
                                  
                                )}
                              
                            )}
                          
                        
                      
                    ))}
                  
                ) : (
                  
                    
                    
                      {hasCampaign
                        ? 'Configure your email parameters and click Generate'
                        : 'Select a campaign to generate emails.'}
                    
                  
                )}
              
            

            {/* Email Sequence Tab */}
            
              
                
                  
                    Sequence Type
                    
                      
                        
                      
                      
                        Cold Outreach
                        Warm Lead Nurture
                        Post-Demo Follow Up
                        Re-engagement
                      
                    
                  

                  
                    Number of Emails: {sequenceLength}
                     setSequenceLength(parseInt(e.target.value))}
                    />
                  

                   sequenceMutation.mutate()}
                    disabled={sequenceMutation.isPending || !hasCampaign}
                  >
                    {sequenceMutation.isPending ? (
                      <>
                        
                        Generating...
                      
                    ) : (
                      <>
                        
                        Generate Sequence
                      
                    )}
                  
                
              

              
                Email Sequence
                {generatedSequence.length > 0 ? (
                  
                    {generatedSequence.map((email, index) => (
                      
                        
                          
                            
                              {index + 1}
                            
                            
                              {email.timing || `Day ${index * 2 + 1}`}
                            
                            {email.purpose || 'Outreach'}
                          
                        
                        
                          
                            {email.subject}
                            
                              {email.body}
                            
                          
                        
                      
                    ))}
                  
                ) : (
                  
                    
                    
                      {hasCampaign
                        ? 'Configure sequence parameters to generate a complete email series'
                        : 'Select a campaign to generate a sequence.'}
                    
                  
                )}
              
            

            {/* Analyze Email Tab */}
            
              
                
                  
                    Subject Line
                     setAnalyzeSubject(e.target.value)}
                      placeholder="Enter your email subject line"
                    />
                  

                  
                    Email Body
                     setAnalyzeBody(e.target.value)}
                      placeholder="Paste your email content here..."
                      className="min-h-[200px]"
                    />
                  

                   analyzeMutation.mutate()}
                    disabled={!hasCampaign || analyzeMutation.isPending || !analyzeSubject || !analyzeBody}
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        
                        Analyzing...
                      
                    ) : (
                      <>
                        
                        Analyze Email
                      
                    )}
                  
                
              

              
                Analysis Results
                {emailAnalysis ? (
                  
                    {/* Overall Score */}
                    
                      
                        
                          Overall Score
                          
                            {emailAnalysis.scores.overall}
                          
                        
                        
                          {Object.entries(emailAnalysis.scores).filter(([key]) => key !== 'overall').map(([key, value]) => (
                            
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                              {value}
                            
                          ))}
                        
                      
                    

                    {/* Spam Risk */}
                     5 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
                      
                        
                          {emailAnalysis.spamRisk.score > 5 ? (
                            
                          ) : (
                            
                          )}
                          
                            Spam Risk: {emailAnalysis.spamRisk.score}/10
                          
                        
                        {emailAnalysis.spamRisk.triggers.length > 0 && (
                          
                            {emailAnalysis.spamRisk.triggers.map((trigger, i) => (
                              
                                {trigger}
                              
                            ))}
                          
                        )}
                      
                    

                    {/* Improvements */}
                    {emailAnalysis.improvements.length > 0 && (
                      
                        
                          
                            
                            Improvement Suggestions
                          
                        
                        
                          
                            {emailAnalysis.improvements.map((imp, i) => (
                              
                                
                                  {imp.area}
                                  {getImpactBadge(imp.impact)}
                                
                                {imp.suggested}
                              
                            ))}
                          
                        
                      
                    )}

                    {/* Strengths */}
                    {emailAnalysis.keyStrengths.length > 0 && (
                      
                        
                          
                            
                            Key Strengths
                          
                          
                            {emailAnalysis.keyStrengths.map((strength, i) => (
                              
                                
                                {strength}
                              
                            ))}
                          
                        
                      
                    )}

                    {/* Rewritten Subject */}
                    {emailAnalysis.rewrittenSubject && (
                      
                        
                          Suggested Subject Line
                          
                            
                              {emailAnalysis.rewrittenSubject}
                            
                             {
                                navigator.clipboard.writeText(emailAnalysis.rewrittenSubject!);
                                toast({ title: 'Copied!' });
                              }}
                            >
                              
                            
                          
                        
                      
                    )}
                  
                ) : (
                  
                    
                    
                      Paste an email to get AI-powered analysis and suggestions
                    
                  
                )}
              
            
          
        
      

      {/* Test Email Dialog */}
      
        
          
            
              
              Send Test Email
            
            
              Send a test email to preview how it will look in recipients' inboxes.
              {activeCampaignName && (
                
                  Campaign: {activeCampaignName}
                
              )}
            
          
          
          
            
              Email Address
               setTestEmailAddress(e.target.value)}
                disabled={sendTestEmailMutation.isPending}
              />
            

            {selectedEmailForTest && (
              
                
                  Subject
                  {selectedEmailForTest.subject}
                
                {selectedEmailForTest.preheader && (
                  
                    Preheader
                    {selectedEmailForTest.preheader}
                  
                )}
              
            )}
          

          
             setShowTestEmailDialog(false)} disabled={sendTestEmailMutation.isPending}>
              Cancel
            
             selectedEmailForTest && sendTestEmailMutation.mutate(selectedEmailForTest)}
              disabled={sendTestEmailMutation.isPending || !testEmailAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddress)}
            >
              {sendTestEmailMutation.isPending ? (
                <>
                  
                  Sending...
                
              ) : (
                <>
                  
                  Send Test
                
              )}
            
          
        
      
    
  );
}

export default EmailTemplateGeneratorPanel;