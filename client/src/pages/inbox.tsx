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
  stats: Record<string, TrackingStats>;
}

export default function InboxPage() {
  const { toast } = useToast();
  const [activeFolder, setActiveFolder] = useState<InboxFolder>('inbox');
  const [selectedEmail, setSelectedEmail] = useState<InboxMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  
  // Email composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<null | 'reply' | 'replyAll' | 'forward'>(null);
  const [replyingToEmail, setReplyingToEmail] = useState<InboxMessage | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(null);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  
  // Track the last injected signature HTML to enable proper removal when switching/editing
  const lastInjectedSignatureRef = useRef<string | null>(null);
  
  const [trackingEventsExpanded, setTrackingEventsExpanded] = useState(false);

  // Gmail connection status
  const { data: gmailStatus, isLoading: gmailStatusLoading } = useQuery<GmailConnectionStatus>({
    queryKey: ['/api/oauth/google/status'],
  });

  // M365 connection status
  const { data: m365Status, isLoading: m365StatusLoading } = useQuery<M365ConnectionStatus>({
    queryKey: ['/api/oauth/microsoft/status'],
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingM365, setIsConnectingM365] = useState(false);

  // Attachment state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

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
  const { data: statsResponse } = useQuery<{ stats: InboxStats[] }>({
    queryKey: ['/api/inbox/stats'],
    refetchInterval: 30000,
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
  const inboxCategory = activeFolder === 'inbox' ? 'primary' : activeFolder === 'other' ? 'other' : 'primary';
  const { data: messagesData, isLoading: messagesLoading, refetch } = useQuery<{
    messages: InboxMessage[];
    pagination: { limit: number; offset: number };
  }>({
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
    enabled: activeFolder === 'sent'
  });

  // Fetch starred messages
  const { data: starredData, isLoading: starredLoading } = useQuery<{ messages: InboxMessage[] }>({
    queryKey: ['/api/inbox/starred'],
    enabled: activeFolder === 'starred',
  });

  // Fetch trashed messages
  const { data: trashData, isLoading: trashLoading } = useQuery<{ messages: InboxMessage[] }>({
    queryKey: ['/api/inbox/trash-messages'],
    enabled: activeFolder === 'trash',
  });

  // Fetch archived messages
  const { data: archiveData, isLoading: archiveLoading } = useQuery<{ messages: InboxMessage[] }>({
    queryKey: ['/api/inbox/archived'],
    enabled: activeFolder === 'archive',
  });

  // Fetch drafts
  const { data: draftsData, isLoading: draftsLoading } = useQuery<{ drafts: Array<{
    id: string; subject: string | null; toEmails: string[] | null; bodyPlain: string | null;
    composerMode: string; lastSavedAt: string; createdAt: string;
  }> }>({
    queryKey: ['/api/inbox/drafts'],
    enabled: activeFolder === 'drafts',
  });

  // Fetch scheduled emails
  const { data: scheduledData, isLoading: scheduledLoading } = useQuery<{ scheduledEmails: Array<{
    id: string; subject: string; toEmails: string[]; scheduledFor: string; status: string;
  }> }>({
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
  const { data: trackingEvents, isLoading: trackingEventsLoading } = useQuery<{ opens: TrackingEvent[]; clicks: TrackingEvent[] }>({
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
  const { data: batchTrackingData } = useQuery<BatchTrackingStats>({
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
  const prevUnreadRef = useRef<number | null>(null);
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
  const grammarDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedBodyRef = useRef<string>("");
  const [grammarResult, setGrammarResult] = useState<{
    corrected: string;
    changes: Array<{ original: string; suggestion: string; reason: string }>;
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
    onSuccess: (data: { corrected: string; changes: Array<{ original: string; suggestion: string; reason: string }> }) => {
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
    const plainText = body.replace(/<[^>]*>/g, '').trim();
    if (plainText.length < 30 || !composerOpen) return;
    // Don't re-check if body hasn't meaningfully changed
    if (body === lastCheckedBodyRef.current) return;

    grammarDebounceRef.current = setTimeout(() => {
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
  const QUOTE_MARKER = '<div class="gmail_quote"';
  const FORWARD_MARKER = '<div style="margin:0;padding:0;">';

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

        // For replies/forwards: inject signature BEFORE the quoted thread
        const quoteIdx = cleanBody.indexOf(QUOTE_MARKER);
        const fwdIdx = cleanBody.indexOf(FORWARD_MARKER);
        const threadIdx = quoteIdx >= 0 ? quoteIdx : fwdIdx;

        if (threadIdx > 0 && (composerMode === 'reply' || composerMode === 'replyAll' || composerMode === 'forward')) {
          const beforeThread = cleanBody.substring(0, threadIdx);
          const threadAndAfter = cleanBody.substring(threadIdx);
          cleanBody = `${beforeThread}<br><br>${newSignatureHtml}<br>${threadAndAfter}`;
        } else {
          // New compose — append at end
          cleanBody = `${cleanBody}<br><br>${newSignatureHtml}`;
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
      '<br><br>',
      '<div class="gmail_quote" style="margin:0 0 0 0;">',
      `  <div style="font-size:12px;color:#5f6368;padding:8px 0;">On ${dateStr}, ${senderDisplay} wrote:</div>`,
      '  <blockquote style="margin:0 0 0 0;padding:0 0 0 12px;border-left:2px solid #ccc;color:#555;">',
      `    ${email.bodyHtml || `<p>${email.bodyPreview || ''}</p>`}`,
      '  </blockquote>',
      '</div>',
    ].join('\n');
  }

  function buildForwardedBlock(email: InboxMessage): string {
    const dateStr = new Date(email.receivedDateTime).toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    return [
      '<br><br>',
      '<div style="margin:0;padding:0;">',
      '  <div style="font-size:12px;color:#5f6368;padding:4px 0;border-top:1px solid #ccc;margin-top:4px;">',
      '    <strong>---------- Forwarded message ----------</strong><br>',
      `    <strong>From:</strong> ${email.fromName || email.from} &lt;${email.from}&gt;<br>`,
      `    <strong>Date:</strong> ${dateStr}<br>`,
      `    <strong>Subject:</strong> ${email.subject}<br>`,
      `    <strong>To:</strong> ${email.to.join(', ')}<br>`,
      email.cc.length > 0 ? `    <strong>Cc:</strong> ${email.cc.join(', ')}<br>` : '',
      '  </div>',
      '  <br>',
      `  ${email.bodyHtml || `<p>${email.bodyPreview || ''}</p>`}`,
      '</div>',
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
        finalBody = `${finalBody}<br><br>${signature.signatureHtml}`;
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
          document.querySelector<HTMLInputElement>('[data-testid="input-search-emails"]')?.focus();
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
    <PageShell
      title="Revenue Inbox"
      description="Enterprise email communication hub — send, receive, and track engagement"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Revenue & Pipeline" },
        { label: "Revenue Inbox" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative"
                  onClick={() => {
                    setShowNotificationBell(false);
                    setActiveFolder('inbox');
                    refetch();
                  }}
                  data-testid="button-notifications"
                >
                  {showNotificationBell || totalUnread > 0 ? (
                    <>
                      <BellDot className="h-4 w-4 text-primary" />
                      {totalUnread > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                          {totalUnread > 99 ? '99+' : totalUnread}
                        </span>
                      )}
                    </>
                  ) : (
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {totalUnread > 0 ? `${totalUnread} unread email${totalUnread !== 1 ? 's' : ''}` : 'No new emails'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Sync buttons */}
          {gmailStatus?.connected && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => syncGmailMutation.mutate()}
                    disabled={syncGmailMutation.isPending}
                    data-testid="button-sync-gmail"
                  >
                    <RefreshCw className={cn("h-4 w-4", syncGmailMutation.isPending && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sync Gmail</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {m365Status?.connected && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => syncM365Mutation.mutate()}
                    disabled={syncM365Mutation.isPending}
                    data-testid="button-sync-m365"
                  >
                    <RefreshCw className={cn("h-4 w-4", syncM365Mutation.isPending && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sync Outlook</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-inbox"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      }
    >
      {/* Email Composer Dialog */}
      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
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
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm mb-1">No Mailbox Connected</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Connect your email account to send emails directly from the inbox.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleConnectGmail}
                          disabled={isConnecting}
                          data-testid="button-connect-gmail-composer"
                        >
                          {isConnecting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4 mr-2" />
                          )}
                          Connect Gmail
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleConnectM365}
                          disabled={isConnectingM365}
                          data-testid="button-connect-m365-composer"
                        >
                          {isConnectingM365 ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4 mr-2" />
                          )}
                          Connect Outlook
                        </Button>
                      </div>
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
              <ContactAutocomplete
                value={to}
                onChange={setTo}
                placeholder="recipient@example.com"
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
                      setCc([]);
                    }}
                    data-testid="button-hide-cc"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ContactAutocomplete
                  value={cc}
                  onChange={setCc}
                  placeholder="cc@example.com"
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
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <Label className="text-sm font-medium flex-shrink-0">
                Message <span className="text-destructive">*</span>
              </Label>

              {/* Inline AI Compose Bar */}
              {aiComposeOpen && (
                <div className="flex items-center gap-2 p-2 rounded-md border border-blue-200 bg-blue-50/50 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <Input
                    placeholder="Describe the email you want to write..."
                    value={aiComposePrompt}
                    onChange={(e) => setAiComposePrompt(e.target.value)}
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
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => aiComposeMutation.mutate({ prompt: aiComposePrompt })}
                    disabled={aiComposeMutation.isPending || !aiComposePrompt.trim()}
                  >
                    {aiComposeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => { setAiComposeOpen(false); setAiComposePrompt(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Inline AI Rewrite Bar */}
              {rewritePromptOpen && (
                <div className="flex items-center gap-2 p-2 rounded-md border border-violet-200 bg-violet-50/50 flex-shrink-0">
                  <RotateCcw className="h-4 w-4 text-violet-500 flex-shrink-0" />
                  <Input
                    placeholder="e.g., Make it more formal, shorten it, add urgency..."
                    value={rewriteInstructions}
                    onChange={(e) => setRewriteInstructions(e.target.value)}
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
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => aiRewriteBodyMutation.mutate({ body, instructions: rewriteInstructions })}
                    disabled={aiRewriteBodyMutation.isPending || !rewriteInstructions.trim() || !body.trim()}
                  >
                    {aiRewriteBodyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Rewrite"}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => { setRewritePromptOpen(false); setRewriteInstructions(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <RichTextEditor
                content={body}
                onChange={setBody}
                placeholder="Write your message here..."
                className="flex-1 min-h-[300px]"
              />

              {/* Live Grammar Suggestions Strip */}
              {grammarCheckMutation.isPending && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground flex-shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Checking grammar...</span>
                </div>
              )}
              {grammarResult && grammarResult.changes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/50 flex-shrink-0">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-xs font-medium text-amber-700 hover:text-amber-900"
                      onClick={() => setGrammarExpanded(!grammarExpanded)}
                    >
                      <AlertCircle className="h-3 w-3" />
                      <span>{grammarResult.changes.length} grammar {grammarResult.changes.length === 1 ? 'issue' : 'issues'} found</span>
                      <ChevronDown className={cn("h-3 w-3 transition-transform", grammarExpanded && "rotate-180")} />
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                        onClick={() => {
                          setBody(grammarResult.corrected);
                          setGrammarResult(null);
                          toast({ title: "Grammar applied", description: "All corrections applied" });
                        }}
                      >
                        Apply All
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setGrammarResult(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {grammarExpanded && (
                    <div className="px-3 pb-2 space-y-1.5 max-h-32 overflow-y-auto border-t border-amber-200/50">
                      {grammarResult.changes.map((change, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 text-xs py-1">
                          <div className="flex-1 min-w-0">
                            <span className="line-through text-red-500">{change.original}</span>
                            <span className="text-muted-foreground mx-1">{'\u2192'}</span>
                            <span className="text-emerald-600 font-medium">{change.suggestion}</span>
                            {change.reason && <span className="text-muted-foreground ml-1">({change.reason})</span>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-emerald-600 hover:text-emerald-700 flex-shrink-0"
                            onClick={() => {
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
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Attachment Chips */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Attachments</Label>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, index) => (
                    <Badge key={`${file.name}-${index}`} variant="secondary" className="gap-1.5 pr-1">
                      <Paperclip className="h-3 w-3" />
                      <span className="text-xs max-w-[150px] truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(0)}KB)
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}


          </div>

          <Separator />

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 bg-muted/30 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                  }
                  e.target.value = '';
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-attach-file"
                className="text-muted-foreground"
              >
                <Paperclip className="h-4 w-4 mr-2" />
                Attach
                {attachments.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-xs h-5 px-1.5">{attachments.length}</Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiComposeOpen(!aiComposeOpen)}
                disabled={aiComposeMutation.isPending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Compose
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRewritePromptOpen(!rewritePromptOpen)}
                disabled={aiRewriteBodyMutation.isPending || !body.trim()}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Rewrite
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

      <div className="flex h-[calc(100vh-8rem)] border rounded-lg overflow-hidden bg-background">
        {/* Sidebar */}
        <InboxSidebar
          activeFolder={activeFolder}
          onFolderChange={(f) => { setActiveFolder(f); setSelectedEmail(null); }}
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
        <div className="w-[340px] border-r flex flex-col min-w-0">
          {/* Search + folder header */}
          <div className="p-3 flex-shrink-0 space-y-2 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold capitalize">{activeFolder === 'inbox' ? 'Primary' : activeFolder}</h3>
              {(activeFolder === 'inbox' || activeFolder === 'other') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => markAllReadMutation.mutate(activeFolder === 'inbox' ? 'primary' : 'other')}
                  disabled={markAllReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  Mark All Read
                </Button>
              )}
              {activeFolder === 'trash' && messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive"
                  onClick={() => emptyTrashMutation.mutate()}
                  disabled={emptyTrashMutation.isPending}
                >
                  Empty Trash
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8"
                data-testid="input-search-emails"
              />
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              {/* Drafts folder — special rendering */}
              {activeFolder === 'drafts' ? (
                draftsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : !draftsData?.drafts?.length ? (
                  <div className="text-center py-12 px-4 text-muted-foreground text-sm">No drafts</div>
                ) : (
                  <div className="divide-y">
                    {draftsData.drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          // Re-open draft in composer — TODO: full draft open
                          toast({ title: "Draft", description: draft.subject || "(No Subject)" });
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="destructive" className="text-[10px] h-[18px] px-1.5">Draft</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(draft.lastSavedAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate">{draft.subject || '(No Subject)'}</p>
                        <p className="text-xs text-muted-foreground truncate">{draft.toEmails?.join(', ') || 'No recipients'}</p>
                      </div>
                    ))}
                  </div>
                )
              ) : activeFolder === 'scheduled' ? (
                scheduledLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : !scheduledData?.scheduledEmails?.length ? (
                  <div className="text-center py-12 px-4 text-muted-foreground text-sm">No scheduled emails</div>
                ) : (
                  <div className="divide-y">
                    {scheduledData.scheduledEmails.map((se) => (
                      <div
                        key={se.id}
                        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5">
                            <Clock className="h-2.5 w-2.5 mr-0.5" />
                            {format(new Date(se.scheduledFor), 'MMM d, h:mm a')}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">{se.subject}</p>
                        <p className="text-xs text-muted-foreground truncate">{se.toEmails.join(', ')}</p>
                      </div>
                    ))}
                  </div>
                )
              ) : isLoadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="text-muted-foreground text-sm">Loading emails...</div>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  {searchQuery ? (
                    <p className="text-muted-foreground text-sm">No emails match your search</p>
                  ) : !gmailStatus?.connected && !m365Status?.connected ? (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm">Connect your email to get started</p>
                      <div className="flex flex-col gap-2 items-center">
                        <Button size="sm" onClick={handleConnectGmail} disabled={isConnecting} data-testid="button-connect-gmail-empty">
                          {isConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                          Connect Gmail
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleConnectM365} disabled={isConnectingM365} data-testid="button-connect-m365-empty">
                          {isConnectingM365 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                          Connect Outlook
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm">No emails in this folder</p>
                      {gmailStatus?.connected && (
                        <Button size="sm" onClick={() => syncGmailMutation.mutate()} disabled={syncGmailMutation.isPending}>
                          <RefreshCw className={cn("h-4 w-4 mr-2", syncGmailMutation.isPending && "animate-spin")} />
                          Sync Gmail
                        </Button>
                      )}
                      {m365Status?.connected && (
                        <Button size="sm" variant="outline" onClick={() => syncM365Mutation.mutate()} disabled={syncM365Mutation.isPending}>
                          <RefreshCw className={cn("h-4 w-4 mr-2", syncM365Mutation.isPending && "animate-spin")} />
                          Sync Outlook
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {messages.map((email) => {
                    const emailStats = activeFolder === 'sent' ? batchStats[email.id] : null;
                    return (
                    <div
                      key={email.id}
                      className={cn(
                        "p-3 cursor-pointer transition-all hover:bg-muted/50 group",
                        selectedEmail?.id === email.id && "bg-primary/5 border-l-2 border-l-primary",
                        !email.isRead && selectedEmail?.id !== email.id && "bg-muted/20"
                      )}
                      onClick={() => handleEmailClick(email)}
                      data-testid={`email-item-${email.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Unread dot */}
                        <div className="flex flex-col items-center gap-1 pt-1.5">
                          <div className={cn("h-2 w-2 rounded-full flex-shrink-0", !email.isRead ? "bg-blue-500" : "bg-transparent")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <h4 className={cn("text-sm truncate", !email.isRead && "font-semibold")}>
                              {email.fromName || email.from}
                            </h4>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(email.receivedDateTime), { addSuffix: true })}
                              </span>
                              {email.isStarred && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => handleToggleStar(e, email.id)}
                                data-testid={`button-star-${email.id}`}
                              >
                                {email.isStarred ? (
                                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                ) : (
                                  <StarOff className="h-3 w-3 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <p className={cn("text-sm truncate", !email.isRead ? "font-medium text-foreground" : "text-muted-foreground")}>
                            {email.subject || '(No Subject)'}
                          </p>
                          {email.bodyPreview && (
                            <p className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5">
                              {email.bodyPreview}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {email.hasAttachments && (
                              <Paperclip className="h-3 w-3 text-muted-foreground" />
                            )}
                            {email.accountName && (
                              <Badge variant="secondary" className="text-[10px] h-[16px] px-1">
                                {email.accountName}
                              </Badge>
                            )}
                            {/* Tracking badges for sent emails */}
                            {emailStats && emailStats.opens > 0 && (
                              <Badge className="text-[10px] h-[16px] px-1 bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                <Eye className="h-2.5 w-2.5 mr-0.5" />
                                {emailStats.uniqueOpens}
                              </Badge>
                            )}
                            {emailStats && emailStats.clicks > 0 && (
                              <Badge className="text-[10px] h-[16px] px-1 bg-violet-500/10 text-violet-600 border-violet-200">
                                <MousePointerClick className="h-2.5 w-2.5 mr-0.5" />
                                {emailStats.uniqueClicks}
                              </Badge>
                            )}
                            {activeFolder === 'sent' && emailStats && emailStats.opens === 0 && emailStats.clicks === 0 && (
                              <Badge variant="outline" className="text-[10px] h-[16px] px-1 text-muted-foreground">
                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                Awaiting
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Email Detail Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedEmail ? (
            <>
              {/* Email Header */}
              <div className="p-6 flex-shrink-0 border-b">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold mb-2 truncate">{selectedEmail.subject || '(No Subject)'}</h2>
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
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="default" size="sm" onClick={() => handleReply(selectedEmail)} data-testid="button-reply">
                      <Reply className="h-4 w-4 mr-1.5" />Reply
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleReplyAll(selectedEmail)} data-testid="button-reply-all">
                      <Reply className="h-4 w-4 mr-1.5" />All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleForward(selectedEmail)} data-testid="button-forward">
                      <Forward className="h-4 w-4 mr-1.5" />Fwd
                    </Button>
                    {activeFolder === 'trash' ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => untrashMutation.mutate(selectedEmail.id)} disabled={untrashMutation.isPending}>
                          <RotateCcw className="h-4 w-4 mr-1.5" />Restore
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => permanentDeleteMutation.mutate(selectedEmail.id)} disabled={permanentDeleteMutation.isPending}>
                          <Trash2 className="h-4 w-4 mr-1.5" />Delete Forever
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => archiveMutation.mutate(selectedEmail.id)} disabled={archiveMutation.isPending} data-testid="button-archive">
                          <Archive className="h-4 w-4 mr-1.5" />Archive
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => trashMutation.mutate(selectedEmail.id)} disabled={trashMutation.isPending}>
                          <Trash2 className="h-4 w-4 mr-1.5" />Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Sender Info */}
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="h-10 w-10 shadow-sm ring-2 ring-background">
                    <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                      {getInitials(selectedEmail.fromName || selectedEmail.from)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{selectedEmail.fromName || selectedEmail.from}</div>
                    <div className="text-xs text-muted-foreground font-mono">{selectedEmail.from}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {format(new Date(selectedEmail.receivedDateTime), 'MMM d, yyyy · h:mm a')}
                      <span className="text-muted-foreground/50">·</span>
                      <span>{formatDistanceToNow(new Date(selectedEmail.receivedDateTime), { addSuffix: true })}</span>
                    </div>
                  </div>
                </div>

                {/* Recipients */}
                <div className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-10 text-xs">To:</span>
                    <span className="font-mono text-xs">{selectedEmail.to.join(', ')}</span>
                  </div>
                  {selectedEmail.cc.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-10 text-xs">Cc:</span>
                      <span className="font-mono text-xs">{selectedEmail.cc.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scrollable content: engagement panels + email body */}
              <div className="flex-1 min-h-0 overflow-y-auto">

              {/* Email Engagement Tracking Panel */}
              {trackingStats && (
                <div className="px-6 py-4 bg-gradient-to-r from-muted/40 to-muted/20 border-b">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Email Engagement Tracking
                    </h3>
                    {(trackingStats.opens > 0 || trackingStats.clicks > 0) && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px]">
                        <Activity className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                    {trackingStats.opens === 0 && trackingStats.clicks === 0 && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        No engagement yet
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
                          <MailOpen className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">Opens</span>
                      </div>
                      <div className="text-xl font-bold">{trackingStats.opens}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{trackingStats.uniqueOpens} unique</div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-7 w-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">Unique Views</span>
                      </div>
                      <div className="text-xl font-bold">{trackingStats.uniqueOpens}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">recipients</div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center">
                          <MousePointerClick className="h-3.5 w-3.5 text-violet-600" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">Clicks</span>
                      </div>
                      <div className="text-xl font-bold">{trackingStats.clicks}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{trackingStats.uniqueClicks} unique</div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center">
                          <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">CTO Rate</span>
                      </div>
                      <div className="text-xl font-bold">
                        {trackingStats.uniqueOpens > 0 
                          ? `${Math.round((trackingStats.uniqueClicks / trackingStats.uniqueOpens) * 100)}%`
                          : '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">click-to-open</div>
                    </div>
                  </div>
                  
                  {(trackingStats.lastOpenedAt || trackingStats.lastClickedAt) && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                      {trackingStats.lastOpenedAt && (
                        <div className="flex items-center gap-2 text-xs">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="text-muted-foreground">Last opened</span>
                          <span className="font-medium">
                            {formatDistanceToNow(new Date(trackingStats.lastOpenedAt), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                      {trackingStats.lastClickedAt && (
                        <div className="flex items-center gap-2 text-xs">
                          <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                          <span className="text-muted-foreground">Last clicked</span>
                          <span className="font-medium">
                            {formatDistanceToNow(new Date(trackingStats.lastClickedAt), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Detailed Tracking Events Panel */}
              {trackingStats && (trackingStats.opens > 0 || trackingStats.clicks > 0) && (
                <div className="border-b">
                  <button
                    type="button"
                    className="w-full px-6 py-2.5 flex items-center justify-between text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                    onClick={() => setTrackingEventsExpanded(!trackingEventsExpanded)}
                  >
                    <span className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5" />
                      Tracking Details
                    </span>
                    {trackingEventsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  {trackingEventsExpanded && (
                    <div className="px-6 pb-4 space-y-3">
                      {trackingEventsLoading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {trackingEvents && (
                        <>
                          {trackingEvents.opens.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                                <MailOpen className="h-3 w-3 text-emerald-500" />
                                Opens ({trackingEvents.opens.length})
                              </h4>
                              <div className="space-y-1.5">
                                {trackingEvents.opens.map((evt) => (
                                  <div key={evt.id} className="flex items-center gap-3 text-[11px] py-1.5 px-2.5 rounded-md bg-muted/30">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">
                                      {evt.openedAt ? format(new Date(evt.openedAt), 'MMM d, h:mm a') : '—'}
                                    </span>
                                    <span className="font-medium text-foreground truncate max-w-[180px]" title={evt.recipientEmail || ''}>
                                      {evt.recipientEmail || <span className="text-muted-foreground italic">unknown (group send)</span>}
                                    </span>
                                    <span className="flex items-center gap-1 w-16 flex-shrink-0">
                                      {evt.deviceType === 'mobile' ? <Smartphone className="h-3 w-3" /> :
                                       evt.deviceType === 'tablet' ? <Smartphone className="h-3 w-3" /> :
                                       <Monitor className="h-3 w-3" />}
                                      <span className="capitalize">{evt.deviceType || 'unknown'}</span>
                                    </span>
                                    <span className="font-mono text-muted-foreground flex-shrink-0">{evt.ipAddress || '—'}</span>
                                    {evt.location && (evt.location.city || evt.location.country) && (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Globe className="h-3 w-3" />
                                        {[evt.location.city, evt.location.country].filter(Boolean).join(', ')}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {trackingEvents.clicks.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                                <MousePointerClick className="h-3 w-3 text-violet-500" />
                                Clicks ({trackingEvents.clicks.length})
                              </h4>
                              <div className="space-y-1.5">
                                {trackingEvents.clicks.map((evt) => (
                                  <div key={evt.id} className="flex items-center gap-3 text-[11px] py-1.5 px-2.5 rounded-md bg-muted/30">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">
                                      {evt.clickedAt ? format(new Date(evt.clickedAt), 'MMM d, h:mm a') : '—'}
                                    </span>
                                    <span className="font-medium text-foreground truncate max-w-[180px]" title={evt.recipientEmail || ''}>
                                      {evt.recipientEmail || <span className="text-muted-foreground italic">unknown (group send)</span>}
                                    </span>
                                    <span className="flex items-center gap-1 w-16 flex-shrink-0">
                                      {evt.deviceType === 'mobile' ? <Smartphone className="h-3 w-3" /> :
                                       evt.deviceType === 'tablet' ? <Smartphone className="h-3 w-3" /> :
                                       <Monitor className="h-3 w-3" />}
                                      <span className="capitalize">{evt.deviceType || 'unknown'}</span>
                                    </span>
                                    <span className="font-mono text-muted-foreground flex-shrink-0">{evt.ipAddress || '—'}</span>
                                    {evt.linkUrl && (
                                      <span className="truncate max-w-[200px] text-blue-500 flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                        {evt.linkText || evt.linkUrl}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {trackingEvents.opens.length === 0 && trackingEvents.clicks.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2">No detailed events recorded yet.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Email Body */}
              <div className="p-6">
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

              </div>{/* end scrollable content */}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/5 shadow-inner">
                  <Mail className="h-10 w-10 text-primary/60" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Select an Email</h3>
                <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                  Choose an email from the list to view its content, track engagement, and manage communications.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
                    <MailOpen className="h-3 w-3 text-emerald-500" />
                    Open tracking
                  </div>
                  <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
                    <MousePointerClick className="h-3 w-3 text-violet-500" />
                    Click tracking
                  </div>
                  <div className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    AI analysis
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      <InboxSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        gmailConnected={gmailStatus?.connected}
        m365Connected={m365Status?.connected}
        onConnectGmail={handleConnectGmail}
        onConnectM365={handleConnectM365}
        onDisconnectGmail={() => disconnectGmailMutation.mutate()}
        onDisconnectM365={() => disconnectM365Mutation.mutate()}
        isConnectingGmail={isConnecting}
        isConnectingM365={isConnectingM365}
      />

      {/* Keyboard Shortcut Help */}
      <KeyboardShortcutHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </PageShell>
  );
}
