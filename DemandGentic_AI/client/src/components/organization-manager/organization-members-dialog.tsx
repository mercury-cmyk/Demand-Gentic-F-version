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
  const [newRole, setNewRole] = useState('member');
  const [removingMember, setRemovingMember] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/organizations', organization?.id, 'members'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/organizations/${organization!.id}/members`);
      return res.json() as Promise;
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
      
        
          
            Members - {organization?.name}
            
              Manage members and their roles for this organization.
            
          

          
            {/* Add Member */}
            {!showAddForm ? (
               setShowAddForm(true)}>
                 Add Member
              
            ) : (
              
                
                  User ID
                   setNewUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="h-9"
                  />
                
                
                  Role
                   setNewRole(v as any)}>
                    
                      
                    
                    
                      Member
                      Admin
                      Owner
                    
                  
                
                 addMemberMutation.mutate({ userId: newUserId, role: newRole })}
                  disabled={!newUserId.trim() || addMemberMutation.isPending}
                >
                  {addMemberMutation.isPending ? (
                    
                  ) : (
                    'Add'
                  )}
                
                 setShowAddForm(false)}>
                  Cancel
                
              
            )}

            {/* Members Table */}
            
              
                
                  
                    User
                    Email
                    Role
                    Joined
                    Actions
                  
                
                
                  {isLoading ? (
                    
                      
                        
                      
                    
                  ) : members.length === 0 ? (
                    
                      
                        No members yet
                      
                    
                  ) : (
                    members.map((member) => {
                      const RoleIcon = ROLE_ICONS[member.role] || User;
                      return (
                        
                          {member.user.username}
                          
                            {member.user.email || '-'}
                          
                          
                            
                                updateRoleMutation.mutate({ userId: member.userId, role })
                              }
                            >
                              
                                
                                  
                                  {member.role}
                                
                              
                              
                                Member
                                Admin
                                Owner
                              
                            
                          
                          
                            {member.joinedAt
                              ? new Date(member.joinedAt).toLocaleDateString()
                              : '-'}
                          
                          
                             setRemovingMember(member)}
                            >
                              
                            
                          
                        
                      );
                    })
                  )}
                
              
            
          

          
             onOpenChange(false)}>
              Close
            
          
        
      

      {/* Remove Member Confirmation */}
       setRemovingMember(null)}>
        
          
            Remove Member
            
              Are you sure you want to remove {removingMember?.user.username} from{' '}
              {organization?.name}? This action cannot be undone.
            
          
          
            Cancel
             {
                if (removingMember) {
                  removeMemberMutation.mutate(removingMember.userId);
                }
              }}
            >
              {removeMemberMutation.isPending ? (
                
              ) : null}
              Remove
            
          
        
      
    
  );
}