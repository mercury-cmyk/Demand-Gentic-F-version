/**
 * Client Portal Email Inbox Page
 * 
 * Provides clients a unified email inbox to view, compose, and manage
 * email communications tied to their campaigns.
 * Supports connecting Google, Microsoft 365, and Custom SMTP accounts.
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  Mail,
  Inbox,
  Send,
  PenSquare,
  Search,
  Settings,
  Link2,
  CheckCircle,
  Unplug,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ProviderStatus = {
  connected: boolean;
  mailboxEmail?: string | null;
  displayName?: string | null;
  connectedAt?: string | null;
};

type EmailStatus = Record<string, ProviderStatus>;

export default function ClientPortalEmailInbox() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'connect'>('inbox');
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  // SMTP form state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpTls, setSmtpTls] = useState(true);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpDisplayName, setSmtpDisplayName] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch connection status for all providers
  const { data: emailStatus, isLoading: statusLoading } = useQuery<EmailStatus>({
    queryKey: ['/api/client-portal/email/status'],
    staleTime: 30_000,
  });

  const googleStatus = emailStatus?.google;
  const microsoftStatus = emailStatus?.o365;
  const smtpStatus = emailStatus?.smtp;
  const hasAnyConnection = googleStatus?.connected || microsoftStatus?.connected || smtpStatus?.connected;

  // Listen for OAuth popup postMessage
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'oauth-success') {
        setConnectingProvider(null);
        queryClient.invalidateQueries({ queryKey: ['/api/client-portal/email/status'] });
        toast({
          title: 'Email Connected',
          description: `${event.data.provider === 'google' ? 'Google' : 'Microsoft'} account connected successfully.`,
        });
      } else if (event.data?.type === 'oauth-error') {
        setConnectingProvider(null);
        toast({
          title: 'Connection Failed',
          description: event.data.error || 'OAuth flow failed. Please try again.',
          variant: 'destructive',
        });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient, toast]);

  // Open OAuth popup for a provider
  const handleConnect = useCallback(async (provider: 'google' | 'microsoft') => {
    setConnectingProvider(provider);
    try {
      const res = await apiRequest('GET', `/api/client-portal/email/${provider}/authorize`);
      const data = await res.json();
      if (!data.authUrl) {
        throw new Error('No auth URL returned');
      }
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        data.authUrl,
        `${provider}-oauth`,
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`,
      );
      // If popup was blocked, fall back
      if (!popup) {
        toast({
          title: 'Popup Blocked',
          description: 'Please allow popups for this site and try again.',
          variant: 'destructive',
        });
        setConnectingProvider(null);
      }
    } catch {
      setConnectingProvider(null);
      toast({
        title: 'Connection Failed',
        description: `Failed to start ${provider === 'google' ? 'Google' : 'Microsoft'} OAuth flow.`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      await apiRequest('POST', `/api/client-portal/email/disconnect/${provider}`);
    },
    onSuccess: (_data, provider) => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/email/status'] });
      toast({
        title: 'Disconnected',
        description: `${provider === 'google' ? 'Google' : provider === 'o365' ? 'Microsoft' : 'SMTP'} account disconnected.`,
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to disconnect email account.', variant: 'destructive' });
    },
  });

  // SMTP config mutation
  const smtpMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/client-portal/email/smtp/configure', {
        host: smtpHost,
        port: parseInt(smtpPort, 10),
        tls: smtpTls,
        username: smtpUsername,
        password: smtpPassword,
        fromEmail: smtpEmail,
        displayName: smtpDisplayName || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/email/status'] });
      toast({ title: 'SMTP Connected', description: 'Custom email server configured successfully.' });
      setSmtpPassword('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to configure SMTP. Check your settings.', variant: 'destructive' });
    },
  });

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Inbox</h1>
            <p className="text-muted-foreground text-sm">
              Manage your email communications in one place
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyConnection && (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setActiveTab('connect')}>
              <Link2 className="h-4 w-4 mr-1" />
              Connect Email
            </Button>
            <Button size="sm">
              <PenSquare className="h-4 w-4 mr-1" />
              Compose
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'inbox'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('inbox')}
          >
            <Inbox className="h-4 w-4 inline mr-1.5" />
            Inbox
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'sent'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('sent')}
          >
            <Send className="h-4 w-4 inline mr-1.5" />
            Sent
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'connect'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('connect')}
          >
            <Settings className="h-4 w-4 inline mr-1.5" />
            Settings
          </button>
        </div>

        {/* Content */}
        {activeTab === 'connect' ? (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Google Workspace */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Google Workspace
                  </CardTitle>
                  {googleStatus?.connected && (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {googleStatus?.connected
                    ? `Connected as ${googleStatus.mailboxEmail}`
                    : 'Connect your Google email account for sending and receiving.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {googleStatus?.connected ? (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => disconnectMutation.mutate('google')}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Disconnect Google
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConnect('google')}
                    disabled={connectingProvider === 'google'}
                  >
                    {connectingProvider === 'google' ? (
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
                    <Mail className="h-5 w-5" />
                    Microsoft 365
                  </CardTitle>
                  {microsoftStatus?.connected && (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {microsoftStatus?.connected
                    ? `Connected as ${microsoftStatus.mailboxEmail}`
                    : 'Connect your Outlook / Microsoft 365 email account.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {microsoftStatus?.connected ? (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => disconnectMutation.mutate('o365')}
                    disabled={disconnectMutation.isPending}
                  >
                    <Unplug className="h-4 w-4 mr-2" />
                    Disconnect Microsoft
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConnect('microsoft')}
                    disabled={connectingProvider === 'microsoft'}
                  >
                    {connectingProvider === 'microsoft' ? (
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
                    <Settings className="h-5 w-5" />
                    Custom SMTP / IMAP
                  </CardTitle>
                  {smtpStatus?.connected && (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {smtpStatus?.connected
                    ? `Configured as ${smtpStatus.mailboxEmail}`
                    : 'Configure a custom email server with SMTP credentials.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {smtpStatus?.connected ? (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => disconnectMutation.mutate('smtp')}
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
                      <Input id="smtp-host" placeholder="smtp.example.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-port">Port</Label>
                      <Input id="smtp-port" placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-user">Username</Label>
                      <Input id="smtp-user" placeholder="user@example.com" value={smtpUsername} onChange={e => setSmtpUsername(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-pass">Password</Label>
                      <Input id="smtp-pass" type="password" placeholder="••••••••" value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-email">From Email</Label>
                      <Input id="smtp-email" type="email" placeholder="noreply@example.com" value={smtpEmail} onChange={e => setSmtpEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-name">Display Name (optional)</Label>
                      <Input id="smtp-name" placeholder="My Company" value={smtpDisplayName} onChange={e => setSmtpDisplayName(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Switch id="smtp-tls" checked={smtpTls} onCheckedChange={setSmtpTls} />
                      <Label htmlFor="smtp-tls">Use TLS</Label>
                    </div>
                    <div className="sm:col-span-2">
                      <Button type="submit" disabled={smtpMutation.isPending}>
                        {smtpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save SMTP Configuration
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {activeTab === 'inbox' ? 'Inbox' : 'Sent Messages'}
                </CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search emails..."
                    className="pl-9 h-9"
                  />
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  {activeTab === 'inbox' ? (
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <Send className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-1">
                  {activeTab === 'inbox' ? 'Your inbox is empty' : 'No sent messages'}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {hasAnyConnection
                    ? activeTab === 'inbox'
                      ? 'No messages yet. Campaign replies and notifications will appear here.'
                      : 'Emails you send through campaigns or compose manually will appear here.'
                    : activeTab === 'inbox'
                      ? 'Connect your email account to start receiving messages here.'
                      : 'Connect an email account first, then compose and send emails.'}
                </p>
                {!hasAnyConnection && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setActiveTab('connect')}
                  >
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Connect Email Account
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPortalLayout>
  );
}
