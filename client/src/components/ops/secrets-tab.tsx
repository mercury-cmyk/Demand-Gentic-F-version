import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff, Copy, RotateCcw, Trash2, MoreVertical, Plus } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Secret {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
  lastUpdated: Date;
  lastAccessedBy?: string;
  status: 'active' | 'rotated' | 'deprecated';
}

interface SecretAuditLog {
  id: string;
  secretName: string;
  action: string;
  user: string;
  timestamp: Date;
}

export default function SecretsTab() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecretAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<Secret | null>(null);
  const [showSecretValue, setShowSecretValue] = useState(false);
  const [newSecret, setNewSecret] = useState({ name: '', value: '', type: 'api-key' });

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/ops/secrets');
      const data = await response.json();

      if (data.success) {
        // Mock data for now
        setSecrets([
          {
            id: '1',
            name: 'github-token',
            type: 'api-key',
            createdAt: new Date('2025-01-15'),
            lastUpdated: new Date('2025-01-15'),
            lastAccessedBy: 'dev@company.com',
            status: 'active',
          },
          {
            id: '2',
            name: 'anthropic-api-key',
            type: 'api-key',
            createdAt: new Date('2025-02-01'),
            lastUpdated: new Date('2025-02-20'),
            lastAccessedBy: 'admin@company.com',
            status: 'active',
          },
          {
            id: '3',
            name: 'db-password',
            type: 'password',
            createdAt: new Date('2024-10-15'),
            lastUpdated: new Date('2025-02-15'),
            lastAccessedBy: 'system',
            status: 'active',
          },
          {
            id: '4',
            name: 'telnyx-api',
            type: 'api-key',
            createdAt: new Date('2024-11-01'),
            lastUpdated: new Date('2025-02-10'),
            status: 'rotated',
          },
        ]);

        setAuditLogs([
          {
            id: '1',
            secretName: 'anthropic-api-key',
            action: 'ACCESSED',
            user: 'admin@company.com',
            timestamp: new Date(),
          },
          {
            id: '2',
            secretName: 'github-token',
            action: 'ROTATED',
            user: 'system',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            id: '3',
            secretName: 'db-password',
            action: 'ACCESSED',
            user: 'dev@company.com',
            timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch secrets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSecret = async () => {
    if (!newSecret.name || !newSecret.value) {
      return;
    }

    try {
      const response = await fetch('/api/ops/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSecret),
      });

      if (response.ok) {
        setNewSecret({ name: '', value: '', type: 'api-key' });
        setShowCreateDialog(false);
        await fetchSecrets();
      }
    } catch (error) {
      console.error('Failed to create secret:', error);
    }
  };

  const handleDeleteSecret = async () => {
    if (!selectedSecret) return;

    try {
      const response = await fetch(`/api/ops/secrets/${selectedSecret.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowDeleteConfirm(false);
        setSelectedSecret(null);
        await fetchSecrets();
      }
    } catch (error) {
      console.error('Failed to delete secret:', error);
    }
  };

  const handleRotateSecret = async (secret: Secret) => {
    try {
      const response = await fetch(`/api/ops/secrets/${secret.id}/rotate`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchSecrets();
      }
    } catch (error) {
      console.error('Failed to rotate secret:', error);
    }
  };

  const filteredSecrets = secrets.filter((secret) =>
    secret.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400';
      case 'rotated':
        return 'bg-blue-500/20 text-blue-400';
      case 'deprecated':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>🔐 Secrets Manager</CardTitle>
              <CardDescription>Manage and audit all API keys and secrets</CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Secret
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700">
                <DialogHeader>
                  <DialogTitle>Create New Secret</DialogTitle>
                  <DialogDescription>Add a new API key or secret</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium text-slate-200">Secret Name</label>
                    <Input
                      placeholder="e.g., github-token"
                      value={newSecret.name}
                      onChange={(e) => setNewSecret({ ...newSecret, name: e.target.value })}
                      className="mt-1 bg-slate-700 border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-200">Secret Value</label>
                    <Input
                      type="password"
                      placeholder="Enter secret value"
                      value={newSecret.value}
                      onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                      className="mt-1 bg-slate-700 border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-200">Type</label>
                    <select
                      value={newSecret.type}
                      onChange={(e) => setNewSecret({ ...newSecret, type: e.target.value })}
                      className="w-full mt-1 bg-slate-700 border border-slate-600 rounded text-slate-200 px-3 py-2"
                    >
                      <option value="api-key">API Key</option>
                      <option value="password">Password</option>
                      <option value="token">Token</option>
                      <option value="cert">Certificate</option>
                    </select>
                  </div>
                  <Button
                    onClick={handleCreateSecret}
                    className="w-full"
                    disabled={!newSecret.name || !newSecret.value}
                  >
                    Create Secret
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Search Bar */}
      <div className="relative">
        <Input
          placeholder="Search secrets by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-800 border-slate-600 text-slate-200 placeholder:text-slate-500"
        />
      </div>

      {/* Secrets Table */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Loading secrets...</div>
          ) : filteredSecrets.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No secrets found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Secret Name</TableHead>
                    <TableHead className="text-slate-300">Type</TableHead>
                    <TableHead className="text-slate-300">Created</TableHead>
                    <TableHead className="text-slate-300">Last Updated</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSecrets.map((secret) => (
                    <TableRow
                      key={secret.id}
                      className="border-slate-700 hover:bg-slate-700/50 transition"
                    >
                      <TableCell className="font-medium text-slate-200">{secret.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{secret.type}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {formatDate(secret.createdAt)}
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {formatDate(secret.lastUpdated)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(secret.status)}>
                          {secret.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="bg-slate-800 border-slate-600"
                            align="end"
                          >
                            <DropdownMenuItem
                              onClick={() => handleRotateSecret(secret)}
                              className="text-slate-200 cursor-pointer hover:bg-slate-700"
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Rotate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setSelectedSecret(secret)}
                              className="text-slate-200 cursor-pointer hover:bg-slate-700"
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              Copy Value
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedSecret(secret);
                                setShowDeleteConfirm(true);
                              }}
                              className="text-red-400 cursor-pointer hover:bg-red-500/20"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
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

      {/* Audit Log */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg">Access Audit Log</CardTitle>
          <CardDescription>Recent secret access and modifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {auditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-700 pb-2">
                <div>
                  <p className="text-sm font-medium text-slate-200">{log.secretName}</p>
                  <p className="text-xs text-slate-400">
                    {log.action} by {log.user}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{formatDate(log.timestamp)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogTitle>Delete Secret</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <span className="font-semibold">{selectedSecret?.name}</span>?
            This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel className="bg-slate-700 hover:bg-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSecret}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
