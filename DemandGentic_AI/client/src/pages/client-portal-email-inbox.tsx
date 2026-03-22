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

type EmailStatus = Record;

export default function ClientPortalEmailInbox() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [connectingProvider, setConnectingProvider] = useState(null);
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
  const { data: emailStatus, isLoading: statusLoading } = useQuery({
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
    
      
        {/* Header */}
        
          
            Shared Inbox
            
              Shared email inbox for your team — all users on your account can view and send from the same connected mailbox
            
          
          
            {hasAnyConnection && (
              
                
                Connected
              
            )}
             setActiveTab('connect')}>
              
              Connect Email
            
            
              
              Compose
            
          
        

        {/* Tab Navigation */}
        
           setActiveTab('inbox')}
          >
            
            Inbox
          
           setActiveTab('sent')}
          >
            
            Sent
          
           setActiveTab('connect')}
          >
            
            Settings
          
        

        {/* Content */}
        {activeTab === 'connect' ? (
          
            {/* Google Workspace */}
            
              
                
                  
                    
                    Google Workspace
                  
                  {googleStatus?.connected && (
                    
                      
                      Connected
                    
                  )}
                
                
                  {googleStatus?.connected
                    ? `Connected as ${googleStatus.mailboxEmail} (shared with your team)`
                    : 'Connect a shared Google email account for your team.'}
                
              
              
                {googleStatus?.connected ? (
                   disconnectMutation.mutate('google')}
                    disabled={disconnectMutation.isPending}
                  >
                    
                    Disconnect Google
                  
                ) : (
                   handleConnect('google')}
                    disabled={connectingProvider === 'google'}
                  >
                    {connectingProvider === 'google' ? (
                      
                    ) : (
                      
                    )}
                    Connect Google Account
                  
                )}
              
            

            {/* Microsoft 365 */}
            
              
                
                  
                    
                    Microsoft 365
                  
                  {microsoftStatus?.connected && (
                    
                      
                      Connected
                    
                  )}
                
                
                  {microsoftStatus?.connected
                    ? `Connected as ${microsoftStatus.mailboxEmail} (shared with your team)`
                    : 'Connect a shared Outlook / Microsoft 365 email account for your team.'}
                
              
              
                {microsoftStatus?.connected ? (
                   disconnectMutation.mutate('o365')}
                    disabled={disconnectMutation.isPending}
                  >
                    
                    Disconnect Microsoft
                  
                ) : (
                   handleConnect('microsoft')}
                    disabled={connectingProvider === 'microsoft'}
                  >
                    {connectingProvider === 'microsoft' ? (
                      
                    ) : (
                      
                    )}
                    Connect Microsoft Account
                  
                )}
              
            

            {/* Custom SMTP */}
            
              
                
                  
                    
                    Custom SMTP / IMAP
                  
                  {smtpStatus?.connected && (
                    
                      
                      Connected
                    
                  )}
                
                
                  {smtpStatus?.connected
                    ? `Configured as ${smtpStatus.mailboxEmail} (shared with your team)`
                    : 'Configure a shared custom email server with SMTP credentials for your team.'}
                
              
              
                {smtpStatus?.connected ? (
                   disconnectMutation.mutate('smtp')}
                    disabled={disconnectMutation.isPending}
                  >
                    
                    Disconnect SMTP
                  
                ) : (
                   {
                      e.preventDefault();
                      smtpMutation.mutate();
                    }}
                  >
                    
                      SMTP Host
                       setSmtpHost(e.target.value)} required />
                    
                    
                      Port
                       setSmtpPort(e.target.value)} required />
                    
                    
                      Username
                       setSmtpUsername(e.target.value)} required />
                    
                    
                      Password
                       setSmtpPassword(e.target.value)} required />
                    
                    
                      From Email
                       setSmtpEmail(e.target.value)} required />
                    
                    
                      Display Name (optional)
                       setSmtpDisplayName(e.target.value)} />
                    
                    
                      
                      Use TLS
                    
                    
                      
                        {smtpMutation.isPending && }
                        Save SMTP Configuration
                      
                    
                  
                )}
              
            
          
        ) : (
          
            
              
                
                  {activeTab === 'inbox' ? 'Inbox' : 'Sent Messages'}
                
                
                  
                  
                
              
            
            
            
              
                
                  {activeTab === 'inbox' ? (
                    
                  ) : (
                    
                  )}
                
                
                  {activeTab === 'inbox' ? 'Shared inbox is empty' : 'No sent messages'}
                
                
                  {hasAnyConnection
                    ? activeTab === 'inbox'
                      ? 'No messages yet. Campaign replies and notifications will appear here for all team members.'
                      : 'Emails sent through campaigns or composed manually will appear here for all team members.'
                    : activeTab === 'inbox'
                      ? 'Connect your team email account to start receiving messages in the shared inbox.'
                      : 'Connect a team email account first, then compose and send emails.'}
                
                {!hasAnyConnection && (
                   setActiveTab('connect')}
                  >
                    
                    Connect Email Account
                  
                )}
              
            
          
        )}
      
    
  );
}