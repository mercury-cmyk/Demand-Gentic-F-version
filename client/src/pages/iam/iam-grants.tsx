/**
 * IAM Access Grants Page
 * 
 * Manage direct permission grants to users and teams
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { 
  Key, Search, Plus, MoreHorizontal, Users, User, 
  ChevronLeft, Trash2, Calendar, AlertTriangle, CheckCircle
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface Grant {
  id: string;
  userId?: string;
  teamId?: string;
  entityType: string;
  entityId?: string;
  grantType: string;
  actions: string[];
  conditions?: Record<string, any>;
  expiresAt?: string;
  reason?: string;
  isActive: boolean;
  grantedBy: string;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface Team {
  id: string;
  name: string;
}

const ENTITY_TYPES = [
  'account', 'project', 'campaign', 'agent', 'call_session',
  'recording', 'transcript', 'report', 'lead', 'delivery',
  'domain', 'smtp', 'email_template', 'prompt', 'quality_review'
];

const ACTIONS = [
  'view', 'create', 'edit', 'delete', 'run', 'execute',
  'approve', 'publish', 'assign', 'export', 'manage_settings',
  'view_sensitive', 'manage_access'
];

const GRANT_TYPES = [
  { value: 'permission', label: 'Permanent Permission' },
  { value: 'temporary', label: 'Temporary Access' },
  { value: 'delegated', label: 'Delegated Access' },
  { value: 'inherited', label: 'Inherited' },
];

export default function IamGrants() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearch();
  const urlUserId = new URLSearchParams(searchParams).get('userId');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [granteeType, setGranteeType] = useState<'user' | 'team'>('user');
  
  const [newGrant, setNewGrant] = useState({
    userId: urlUserId || '',
    teamId: '',
    entityType: '',
    entityId: '',
    grantType: 'permission',
    actions: [] as string[],
    expiresAt: '',
    reason: '',
  });

  // Fetch grants
  const { data: grants, isLoading } = useQuery<Grant[]>({
    queryKey: ['/api/iam/grants', urlUserId ? `userId=${urlUserId}` : ''],
  });

  // Fetch users for picker
  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: showCreateModal,
  });

  // Fetch teams for picker
  const { data: teams } = useQuery<Team[]>({
    queryKey: ['/api/iam/teams'],
    enabled: showCreateModal,
  });

  // Create grant mutation
  const createGrantMutation = useMutation({
    mutationFn: async (data: typeof newGrant) => {
      const payload: any = {
        entityType: data.entityType,
        grantType: data.grantType,
        actions: data.actions,
        reason: data.reason || undefined,
      };
      
      if (granteeType === 'user') {
        payload.userId = data.userId;
      } else {
        payload.teamId = data.teamId;
      }
      
      if (data.entityId) payload.entityId = data.entityId;
      if (data.expiresAt) payload.expiresAt = new Date(data.expiresAt).toISOString();
      
      const res = await fetch('/api/iam/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create grant');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/grants'] });
      setShowCreateModal(false);
      resetNewGrant();
      toast({ title: 'Access grant created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create grant', variant: 'destructive' });
    },
  });

  const resetNewGrant = () => {
    setNewGrant({
      userId: '',
      teamId: '',
      entityType: '',
      entityId: '',
      grantType: 'permission',
      actions: [],
      expiresAt: '',
      reason: '',
    });
  };

  const toggleAction = (action: string) => {
    setNewGrant(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isExpiringSoon = (expiresAt?: string) => {
    if (!expiresAt) return false;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const dayInMs = 24 * 60 * 60 * 1000;
    return expiry > now && (expiry.getTime() - now.getTime()) < 7 * dayInMs;
  };

  const filteredGrants = grants?.filter(grant => 
    grant.entityType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    grant.reason?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <h1 className="text-3xl font-bold tracking-tight">Access Grants</h1>
          <p className="text-muted-foreground">
            Direct permission grants to users and teams
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Grant
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search grants by entity type or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Grants Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Grants</CardTitle>
          <CardDescription>
            {filteredGrants?.length ?? 0} grants
            {urlUserId && ' for selected user'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : filteredGrants && filteredGrants.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grantee</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGrants.map((grant) => (
                  <TableRow key={grant.id} className={!grant.isActive || isExpired(grant.expiresAt) ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {grant.userId ? (
                          <User className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Users className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">
                          {grant.userId ? 'User' : 'Team'}: {grant.userId || grant.teamId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{grant.entityType}</Badge>
                      {grant.entityId && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({grant.entityId.slice(0, 8)}...)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {grant.actions.slice(0, 2).map(action => (
                          <Badge key={action} variant="secondary" className="text-xs">
                            {action}
                          </Badge>
                        ))}
                        {grant.actions.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{grant.actions.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={grant.grantType === 'temporary' ? 'outline' : 'default'}>
                        {grant.grantType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {grant.expiresAt ? (
                        <div className="flex items-center gap-1">
                          {isExpired(grant.expiresAt) ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Expired
                            </Badge>
                          ) : isExpiringSoon(grant.expiresAt) ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600 gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(grant.expiresAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              {new Date(grant.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Permanent
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Revoke Grant
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
              <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No active grants</h3>
              <p className="text-muted-foreground mb-4">
                Create grants to give users or teams direct access to resources
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Grant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Grant Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Access Grant</DialogTitle>
            <DialogDescription>
              Grant direct access to a user or team
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={granteeType} onValueChange={(v) => setGranteeType(v as 'user' | 'team')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="user">
                <User className="h-4 w-4 mr-2" />
                User
              </TabsTrigger>
              <TabsTrigger value="team">
                <Users className="h-4 w-4 mr-2" />
                Team
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="user" className="space-y-4 mt-4">
              <div>
                <Label>Select User</Label>
                <Select value={newGrant.userId} onValueChange={(v) => setNewGrant({ ...newGrant, userId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}`
                          : user.username
                        } ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            
            <TabsContent value="team" className="space-y-4 mt-4">
              <div>
                <Label>Select Team</Label>
                <Select value={newGrant.teamId} onValueChange={(v) => setNewGrant({ ...newGrant, teamId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entity Type</Label>
                <Select value={newGrant.entityType} onValueChange={(v) => setNewGrant({ ...newGrant, entityType: v })}>
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
                <Label>Grant Type</Label>
                <Select value={newGrant.grantType} onValueChange={(v) => setNewGrant({ ...newGrant, grantType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Specific Entity ID (Optional)</Label>
                <Input
                  value={newGrant.entityId}
                  onChange={(e) => setNewGrant({ ...newGrant, entityId: e.target.value })}
                  placeholder="Leave empty for all"
                />
              </div>
              <div>
                <Label>Expires At (Optional)</Label>
                <Input
                  type="datetime-local"
                  value={newGrant.expiresAt}
                  onChange={(e) => setNewGrant({ ...newGrant, expiresAt: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <Label>Actions</Label>
              <div className="grid grid-cols-3 gap-2 mt-2 p-3 border rounded-md">
                {ACTIONS.map(action => (
                  <div key={action} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`grant-action-${action}`}
                      checked={newGrant.actions.includes(action)}
                      onCheckedChange={() => toggleAction(action)}
                    />
                    <Label htmlFor={`grant-action-${action}`} className="cursor-pointer text-sm">
                      {action.replace(/_/g, ' ')}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label>Reason</Label>
              <Textarea
                value={newGrant.reason}
                onChange={(e) => setNewGrant({ ...newGrant, reason: e.target.value })}
                placeholder="Why is this access being granted?"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateModal(false);
              resetNewGrant();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => createGrantMutation.mutate(newGrant)}
              disabled={
                (!newGrant.userId && !newGrant.teamId) || 
                !newGrant.entityType || 
                newGrant.actions.length === 0 || 
                createGrantMutation.isPending
              }
            >
              {createGrantMutation.isPending ? 'Creating...' : 'Create Grant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
