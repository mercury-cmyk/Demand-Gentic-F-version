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
    <Badge variant="outline" className={className}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </Badge>
  );
}

function DnsRecordRow({ record, onCopy }: { record: DnsRecord; onCopy: (text: string) => void }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline">{record.type}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs max-w-[200px] truncate">
        <Tooltip>
          <TooltipTrigger>{record.name}</TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs">{record.name}</p>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="font-mono text-xs max-w-[300px] truncate">
        <Tooltip>
          <TooltipTrigger>{record.value}</TooltipTrigger>
          <TooltipContent className="max-w-[500px]">
            <p className="font-mono text-xs break-all">{record.value}</p>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
        {record.purpose}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCopy(record.value)}
        >
          <Copy className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddDomainDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [purpose, setPurpose] = useState<'marketing' | 'transactional' | 'both'>('both');
  const [provider, setProvider] = useState<'mailgun' | 'ses' | 'sendgrid' | 'custom'>('mailgun');
  const [region, setRegion] = useState<'US' | 'EU'>('US');

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Domain
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Domain</DialogTitle>
          <DialogDescription>
            Configure a new sending domain for your emails.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subdomain">Subdomain (optional)</Label>
            <Input
              id="subdomain"
              placeholder="mail"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the root domain
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={(v: any) => setPurpose(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Marketing & Transactional</SelectItem>
                <SelectItem value="marketing">Marketing Only</SelectItem>
                <SelectItem value="transactional">Transactional Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Email Provider</Label>
              <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                  <SelectItem value="ses">Amazon SES</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="custom">Custom SMTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Region</Label>
              <Select value={region} onValueChange={(v: any) => setRegion(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="EU">Europe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
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
            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Domain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              allVerified ? 'bg-green-100' : 'bg-yellow-100'
            }`}
          >
            {allVerified ? (
              <ShieldCheck className="w-5 h-5 text-green-600" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-yellow-600" />
            )}
          </div>
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {domain.domain}
            </CardTitle>
            <CardDescription>
              {domain.configuration?.domainPurpose === 'both'
                ? 'Marketing & Transactional'
                : domain.configuration?.domainPurpose || 'Email'}
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {domain.healthScore !== null && (
            <Badge
              variant="outline"
              className={
                domain.healthScore >= 80
                  ? 'bg-green-100 text-green-800'
                  : domain.healthScore >= 60
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }
            >
              Score: {domain.healthScore}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => validateMutation.mutate()}
            disabled={validateMutation.isPending}
          >
            {validateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteMutation.mutate()}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">SPF</p>
            <StatusBadge status={domain.spfStatus} />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">DKIM</p>
            <StatusBadge status={domain.dkimStatus} />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">DMARC</p>
            <StatusBadge status={domain.dmarcStatus} />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Tracking</p>
            <StatusBadge status={domain.trackingDomainStatus} />
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowDns(!showDns)}
        >
          {showDns ? 'Hide' : 'Show'} DNS Records
        </Button>

        {showDns && dnsRecords.length > 0 && (
          <div className="mt-4 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dnsRecords.map((record, idx) => (
                  <DnsRecordRow key={idx} record={record} onCopy={copyToClipboard} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {domain.lastCheckedAt && (
          <p className="text-xs text-muted-foreground mt-4">
            Last checked: {new Date(domain.lastCheckedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DomainManagementPage() {
  const queryClient = useQueryClient();

  const { data: domains, isLoading, refetch } = useQuery<Domain[]>({
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Domain Management</h1>
          <p className="text-muted-foreground">
            Configure and verify your sending domains for optimal deliverability
          </p>
        </div>
        <AddDomainDialog onSuccess={() => refetch()} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{domains?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{verifiedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Health Score</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {domains && domains.length > 0
                ? Math.round(
                    domains.reduce((acc, d) => acc + (d.healthScore || 0), 0) /
                      domains.length
                  )
                : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domains List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : domains && domains.length > 0 ? (
        <div className="grid gap-4">
          {domains.map((domain) => (
            <DomainCard key={domain.id} domain={domain} onRefresh={() => refetch()} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No domains configured</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add a sending domain to start sending authenticated emails.
            </p>
            <AddDomainDialog onSuccess={() => refetch()} />
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>DNS Configuration Instructions</CardTitle>
          <CardDescription>
            Follow these steps to configure your domain for email sending
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Log in to your DNS provider (e.g., Cloudflare, GoDaddy, Route 53)</li>
            <li>Navigate to DNS management for your domain</li>
            <li>Add each record exactly as shown in the DNS Records table above</li>
            <li>
              Wait for DNS propagation (can take up to 48 hours, usually much faster)
            </li>
            <li>
              Click the refresh button on your domain to verify the configuration
            </li>
          </ol>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Important Note
            </h4>
            <p className="text-sm text-yellow-700 mt-1">
              If you already have an SPF record, merge the includes rather than creating
              a duplicate. Only one SPF record is allowed per domain.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
