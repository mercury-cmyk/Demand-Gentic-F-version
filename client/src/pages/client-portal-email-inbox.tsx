/**
 * Client Portal Email Inbox Page
 *
 * Full-featured shared inbox for client portal users — mirrors the admin inbox UI.
 * Supports connecting Google, Microsoft 365, and Custom SMTP accounts.
 * All data is scoped to the client's account (clientAccountId).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  Inbox as InboxIcon,
  Send,
  Archive,
  Star,
  StarOff,
  RefreshCw,
  Reply,
  Forward,
  Trash2,
  Paperclip,
  Search,
  ChevronRight,
  Loader2,
  X,
  Plus,
  Link2,
  Unplug,
  CheckCircle,
  Settings,
  PenSquare,
  AlertCircle,
  MailOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ==================== Types ====================

interface InboxMessage {
  id: string;
  conversationId: string | null;
  subject: string | null;
  bodyPreview: string | null;
  bodyHtml: string | null;
  from: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedDateTime: string | null;
  hasAttachments: boolean;
  importance: string;
  isRead: boolean;
  isStarred: boolean;
  category: string;
  direction: string;
}

interface InboxStats {
  category: string;
  unreadCount: number;
  totalCount: number;
}

interface MailboxAccount {
  id: string;
  provider: string;
  status: string;
  mailboxEmail: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

type ProviderStatus = {
  connected: boolean;
  mailboxEmail?: string | null;
  displayName?: string | null;
  connectedAt?: string | null;
};

type EmailStatus = Record<string, ProviderStatus>;

type InboxFolder =
  | "inbox"
  | "other"
  | "sent"
  | "starred"
  | "archive"
  | "trash";

// ==================== API Helper ====================

function clientApi(method: string, path: string, body?: any) {
  const token = localStorage.getItem("clientPortalToken");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(path, {
    method,
    headers,
    credentials: "include",
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((res) => {
    if (res.status === 401) {
      localStorage.removeItem("clientPortalToken");
      window.location.href = "/client-portal/login";
      throw new Error("Session expired");
    }
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  });
}

// ==================== Sidebar ====================

function InboxSidebar({
  activeFolder,
  onFolderChange,
  primaryUnread,
  otherUnread,
  collapsed,
}: {
  activeFolder: InboxFolder;
  onFolderChange: (f: InboxFolder) => void;
  primaryUnread: number;
  otherUnread: number;
  collapsed: boolean;
}) {
  const folders: { id: InboxFolder; label: string; icon: any; badge?: number }[] = [
    { id: "inbox", label: "Primary", icon: InboxIcon, badge: primaryUnread },
    { id: "other", label: "Other", icon: Mail, badge: otherUnread },
    { id: "sent", label: "Sent", icon: Send },
    { id: "starred", label: "Starred", icon: Star },
    { id: "archive", label: "Archive", icon: Archive },
    { id: "trash", label: "Trash", icon: Trash2 },
  ];

  return (
    <div className={cn("border-r bg-muted/30 flex flex-col py-2", collapsed ? "w-14" : "w-48")}>
      {folders.map((f) => {
        const Icon = f.icon;
        const isActive = activeFolder === f.id;
        return (
          <TooltipProvider key={f.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors mx-1 rounded-md",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={() => onFolderChange(f.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{f.label}</span>
                      {f.badge ? (
                        <Badge variant="secondary" className="h-5 min-w-[20px] text-[10px] px-1.5">
                          {f.badge}
                        </Badge>
                      ) : null}
                    </>
                  )}
                </button>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right">
                  {f.label}
                  {f.badge ? ` (${f.badge})` : ""}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// ==================== Main Component ====================

export default function ClientPortalEmailInbox() {
  const { toast } = useToast();
  const [activeFolder, setActiveFolder] = useState<InboxFolder>("inbox");
  const [selectedEmail, setSelectedEmail] = useState<InboxMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeView, setActiveView] = useState<"inbox" | "settings">("inbox");
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<null | "reply" | "forward">(null);
  const [replyingToEmail, setReplyingToEmail] = useState<InboxMessage | null>(null);
  const [compTo, setCompTo] = useState("");
  const [compCc, setCompCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [compSubject, setCompSubject] = useState("");
  const [compBody, setCompBody] = useState("");

  // SMTP form state
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpTls, setSmtpTls] = useState(true);
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpDisplayName, setSmtpDisplayName] = useState("");

  // ==================== Connection Status ====================

  const { data: emailStatus, isLoading: statusLoading } = useQuery<EmailStatus>({
    queryKey: ["/api/client-portal/email/status"],
    staleTime: 30_000,
  });

  const googleStatus = emailStatus?.google;
  const microsoftStatus = emailStatus?.o365;
  const smtpStatus = emailStatus?.smtp;
  const hasAnyConnection =
    googleStatus?.connected || microsoftStatus?.connected || smtpStatus?.connected;

  // ==================== Inbox Stats ====================

  const { data: statsResponse } = useQuery<{ stats: InboxStats[] }>({
    queryKey: ["/api/client-portal/inbox/stats"],
    queryFn: () => clientApi("GET", "/api/client-portal/inbox/stats"),
    refetchInterval: 30000,
    enabled: hasAnyConnection === true,
  });

  const stats = statsResponse?.stats || [];
  const primaryStats = stats.find((s) => s.category === "primary") || {
    unreadCount: 0,
    totalCount: 0,
  };
  const otherStats = stats.find((s) => s.category === "other") || {
    unreadCount: 0,
    totalCount: 0,
  };

  // ==================== Mailbox Accounts ====================

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/client-portal/inbox/mailbox-accounts"],
    queryFn: () => clientApi("GET", "/api/client-portal/inbox/mailbox-accounts"),
  });

  // ==================== Messages ====================

  const inboxCategory =
    activeFolder === "inbox"
      ? "primary"
      : activeFolder === "other"
      ? "other"
      : "primary";

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{
    messages: InboxMessage[];
  }>({
    queryKey: ["/api/client-portal/inbox/messages", inboxCategory, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams({
        category: inboxCategory,
        limit: "50",
        offset: "0",
        ...(searchQuery && { searchQuery }),
      });
      return clientApi("GET", `/api/client-portal/inbox/messages?${params}`);
    },
    enabled:
      hasAnyConnection === true &&
      (activeFolder === "inbox" || activeFolder === "other"),
  });

  const { data: sentData, isLoading: sentLoading } = useQuery<{
    messages: InboxMessage[];
  }>({
    queryKey: ["/api/client-portal/inbox/sent", searchQuery],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: "50",
        offset: "0",
        ...(searchQuery && { searchQuery }),
      });
      return clientApi("GET", `/api/client-portal/inbox/sent?${params}`);
    },
    enabled: hasAnyConnection === true && activeFolder === "sent",
  });

  const { data: starredData, isLoading: starredLoading } = useQuery<{
    messages: InboxMessage[];
  }>({
    queryKey: ["/api/client-portal/inbox/starred"],
    queryFn: () => clientApi("GET", "/api/client-portal/inbox/starred"),
    enabled: hasAnyConnection === true && activeFolder === "starred",
  });

  const { data: archiveData, isLoading: archiveLoading } = useQuery<{
    messages: InboxMessage[];
  }>({
    queryKey: ["/api/client-portal/inbox/archived"],
    queryFn: () => clientApi("GET", "/api/client-portal/inbox/archived"),
    enabled: hasAnyConnection === true && activeFolder === "archive",
  });

  const { data: trashData, isLoading: trashLoading } = useQuery<{
    messages: InboxMessage[];
  }>({
    queryKey: ["/api/client-portal/inbox/trash-messages"],
    queryFn: () => clientApi("GET", "/api/client-portal/inbox/trash-messages"),
    enabled: hasAnyConnection === true && activeFolder === "trash",
  });

  const messages = (() => {
    switch (activeFolder) {
      case "inbox":
      case "other":
        return messagesData?.messages || [];
      case "sent":
        return sentData?.messages || [];
      case "starred":
        return starredData?.messages || [];
      case "archive":
        return archiveData?.messages || [];
      case "trash":
        return trashData?.messages || [];
      default:
        return [];
    }
  })();

  const isLoadingMessages = (() => {
    switch (activeFolder) {
      case "inbox":
      case "other":
        return messagesLoading;
      case "sent":
        return sentLoading;
      case "starred":
        return starredLoading;
      case "archive":
        return archiveLoading;
      case "trash":
        return trashLoading;
      default:
        return false;
    }
  })();

  // ==================== Mutations ====================

  const syncMutation = useMutation({
    mutationFn: () => clientApi("POST", "/api/client-portal/inbox/sync"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      toast({
        title: "Sync Complete",
        description: `Synced ${data.synced} new email${data.synced !== 1 ? "s" : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Sync Failed", variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: ({ messageId, isRead }: { messageId: string; isRead: boolean }) =>
      clientApi("POST", "/api/client-portal/inbox/mark-read", { messageId, isRead }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: (messageId: string) =>
      clientApi("POST", "/api/client-portal/inbox/toggle-star", { messageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (messageId: string) =>
      clientApi("POST", "/api/client-portal/inbox/archive", { messageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      setSelectedEmail(null);
      toast({ title: "Archived" });
    },
  });

  const trashMutation = useMutation({
    mutationFn: (messageId: string) =>
      clientApi("POST", "/api/client-portal/inbox/trash", { messageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      setSelectedEmail(null);
      toast({ title: "Moved to Trash" });
    },
  });

  const untrashMutation = useMutation({
    mutationFn: (messageId: string) =>
      clientApi("POST", "/api/client-portal/inbox/untrash", { messageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      setSelectedEmail(null);
      toast({ title: "Restored" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      clientApi("DELETE", "/api/client-portal/inbox/delete", { messageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      setSelectedEmail(null);
      toast({ title: "Permanently deleted" });
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => clientApi("POST", "/api/client-portal/inbox/empty-trash"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      setSelectedEmail(null);
      toast({ title: "Trash emptied" });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: (category: "primary" | "other") =>
      clientApi("POST", "/api/client-portal/inbox/mark-all-read", { category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
      toast({ title: "All marked as read" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: (data: {
      to: string[];
      cc?: string[];
      subject: string;
      bodyHtml: string;
    }) => clientApi("POST", "/api/client-portal/inbox/send", data),
    onSuccess: () => {
      toast({ title: "Email sent" });
      handleCloseComposer();
      queryClient.invalidateQueries({ queryKey: ["/api/client-portal/inbox"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Send failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ==================== OAuth Handlers ====================

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-success") {
        setConnectingProvider(null);
        queryClient.invalidateQueries({
          queryKey: ["/api/client-portal/email/status"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/client-portal/inbox/mailbox-accounts"],
        });
        toast({
          title: "Email Connected",
          description: `${
            event.data.provider === "google" ? "Google" : "Microsoft"
          } account connected successfully.`,
        });
      } else if (event.data?.type === "oauth-error") {
        setConnectingProvider(null);
        toast({
          title: "Connection Failed",
          description: event.data.error || "OAuth flow failed.",
          variant: "destructive",
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast]);

  const handleConnect = useCallback(
    async (provider: "google" | "microsoft") => {
      setConnectingProvider(provider);
      try {
        const res = await apiRequest(
          "GET",
          `/api/client-portal/email/${provider}/authorize`
        );
        const data = await res.json();
        if (!data.authUrl) throw new Error("No auth URL");

        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          data.authUrl,
          `${provider}-oauth`,
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
        );

        if (!popup) {
          toast({
            title: "Popup Blocked",
            description: "Please allow popups and try again.",
            variant: "destructive",
          });
          setConnectingProvider(null);
          return;
        }

        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            setConnectingProvider(null);
          }
        }, 1000);
      } catch {
        setConnectingProvider(null);
        toast({
          title: "Connection Failed",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const disconnectMutation = useMutation({
    mutationFn: (provider: string) =>
      apiRequest("POST", `/api/client-portal/email/disconnect/${provider}`).then(
        (r) => r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/client-portal/email/status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/client-portal/inbox/mailbox-accounts"],
      });
      toast({ title: "Disconnected" });
    },
  });

  const smtpMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/client-portal/email/smtp/configure", {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        tls: smtpTls,
        username: smtpUsername,
        password: smtpPassword,
        fromEmail: smtpEmail,
        displayName: smtpDisplayName || undefined,
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/client-portal/email/status"],
      });
      toast({ title: "SMTP Connected" });
      setSmtpPassword("");
    },
    onError: () => {
      toast({
        title: "SMTP Error",
        description: "Check your settings.",
        variant: "destructive",
      });
    },
  });

  // ==================== Composer ====================

  function handleOpenComposer(
    mode?: "reply" | "forward",
    email?: InboxMessage
  ) {
    setComposerMode(mode || null);
    setReplyingToEmail(email || null);

    if (mode === "reply" && email) {
      setCompTo(email.from || "");
      setCompSubject(`Re: ${email.subject || ""}`);
      setCompBody("");
    } else if (mode === "forward" && email) {
      setCompTo("");
      setCompSubject(`Fwd: ${email.subject || ""}`);
      setCompBody(
        `<br/><br/>---------- Forwarded message ----------<br/>${
          email.bodyHtml || email.bodyPreview || ""
        }`
      );
    } else {
      setCompTo("");
      setCompSubject("");
      setCompBody("");
    }

    setCompCc("");
    setShowCc(false);
    setComposerOpen(true);
  }

  function handleCloseComposer() {
    setComposerOpen(false);
    setComposerMode(null);
    setReplyingToEmail(null);
    setCompTo("");
    setCompCc("");
    setCompSubject("");
    setCompBody("");
  }

  function handleSend() {
    const toArr = compTo
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const ccArr = compCc
      ? compCc
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : undefined;

    if (!toArr.length || !compSubject) {
      toast({
        title: "Missing fields",
        description: "To and Subject are required",
        variant: "destructive",
      });
      return;
    }

    sendEmailMutation.mutate({
      to: toArr,
      cc: ccArr,
      subject: compSubject,
      bodyHtml: compBody || "<p></p>",
    });
  }

  // Auto-mark as read when selecting email
  useEffect(() => {
    if (selectedEmail && !selectedEmail.isRead) {
      markReadMutation.mutate({
        messageId: selectedEmail.id,
        isRead: true,
      });
    }
  }, [selectedEmail?.id]);

  // ==================== Folder label ====================

  const folderLabel: Record<InboxFolder, string> = {
    inbox: "Primary Inbox",
    other: "Other",
    sent: "Sent",
    starred: "Starred",
    archive: "Archive",
    trash: "Trash",
  };

  // ==================== Render ====================

  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shared Inbox</h1>
            <p className="text-muted-foreground text-sm">
              Team email inbox — connect Google, Microsoft 365, or custom SMTP
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyConnection && (
              <Badge
                variant="outline"
                className="text-green-600 border-green-200 bg-green-50"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setActiveView(activeView === "settings" ? "inbox" : "settings")
              }
            >
              <Settings className="h-4 w-4 mr-1" />
              {activeView === "settings" ? "Inbox" : "Settings"}
            </Button>
            {hasAnyConnection && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 mr-1",
                      syncMutation.isPending && "animate-spin"
                    )}
                  />
                  Sync
                </Button>
                <Button size="sm" onClick={() => handleOpenComposer()}>
                  <PenSquare className="h-4 w-4 mr-1" />
                  Compose
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Settings View (Connection Management) */}
        {activeView === "settings" ? (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Google Workspace */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-red-500/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-red-500" />
                    </div>
                    Google Workspace
                  </CardTitle>
                  {googleStatus?.connected && (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-200 bg-green-50 text-xs"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {googleStatus?.connected
                    ? `Connected as ${googleStatus.mailboxEmail}`
                    : "Connect a Google email account for your team."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {googleStatus?.connected ? (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => disconnectMutation.mutate("google")}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Disconnect Google
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConnect("google")}
                    disabled={connectingProvider === "google"}
                  >
                    {connectingProvider === "google" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Connect Google Account
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Microsoft 365 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-blue-500" />
                    </div>
                    Microsoft 365
                  </CardTitle>
                  {microsoftStatus?.connected && (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-200 bg-green-50 text-xs"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {microsoftStatus?.connected
                    ? `Connected as ${microsoftStatus.mailboxEmail}`
                    : "Connect Outlook / Microsoft 365 email for your team."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {microsoftStatus?.connected ? (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => disconnectMutation.mutate("o365")}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Disconnect Microsoft
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConnect("microsoft")}
                    disabled={connectingProvider === "microsoft"}
                  >
                    {connectingProvider === "microsoft" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Connect Microsoft Account
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Custom SMTP */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-gray-500/10 flex items-center justify-center">
                      <Settings className="h-4 w-4 text-gray-500" />
                    </div>
                    Custom SMTP / IMAP
                  </CardTitle>
                  {smtpStatus?.connected && (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-200 bg-green-50 text-xs"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {smtpStatus?.connected
                    ? `Configured as ${smtpStatus.mailboxEmail}`
                    : "Configure custom SMTP credentials for your team."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {smtpStatus?.connected ? (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => disconnectMutation.mutate("smtp")}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Disconnect SMTP
                  </Button>
                ) : (
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      smtpMutation.mutate();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-host">SMTP Host</Label>
                      <Input
                        id="smtp-host"
                        placeholder="smtp.example.com"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-port">Port</Label>
                      <Input
                        id="smtp-port"
                        placeholder="587"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-user">Username</Label>
                      <Input
                        id="smtp-user"
                        placeholder="user@example.com"
                        value={smtpUsername}
                        onChange={(e) => setSmtpUsername(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-pass">Password</Label>
                      <Input
                        id="smtp-pass"
                        type="password"
                        placeholder="••••••••"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-email">From Email</Label>
                      <Input
                        id="smtp-email"
                        type="email"
                        placeholder="noreply@example.com"
                        value={smtpEmail}
                        onChange={(e) => setSmtpEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-name">Display Name (optional)</Label>
                      <Input
                        id="smtp-name"
                        placeholder="My Company"
                        value={smtpDisplayName}
                        onChange={(e) => setSmtpDisplayName(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Switch
                        id="smtp-tls"
                        checked={smtpTls}
                        onCheckedChange={setSmtpTls}
                      />
                      <Label htmlFor="smtp-tls">Use TLS</Label>
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={smtpMutation.isPending}>
                        {smtpMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Save SMTP Configuration
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        ) : !hasAnyConnection ? (
          /* No connection — onboarding state */
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <InboxIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">
                  Connect Your Team Email
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Connect a Google or Microsoft email account to start sending
                  and receiving emails in your shared inbox.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleConnect("google")}
                    disabled={connectingProvider === "google"}
                  >
                    {connectingProvider === "google" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Google
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleConnect("microsoft")}
                    disabled={connectingProvider === "microsoft"}
                  >
                    {connectingProvider === "microsoft" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Microsoft 365
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setActiveView("settings")}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Custom SMTP
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Full Inbox View */
          <Card className="overflow-hidden">
            <div className="flex h-[calc(100vh-200px)] min-h-[500px]">
              {/* Sidebar */}
              <InboxSidebar
                activeFolder={activeFolder}
                onFolderChange={(f) => {
                  setActiveFolder(f);
                  setSelectedEmail(null);
                }}
                primaryUnread={primaryStats.unreadCount}
                otherUnread={otherStats.unreadCount}
                collapsed={sidebarCollapsed}
              />

              {/* Message List */}
              <div className="flex-1 flex flex-col min-w-0 border-r">
                {/* List Header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
                  <h3 className="text-sm font-semibold flex-1">
                    {folderLabel[activeFolder]}
                  </h3>
                  <div className="relative w-44">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="pl-7 h-8 text-xs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  {(activeFolder === "inbox" || activeFolder === "other") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        markAllReadMutation.mutate(inboxCategory as any)
                      }
                    >
                      <MailOpen className="h-3 w-3 mr-1" />
                      Mark all read
                    </Button>
                  )}
                  {activeFolder === "trash" && messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => emptyTrashMutation.mutate()}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Empty trash
                    </Button>
                  )}
                </div>

                {/* Message List Body */}
                <ScrollArea className="flex-1">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                      <div className="rounded-full bg-muted p-3 mb-3">
                        <InboxIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium mb-1">No messages</p>
                      <p className="text-xs text-muted-foreground">
                        {activeFolder === "inbox"
                          ? "Your inbox is empty. Sync to check for new emails."
                          : `No messages in ${folderLabel[activeFolder].toLowerCase()}.`}
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <button
                        key={msg.id}
                        className={cn(
                          "w-full flex items-start gap-3 px-3 py-3 text-left border-b transition-colors hover:bg-accent/50",
                          selectedEmail?.id === msg.id && "bg-accent",
                          !msg.isRead && "bg-blue-50/40 dark:bg-blue-950/20"
                        )}
                        onClick={() => setSelectedEmail(msg)}
                      >
                        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {(msg.fromName || msg.from || "?")[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-sm truncate",
                                !msg.isRead && "font-semibold"
                              )}
                            >
                              {msg.fromName || msg.from || "Unknown"}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                              {msg.receivedDateTime
                                ? formatDistanceToNow(
                                    new Date(msg.receivedDateTime),
                                    { addSuffix: true }
                                  )
                                : ""}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "text-xs truncate",
                              !msg.isRead
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {msg.subject || "(no subject)"}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {msg.bodyPreview?.substring(0, 80) || ""}
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {msg.isStarred && (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          )}
                          {msg.hasAttachments && (
                            <Paperclip className="h-3 w-3 text-muted-foreground" />
                          )}
                          {!msg.isRead && (
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </ScrollArea>
              </div>

              {/* Email Detail Pane */}
              <div className="flex-1 flex flex-col min-w-0">
                {selectedEmail ? (
                  <>
                    {/* Detail Header */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                handleOpenComposer("reply", selectedEmail)
                              }
                            >
                              <Reply className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reply</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                handleOpenComposer("forward", selectedEmail)
                              }
                            >
                              <Forward className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Forward</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                toggleStarMutation.mutate(selectedEmail.id)
                              }
                            >
                              {selectedEmail.isStarred ? (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              ) : (
                                <StarOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {selectedEmail.isStarred ? "Unstar" : "Star"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                archiveMutation.mutate(selectedEmail.id)
                              }
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Archive</TooltipContent>
                        </Tooltip>
                        {activeFolder === "trash" ? (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() =>
                                    untrashMutation.mutate(selectedEmail.id)
                                  }
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Restore</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() =>
                                    permanentDeleteMutation.mutate(
                                      selectedEmail.id
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete forever</TooltipContent>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() =>
                                  trashMutation.mutate(selectedEmail.id)
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        )}
                      </TooltipProvider>
                      <div className="ml-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setSelectedEmail(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Email Content */}
                    <ScrollArea className="flex-1 p-4">
                      <div className="max-w-3xl">
                        <h2 className="text-lg font-semibold mb-3">
                          {selectedEmail.subject || "(no subject)"}
                        </h2>

                        <div className="flex items-start gap-3 mb-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {(
                                selectedEmail.fromName ||
                                selectedEmail.from ||
                                "?"
                              )[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {selectedEmail.fromName || selectedEmail.from}
                              </span>
                              {selectedEmail.importance === "high" && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] h-4"
                                >
                                  Important
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {selectedEmail.from}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              To: {selectedEmail.to.join(", ")}
                              {selectedEmail.cc?.length > 0 &&
                                ` | Cc: ${selectedEmail.cc.join(", ")}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedEmail.receivedDateTime
                                ? format(
                                    new Date(selectedEmail.receivedDateTime),
                                    "MMM d, yyyy h:mm a"
                                  )
                                : ""}
                            </p>
                          </div>
                        </div>

                        <Separator className="mb-4" />

                        {selectedEmail.bodyHtml ? (
                          <div
                            className="prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{
                              __html: selectedEmail.bodyHtml,
                            }}
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">
                            {selectedEmail.bodyPreview || "No content"}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Mail className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Select an email to read
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Composer Dialog */}
        <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {composerMode === "reply"
                  ? "Reply"
                  : composerMode === "forward"
                  ? "Forward"
                  : "New Email"}
              </DialogTitle>
              <DialogDescription>
                Sending from your connected team mailbox
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input
                  placeholder="recipient@example.com"
                  value={compTo}
                  onChange={(e) => setCompTo(e.target.value)}
                />
              </div>

              {showCc && (
                <div className="space-y-1.5">
                  <Label>Cc</Label>
                  <Input
                    placeholder="cc@example.com"
                    value={compCc}
                    onChange={(e) => setCompCc(e.target.value)}
                  />
                </div>
              )}

              {!showCc && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setShowCc(true)}
                >
                  + Add Cc
                </Button>
              )}

              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input
                  placeholder="Email subject"
                  value={compSubject}
                  onChange={(e) => setCompSubject(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Body</Label>
                <textarea
                  className="w-full min-h-[200px] rounded-md border bg-background px-3 py-2 text-sm resize-y"
                  placeholder="Write your message..."
                  value={compBody}
                  onChange={(e) => setCompBody(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCloseComposer}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={sendEmailMutation.isPending}
                >
                  {sendEmailMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPortalLayout>
  );
}
