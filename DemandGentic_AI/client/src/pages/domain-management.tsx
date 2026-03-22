/**
 * Domain Management Page
 *
 * Manage email domains, configure DNS records, and validate authentication.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Domain {
  id: number;
  domain: string;
  spfStatus: 'pending' | 'verified' | 'failed';
  dkimStatus: 'pending' | 'verified' | 'failed';
  dmarcStatus: 'pending' | 'verified' | 'failed';
  trackingDomainStatus: 'pending' | 'verified' | 'failed';
  lastCheckedAt: string | null;
  createdAt: string;
  configuration: {
    domainPurpose: string;
    generatedSpfRecord: string;
    generatedDkimSelector: string;
    generatedDkimRecord: string;
    generatedDmarcRecord: string;
    generatedTrackingCname: string | null;
  } | null;
  healthScore: number | null;
  warmupPhase: string;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

function StatusBadge({ status }: { status: 'pending' | 'verified' | 'failed' | 'partial' }) {
  const variants = {
    pending: { icon: Clock, className: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
    verified: { icon: CheckCircle2, className: 'bg-green-100 text-green-800', label: 'Verified' },
    failed: { icon: XCircle, className: 'bg-red-100 text-red-800', label: 'Failed' },
    partial: { icon: AlertCircle, className: 'bg-orange-100 text-orange-800', label: 'Partial' },
  };

  const { icon: Icon, className, label } = variants[status] || variants.pending;

  return (
    
      
      {label}
    
  );
}

function DnsRecordRow({ record, onCopy }: { record: DnsRecord; onCopy: (text: string) => void }) {
  return (
    
      
        {record.type}
      
      
        
          {record.name}
          
            {record.name}
          
        
      
      
        
          {record.value}
          
            {record.value}
          
        
      
      
        {record.purpose}
      
      
         onCopy(record.value)}
        >
          
        
      
    
  );
}

function AddDomainDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [purpose, setPurpose] = useState('both');
  const [provider, setProvider] = useState('mailgun');
  const [region, setRegion] = useState('US');

  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: {
      domain: string;
      subdomain?: string;
      purpose: string;
      provider: string;
      region: string;
    }) => {
      const response = await apiRequest('POST', '/api/domains', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Domain created', description: 'DNS records have been generated.' });
      setOpen(false);
      setDomain('');
      setSubdomain('');
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create domain',
        variant: 'destructive',
      });
    },
  });

  return (
    
      
        
          
          Add Domain
        
      
      
        
          Add New Domain
          
            Configure a new sending domain for your emails.
          
        

        
          
            Domain
             setDomain(e.target.value)}
            />
          

          
            Subdomain (optional)
             setSubdomain(e.target.value)}
            />
            
              Leave empty to use the root domain
            
          

          
            Purpose
             setPurpose(v)}>
              
                
              
              
                Marketing & Transactional
                Marketing Only
                Transactional Only
              
            
          

          
            
              Email Provider
               setProvider(v)}>
                
                  
                
                
                  Mailgun
                  Amazon SES
                  SendGrid
                  Custom SMTP
                
              
            

            
              Region
               setRegion(v)}>
                
                  
                
                
                  United States
                  Europe
                
              
            
          
        

        
           setOpen(false)}>
            Cancel
          
          
              createMutation.mutate({
                domain,
                subdomain: subdomain || undefined,
                purpose,
                provider,
                region,
              })
            }
            disabled={!domain || createMutation.isPending}
          >
            {createMutation.isPending && }
            Create Domain
          
        
      
    
  );
}

function DomainCard({ domain, onRefresh }: { domain: Domain; onRefresh: () => void }) {
  const [showDns, setShowDns] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const validateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/domains/${domain.id}/validate`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Validation complete', description: 'DNS records have been checked.' });
      onRefresh();
    },
    onError: () => {
      toast({ title: 'Validation failed', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/domains/${domain.id}`);
    },
    onSuccess: () => {
      toast({ title: 'Domain deleted' });
      onRefresh();
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const dnsRecords: DnsRecord[] = domain.configuration
    ? [
        {
          type: 'TXT',
          name: domain.domain,
          value: domain.configuration.generatedSpfRecord,
          purpose: 'SPF - Authorize mail servers',
        },
        {
          type: 'CNAME',
          name: `${domain.configuration.generatedDkimSelector}._domainkey.${domain.domain}`,
          value: domain.configuration.generatedDkimRecord,
          purpose: 'DKIM - Digital signature',
        },
        {
          type: 'TXT',
          name: `_dmarc.${domain.domain}`,
          value: domain.configuration.generatedDmarcRecord,
          purpose: 'DMARC - Policy',
        },
        ...(domain.configuration.generatedTrackingCname
          ? [
              {
                type: 'CNAME',
                name: `email.${domain.domain}`,
                value: domain.configuration.generatedTrackingCname,
                purpose: 'Tracking - Opens & clicks',
              },
            ]
          : []),
      ]
    : [];

  const allVerified =
    domain.spfStatus === 'verified' &&
    domain.dkimStatus === 'verified' &&
    domain.dmarcStatus === 'verified';

  return (
    
      
        
          
            {allVerified ? (
              
            ) : (
              
            )}
          
          
            
              
              {domain.domain}
            
            
              {domain.configuration?.domainPurpose === 'both'
                ? 'Marketing & Transactional'
                : domain.configuration?.domainPurpose || 'Email'}
            
          
        

        
          {domain.healthScore !== null && (
            = 80
                  ? 'bg-green-100 text-green-800'
                  : domain.healthScore >= 60
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }
            >
              Score: {domain.healthScore}
            
          )}
           validateMutation.mutate()}
            disabled={validateMutation.isPending}
          >
            {validateMutation.isPending ? (
              
            ) : (
              
            )}
          
           deleteMutation.mutate()}
          >
            
          
        
      

      
        
          
            SPF
            
          
          
            DKIM
            
          
          
            DMARC
            
          
          
            Tracking
            
          
        

         setShowDns(!showDns)}
        >
          {showDns ? 'Hide' : 'Show'} DNS Records
        

        {showDns && dnsRecords.length > 0 && (
          
            
              
                
                  Type
                  Name
                  Value
                  Purpose
                  
                
              
              
                {dnsRecords.map((record, idx) => (
                  
                ))}
              
            
          
        )}

        {domain.lastCheckedAt && (
          
            Last checked: {new Date(domain.lastCheckedAt).toLocaleString()}
          
        )}
      
    
  );
}

export default function DomainManagementPage() {
  const queryClient = useQueryClient();

  const { data: domains, isLoading, refetch } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/domains');
      return response.json();
    },
  });

  const verifiedCount = domains?.filter(
    (d) =>
      d.spfStatus === 'verified' &&
      d.dkimStatus === 'verified' &&
      d.dmarcStatus === 'verified'
  ).length || 0;

  const pendingCount = domains?.filter(
    (d) =>
      d.spfStatus === 'pending' ||
      d.dkimStatus === 'pending' ||
      d.dmarcStatus === 'pending'
  ).length || 0;

  return (
    
      
        
          Domain Management
          
            Configure and verify your sending domains for optimal deliverability
          
        
         refetch()} />
      

      {/* Stats Cards */}
      
        
          
            Total Domains
            
          
          
            {domains?.length || 0}
          
        

        
          
            Verified
            
          
          
            {verifiedCount}
          
        

        
          
            Pending
            
          
          
            {pendingCount}
          
        

        
          
            Avg. Health Score
            
          
          
            
              {domains && domains.length > 0
                ? Math.round(
                    domains.reduce((acc, d) => acc + (d.healthScore || 0), 0) /
                      domains.length
                  )
                : 0}
            
          
        
      

      {/* Domains List */}
      {isLoading ? (
        
          
        
      ) : domains && domains.length > 0 ? (
        
          {domains.map((domain) => (
             refetch()} />
          ))}
        
      ) : (
        
          
            
            No domains configured
            
              Add a sending domain to start sending authenticated emails.
            
             refetch()} />
          
        
      )}

      {/* Instructions */}
      
        
          DNS Configuration Instructions
          
            Follow these steps to configure your domain for email sending
          
        
        
          
            Log in to your DNS provider (e.g., Cloudflare, GoDaddy, Route 53)
            Navigate to DNS management for your domain
            Add each record exactly as shown in the DNS Records table above
            
              Wait for DNS propagation (can take up to 48 hours, usually much faster)
            
            
              Click the refresh button on your domain to verify the configuration
            
          

          
            
              
              Important Note
            
            
              If you already have an SPF record, merge the includes rather than creating
              a duplicate. Only one SPF record is allowed per domain.
            
          
        
      
    
  );
}