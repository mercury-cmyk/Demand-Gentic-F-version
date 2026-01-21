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

interface GeneratedEmail {
  subject: string;
  preheader?: string;
  body: string;
  cta?: string;
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
  improvements: Array<{
    area: string;
    current: string;
    suggested: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  rewrittenSubject?: string;
  keyStrengths: string[];
}

interface Campaign {
  id: string;
  name: string;
  status?: string | null;
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
  const [activeTab, setActiveTab] = useState<'generate' | 'sequence' | 'analyze'>('generate');

  // Campaign selection state
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');

  // Generation form state
  const [emailType, setEmailType] = useState('cold_outreach');
  const [tone, setTone] = useState('professional');
  const [variants, setVariants] = useState(1);
  
  // Sequence form state
  const [sequenceLength, setSequenceLength] = useState(5);
  const [sequenceType, setSequenceType] = useState('cold');
  
  // Analyze form state
  const [analyzeSubject, setAnalyzeSubject] = useState('');
  const [analyzeBody, setAnalyzeBody] = useState('');
  
  // Results state
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [generatedSequence, setGeneratedSequence] = useState<any[]>([]);
  const [emailAnalysis, setEmailAnalysis] = useState<EmailAnalysis | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Test email state
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);
  const [selectedEmailForTest, setSelectedEmailForTest] = useState<GeneratedEmail | null>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

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
      // Build simple, professional HTML email with campaign context
      const htmlContent = buildSimpleEmailHtml(email, activeCampaignName);
      
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

  // Build simple, professional email HTML with campaign context
  const buildSimpleEmailHtml = (email: GeneratedEmail, campaign?: string): string => {
    const preheaderHtml = email.preheader 
      ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${email.preheader}</div>`
      : '';
    
    // Convert newlines to <br> tags and paragraphs
    const formattedBody = email.body
      .split('\n\n')
      .map(para => `<p style="margin: 0 0 16px 0; line-height: 1.6;">${para.replace(/\n/g, '<br>')}</p>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${email.subject}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${preheaderHtml}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">
                ${campaign || 'DemandEarn'}
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px; color: #374151; font-size: 15px;">
              ${formattedBody}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center;">
                This is a test email from ${campaign || 'your campaign'}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    if (impact === 'high') return <Badge className="bg-red-100 text-red-700">High Impact</Badge>;
    if (impact === 'medium') return <Badge className="bg-amber-100 text-amber-700">Medium</Badge>;
    return <Badge className="bg-gray-100 text-gray-700">Low</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-pink-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl text-white">Email Template Generator</DialogTitle>
              <DialogDescription className="text-purple-100">
                AI-powered email templates for your campaigns
                {activeCampaignName && ` - ${activeCampaignName}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
          <div className="px-6 pt-4 space-y-4">
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder={campaignsLoading ? 'Loading campaigns...' : 'Select a campaign'} />
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
              {!campaignsLoading && campaigns.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No campaigns assigned yet. Contact your account manager to add one.
                </p>
              )}
            </div>

            <TabsList className="grid grid-cols-3 w-fit">
              <TabsTrigger value="generate" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Generate Email
              </TabsTrigger>
              <TabsTrigger value="sequence" className="gap-2">
                <FileText className="h-4 w-4" />
                Email Sequence
              </TabsTrigger>
              <TabsTrigger value="analyze" className="gap-2">
                <Eye className="h-4 w-4" />
                Analyze Email
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            {/* Generate Single Email Tab */}
            <TabsContent value="generate" className="h-full m-0 flex">
              {/* Form Panel */}
              <div className="w-1/2 p-6 border-r overflow-auto">
                <div className="space-y-4">

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

                  <Button
                    className="w-full"
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
                </div>
              </div>

              {/* Results Panel */}
              <div className="w-1/2 p-6 overflow-auto bg-slate-50">
                <h3 className="font-semibold mb-4">Generated Emails</h3>
                {generatedEmails.length > 0 ? (
                  <div className="space-y-4">
                    {generatedEmails.map((email, index) => (
                      <Card key={index}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Version {index + 1}</CardTitle>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSendTestEmail(email)}
                                title="Send test email"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopy(`Subject: ${email.subject}\n\n${email.body}`, index)}
                              >
                                {copiedIndex === index ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Subject Line</Label>
                              <p className="font-medium">{email.subject}</p>
                            </div>
                            {email.preheader && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Preheader</Label>
                                <p className="text-sm text-muted-foreground">{email.preheader}</p>
                              </div>
                            )}
                            <div>
                              <Label className="text-xs text-muted-foreground">Body</Label>
                              <div className="text-sm whitespace-pre-wrap bg-white p-3 rounded border">
                                {email.body}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      {hasCampaign
                        ? 'Configure your email parameters and click Generate'
                        : 'Select a campaign to generate emails.'}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Email Sequence Tab */}
            <TabsContent value="sequence" className="h-full m-0 flex">
              <div className="w-1/3 p-6 border-r">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Sequence Type</Label>
                    <Select value={sequenceType} onValueChange={setSequenceType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cold">Cold Outreach</SelectItem>
                        <SelectItem value="warm">Warm Lead Nurture</SelectItem>
                        <SelectItem value="post_demo">Post-Demo Follow Up</SelectItem>
                        <SelectItem value="re_engagement">Re-engagement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Number of Emails: {sequenceLength}</Label>
                    <Input
                      type="range"
                      min={3}
                      max={10}
                      value={sequenceLength}
                      onChange={(e) => setSequenceLength(parseInt(e.target.value))}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => sequenceMutation.mutate()}
                    disabled={sequenceMutation.isPending || !hasCampaign}
                  >
                    {sequenceMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Generate Sequence
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6 bg-slate-50">
                <h3 className="font-semibold mb-4">Email Sequence</h3>
                {generatedSequence.length > 0 ? (
                  <div className="space-y-4">
                    {generatedSequence.map((email, index) => (
                      <Card key={index}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </div>
                            <CardTitle className="text-sm flex-1">
                              {email.timing || `Day ${index * 2 + 1}`}
                            </CardTitle>
                            <Badge variant="outline">{email.purpose || 'Outreach'}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <p className="font-medium text-sm">{email.subject}</p>
                            <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-white p-2 rounded border max-h-32 overflow-auto">
                              {email.body}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      {hasCampaign
                        ? 'Configure sequence parameters to generate a complete email series'
                        : 'Select a campaign to generate a sequence.'}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Analyze Email Tab */}
            <TabsContent value="analyze" className="h-full m-0 flex">
              <div className="w-1/2 p-6 border-r overflow-auto">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subject Line</Label>
                    <Input
                      value={analyzeSubject}
                      onChange={(e) => setAnalyzeSubject(e.target.value)}
                      placeholder="Enter your email subject line"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Email Body</Label>
                    <Textarea
                      value={analyzeBody}
                      onChange={(e) => setAnalyzeBody(e.target.value)}
                      placeholder="Paste your email content here..."
                      className="min-h-[200px]"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={!hasCampaign || analyzeMutation.isPending || !analyzeSubject || !analyzeBody}
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Analyze Email
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6 bg-slate-50">
                <h3 className="font-semibold mb-4">Analysis Results</h3>
                {emailAnalysis ? (
                  <div className="space-y-4">
                    {/* Overall Score */}
                    <Card>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-4">
                          <span className="font-medium">Overall Score</span>
                          <span className={cn(
                            "text-2xl font-bold px-3 py-1 rounded",
                            getScoreColor(emailAnalysis.scores.overall)
                          )}>
                            {emailAnalysis.scores.overall}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {Object.entries(emailAnalysis.scores).filter(([key]) => key !== 'overall').map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className={cn("font-medium", getScoreColor(value))}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Spam Risk */}
                    <Card className={emailAnalysis.spamRisk.score > 5 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          {emailAnalysis.spamRisk.score > 5 ? (
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                          ) : (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                          <span className="font-medium">
                            Spam Risk: {emailAnalysis.spamRisk.score}/10
                          </span>
                        </div>
                        {emailAnalysis.spamRisk.triggers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {emailAnalysis.spamRisk.triggers.map((trigger, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {trigger}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Improvements */}
                    {emailAnalysis.improvements.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Lightbulb className="h-4 w-4 text-amber-500" />
                            Improvement Suggestions
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {emailAnalysis.improvements.map((imp, i) => (
                              <div key={i} className="border-l-2 border-amber-300 pl-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{imp.area}</span>
                                  {getImpactBadge(imp.impact)}
                                </div>
                                <p className="text-xs text-muted-foreground">{imp.suggested}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Strengths */}
                    {emailAnalysis.keyStrengths.length > 0 && (
                      <Card className="border-green-200 bg-green-50">
                        <CardContent className="pt-4">
                          <p className="font-medium text-sm mb-2 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            Key Strengths
                          </p>
                          <ul className="text-sm space-y-1">
                            {emailAnalysis.keyStrengths.map((strength, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <ChevronRight className="h-4 w-4 text-green-500 mt-0.5" />
                                {strength}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Rewritten Subject */}
                    {emailAnalysis.rewrittenSubject && (
                      <Card>
                        <CardContent className="pt-4">
                          <p className="font-medium text-sm mb-2">Suggested Subject Line</p>
                          <div className="flex items-center gap-2">
                            <p className="flex-1 bg-white p-2 rounded border text-sm">
                              {emailAnalysis.rewrittenSubject}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(emailAnalysis.rewrittenSubject!);
                                toast({ title: 'Copied!' });
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Eye className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Paste an email to get AI-powered analysis and suggestions
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>

      {/* Test Email Dialog */}
      <Dialog open={showTestEmailDialog} onOpenChange={setShowTestEmailDialog}>
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
                disabled={sendTestEmailMutation.isPending}
              />
            </div>

            {selectedEmailForTest && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <p className="font-medium text-sm">{selectedEmailForTest.subject}</p>
                </div>
                {selectedEmailForTest.preheader && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Preheader</Label>
                    <p className="text-xs text-muted-foreground">{selectedEmailForTest.preheader}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTestEmailDialog(false)} disabled={sendTestEmailMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedEmailForTest && sendTestEmailMutation.mutate(selectedEmailForTest)}
              disabled={sendTestEmailMutation.isPending || !testEmailAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailAddress)}
            >
              {sendTestEmailMutation.isPending ? (
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
    </Dialog>
  );
}

export default EmailTemplateGeneratorPanel;
