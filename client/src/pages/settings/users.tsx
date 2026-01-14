/**
 * Users & Roles Settings Page
 *
 * User management within the Settings Hub.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsLayout } from "@/components/settings/settings-layout";
import type { User as UserType } from "@shared/schema";

type UserWithRoles = Omit<UserType, 'password'> & { roles?: string[] };

const AVAILABLE_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'agent', label: 'Agent' },
  { value: 'quality_analyst', label: 'Quality Analyst' },
  { value: 'content_creator', label: 'Content Creator' },
  { value: 'campaign_manager', label: 'Campaign Manager' },
];

export default function UsersSettingsPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);

  // Form state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['agent']);

  const { data: users, isLoading } = useQuery<UserWithRoles[]>({
    queryKey: ['/api/users'],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/users', data);
      return await response.json();
    },
    onSuccess: async (user: any) => {
      if (selectedRoles.length > 0 && user.id) {
        try {
          await apiRequest('PUT', `/api/users/${user.id}/roles`, { roles: selectedRoles });
        } catch (error) {
          console.error('Failed to assign roles:', error);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      resetForm();
      setDialogOpen(false);
      toast({
        title: "Success",
        description: "User created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const response = await apiRequest('PUT', `/api/users/${userId}`, data);
      return await response.json();
    },
    onSuccess: async (user: any) => {
      if (editingUser && selectedRoles.length > 0) {
        try {
          await apiRequest('PUT', `/api/users/${user.id}/roles`, { roles: selectedRoles });
        } catch (error) {
          console.error('Failed to update roles:', error);
          toast({
            variant: "destructive",
            title: "Partial Success",
            description: "User details updated but roles update failed. Please try updating roles again.",
          });
          queryClient.invalidateQueries({ queryKey: ['/api/users'] });
          resetForm();
          setDialogOpen(false);
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      resetForm();
      setDialogOpen(false);
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('DELETE', `/api/users/${userId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setSelectedRoles(['agent']);
    setEditingUser(null);
  };

  const handleSaveUser = () => {
    if (editingUser) {
      if (!username) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Username is required",
        });
        return;
      }

      if (selectedRoles.length === 0) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Please select at least one role",
        });
        return;
      }

      const data: any = {
        username,
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null,
      };

      if (password) {
        data.password = password;
      }

      updateUserMutation.mutate({
        userId: editingUser.id,
        data,
      });
    } else {
      if (!username || !password || !firstName || !lastName) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Username, password, first name, and last name are required",
        });
        return;
      }

      if (selectedRoles.length === 0) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Please select at least one role",
        });
        return;
      }

      const data = {
        username,
        email: email || undefined,
        password,
        firstName,
        lastName,
        role: selectedRoles[0] || 'agent',
      };
      createUserMutation.mutate(data);
    }
  };

  const toggleRole = (roleValue: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleValue)
        ? prev.filter(r => r !== roleValue)
        : [...prev, roleValue]
    );
  };

  const getRoleBadgeVariant = (userRole: string) => {
    switch (userRole) {
      case 'admin':
        return 'destructive';
      case 'campaign_manager':
        return 'default';
      case 'quality_analyst':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (userRole: string) => {
    const role = AVAILABLE_ROLES.find(r => r.value === userRole);
    return role?.label || userRole;
  };

  return (
    <SettingsLayout
      title="Users & Roles"
      description="Manage users and assign multiple roles"
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            if (!open) resetForm();
            setDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
                <DialogDescription>
                  {editingUser ? `Update details for ${editingUser.username}` : 'Add a new user to the system'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {editingUser && (
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <p className="text-muted-foreground">Leave password blank to keep current password</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Username *</Label>
                  <Input
                    data-testid="input-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="john.doe"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input
                      data-testid="input-firstname"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input
                      data-testid="input-lastname"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email (optional)</Label>
                  <Input
                    data-testid="input-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john.doe@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password {editingUser ? '(optional)' : '*'}</Label>
                  <Input
                    data-testid="input-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingUser ? "Leave blank to keep current" : "••••••••"}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Roles *</Label>
                  <div className="space-y-2 border rounded-md p-3">
                    {AVAILABLE_ROLES.map((role) => (
                      <div key={role.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`role-${role.value}`}
                          data-testid={`checkbox-role-${role.value}`}
                          checked={selectedRoles.includes(role.value)}
                          onCheckedChange={() => toggleRole(role.value)}
                        />
                        <label
                          htmlFor={`role-${role.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {role.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select one or more roles to assign to this user
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveUser}
                  disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  data-testid="button-save-user"
                >
                  {(createUserMutation.isPending || updateUserMutation.isPending) ? 'Saving...' : (editingUser ? 'Update User' : 'Create User')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Users</CardTitle>
            <CardDescription>
              All users with access to the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading users...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!users || users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {user.username}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.firstName || user.lastName
                            ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                            : '-'}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {user.roles && user.roles.length > 0 ? (
                              user.roles.map((role) => (
                                <Badge key={role} variant={getRoleBadgeVariant(role)} data-testid={`badge-role-${role}`}>
                                  {getRoleLabel(role)}
                                </Badge>
                              ))
                            ) : (
                              <Badge variant={getRoleBadgeVariant(user.role)}>
                                {getRoleLabel(user.role)}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-edit-user-${user.id}`}
                              onClick={() => {
                                setEditingUser(user);
                                setUsername(user.username);
                                setEmail(user.email);
                                setFirstName(user.firstName || '');
                                setLastName(user.lastName || '');
                                setPassword('');
                                setSelectedRoles(user.roles || [user.role]);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-delete-user-${user.id}`}
                              disabled={user.id === currentUser?.id}
                              title={user.id === currentUser?.id ? "Cannot delete your own account" : "Delete user"}
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
                                  deleteUserMutation.mutate(user.id);
                                }
                              }}
                            >
                              <Trash2 className={`h-4 w-4 ${user.id === currentUser?.id ? 'text-muted-foreground' : 'text-red-500'}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Permissions</CardTitle>
            <CardDescription>
              Overview of what each role can access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Badge variant="destructive">Admin</Badge>
                <p className="text-sm text-muted-foreground">
                  Full system access, user management, all settings and configurations
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Badge>Campaign Manager</Badge>
                <p className="text-sm text-muted-foreground">
                  Create and manage campaigns, access contacts and accounts, view reports
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="secondary">Quality Analyst</Badge>
                <p className="text-sm text-muted-foreground">
                  Review and approve leads, access quality assurance tools
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline">Content Creator</Badge>
                <p className="text-sm text-muted-foreground">
                  Create and manage content assets, social posts, and marketing materials
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline">Agent</Badge>
                <p className="text-sm text-muted-foreground">
                  Access agent console, make calls, view assigned queue
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
