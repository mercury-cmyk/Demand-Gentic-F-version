/**
 * IAM Policies Page
 * 
 * Create and manage permission policies
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  FileText, Search, Plus, MoreHorizontal, Lock, 
  ChevronLeft, Edit, Trash2, Shield, Eye
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Policy {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  entityType: string;
  actions: string[];
  scopeType: string;
  conditions?: Record<string, any>;
  effect: 'allow' | 'deny';
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
}

const ENTITY_TYPES = [
  'account', 'project', 'campaign', 'agent', 'call_session',
  'recording', 'transcript', 'report', 'lead', 'delivery',
  'domain', 'smtp', 'email_template', 'prompt', 'quality_review',
  'audit_log', 'user', 'team', 'role', 'policy'
];

const ACTIONS = [
  'view', 'create', 'edit', 'delete', 'run', 'execute',
  'approve', 'publish', 'assign', 'export', 'manage_settings',
  'view_sensitive', 'manage_access'
];

const SCOPE_TYPES = [
  { value: 'all', label: 'All Resources' },
  { value: 'own', label: 'Own Resources Only' },
  { value: 'assigned', label: 'Assigned Resources' },
  { value: 'team', label: 'Team Resources' },
  { value: 'organization', label: 'Organization' },
  { value: 'hierarchy', label: 'Hierarchy (Parent/Child)' },
  { value: 'project', label: 'Project Scope' },
  { value: 'department', label: 'Department' },
];

export default function IamPolicies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    description: '',
    entityType: '',
    actions: [] as string[],
    scopeType: 'all',
    effect: 'allow' as 'allow' | 'deny',
  });

  // Fetch policies
  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ['/api/iam/policies'],
  });

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: async (data: typeof newPolicy) => {
      const res = await fetch('/api/iam/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create policy');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/policies'] });
      setShowCreateModal(false);
      resetNewPolicy();
      toast({ title: 'Policy created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create policy', variant: 'destructive' });
    },
  });

  const resetNewPolicy = () => {
    setNewPolicy({
      name: '',
      description: '',
      entityType: '',
      actions: [],
      scopeType: 'all',
      effect: 'allow',
    });
  };

  const toggleAction = (action: string) => {
    setNewPolicy(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };

  const filteredPolicies = policies?.filter(policy => 
    policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    policy.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    policy.entityType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const systemPolicies = filteredPolicies?.filter(p => p.isSystem);
  const customPolicies = filteredPolicies?.filter(p => !p.isSystem);

  const getEffectBadge = (effect: string) => {
    return effect === 'deny' 
      ? <Badge variant="destructive">Deny</Badge>
      : <Badge variant="default">Allow</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/iam">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
          <p className="text-muted-foreground">
            Define fine-grained permission policies for entities
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search policies by name or entity type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* System Policies */}
          {systemPolicies && systemPolicies.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>System Policies</CardTitle>
                </div>
                <CardDescription>
                  Built-in policies for common access patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead className="text-right">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {systemPolicies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="font-medium">{policy.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              System
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{policy.entityType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {policy.actions.slice(0, 2).map(action => (
                              <Badge key={action} variant="secondary" className="text-xs">
                                {action}
                              </Badge>
                            ))}
                            {policy.actions.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{policy.actions.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {policy.scopeType}
                        </TableCell>
                        <TableCell>
                          {getEffectBadge(policy.effect)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedPolicy(policy);
                              setShowDetailsModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Custom Policies */}
          <Card>
            <CardHeader>
              <CardTitle>Custom Policies</CardTitle>
              <CardDescription>
                User-defined policies for specific access requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customPolicies && customPolicies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Effect</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customPolicies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="font-medium">{policy.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{policy.entityType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {policy.actions.slice(0, 2).map(action => (
                              <Badge key={action} variant="secondary" className="text-xs">
                                {action}
                              </Badge>
                            ))}
                            {policy.actions.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{policy.actions.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {policy.scopeType}
                        </TableCell>
                        <TableCell>
                          {getEffectBadge(policy.effect)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setSelectedPolicy(policy);
                                setShowDetailsModal(true);
                              }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Shield className="h-4 w-4 mr-2" />
                                Attach to Role
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Policy
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Policy
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No custom policies yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create policies to define fine-grained permissions
                  </p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Policy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Policy Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Policy</DialogTitle>
            <DialogDescription>
              Define a permission policy for an entity type
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="policy-name">Policy Name</Label>
                <Input
                  id="policy-name"
                  value={newPolicy.name}
                  onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                  placeholder="e.g., View Published Reports"
                />
              </div>
              <div>
                <Label>Effect</Label>
                <Select 
                  value={newPolicy.effect} 
                  onValueChange={(v) => setNewPolicy({ ...newPolicy, effect: v as 'allow' | 'deny' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label htmlFor="policy-description">Description</Label>
              <Textarea
                id="policy-description"
                value={newPolicy.description}
                onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
                placeholder="What does this policy control?"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entity Type</Label>
                <Select 
                  value={newPolicy.entityType} 
                  onValueChange={(v) => setNewPolicy({ ...newPolicy, entityType: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Scope</Label>
                <Select 
                  value={newPolicy.scopeType} 
                  onValueChange={(v) => setNewPolicy({ ...newPolicy, scopeType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_TYPES.map(scope => (
                      <SelectItem key={scope.value} value={scope.value}>
                        {scope.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Actions</Label>
              <div className="grid grid-cols-3 gap-2 mt-2 p-3 border rounded-md">
                {ACTIONS.map(action => (
                  <div key={action} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`action-${action}`}
                      checked={newPolicy.actions.includes(action)}
                      onCheckedChange={() => toggleAction(action)}
                    />
                    <Label htmlFor={`action-${action}`} className="cursor-pointer text-sm">
                      {action.replace(/_/g, ' ')}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateModal(false);
              resetNewPolicy();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => createPolicyMutation.mutate(newPolicy)}
              disabled={!newPolicy.name || !newPolicy.entityType || newPolicy.actions.length === 0 || createPolicyMutation.isPending}
            >
              {createPolicyMutation.isPending ? 'Creating...' : 'Create Policy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedPolicy?.name}</DialogTitle>
            <DialogDescription>
              {selectedPolicy?.description || 'No description provided'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedPolicy && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Entity Type</Label>
                  <p className="font-medium">{selectedPolicy.entityType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Scope</Label>
                  <p className="font-medium">{selectedPolicy.scopeType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Effect</Label>
                  <p>{getEffectBadge(selectedPolicy.effect)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium">
                    {new Date(selectedPolicy.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Actions</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedPolicy.actions.map(action => (
                    <Badge key={action}>{action}</Badge>
                  ))}
                </div>
              </div>
              
              {selectedPolicy.conditions && Object.keys(selectedPolicy.conditions).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Conditions</Label>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-sm overflow-auto">
                    {JSON.stringify(selectedPolicy.conditions, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
