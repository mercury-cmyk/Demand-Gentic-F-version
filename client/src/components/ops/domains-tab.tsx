import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Copy,
  Plus,
  Globe,
  Shield,
  Trash2,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface DomainMapping {
  id: string;
  domain: string;
  cloudRunService: string;
  environment: 'dev' | 'staging' | 'prod';
  httpStatus: number;
  sslStatus: 'ACTIVE' | 'PENDING' | 'EXPIRED';
  sslExpiry: Date;
  dnsStatus: 'PROPAGATED' | 'PENDING';
  createdAt: Date;
  lastChecked: Date;
}

type DomainEnvironment = DomainMapping['environment'];

export default function DomainsTab() {
  const [domains, setDomains] = useState<DomainMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDNSDialog, setShowDNSDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<DomainMapping | null>(null);
  const [newDomain, setNewDomain] = useState<{
    domain: string;
    cloudRunService: string;
    environment: DomainEnvironment;
  }>({
    domain: '',
    cloudRunService: '',
    environment: 'prod',
  });

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const mockDomains: DomainMapping[] = [
        {
          id: '1',
          domain: 'demandgentic.com',
          cloudRunService: 'demandgentic-api',
          environment: 'prod',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-03-15'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-01'),
          lastChecked: new Date(),
        },
        {
          id: '2',
          domain: 'api.demandgentic.com',
          cloudRunService: 'demandgentic-api',
          environment: 'prod',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-03-15'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-05'),
          lastChecked: new Date(),
        },
        {
          id: '3',
          domain: 'api-staging.demandgentic.com',
          cloudRunService: 'demandgentic-api-staging',
          environment: 'staging',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-02-20'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-15'),
          lastChecked: new Date(),
        },
        {
          id: '4',
          domain: 'api-dev.demandgentic.com',
          cloudRunService: 'demandgentic-api-dev',
          environment: 'dev',
          httpStatus: 200,
          sslStatus: 'ACTIVE',
          sslExpiry: new Date('2026-04-01'),
          dnsStatus: 'PROPAGATED',
          createdAt: new Date('2025-01-20'),
          lastChecked: new Date(),
        },
      ];

      setDomains(mockDomains);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
      setIsLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain.domain || !newDomain.cloudRunService) {
      return;
    }

    try {
      const response = await fetch('/api/ops/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDomain),
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedDomain({
          id: Math.random().toString(),
          ...newDomain,
          httpStatus: 0,
          sslStatus: 'PENDING',
          sslExpiry: new Date(),
          dnsStatus: 'PENDING',
          createdAt: new Date(),
          lastChecked: new Date(),
        });
        setShowDNSDialog(true);
        setNewDomain({ domain: '', cloudRunService: '', environment: 'prod' });
      }
    } catch (error) {
      console.error('Failed to add domain:', error);
    }
  };

  const handleDeleteDomain = async () => {
    if (!selectedDomain) return;

    try {
      const response = await fetch(`/api/ops/domains/${selectedDomain.domain}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDomains();
        setShowDeleteDialog(false);
        setSelectedDomain(null);
      }
    } catch (error) {
      console.error('Failed to delete domain:', error);
    }
  };

  const handleRenewSSL = async (domain: DomainMapping) => {
    try {
      const response = await fetch(`/api/ops/domains/${domain.domain}/ssl/renew`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchDomains();
      }
    } catch (error) {
      console.error('Failed to renew SSL:', error);
    }
  };

  const getSSLColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500/20 text-green-400';
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'EXPIRED':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getDNSRecords = (domain: string, service: string) => {
    return [
      {
        name: domain,
        type: 'CNAME',
        value: `${service}.run.app`,
        instruction: `Add CNAME record pointing to ${service}.run.app`,
      },
      {
        name: `_acme-challenge.${domain}`,
        type: 'TXT',
        value: 'v=acme-validation-token',
        instruction: 'SSL certificate validation record',
      },
    ];
  };

  return (
    <div className="space-y-6">
      {/* Add Domain Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogTrigger asChild>
          <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/50 cursor-pointer hover:border-blue-500/70 transition">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Add New Domain</h3>
                  <p className="text-sm text-slate-400">
                    Map a custom domain to your Cloud Run service
                  </p>
                </div>
                <Plus className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </DialogTrigger>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle>Add New Domain</DialogTitle>
            <DialogDescription>Map a custom domain to your Cloud Run service</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-200">Domain Name</label>
              <Input
                placeholder="e.g., api.mycompany.com"
                value={newDomain.domain}
                onChange={(e) => setNewDomain({ ...newDomain, domain: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">Cloud Run Service</label>
              <Input
                placeholder="e.g., demandgentic-api"
                value={newDomain.cloudRunService}
                onChange={(e) => setNewDomain({ ...newDomain, cloudRunService: e.target.value })}
                className="mt-1 bg-slate-700 border-slate-600"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-200">Environment</label>
              <Select value={newDomain.environment} onValueChange={(val) =>
                setNewDomain({ ...newDomain, environment: val as DomainEnvironment })
              }>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="dev">Development</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="prod">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddDomain} className="w-full">
              Add Domain
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DNS Records Dialog */}
      <Dialog open={showDNSDialog} onOpenChange={setShowDNSDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle>DNS Records to Add</DialogTitle>
            <DialogDescription>
              Add these DNS records at your domain registrar to activate {selectedDomain?.domain}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedDomain &&
              getDNSRecords(selectedDomain.domain, selectedDomain.cloudRunService).map(
                (record, idx) => (
                  <Card key={idx} className="bg-slate-700 border-slate-600">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-400">Type</p>
                            <p className="font-mono text-sm font-bold text-slate-200">
                              {record.type}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400">Name</p>
                            <p className="font-mono text-sm text-slate-200">{record.name}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Value</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-slate-900 p-2 rounded text-sm text-slate-300 break-all">
                              {record.value}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigator.clipboard.writeText(record.value)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">{record.instruction}</p>
                      </div>
                    </CardContent>
                  </Card>
                )
              )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Domain Mappings Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle>Domain Mappings</CardTitle>
          <CardDescription>All custom domains and their mappings</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Loading domains...</div>
          ) : domains.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No domains found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Domain</TableHead>
                    <TableHead className="text-slate-300">Service</TableHead>
                    <TableHead className="text-slate-300">SSL</TableHead>
                    <TableHead className="text-slate-300">DNS</TableHead>
                    <TableHead className="text-slate-300">HTTP Status</TableHead>
                    <TableHead className="text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow
                      key={domain.id}
                      className="border-slate-700 hover:bg-slate-700/50 transition"
                    >
                      <TableCell className="font-medium text-slate-200 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-400" />
                        {domain.domain}
                      </TableCell>
                      <TableCell className="text-slate-300">{domain.cloudRunService}</TableCell>
                      <TableCell>
                        <Badge className={getSSLColor(domain.sslStatus)}>
                          {domain.sslStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            domain.dnsStatus === 'PROPAGATED'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }
                        >
                          {domain.dnsStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono text-slate-200">{domain.httpStatus}</span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-slate-800 border-slate-600" align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedDomain(domain);
                                setShowDNSDialog(true);
                              }}
                              className="text-slate-200 cursor-pointer hover:bg-slate-700"
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              View DNS Records
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRenewSSL(domain)}
                              className="text-slate-200 cursor-pointer hover:bg-slate-700"
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              Renew SSL
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedDomain(domain);
                                setShowDeleteDialog(true);
                              }}
                              className="text-red-400 cursor-pointer hover:bg-red-500/20"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogTitle>Remove Domain</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove <span className="font-semibold">{selectedDomain?.domain}</span>?
            This will stop routing traffic to {selectedDomain?.cloudRunService}.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel className="bg-slate-700 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDomain}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
