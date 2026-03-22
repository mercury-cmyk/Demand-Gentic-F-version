import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageShell } from "@/components/patterns/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  Mail, Inbox as InboxIcon, Send, Archive, Star, StarOff,
  RefreshCw, Reply, Forward, Trash2, Paperclip,
  Search, Building2, User, Target, ChevronRight, ChevronDown, Loader2, X, Plus,
  Sparkles, AlertCircle, Eye, MousePointer,
  Link2, Unlink, Bell, BellDot, BarChart3, Clock, TrendingUp,
  ExternalLink, Activity, Globe, Smartphone, Monitor, MailOpen,
  MousePointerClick, ArrowUpRight, RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SignatureManager } from "@/components/signature-manager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InboxSidebar, type InboxFolder } from "@/components/inbox/inbox-sidebar";
import { InboxSettingsPanel } from "@/components/inbox/inbox-settings-panel";
import { KeyboardShortcutHelp } from "@/components/inbox/keyboard-shortcut-help";
import { ContactAutocomplete } from "@/components/inbox/contact-autocomplete";

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

interface GmailConnectionStatus {
  connected: boolean;
  mailboxEmail?: string;
  displayName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
}

interface M365ConnectionStatus {
  connected: boolean;
  mailboxEmail?: string;
  displayName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
}

interface TrackingStats {
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
}

interface BatchTrackingStats {
  stats: Record;
}

export default function InboxPage() {
  const { toast } = useToast();
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  
  // Email composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState(null);
  const [replyingToEmail, setReplyingToEmail] = useState(null);
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [showCc, setShowCc] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState(null);
  const [selectedMailboxId, setSelectedMailboxId] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  
  // Track the last injected signature HTML to enable proper removal when switching/editing
  const lastInjectedSignatureRef = useRef(null);
  
  const [trackingEventsExpanded, setTrackingEventsExpanded] = useState(false);

  // Gmail connection status
  const { data: gmailStatus, isLoading: gmailStatusLoading } = useQuery({
    queryKey: ['/api/oauth/google/status'],
  });

  // M365 connection status
  const { data: m365Status, isLoading: m365StatusLoading } = useQuery({
    queryKey: ['/api/oauth/microsoft/status'],
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingM365, setIsConnectingM365] = useState(false);

  // Attachment state
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  // Gmail OAuth popup connect handler
  const handleConnectGmail = useCallback(async () => {
    setIsConnecting(true);
    try {
      const res = await apiRequest("GET", "/api/oauth/google/authorize");
      const { authUrl } = await res.json();

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const popup = window.open(
        authUrl,
        "gmail-oauth",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "oauth-success" && event.data?.provider === "google") {
          window.removeEventListener("message", handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ["/api/oauth/google/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inbox/messages"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inbox/stats"] });
          toast({ title: "Gmail Connected", description: "Your Gmail account has been connected successfully." });
        }
        if (event.data?.type === "oauth-error" && event.data?.provider === "google") {
          window.removeEventListener("message", handleMessage);
          setIsConnecting(false);
          toast({ title: "Connection Failed", description: event.data.error || "Failed to connect Gmail account.", variant: "destructive" });
        }
      };
      window.addEventListener("message", handleMessage);

      // Cleanup if popup is closed without completing
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          setIsConnecting(false);
        }
      }, 1000);
    } catch (error) {
      setIsConnecting(false);
      toast({ title: "Connection Failed", description: "Failed to initiate Gmail connection.", variant: "destructive" });
    }
  }, [toast]);

  // Gmail disconnect mutation
  const disconnectGmailMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/oauth/google/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/google/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: "Gmail Disconnected", description: "Your Gmail account has been disconnected." });
    },
    onError: () => {
      toast({ title: "Disconnect Failed", description: "Failed to disconnect Gmail account.", variant: "destructive" });
    },
  });

  // Gmail sync mutation
  const syncGmailMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/oauth/google/sync");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/google/status"] });
      toast({ title: "Sync Complete", description: "Gmail emails have been synced." });
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Failed to sync Gmail emails.", variant: "destructive" });
    },
  });

  // M365/Outlook OAuth popup connect handler
  const handleConnectM365 = useCallback(async () => {
    setIsConnectingM365(true);
    try {
      const res = await apiRequest("GET", "/api/oauth/microsoft/authorize");
      const { authUrl } = await res.json();

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const popup = window.open(
        authUrl,
        "m365-oauth",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "oauth-success" && event.data?.provider === "microsoft") {
          window.removeEventListener("message", handleMessage);
          setIsConnectingM365(false);
          queryClient.invalidateQueries({ queryKey: ["/api/oauth/microsoft/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inbox/messages"] });
          queryClient.invalidateQueries({ queryKey: ["/api/inbox/stats"] });
          toast({ title: "Outlook Connected", description: "Your Microsoft 365 account has been connected successfully." });
        }
        if (event.data?.type === "oauth-error" && event.data?.provider === "microsoft") {
          window.removeEventListener("message", handleMessage);
          setIsConnectingM365(false);
          toast({ title: "Connection Failed", description: event.data.error || "Failed to connect Outlook account.", variant: "destructive" });
        }
      };
      window.addEventListener("message", handleMessage);

      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          setIsConnectingM365(false);
        }
      }, 1000);
    } catch (error) {
      setIsConnectingM365(false);
      toast({ title: "Connection Failed", description: "Failed to initiate Outlook connection.", variant: "destructive" });
    }
  }, [toast]);

  // M365 disconnect mutation
  const disconnectM365Mutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/oauth/microsoft/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/microsoft/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox-accounts"] });
      toast({ title: "Outlook Disconnected", description: "Your Microsoft 365 account has been disconnected." });
    },
    onError: () => {
      toast({ title: "Disconnect Failed", description: "Failed to disconnect Outlook account.", variant: "destructive" });
    },
  });

  // M365 sync mutation
  const syncM365Mutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/oauth/microsoft/sync");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/oauth/microsoft/status"] });
      toast({ title: "Sync Complete", description: "Outlook emails have been synced." });
    },
    onError: () => {
      toast({ title: "Sync Failed", description: "Failed to sync Outlook emails.", variant: "destructive" });
    },
  });

  // Fetch inbox statistics (poll every 30s for new email notifications)
  const { data: statsResponse } = useQuery({
    queryKey: ['/api/inbox/stats'],
    refetchInterval: 30000,
  });

  const stats = statsResponse?.stats || [];

  // Fetch email signatures
  const { data: signatures = [] } = useQuery({
    queryKey: ['/api/signatures'],
    enabled: composerOpen,
  });
  
  // Fetch mailbox accounts
  const { data: mailboxAccounts = [] } = useQuery({
    queryKey: ['/api/mailbox-accounts'],
    enabled: composerOpen,
  });
  
  const primaryStats = stats.find((s: InboxStats) => s.category === 'primary') || { unreadCount: 0, totalCount: 0 };
  const otherStats = stats.find((s: InboxStats) => s.category === 'other') || { unreadCount: 0, totalCount: 0 };

  // Fetch inbox messages (Primary/Other) with hierarchical query key for cache invalidation
  // Using separate segments so invalidateQueries(['/api/inbox/messages']) matches all
  const inboxCategory = activeFolder === 'inbox' ? 'primary' : activeFolder === 'other' ? 'other' : 'primary';
  const { data: messagesData, isLoading: messagesLoading, refetch } = useQuery({
    queryKey: ['/api/inbox/messages', inboxCategory, searchQuery || ''],
    queryFn: async () => {
      const params = new URLSearchParams({
        category: inboxCategory,
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
    enabled: activeFolder === 'inbox' || activeFolder === 'other'
  });

  // Fetch sent messages
  const { data: sentMessagesData, isLoading: sentMessagesLoading } = useQuery({
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
    enabled: activeFolder === 'sent'
  });

  // Fetch starred messages
  const { data: starredData, isLoading: starredLoading } = useQuery({
    queryKey: ['/api/inbox/starred'],
    enabled: activeFolder === 'starred',
  });

  // Fetch trashed messages
  const { data: trashData, isLoading: trashLoading } = useQuery({
    queryKey: ['/api/inbox/trash-messages'],
    enabled: activeFolder === 'trash',
  });

  // Fetch archived messages
  const { data: archiveData, isLoading: archiveLoading } = useQuery({
    queryKey: ['/api/inbox/archived'],
    enabled: activeFolder === 'archive',
  });

  // Fetch drafts
  const { data: draftsData, isLoading: draftsLoading } = useQuery }>({
    queryKey: ['/api/inbox/drafts'],
    enabled: activeFolder === 'drafts',
  });

  // Fetch scheduled emails
  const { data: scheduledData, isLoading: scheduledLoading } = useQuery }>({
    queryKey: ['/api/inbox/scheduled'],
    enabled: activeFolder === 'scheduled',
  });

  // Derive messages based on active folder
  const messages = (() => {
    switch (activeFolder) {
      case 'inbox':
      case 'other':
        return messagesData?.messages || [];
      case 'sent':
        return sentMessagesData?.messages || [];
      case 'starred':
        return starredData?.messages || [];
      case 'trash':
        return trashData?.messages || [];
      case 'archive':
        return archiveData?.messages || [];
      default:
        return [];
    }
  })();
  
  const isLoadingMessages = (() => {
    switch (activeFolder) {
      case 'inbox': case 'other': return messagesLoading;
      case 'sent': return sentMessagesLoading;
      case 'starred': return starredLoading;
      case 'trash': return trashLoading;
      case 'archive': return archiveLoading;
      case 'drafts': return draftsLoading;
      case 'scheduled': return scheduledLoading;
      default: return false;
    }
  })();

  // Fetch tracking stats for selected email
  const { data: trackingStats } = useQuery({
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

  // Fetch detailed tracking events (lazy - only when expanded)
  interface TrackingEvent {
    id: number;
    recipientEmail: string;
    openedAt?: string;
    clickedAt?: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceType: string | null;
    location?: { city?: string; region?: string; country?: string } | null;
    linkUrl?: string | null;
    linkText?: string | null;
  }
  const { data: trackingEvents, isLoading: trackingEventsLoading } = useQuery({
    queryKey: ['/api/track/events', selectedEmail?.id],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`/api/track/events/${selectedEmail!.id}`, { headers, credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch tracking events');
      return response.json();
    },
    enabled: !!selectedEmail?.id && trackingEventsExpanded,
  });

  // Fetch batch tracking stats for sent emails in list view
  const sentMessageIds = (activeFolder === 'sent' ? messages : []).map(m => m.id);
  const { data: batchTrackingData } = useQuery({
    queryKey: ['/api/track/stats/batch', sentMessageIds.join(',')],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch('/api/track/stats/batch', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ messageIds: sentMessageIds }),
      });
      
      if (!response.ok) throw new Error('Failed to fetch batch tracking stats');
      return response.json();
    },
    enabled: activeFolder === 'sent' && sentMessageIds.length > 0,
    refetchInterval: 30000, // Refresh every 30 seconds for live tracking
  });
  const batchStats = batchTrackingData?.stats || {};

  // Notification polling: track previous unread count for new email detection
  const prevUnreadRef = useRef(null);
  const [showNotificationBell, setShowNotificationBell] = useState(false);
  const totalUnread = (primaryStats.unreadCount || 0) + (otherStats.unreadCount || 0);
  
  useEffect(() => {
    if (prevUnreadRef.current !== null && totalUnread > prevUnreadRef.current) {
      // New email arrived
      setShowNotificationBell(true);
      toast({
        title: "New email received",
        description: `You have ${totalUnread} unread email${totalUnread !== 1 ? 's' : ''} in your inbox`,
      });
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);

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
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/archived'] });
      setSelectedEmail(null);
      toast({
        title: "Email archived",
        description: "The email has been moved to your archive",
      });
    }
  });

  // Trash mutation (soft-delete)
  const trashMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", "/api/inbox/trash", { messageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/trash-messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/starred'] });
      setSelectedEmail(null);
      toast({ title: "Email deleted", description: "Moved to Trash" });
    }
  });

  // Restore from trash
  const untrashMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("POST", "/api/inbox/untrash", { messageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/trash-messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/stats'] });
      setSelectedEmail(null);
      toast({ title: "Email restored", description: "Message restored from trash" });
    }
  });

  // Permanent delete
  const permanentDeleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest("DELETE", "/api/inbox/delete", { messageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/trash-messages'] });
      setSelectedEmail(null);
      toast({ title: "Permanently deleted", description: "Message has been permanently deleted" });
    }
  });

  // Empty trash
  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/inbox/empty-trash");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/trash-messages'] });
      setSelectedEmail(null);
      toast({ title: "Trash emptied", description: "All trashed messages have been permanently deleted" });
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

  // AI Compose mutation (DeepSeek → Kimi → OpenAI)
  const [aiComposeOpen, setAiComposeOpen] = useState(false);
  const [aiComposePrompt, setAiComposePrompt] = useState("");
  const [grammarExpanded, setGrammarExpanded] = useState(false);
  const grammarDebounceRef = useRef | null>(null);
  const lastCheckedBodyRef = useRef("");
  const [grammarResult, setGrammarResult] = useState;
  } | null>(null);
  const [rewritePromptOpen, setRewritePromptOpen] = useState(false);
  const [rewriteInstructions, setRewriteInstructions] = useState("");

  const aiComposeMutation = useMutation({
    mutationFn: async (data: { prompt: string; tone?: string; replyTo?: string }) => {
      const response = await apiRequest("POST", "/api/email-ai/compose", data, { timeout: 60000 });
      return await response.json();
    },
    onSuccess: (data: { subject: string; body: string }) => {
      if (data.subject) setSubject(data.subject);
      if (data.body) setBody(data.body);
      setAiComposeOpen(false);
      setAiComposePrompt("");
      toast({ title: "Email composed", description: "AI has generated your email" });
    },
    onError: (error: Error) => {
      toast({ title: "Compose failed", description: error.message || "Could not compose email", variant: "destructive" });
    },
  });

  const aiRewriteBodyMutation = useMutation({
    mutationFn: async (data: { body: string; instructions: string }) => {
      const response = await apiRequest("POST", "/api/email-ai/rewrite-body", data, { timeout: 60000 });
      return await response.json();
    },
    onSuccess: (data: { body: string }) => {
      if (data.body) setBody(data.body);
      setRewritePromptOpen(false);
      setRewriteInstructions("");
      toast({ title: "Email rewritten", description: "AI has improved your email" });
    },
    onError: (error: Error) => {
      toast({ title: "Rewrite failed", description: error.message || "Could not rewrite email", variant: "destructive" });
    },
  });

  const grammarCheckMutation = useMutation({
    mutationFn: async (data: { text: string }) => {
      const response = await apiRequest("POST", "/api/email-ai/grammar", data, { timeout: 60000 });
      return await response.json();
    },
    onSuccess: (data: { corrected: string; changes: Array }) => {
      setGrammarResult(data);
    },
    onError: () => {
      // Silent during auto-check — no disruptive error toasts
    },
  });

  // Live grammar checking — debounce 3s after body changes
  useEffect(() => {
    if (grammarDebounceRef.current) {
      clearTimeout(grammarDebounceRef.current);
    }
    // Strip HTML tags to get plain text length
    const plainText = body.replace(/]*>/g, '').trim();
    if (plainText.length  {
      lastCheckedBodyRef.current = body;
      grammarCheckMutation.mutate({ text: body });
    }, 3000);

    return () => {
      if (grammarDebounceRef.current) clearTimeout(grammarDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, composerOpen]);

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

  // Inject/replace signature when signature changes.
  // For replies/forwards, signature goes BETWEEN the compose area and the quoted thread
  // (Gmail/Outlook standard: fresh text → signature → quoted original).
  const QUOTE_MARKER = '';

  useEffect(() => {
    if (!composerOpen) return;

    let cleanBody = body;

    // Remove the LAST INJECTED signature HTML (not current signatures array)
    if (lastInjectedSignatureRef.current) {
      const lastSigWithBreaks = `${lastInjectedSignatureRef.current}`;
      cleanBody = cleanBody.split(lastSigWithBreaks).join('');
      cleanBody = cleanBody.split(lastInjectedSignatureRef.current).join('');
    }

    // Add new signature if one is selected (and not "none")
    let newSignatureHtml: string | null = null;
    if (selectedSignatureId && selectedSignatureId !== 'none') {
      const signature = signatures.find(s => s.id === selectedSignatureId);
      if (signature) {
        newSignatureHtml = signature.signatureHtml;

        // For replies/forwards: inject signature BEFORE the quoted thread
        const quoteIdx = cleanBody.indexOf(QUOTE_MARKER);
        const fwdIdx = cleanBody.indexOf(FORWARD_MARKER);
        const threadIdx = quoteIdx >= 0 ? quoteIdx : fwdIdx;

        if (threadIdx > 0 && (composerMode === 'reply' || composerMode === 'replyAll' || composerMode === 'forward')) {
          const beforeThread = cleanBody.substring(0, threadIdx);
          const threadAndAfter = cleanBody.substring(threadIdx);
          cleanBody = `${beforeThread}${newSignatureHtml}${threadAndAfter}`;
        } else {
          // New compose — append at end
          cleanBody = `${cleanBody}${newSignatureHtml}`;
        }
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
    setTo([]);
    setCc([]);
    setShowCc(false);
    setSubject("");
    setBody("");
    setShowAiAnalysis(false);
    setAiAnalysis(null);
    setSelectedSignatureId(null);
    setSelectedMailboxId(null);
    setAttachments([]);
    lastInjectedSignatureRef.current = null;
  };

  // Collect all connected mailbox emails (lowercase) for filtering self from recipients
  const myEmails = new Set(mailboxAccounts.map(m => m.mailboxEmail.toLowerCase()));

  /**
   * Build a quoted thread block in Gmail/Outlook style.
   * Structure: empty compose area → (signature injected by useEffect) → quoted thread below.
   * The quoted thread is separated by a clear divider so the fresh message, signature,
   * and previous thread are visually distinct and never mixed.
   */
  function buildQuotedReply(email: InboxMessage): string {
    const dateStr = new Date(email.receivedDateTime).toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const senderDisplay = email.fromName ? `${email.fromName} &lt;${email.from}&gt;` : email.from;

    return [
      '',
      '',
      `  On ${dateStr}, ${senderDisplay} wrote:`,
      '  ',
      `    ${email.bodyHtml || `${email.bodyPreview || ''}`}`,
      '  ',
      '',
    ].join('\n');
  }

  function buildForwardedBlock(email: InboxMessage): string {
    const dateStr = new Date(email.receivedDateTime).toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return [
      '',
      '',
      '  ',
      '    ---------- Forwarded message ----------',
      `    From: ${email.fromName || email.from} &lt;${email.from}&gt;`,
      `    Date: ${dateStr}`,
      `    Subject: ${email.subject}`,
      `    To: ${email.to.join(', ')}`,
      email.cc.length > 0 ? `    Cc: ${email.cc.join(', ')}` : '',
      '  ',
      '  ',
      `  ${email.bodyHtml || `${email.bodyPreview || ''}`}`,
      '',
    ].filter(Boolean).join('\n');
  }

  const handleReply = (email: InboxMessage) => {
    setComposerMode('reply');
    setReplyingToEmail(email);
    setTo([email.from]);
    setCc([]);
    setShowCc(false);
    setSubject(email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`);
    // Body: empty compose area + quoted thread (signature injected by useEffect between them)
    setBody(buildQuotedReply(email));
    setComposerOpen(true);
  };

  const handleReplyAll = (email: InboxMessage) => {
    setComposerMode('replyAll');
    setReplyingToEmail(email);

    // To: original sender (never yourself)
    const toRecipients = [email.from].filter(addr => !myEmails.has(addr.toLowerCase()));
    // If the sender IS yourself (sent mail), put the original To in the To field instead
    if (toRecipients.length === 0) {
      toRecipients.push(...email.to.filter(addr => !myEmails.has(addr.toLowerCase())));
    }
    setTo(toRecipients);

    // CC: everyone else from To + CC, excluding sender (already in To) and self
    const ccRecipients = [...email.to, ...email.cc].filter(addr => {
      const lower = addr.toLowerCase();
      return !myEmails.has(lower) && lower !== email.from.toLowerCase();
    });
    // Deduplicate
    const uniqueCc = [...new Set(ccRecipients.map(e => e.toLowerCase()))].map(lower =>
      ccRecipients.find(e => e.toLowerCase() === lower)!
    );
    setCc(uniqueCc);
    setShowCc(uniqueCc.length > 0);

    setSubject(email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`);
    setBody(buildQuotedReply(email));
    setComposerOpen(true);
  };

  const handleForward = (email: InboxMessage) => {
    setComposerMode('forward');
    setReplyingToEmail(email);
    setTo([]);
    setCc([]);
    setShowCc(false);
    setSubject(email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`);
    setBody(buildForwardedBlock(email));
    setComposerOpen(true);
  };

  const handleSendEmail = () => {
    if (to.length === 0) {
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
        finalBody = `${finalBody}${signature.signatureHtml}`;
      }
    }

    sendEmailMutation.mutate({
      to: to.join(', '),
      cc: cc.length > 0 ? cc.join(', ') : undefined,
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

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      // Never intercept modifier combos (Ctrl+C for copy, Ctrl+V for paste, Cmd+A, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        case "c":
          e.preventDefault();
          handleOpenComposer();
          break;
        case "/":
          e.preventDefault();
          document.querySelector('[data-testid="input-search-emails"]')?.focus();
          break;
        case "r":
          if (selectedEmail) {
            e.preventDefault();
            handleReply(selectedEmail);
          }
          break;
        case "a":
          if (selectedEmail) {
            e.preventDefault();
            handleReplyAll(selectedEmail);
          }
          break;
        case "f":
          if (selectedEmail) {
            e.preventDefault();
            handleForward(selectedEmail);
          }
          break;
        case "e":
          if (selectedEmail) {
            e.preventDefault();
            archiveMutation.mutate(selectedEmail.id);
          }
          break;
        case "#":
          if (selectedEmail) {
            e.preventDefault();
            trashMutation.mutate(selectedEmail.id);
          }
          break;
        case "s":
          if (selectedEmail) {
            e.preventDefault();
            toggleStarMutation.mutate(selectedEmail.id);
          }
          break;
        case "Escape":
          setSelectedEmail(null);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEmail]);

  return (
    
          {/* Notification Bell */}
          
            
              
                 {
                    setShowNotificationBell(false);
                    setActiveFolder('inbox');
                    refetch();
                  }}
                  data-testid="button-notifications"
                >
                  {showNotificationBell || totalUnread > 0 ? (
                    <>
                      
                      {totalUnread > 0 && (
                        
                          {totalUnread > 99 ? '99+' : totalUnread}
                        
                      )}
                    
                  ) : (
                    
                  )}
                
              
              
                {totalUnread > 0 ? `${totalUnread} unread email${totalUnread !== 1 ? 's' : ''}` : 'No new emails'}
              
            
          

          {/* Sync buttons */}
          {gmailStatus?.connected && (
            
              
                
                   syncGmailMutation.mutate()}
                    disabled={syncGmailMutation.isPending}
                    data-testid="button-sync-gmail"
                  >
                    
                  
                
                Sync Gmail
              
            
          )}
          {m365Status?.connected && (
            
              
                
                   syncM365Mutation.mutate()}
                    disabled={syncM365Mutation.isPending}
                    data-testid="button-sync-m365"
                  >
                    
                  
                
                Sync Outlook
              
            
          )}

           refetch()}
            data-testid="button-refresh-inbox"
          >
            
            Refresh
          
        
      }
    >
      {/* Email Composer Dialog */}
      
        
          
            New Email
            
              Compose and send a new email with rich text formatting
            
          

          

          
            {/* No Mailbox Warning */}
            {mailboxAccounts.length === 0 && (
              
                
                  
                    
                    
                      No Mailbox Connected
                      
                        Connect your email account to send emails directly from the inbox.
                      
                      
                        
                          {isConnecting ? (
                            
                          ) : (
                            
                          )}
                          Connect Gmail
                        
                        
                          {isConnectingM365 ? (
                            
                          ) : (
                            
                          )}
                          Connect Outlook
                        
                      
                    
                  
                
              
            )}

            {/* Mailbox Selector - Show if multiple mailboxes */}
            {mailboxAccounts.length > 1 && (
              
                
                  Send From *
                
                
                  
                    
                  
                  
                    {mailboxAccounts.map((mailbox) => (
                      
                        {mailbox.mailboxEmail}
                      
                    ))}
                  
                
              
            )}

            {/* Show single mailbox info */}
            {mailboxAccounts.length === 1 && (
              
                
                Sending from: {mailboxAccounts[0].mailboxEmail}
              
            )}

            {/* To Field */}
            
              
                To *
              
              
            

            {/* CC Field Toggle */}
            {!showCc && (
               setShowCc(true)}
                data-testid="button-show-cc"
                className="text-muted-foreground"
              >
                
                Add Cc
              
            )}

            {/* CC Field */}
            {showCc && (
              
                
                  
                    Cc
                  
                   {
                      setShowCc(false);
                      setCc([]);
                    }}
                    data-testid="button-hide-cc"
                  >
                    
                  
                
                
              
            )}

            {/* Subject Field */}
            
              
                Subject *
              
               setSubject(e.target.value)}
                data-testid="input-email-subject"
              />
            

            {/* Body Field - Rich Text Editor */}
            
              
                Message *
              

              {/* Inline AI Compose Bar */}
              {aiComposeOpen && (
                
                  
                   setAiComposePrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiComposePrompt.trim()) {
                        aiComposeMutation.mutate({ prompt: aiComposePrompt });
                      }
                      if (e.key === 'Escape') { setAiComposeOpen(false); setAiComposePrompt(""); }
                    }}
                    className="h-8 text-sm flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                    disabled={aiComposeMutation.isPending}
                  />
                   aiComposeMutation.mutate({ prompt: aiComposePrompt })}
                    disabled={aiComposeMutation.isPending || !aiComposePrompt.trim()}
                  >
                    {aiComposeMutation.isPending ?  : "Generate"}
                  
                   { setAiComposeOpen(false); setAiComposePrompt(""); }}>
                    
                  
                
              )}

              {/* Inline AI Rewrite Bar */}
              {rewritePromptOpen && (
                
                  
                   setRewriteInstructions(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && rewriteInstructions.trim() && body.trim()) {
                        aiRewriteBodyMutation.mutate({ body, instructions: rewriteInstructions });
                      }
                      if (e.key === 'Escape') { setRewritePromptOpen(false); setRewriteInstructions(""); }
                    }}
                    className="h-8 text-sm flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    autoFocus
                    disabled={aiRewriteBodyMutation.isPending}
                  />
                   aiRewriteBodyMutation.mutate({ body, instructions: rewriteInstructions })}
                    disabled={aiRewriteBodyMutation.isPending || !rewriteInstructions.trim() || !body.trim()}
                  >
                    {aiRewriteBodyMutation.isPending ?  : "Rewrite"}
                  
                   { setRewritePromptOpen(false); setRewriteInstructions(""); }}>
                    
                  
                
              )}

              

              {/* Live Grammar Suggestions Strip */}
              {grammarCheckMutation.isPending && (
                
                  
                  Checking grammar...
                
              )}
              {grammarResult && grammarResult.changes.length > 0 && (
                
                  
                     setGrammarExpanded(!grammarExpanded)}
                    >
                      
                      {grammarResult.changes.length} grammar {grammarResult.changes.length === 1 ? 'issue' : 'issues'} found
                      
                    
                    
                       {
                          setBody(grammarResult.corrected);
                          setGrammarResult(null);
                          toast({ title: "Grammar applied", description: "All corrections applied" });
                        }}
                      >
                        Apply All
                      
                       setGrammarResult(null)}>
                        
                      
                    
                  
                  {grammarExpanded && (
                    
                      {grammarResult.changes.map((change, i) => (
                        
                          
                            {change.original}
                            {'\u2192'}
                            {change.suggestion}
                            {change.reason && ({change.reason})}
                          
                           {
                              const updated = body.replace(change.original, change.suggestion);
                              setBody(updated);
                              const remaining = grammarResult.changes.filter((_, idx) => idx !== i);
                              if (remaining.length === 0) {
                                setGrammarResult(null);
                              } else {
                                setGrammarResult({ ...grammarResult, changes: remaining });
                              }
                            }}
                          >
                            Fix
                          
                        
                      ))}
                    
                  )}
                
              )}
            

            {/* Attachment Chips */}
            {attachments.length > 0 && (
              
                Attachments
                
                  {attachments.map((file, index) => (
                    
                      
                      {file.name}
                      
                        ({(file.size / 1024).toFixed(0)}KB)
                      
                       setAttachments(prev => prev.filter((_, i) => i !== index))}
                      >
                        
                      
                    
                  ))}
                
              
            )}


          

          

          {/* Footer Actions */}
          
            
               {
                  if (e.target.files) {
                    setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                  }
                  e.target.value = '';
                }}
              />
               fileInputRef.current?.click()}
                data-testid="button-attach-file"
                className="text-muted-foreground"
              >
                
                Attach
                {attachments.length > 0 && (
                  {attachments.length}
                )}
              
               setAiComposeOpen(!aiComposeOpen)}
                disabled={aiComposeMutation.isPending}
              >
                
                AI Compose
              
               setRewritePromptOpen(!rewritePromptOpen)}
                disabled={aiRewriteBodyMutation.isPending || !body.trim()}
              >
                
                Rewrite
              
              
              
              
              {/* Signature Picker */}
              {signatures.length > 0 && (
                
                  
                    
                      
                    
                    
                      No signature
                      {signatures.map((sig) => (
                        
                          {sig.name} {sig.isDefault && '(Default)'}
                        
                      ))}
                    
                  
                
              )}
              
              
            
            
              
                Cancel
              
              
                {sendEmailMutation.isPending ? (
                  <>
                    
                    Sending...
                  
                ) : (
                  <>
                    
                    Send
                  
                )}
              
            
          
        
      

      
        {/* Sidebar */}
         { setActiveFolder(f); setSelectedEmail(null); }}
          onCompose={handleOpenComposer}
          onOpenSettings={() => setSettingsOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          stats={{
            primaryUnread: primaryStats.unreadCount || 0,
            otherUnread: otherStats.unreadCount || 0,
            draftsCount: draftsData?.drafts?.length ?? 0,
            scheduledCount: scheduledData?.scheduledEmails?.length ?? 0,
          }}
          gmailConnected={gmailStatus?.connected}
          m365Connected={m365Status?.connected}
        />

        {/* Email List Panel */}
        
          {/* Search + folder header */}
          
            
              {activeFolder === 'inbox' ? 'Primary' : activeFolder}
              {(activeFolder === 'inbox' || activeFolder === 'other') && (
                 markAllReadMutation.mutate(activeFolder === 'inbox' ? 'primary' : 'other')}
                  disabled={markAllReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  Mark All Read
                
              )}
              {activeFolder === 'trash' && messages.length > 0 && (
                 emptyTrashMutation.mutate()}
                  disabled={emptyTrashMutation.isPending}
                >
                  Empty Trash
                
              )}
            
            
              
               setSearchQuery(e.target.value)}
                className="pl-9 h-8"
                data-testid="input-search-emails"
              />
            
          

          {/* Message list */}
          
            
              {/* Drafts folder — special rendering */}
              {activeFolder === 'drafts' ? (
                draftsLoading ? (
                  
                    
                  
                ) : !draftsData?.drafts?.length ? (
                  No drafts
                ) : (
                  
                    {draftsData.drafts.map((draft) => (
                       {
                          // Re-open draft in composer — TODO: full draft open
                          toast({ title: "Draft", description: draft.subject || "(No Subject)" });
                        }}
                      >
                        
                          Draft
                          
                            {formatDistanceToNow(new Date(draft.lastSavedAt), { addSuffix: true })}
                          
                        
                        {draft.subject || '(No Subject)'}
                        {draft.toEmails?.join(', ') || 'No recipients'}
                      
                    ))}
                  
                )
              ) : activeFolder === 'scheduled' ? (
                scheduledLoading ? (
                  
                    
                  
                ) : !scheduledData?.scheduledEmails?.length ? (
                  No scheduled emails
                ) : (
                  
                    {scheduledData.scheduledEmails.map((se) => (
                      
                        
                          
                            
                            {format(new Date(se.scheduledFor), 'MMM d, h:mm a')}
                          
                        
                        {se.subject}
                        {se.toEmails.join(', ')}
                      
                    ))}
                  
                )
              ) : isLoadingMessages ? (
                
                  
                    
                    Loading emails...
                  
                
              ) : messages.length === 0 ? (
                
                  
                    
                  
                  {searchQuery ? (
                    No emails match your search
                  ) : !gmailStatus?.connected && !m365Status?.connected ? (
                    
                      Connect your email to get started
                      
                        
                          {isConnecting ?  : }
                          Connect Gmail
                        
                        
                          {isConnectingM365 ?  : }
                          Connect Outlook
                        
                      
                    
                  ) : (
                    
                      No emails in this folder
                      {gmailStatus?.connected && (
                         syncGmailMutation.mutate()} disabled={syncGmailMutation.isPending}>
                          
                          Sync Gmail
                        
                      )}
                      {m365Status?.connected && (
                         syncM365Mutation.mutate()} disabled={syncM365Mutation.isPending}>
                          
                          Sync Outlook
                        
                      )}
                    
                  )}
                
              ) : (
                
                  {messages.map((email) => {
                    const emailStats = activeFolder === 'sent' ? batchStats[email.id] : null;
                    return (
                     handleEmailClick(email)}
                      data-testid={`email-item-${email.id}`}
                    >
                      
                        {/* Unread dot */}
                        
                          
                        
                        
                          
                            
                              {email.fromName || email.from}
                            
                            
                              
                                {formatDistanceToNow(new Date(email.receivedDateTime), { addSuffix: true })}
                              
                              {email.isStarred && }
                               handleToggleStar(e, email.id)}
                                data-testid={`button-star-${email.id}`}
                              >
                                {email.isStarred ? (
                                  
                                ) : (
                                  
                                )}
                              
                            
                          
                          
                            {email.subject || '(No Subject)'}
                          
                          {email.bodyPreview && (
                            
                              {email.bodyPreview}
                            
                          )}
                          
                            {email.hasAttachments && (
                              
                            )}
                            {email.accountName && (
                              
                                {email.accountName}
                              
                            )}
                            {/* Tracking badges for sent emails */}
                            {emailStats && emailStats.opens > 0 && (
                              
                                
                                {emailStats.uniqueOpens}
                              
                            )}
                            {emailStats && emailStats.clicks > 0 && (
                              
                                
                                {emailStats.uniqueClicks}
                              
                            )}
                            {activeFolder === 'sent' && emailStats && emailStats.opens === 0 && emailStats.clicks === 0 && (
                              
                                
                                Awaiting
                              
                            )}
                          
                        
                      
                    
                  );
                  })}
                
              )}
            
          
        

        {/* Email Detail Panel */}
        
          {selectedEmail ? (
            <>
              {/* Email Header */}
              
                
                  
                    {selectedEmail.subject || '(No Subject)'}
                    
                      {selectedEmail.accountName && (
                        
                          
                          {selectedEmail.accountName}
                        
                      )}
                      {selectedEmail.contactName && (
                        
                          
                          {selectedEmail.contactName}
                        
                      )}
                      {selectedEmail.opportunityId && (
                        
                          
                          Linked to Deal
                        
                      )}
                    
                  
                  
                     handleReply(selectedEmail)} data-testid="button-reply">
                      Reply
                    
                     handleReplyAll(selectedEmail)} data-testid="button-reply-all">
                      All
                    
                     handleForward(selectedEmail)} data-testid="button-forward">
                      Fwd
                    
                    {activeFolder === 'trash' ? (
                      <>
                         untrashMutation.mutate(selectedEmail.id)} disabled={untrashMutation.isPending}>
                          Restore
                        
                         permanentDeleteMutation.mutate(selectedEmail.id)} disabled={permanentDeleteMutation.isPending}>
                          Delete Forever
                        
                      
                    ) : (
                      <>
                         archiveMutation.mutate(selectedEmail.id)} disabled={archiveMutation.isPending} data-testid="button-archive">
                          Archive
                        
                         trashMutation.mutate(selectedEmail.id)} disabled={trashMutation.isPending}>
                          Delete
                        
                      
                    )}
                  
                

                {/* Sender Info */}
                
                  
                    
                      {getInitials(selectedEmail.fromName || selectedEmail.from)}
                    
                  
                  
                    {selectedEmail.fromName || selectedEmail.from}
                    {selectedEmail.from}
                    
                      
                      {format(new Date(selectedEmail.receivedDateTime), 'MMM d, yyyy · h:mm a')}
                      ·
                      {formatDistanceToNow(new Date(selectedEmail.receivedDateTime), { addSuffix: true })}
                    
                  
                

                {/* Recipients */}
                
                  
                    To:
                    {selectedEmail.to.join(', ')}
                  
                  {selectedEmail.cc.length > 0 && (
                    
                      Cc:
                      {selectedEmail.cc.join(', ')}
                    
                  )}
                
              

              {/* Scrollable content: engagement panels + email body */}
              

              {/* Email Engagement Tracking Panel */}
              {trackingStats && (
                
                  
                    
                      
                      Email Engagement Tracking
                    
                    {(trackingStats.opens > 0 || trackingStats.clicks > 0) && (
                      
                        
                        Active
                      
                    )}
                    {trackingStats.opens === 0 && trackingStats.clicks === 0 && (
                      
                        
                        No engagement yet
                      
                    )}
                  
                  
                  
                    
                      
                        
                          
                        
                        Opens
                      
                      {trackingStats.opens}
                      {trackingStats.uniqueOpens} unique
                    
                    
                      
                        
                          
                        
                        Unique Views
                      
                      {trackingStats.uniqueOpens}
                      recipients
                    
                    
                      
                        
                          
                        
                        Clicks
                      
                      {trackingStats.clicks}
                      {trackingStats.uniqueClicks} unique
                    
                    
                      
                        
                          
                        
                        CTO Rate
                      
                      
                        {trackingStats.uniqueOpens > 0 
                          ? `${Math.round((trackingStats.uniqueClicks / trackingStats.uniqueOpens) * 100)}%`
                          : '—'}
                      
                      click-to-open
                    
                  
                  
                  {(trackingStats.lastOpenedAt || trackingStats.lastClickedAt) && (
                    
                      {trackingStats.lastOpenedAt && (
                        
                          
                          Last opened
                          
                            {formatDistanceToNow(new Date(trackingStats.lastOpenedAt), { addSuffix: true })}
                          
                        
                      )}
                      {trackingStats.lastClickedAt && (
                        
                          
                          Last clicked
                          
                            {formatDistanceToNow(new Date(trackingStats.lastClickedAt), { addSuffix: true })}
                          
                        
                      )}
                    
                  )}
                
              )}

              {/* Detailed Tracking Events Panel */}
              {trackingStats && (trackingStats.opens > 0 || trackingStats.clicks > 0) && (
                
                   setTrackingEventsExpanded(!trackingEventsExpanded)}
                  >
                    
                      
                      Tracking Details
                    
                    {trackingEventsExpanded ?  : }
                  
                  {trackingEventsExpanded && (
                    
                      {trackingEventsLoading && (
                        
                          
                        
                      )}
                      {trackingEvents && (
                        <>
                          {trackingEvents.opens.length > 0 && (
                            
                              
                                
                                Opens ({trackingEvents.opens.length})
                              
                              
                                {trackingEvents.opens.map((evt) => (
                                  
                                    
                                      {evt.openedAt ? format(new Date(evt.openedAt), 'MMM d, h:mm a') : '—'}
                                    
                                    
                                      {evt.recipientEmail || unknown (group send)}
                                    
                                    
                                      {evt.deviceType === 'mobile' ?  :
                                       evt.deviceType === 'tablet' ?  :
                                       }
                                      {evt.deviceType || 'unknown'}
                                    
                                    {evt.ipAddress || '—'}
                                    {evt.location && (evt.location.city || evt.location.country) && (
                                      
                                        
                                        {[evt.location.city, evt.location.country].filter(Boolean).join(', ')}
                                      
                                    )}
                                  
                                ))}
                              
                            
                          )}
                          {trackingEvents.clicks.length > 0 && (
                            
                              
                                
                                Clicks ({trackingEvents.clicks.length})
                              
                              
                                {trackingEvents.clicks.map((evt) => (
                                  
                                    
                                      {evt.clickedAt ? format(new Date(evt.clickedAt), 'MMM d, h:mm a') : '—'}
                                    
                                    
                                      {evt.recipientEmail || unknown (group send)}
                                    
                                    
                                      {evt.deviceType === 'mobile' ?  :
                                       evt.deviceType === 'tablet' ?  :
                                       }
                                      {evt.deviceType || 'unknown'}
                                    
                                    {evt.ipAddress || '—'}
                                    {evt.linkUrl && (
                                      
                                        
                                        {evt.linkText || evt.linkUrl}
                                      
                                    )}
                                  
                                ))}
                              
                            
                          )}
                          {trackingEvents.opens.length === 0 && trackingEvents.clicks.length === 0 && (
                            No detailed events recorded yet.
                          )}
                        
                      )}
                    
                  )}
                
              )}

              {/* Email Body */}
              
                {selectedEmail.bodyHtml ? (
                  
                ) : (
                  
                    {selectedEmail.bodyPreview}
                  
                )}
              

              {/* end scrollable content */}
            
          ) : (
            
              
                
                  
                
                Select an Email
                
                  Choose an email from the list to view its content, track engagement, and manage communications.
                
                
                  
                    
                    Open tracking
                  
                  
                    
                    Click tracking
                  
                  
                    
                    AI analysis
                  
                
              
            
          )}
        
      

      {/* Settings Panel */}
       disconnectGmailMutation.mutate()}
        onDisconnectM365={() => disconnectM365Mutation.mutate()}
        isConnectingGmail={isConnecting}
        isConnectingM365={isConnectingM365}
      />

      {/* Keyboard Shortcut Help */}
      
    
  );
}