import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageShell } from "@/components/patterns/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  Mail, Inbox as InboxIcon, Send, Archive, Star, StarOff,
  RefreshCw, Reply, Forward, Trash2, Paperclip,
  Search, Building2, User, Target, ChevronRight, Loader2, X, Plus,
  Sparkles, CheckCircle2, AlertCircle, Zap, Eye, MousePointer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SignatureManager } from "@/components/signature-manager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InboxMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  bodyHtml: string | null;
  from: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedDateTime: string;
  hasAttachments: boolean;
  importance: string;
  isRead: boolean;
  isStarred: boolean;
  category: 'primary' | 'other';
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
}

interface InboxStats {
  category: 'primary' | 'other';
  unreadCount: number;
  totalCount: number;
}

interface EmailSignature {
  id: string;
  userId: string;
  name: string;
  signatureHtml: string;
  signaturePlain?: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MailboxAccount {
  id: string;
  mailboxEmail: string;
  provider: string;
}

interface TrackingStats {
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
}

export default function InboxPage() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<'primary' | 'other' | 'sent'>('primary');
  const [selectedEmail, setSelectedEmail] = useState<InboxMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Email composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<null | 'reply' | 'replyAll' | 'forward'>(null);
  const [replyingToEmail, setReplyingToEmail] = useState<InboxMessage | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  
  // Track the last injected signature HTML to enable proper removal when switching/editing
  const lastInjectedSignatureRef = useRef<string | null>(null);
  
  // AI Analysis state
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    overallScore: number;
    toneScore: number;
    clarityScore: number;
    professionalismScore: number;
    sentiment: string;
    suggestions: string[];
  } | null>(null);

  // Fetch inbox statistics
  const { data: statsResponse } = useQuery<{ stats: InboxStats[] }>({
    queryKey: ['/api/inbox/stats'],
  });

  const stats = statsResponse?.stats || [];

  // Fetch email signatures
  const { data: signatures = [] } = useQuery<EmailSignature[]>({
    queryKey: ['/api/signatures'],
    enabled: composerOpen,
  });
  
  // Fetch mailbox accounts
  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ['/api/mailbox-accounts'],
    enabled: composerOpen,
  });
  
  const primaryStats = stats.find((s: InboxStats) => s.category === 'primary') || { unreadCount: 0, totalCount: 0 };
  const otherStats = stats.find((s: InboxStats) => s.category === 'other') || { unreadCount: 0, totalCount: 0 };

  // Fetch inbox messages (Primary/Other) with hierarchical query key for cache invalidation
  // Using separate segments so invalidateQueries(['/api/inbox/messages']) matches all
  const { data: messagesData, isLoading: messagesLoading, refetch } = useQuery<{
    messages: InboxMessage[];
    pagination: { limit: number; offset: number };
  }>({
    queryKey: ['/api/inbox/messages', selectedCategory, searchQuery || ''],
    queryFn: async () => {
      // Guard: Should never execute when selectedCategory is 'sent'
      if (selectedCategory === 'sent') {
        throw new Error('Inbox query should not run for sent category');
      }

      const params = new URLSearchParams({
        category: selectedCategory,
        limit: '50',
        offset: '0',
        ...(searchQuery && { searchQuery })
      });
      
      // Get auth token from localStorage (same as default query client)
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/inbox/messages?${params}`, {
        headers,
        credentials: 'include'
      });
      
      // Handle 401 same as default query client
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        throw new Error('Session expired. Please login again.');
      }
      
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    enabled: selectedCategory !== 'sent'
  });

  // Fetch sent messages
  const { data: sentMessagesData, isLoading: sentMessagesLoading } = useQuery<{
    messages: InboxMessage[];
    pagination: { limit: number; offset: number };
  }>({
    queryKey: ['/api/inbox/sent', searchQuery || ''],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '50',
        offset: '0',
        ...(searchQuery && { searchQuery })
      });
      
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/inbox/sent?${params}`, {
        headers,
        credentials: 'include'
      });
      
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        throw new Error('Session expired. Please login again.');
      }
      
      if (!response.ok) throw new Error('Failed to fetch sent messages');
      return response.json();
    },
    enabled: selectedCategory === 'sent'
  });

  const messages = selectedCategory === 'sent' 
    ? (sentMessagesData?.messages || []) 
    : (messagesData?.messages || []);
  
  const isLoadingMessages = selectedCategory === 'sent' ? sentMessagesLoading : messagesLoading;

  // Fetch tracking stats for selected email
  const { data: trackingStats } = useQuery<TrackingStats>({
    queryKey: ['/api/track/stats', selectedEmail?.id],
    queryFn: async () => {
      if (!selectedEmail?.id) {
        throw new Error('No email selected');
      }
      
      // Get auth token from localStorage
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/track/stats/${selectedEmail.id}`, {
        headers,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch tracking stats');
      }
      
      return response.json();
    },
    enabled: !!selectedEmail?.id,
  });

  // Mark as read mutation
  const markReadMutation = useMutation({
    mutationFn: async ({ messageId, isRead }: { messageId: string; isRead: boolean }) => {
      return await apiRequest("POST", "/api/inbox/mark-read", { messageId, isRead });
    },
    onSuccess: () => {
      // Invalidate all messages queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/stats'] });
    }
  });

  // Toggle star mutation
  const toggleStarMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", "/api/inbox/toggle-star", { messageId });
    },
    onSuccess: () => {
      // Invalidate all messages queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
    }
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", "/api/inbox/archive", { messageId });
    },
    onSuccess: () => {
      // Invalidate all messages queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/stats'] });
      setSelectedEmail(null);
      toast({
        title: "Email archived",
        description: "The email has been moved to your archive",
      });
    }
  });

  // Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async (category: 'primary' | 'other') => {
      return await apiRequest("POST", "/api/inbox/mark-all-read", { category });
    },
    onSuccess: () => {
      // Invalidate all messages queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/stats'] });
      toast({
        title: "All marked as read",
        description: "All emails in this category have been marked as read",
      });
    }
  });

  // Auto-select mailbox when only one mailbox account exists
  useEffect(() => {
    if (composerOpen && mailboxAccounts.length === 1 && !selectedMailboxId) {
      // Auto-select the only mailbox
      setSelectedMailboxId(mailboxAccounts[0].id);
    }
  }, [composerOpen, mailboxAccounts, selectedMailboxId]);

  // Send email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: { to: string; cc?: string; subject: string; body: string; mailboxAccountId: string }) => {
      return await apiRequest("POST", "/api/emails/send", emailData);
    },
    onSuccess: () => {
      toast({
        title: "Email sent successfully",
        description: "Your email has been sent",
      });
      handleCloseComposer();
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/sent'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send email",
        description: error.message || "An error occurred while sending",
        variant: "destructive",
      });
    }
  });

  // AI Analysis mutation
  const analyzeEmailMutation = useMutation({
    mutationFn: async (emailData: { subject: string; body: string }) => {
      const response = await apiRequest("POST", "/api/email-ai/analyze", emailData);
      return await response.json();
    },
    onSuccess: (data) => {
      setAiAnalysis(data);
      setShowAiAnalysis(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Could not analyze email",
        variant: "destructive",
      });
    }
  });

  // AI Rewrite mutation
  const rewriteEmailMutation = useMutation({
    mutationFn: async (data: { subject: string; body: string; improvements: string[] }) => {
      const response = await apiRequest("POST", "/api/email-ai/rewrite", data);
      return await response.json();
    },
    onSuccess: (data: { subject: string; body: string }) => {
      setSubject(data.subject);
      setBody(data.body);
      setShowAiAnalysis(false);
      setAiAnalysis(null);
      toast({
        title: "Email rewritten",
        description: "Your email has been improved by AI",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Rewrite failed",
        description: error.message || "Could not rewrite email",
        variant: "destructive",
      });
    }
  });

  const handleOpenComposer = () => {
    setComposerOpen(true);
  };

  // Auto-select default signature when composer opens
  useEffect(() => {
    if (composerOpen && signatures.length > 0) {
      const defaultSig = signatures.find(s => s.isDefault);
      if (defaultSig && !selectedSignatureId) {
        setSelectedSignatureId(defaultSig.id);
      }
    }
  }, [composerOpen, signatures, selectedSignatureId]);

  // Inject/replace signature when signature changes
  useEffect(() => {
    if (!composerOpen) return;

    let cleanBody = body;

    // Remove the LAST INJECTED signature HTML (not current signatures array)
    if (lastInjectedSignatureRef.current) {
      const lastSigWithBreaks = `<br><br>${lastInjectedSignatureRef.current}`;
      cleanBody = cleanBody.split(lastSigWithBreaks).join('');
      cleanBody = cleanBody.split(lastInjectedSignatureRef.current).join('');
    }

    // Add new signature if one is selected (and not "none")
    let newSignatureHtml: string | null = null;
    if (selectedSignatureId && selectedSignatureId !== 'none') {
      const signature = signatures.find(s => s.id === selectedSignatureId);
      if (signature) {
        newSignatureHtml = signature.signatureHtml;
        cleanBody = `${cleanBody}<br><br>${newSignatureHtml}`;
      }
    }

    // Update the last injected signature reference
    lastInjectedSignatureRef.current = newSignatureHtml;

    // Only update if body actually changed to avoid infinite loop
    if (cleanBody !== body) {
      setBody(cleanBody);
    }
  }, [selectedSignatureId, signatures]);

  const handleCloseComposer = () => {
    setComposerOpen(false);
    setComposerMode(null);
    setReplyingToEmail(null);
    setTo("");
    setCc("");
    setShowCc(false);
    setSubject("");
    setBody("");
    setShowAiAnalysis(false);
    setAiAnalysis(null);
    setSelectedSignatureId(null);
    setSelectedMailboxId(null);
    lastInjectedSignatureRef.current = null;
  };

  const handleReply = (email: InboxMessage) => {
    setComposerMode('reply');
    setReplyingToEmail(email);
    setTo(email.from);
    setSubject(email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`);
    
    // Quote original message
    const quotedBody = `
      <br><br>
      <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 12px; color: #666;">
        <p><strong>On ${new Date(email.receivedDateTime).toLocaleString()}, ${email.fromName || email.from} wrote:</strong></p>
        ${email.bodyHtml || `<p>${email.bodyPreview}</p>`}
      </div>
    `;
    setBody(quotedBody);
    setComposerOpen(true);
  };

  const handleReplyAll = (email: InboxMessage) => {
    setComposerMode('replyAll');
    setReplyingToEmail(email);
    setTo(email.from);
    
    // Include all other recipients in CC except the current user
    const otherRecipients = [...email.to, ...email.cc].filter(recipient => 
      recipient.toLowerCase() !== email.from.toLowerCase()
    );
    if (otherRecipients.length > 0) {
      setCc(otherRecipients.join(', '));
      setShowCc(true);
    }
    
    setSubject(email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`);
    
    // Quote original message
    const quotedBody = `
      <br><br>
      <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 12px; color: #666;">
        <p><strong>On ${new Date(email.receivedDateTime).toLocaleString()}, ${email.fromName || email.from} wrote:</strong></p>
        ${email.bodyHtml || `<p>${email.bodyPreview}</p>`}
      </div>
    `;
    setBody(quotedBody);
    setComposerOpen(true);
  };

  const handleForward = (email: InboxMessage) => {
    setComposerMode('forward');
    setReplyingToEmail(email);
    setTo('');
    setSubject(email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`);
    
    // Forward original message
    const forwardedBody = `
      <br><br>
      <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 12px;">
        <p><strong>---------- Forwarded message ----------</strong></p>
        <p><strong>From:</strong> ${email.fromName || email.from} &lt;${email.from}&gt;</p>
        <p><strong>Date:</strong> ${new Date(email.receivedDateTime).toLocaleString()}</p>
        <p><strong>Subject:</strong> ${email.subject}</p>
        <p><strong>To:</strong> ${email.to.join(', ')}</p>
        ${email.cc.length > 0 ? `<p><strong>Cc:</strong> ${email.cc.join(', ')}</p>` : ''}
        <br>
        ${email.bodyHtml || `<p>${email.bodyPreview}</p>`}
      </div>
    `;
    setBody(forwardedBody);
    setComposerOpen(true);
  };

  const handleAnalyzeEmail = () => {
    if (!subject.trim() || !body.trim()) {
      toast({
        title: "Cannot analyze",
        description: "Please enter both subject and message",
        variant: "destructive",
      });
      return;
    }

    analyzeEmailMutation.mutate({ subject, body });
  };

  const handleRewriteEmail = () => {
    if (!aiAnalysis) return;

    rewriteEmailMutation.mutate({
      subject,
      body,
      improvements: aiAnalysis.suggestions,
    });
  };

  const handleSendEmail = () => {
    if (!to.trim()) {
      toast({
        title: "Recipient required",
        description: "Please enter at least one recipient email address",
        variant: "destructive",
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        title: "Subject required",
        description: "Please enter an email subject",
        variant: "destructive",
      });
      return;
    }

    if (!selectedMailboxId) {
      toast({
        title: "Mailbox required",
        description: "Please select a mailbox to send from",
        variant: "destructive",
      });
      return;
    }

    // Prepare final body with signature if selected
    let finalBody = body;
    if (selectedSignatureId && selectedSignatureId !== 'none') {
      const signature = signatures.find(s => s.id === selectedSignatureId);
      if (signature && !finalBody.includes(signature.signatureHtml)) {
        finalBody = `${finalBody}<br><br>${signature.signatureHtml}`;
      }
    }

    sendEmailMutation.mutate({
      to,
      cc: cc.trim() || undefined,
      subject,
      body: finalBody,
      mailboxAccountId: selectedMailboxId,
    });
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleEmailClick = (email: InboxMessage) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      markReadMutation.mutate({ messageId: email.id, isRead: true });
    }
  };

  const handleToggleStar = (e: React.MouseEvent, messageId: string) => {
    e.stopPropagation();
    toggleStarMutation.mutate(messageId);
  };

  return (
    <PageShell
      title="Inbox"
      description="Enterprise email communication hub with dual inbox categorization"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Communications" },
        { label: "Inbox" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-inbox"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {selectedCategory !== 'sent' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate(selectedCategory as 'primary' | 'other')}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              Mark All Read
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleOpenComposer}
            data-testid="button-compose-email"
          >
            <Send className="h-4 w-4 mr-2" />
            Compose
          </Button>
        </div>
      }
    >
      {/* Email Composer Dialog */}
      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-xl font-semibold">New Email</DialogTitle>
            <DialogDescription className="sr-only">
              Compose and send a new email with rich text formatting
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* No Mailbox Warning */}
            {mailboxAccounts.length === 0 && (
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sm mb-1">No Mailbox Connected</h4>
                      <p className="text-sm text-muted-foreground">
                        You need to connect a mailbox account before sending emails. Go to Settings to connect your Microsoft 365 or Google account.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mailbox Selector - Show if multiple mailboxes */}
            {mailboxAccounts.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="mailbox" className="text-sm font-medium">
                  Send From <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedMailboxId || ''}
                  onValueChange={setSelectedMailboxId}
                >
                  <SelectTrigger id="mailbox" data-testid="select-mailbox-account">
                    <SelectValue placeholder="Select mailbox account" />
                  </SelectTrigger>
                  <SelectContent>
                    {mailboxAccounts.map((mailbox) => (
                      <SelectItem key={mailbox.id} value={mailbox.id}>
                        {mailbox.mailboxEmail}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Show single mailbox info */}
            {mailboxAccounts.length === 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>Sending from: <strong className="text-foreground">{mailboxAccounts[0].mailboxEmail}</strong></span>
              </div>
            )}

            {/* To Field */}
            <div className="space-y-2">
              <Label htmlFor="to" className="text-sm font-medium">
                To <span className="text-destructive">*</span>
              </Label>
              <Input
                id="to"
                type="email"
                placeholder="recipient@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                data-testid="input-email-to"
                className="font-mono text-sm"
              />
            </div>

            {/* CC Field Toggle */}
            {!showCc && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCc(true)}
                data-testid="button-show-cc"
                className="text-muted-foreground"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Cc
              </Button>
            )}

            {/* CC Field */}
            {showCc && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cc" className="text-sm font-medium">
                    Cc
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setShowCc(false);
                      setCc("");
                    }}
                    data-testid="button-hide-cc"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  id="cc"
                  type="email"
                  placeholder="cc@example.com (separate multiple with commas)"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  data-testid="input-email-cc"
                  className="font-mono text-sm"
                />
              </div>
            )}

            {/* Subject Field */}
            <div className="space-y-2">
              <Label htmlFor="subject" className="text-sm font-medium">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject"
                type="text"
                placeholder="Email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="input-email-subject"
              />
            </div>

            {/* Body Field - Rich Text Editor */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Message <span className="text-destructive">*</span>
              </Label>
              <RichTextEditor
                content={body}
                onChange={setBody}
                placeholder="Write your message here..."
              />
            </div>

            {/* AI Analysis Results */}
            {showAiAnalysis && aiAnalysis && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">AI Email Analysis</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setShowAiAnalysis(false);
                        setAiAnalysis(null);
                      }}
                      data-testid="button-close-analysis"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Overall Score */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Overall Quality</span>
                        <span className="text-sm font-semibold">{aiAnalysis.overallScore}/100</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            aiAnalysis.overallScore >= 70 ? "bg-green-500" : 
                            aiAnalysis.overallScore >= 50 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${aiAnalysis.overallScore}%` }}
                        />
                      </div>
                    </div>
                    {aiAnalysis.overallScore >= 70 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>

                  {/* Detailed Scores */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Tone</div>
                      <div className="text-sm font-semibold">{aiAnalysis.toneScore}/100</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Clarity</div>
                      <div className="text-sm font-semibold">{aiAnalysis.clarityScore}/100</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Professional</div>
                      <div className="text-sm font-semibold">{aiAnalysis.professionalismScore}/100</div>
                    </div>
                  </div>

                  {/* Sentiment Badge */}
                  <div>
                    <Badge variant={
                      aiAnalysis.sentiment === 'positive' ? 'default' :
                      aiAnalysis.sentiment === 'neutral' ? 'secondary' : 'destructive'
                    }>
                      {aiAnalysis.sentiment.charAt(0).toUpperCase() + aiAnalysis.sentiment.slice(1)} Sentiment
                    </Badge>
                  </div>

                  {/* Suggestions */}
                  {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Suggestions for Improvement:</h4>
                      <ul className="space-y-1.5">
                        {aiAnalysis.suggestions.map((suggestion, index) => (
                          <li key={index} className="text-sm text-muted-foreground flex gap-2">
                            <span className="text-primary">•</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Rewrite Button */}
                  {aiAnalysis.overallScore < 80 && (
                    <Button
                      onClick={handleRewriteEmail}
                      disabled={rewriteEmailMutation.isPending}
                      size="sm"
                      className="w-full"
                      data-testid="button-ai-rewrite"
                    >
                      {rewriteEmailMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Rewriting...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Apply AI Improvements
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 bg-muted/30 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                disabled
                data-testid="button-attach-file"
                className="text-muted-foreground"
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Attach
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalyzeEmail}
                disabled={analyzeEmailMutation.isPending || !subject.trim() || !body.trim()}
                data-testid="button-analyze-email"
              >
                {analyzeEmailMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze with AI
                  </>
                )}
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Signature Picker */}
              {signatures.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedSignatureId || ''}
                    onValueChange={setSelectedSignatureId}
                  >
                    <SelectTrigger className="w-[180px] h-8" data-testid="select-signature">
                      <SelectValue placeholder="No signature" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No signature</SelectItem>
                      {signatures.map((sig) => (
                        <SelectItem key={sig.id} value={sig.id}>
                          {sig.name} {sig.isDefault && '(Default)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <SignatureManager />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCloseComposer}
                data-testid="button-cancel-email"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={sendEmailMutation.isPending || mailboxAccounts.length === 0}
                data-testid="button-send-email"
              >
                {sendEmailMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email List */}
        <div className="lg:col-span-1">
          <Card className="h-[calc(100vh-16rem)] flex flex-col">
            <div className="p-4 flex-shrink-0 space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-emails"
                />
              </div>

              {/* Primary/Other/Sent Tabs */}
              <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as 'primary' | 'other' | 'sent')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="primary" data-testid="tab-primary" className="relative">
                    <InboxIcon className="h-4 w-4 mr-2" />
                    Primary
                    {primaryStats.unreadCount > 0 && (
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                        {primaryStats.unreadCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="other" data-testid="tab-other" className="relative">
                    <Mail className="h-4 w-4 mr-2" />
                    Other
                    {otherStats.unreadCount > 0 && (
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                        {otherStats.unreadCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="sent" data-testid="tab-sent" className="relative">
                    <Send className="h-4 w-4 mr-2" />
                    Sent
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Separator />

            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <div className="text-muted-foreground text-sm">Loading emails...</div>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Mail className="h-8 w-8 text-primary" />
                    </div>
                    {searchQuery ? (
                      <>
                        <p className="text-foreground text-sm font-medium mb-1">
                          No emails match your search
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Try a different search term
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold mb-2">Your Inbox is Empty</h3>
                        <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                          Connect your Microsoft 365 or Google account and sync your emails to start managing communications from within the CRM
                        </p>
                        <div className="flex flex-col gap-3 items-center">
                          <Button
                            size="lg"
                            onClick={() => window.location.href = '/settings'}
                            data-testid="button-connect-m365"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Connect Email
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Or sync your existing connection
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            data-testid="button-refresh-inbox-empty"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh Inbox
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="divide-y">
                    {messages.map((email) => (
                      <div
                        key={email.id}
                        className={cn(
                          "p-4 cursor-pointer transition-all hover-elevate active-elevate-2",
                          selectedEmail?.id === email.id && "bg-primary/5 border-l-2 border-l-primary",
                          !email.isRead && selectedEmail?.id !== email.id && "bg-muted/30"
                        )}
                        onClick={() => handleEmailClick(email)}
                        data-testid={`email-item-${email.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-background">
                            <AvatarFallback className={cn(
                              !email.isRead && "bg-primary/10 text-primary font-semibold"
                            )}>
                              {getInitials(email.fromName || email.from)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className={cn(
                                "text-sm truncate",
                                !email.isRead && "font-semibold"
                              )}>
                                {email.fromName || email.from}
                              </h4>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(email.receivedDateTime), { addSuffix: true })}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => handleToggleStar(e, email.id)}
                                  data-testid={`button-star-${email.id}`}
                                >
                                  {email.isStarred ? (
                                    <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                                  ) : (
                                    <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <p className={cn(
                              "text-sm truncate mb-1",
                              !email.isRead ? "font-medium text-foreground" : "text-muted-foreground"
                            )}>
                              {email.subject || '(No Subject)'}
                            </p>
                            {email.bodyPreview && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {email.bodyPreview}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {!email.isRead && (
                                <Badge variant="default" className="text-xs h-5 px-2">
                                  Unread
                                </Badge>
                              )}
                              {email.hasAttachments && (
                                <Badge variant="outline" className="text-xs h-5 px-2">
                                  <Paperclip className="h-3 w-3 mr-1" />
                                  Files
                                </Badge>
                              )}
                              {email.accountName && (
                                <Badge variant="secondary" className="text-xs h-5 px-2">
                                  <Building2 className="h-3 w-3 mr-1" />
                                  {email.accountName}
                                </Badge>
                              )}
                              {email.contactName && (
                                <Badge variant="secondary" className="text-xs h-5 px-2">
                                  <User className="h-3 w-3 mr-1" />
                                  {email.contactName}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </Card>
        </div>

        {/* Email Detail */}
        <div className="lg:col-span-2">
          <Card className="h-[calc(100vh-16rem)] flex flex-col">
            {selectedEmail ? (
              <>
                {/* Email Header */}
                <div className="p-6 flex-shrink-0">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-2xl font-semibold mb-2">{selectedEmail.subject || '(No Subject)'}</h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedEmail.accountName && (
                          <Badge variant="secondary">
                            <Building2 className="h-3 w-3 mr-1.5" />
                            {selectedEmail.accountName}
                          </Badge>
                        )}
                        {selectedEmail.contactName && (
                          <Badge variant="secondary">
                            <User className="h-3 w-3 mr-1.5" />
                            {selectedEmail.contactName}
                          </Badge>
                        )}
                        {selectedEmail.opportunityId && (
                          <Badge variant="secondary">
                            <Target className="h-3 w-3 mr-1.5" />
                            Linked to Deal
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleReply(selectedEmail)}
                        data-testid="button-reply"
                      >
                        <Reply className="h-4 w-4 mr-2" />
                        Reply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReplyAll(selectedEmail)}
                        data-testid="button-reply-all"
                      >
                        <Reply className="h-4 w-4 mr-2" />
                        Reply All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleForward(selectedEmail)}
                        data-testid="button-forward"
                      >
                        <Forward className="h-4 w-4 mr-2" />
                        Forward
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => archiveMutation.mutate(selectedEmail.id)}
                        disabled={archiveMutation.isPending}
                        data-testid="button-archive"
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                    </div>
                  </div>

                  {/* Sender Info */}
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="text-lg">
                        {getInitials(selectedEmail.fromName || selectedEmail.from)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-medium">{selectedEmail.fromName || selectedEmail.from}</div>
                      <div className="text-sm text-muted-foreground">{selectedEmail.from}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(selectedEmail.receivedDateTime).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Recipients */}
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-12">To:</span>
                      <span className="font-mono text-xs">{selectedEmail.to.join(', ')}</span>
                    </div>
                    {selectedEmail.cc.length > 0 && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground min-w-12">Cc:</span>
                        <span className="font-mono text-xs">{selectedEmail.cc.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Tracking Stats */}
                {trackingStats && (trackingStats.opens > 0 || trackingStats.clicks > 0) && (
                  <>
                    <div className="px-6 py-4 bg-muted/30">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Email Engagement
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <div className="text-2xl font-bold text-primary">
                            {trackingStats.opens}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Opens</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold text-primary">
                            {trackingStats.uniqueOpens}
                          </div>
                          <div className="text-xs text-muted-foreground">Unique Opens</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold text-accent">
                            {trackingStats.clicks}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Clicks</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-2xl font-bold text-accent">
                            {trackingStats.uniqueClicks}
                          </div>
                          <div className="text-xs text-muted-foreground">Unique Clicks</div>
                        </div>
                      </div>
                      {(trackingStats.lastOpenedAt || trackingStats.lastClickedAt) && (
                        <div className="mt-3 pt-3 border-t flex flex-col gap-1.5 text-xs text-muted-foreground">
                          {trackingStats.lastOpenedAt && (
                            <div className="flex items-center gap-2">
                              <Eye className="h-3 w-3" />
                              Last opened {formatDistanceToNow(new Date(trackingStats.lastOpenedAt), { addSuffix: true })}
                            </div>
                          )}
                          {trackingStats.lastClickedAt && (
                            <div className="flex items-center gap-2">
                              <MousePointer className="h-3 w-3" />
                              Last clicked {formatDistanceToNow(new Date(trackingStats.lastClickedAt), { addSuffix: true })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Separator />
                  </>
                )}

                {/* Email Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6">
                  {selectedEmail.bodyHtml ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap font-sans text-sm">
                      {selectedEmail.bodyPreview}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                    <Mail className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Email Selected</h3>
                  <p className="text-muted-foreground text-sm">
                    Select an email from the list to view its content
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
