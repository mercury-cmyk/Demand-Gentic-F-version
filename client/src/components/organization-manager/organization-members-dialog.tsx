import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Plus, Trash2, Crown, Shield, User, Loader2 } from 'lucide-react';
import type { Organization, OrganizationMember } from './types';

interface OrganizationMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
}

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
};

const ROLE_COLORS = {
  owner: 'bg-amber-100 text-amber-800 border-amber-300',
  admin: 'bg-blue-100 text-blue-800 border-blue-300',
  member: 'bg-gray-100 text-gray-800 border-gray-300',
};

export function OrganizationMembersDialog({
  open,
  onOpenChange,
  organization,
}: OrganizationMembersDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [removingMember, setRemovingMember] = useState<OrganizationMember | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/organizations', organization?.id, 'members'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/organizations/${organization!.id}/members`);
      return res.json() as Promise<{ members: OrganizationMember[] }>;
    },
    enabled: !!organization?.id && open,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { userId: string; role: string }) => {
      const res = await apiRequest('POST', `/api/organizations/${organization!.id}/members`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organization?.id, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: 'Member added', description: 'Member has been added to the organization.' });
      setShowAddForm(false);
      setNewUserId('');
      setNewRole('member');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest('PUT', `/api/organizations/${organization!.id}/members/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organization?.id, 'members'] });
      toast({ title: 'Role updated', description: 'Member role has been updated.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('DELETE', `/api/organizations/${organization!.id}/members/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organization?.id, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      toast({ title: 'Member removed', description: 'Member has been removed from the organization.' });
      setRemovingMember(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      setRemovingMember(null);
    },
  });

  const members = data?.members || [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Members - {organization?.name}</DialogTitle>
            <DialogDescription>
              Manage members and their roles for this organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add Member */}
            {!showAddForm ? (
              <Button size="sm" onClick={() => setShowAddForm(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Member
              </Button>
            ) : (
              <div className="flex items-end gap-3 p-3 rounded-md border bg-muted/30">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">User ID</Label>
                  <Input
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="h-9"
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as any)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={() => addMemberMutation.mutate({ userId: newUserId, role: newRole })}
                  disabled={!newUserId.trim() || addMemberMutation.isPending}
                >
                  {addMemberMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Add'
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Members Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        No members yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => {
                      const RoleIcon = ROLE_ICONS[member.role] || User;
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.user.username}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.user.email || '-'}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={member.role}
                              onValueChange={(role) =>
                                updateRoleMutation.mutate({ userId: member.userId, role })
                              }
                            >
                              <SelectTrigger className="h-8 w-28">
                                <div className="flex items-center gap-1.5">
                                  <RoleIcon className="h-3.5 w-3.5" />
                                  <span className="capitalize">{member.role}</span>
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="owner">Owner</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {member.joinedAt
                              ? new Date(member.joinedAt).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setRemovingMember(member)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!removingMember} onOpenChange={() => setRemovingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removingMember?.user.username} from{' '}
              {organization?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removingMember) {
                  removeMemberMutation.mutate(removingMember.userId);
                }
              }}
            >
              {removeMemberMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
