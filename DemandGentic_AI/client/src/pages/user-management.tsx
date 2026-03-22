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
import type { User as UserType } from "@shared/schema";

type UserWithRoles = Omit & { roles?: string[] };

const AVAILABLE_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'agent', label: 'Agent' },
  { value: 'quality_analyst', label: 'Quality Analyst' },
  { value: 'content_creator', label: 'Content Creator' },
  { value: 'campaign_manager', label: 'Campaign Manager' },
  { value: 'data_ops', label: 'Data Ops' },
  { value: 'voice_trainer', label: 'Voice Trainer' },
];

export default function UserManagementPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Form state
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState(['agent']);

  const { data: users, isLoading } = useQuery({
    queryKey: ['/api/users'],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/users', data);
      return await response.json();
    },
    onSuccess: async (user: any) => {
      // After creating user, assign roles
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
      // After updating user, update roles
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
      // Editing existing user - validate fields
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

      // Update existing user
      const data: any = {
        username,
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null,
      };
      
      // Only include password if it's provided
      if (password) {
        data.password = password;
      }

      updateUserMutation.mutate({
        userId: editingUser.id,
        data,
      });
    } else {
      // Creating new user - validate all required fields
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

      // Create new user
      const data = {
        username,
        email: email || undefined,
        password,
        firstName,
        lastName,
        role: selectedRoles[0] || 'agent', // Legacy role field
      };
      createUserMutation.mutate(data);
    }
  };

  const toggleRole = (roleValue: string) => {
    setSelectedRoles(prev => {
      if (prev.includes(roleValue)) {
        return prev.filter(r => r !== roleValue);
      }
      // voice_trainer is exclusive — selecting it clears other roles
      if (roleValue === 'voice_trainer') return ['voice_trainer'];
      // Selecting another role deselects voice_trainer
      return [...prev.filter(r => r !== 'voice_trainer'), roleValue];
    });
  };

  const getRoleBadgeVariant = (userRole: string) => {
    switch (userRole) {
      case 'admin':
        return 'destructive';
      case 'campaign_manager':
        return 'default';
      case 'quality_analyst':
        return 'secondary';
      case 'content_creator':
        return 'outline';
      case 'agent':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (userRole: string) => {
    const role = AVAILABLE_ROLES.find(r => r.value === userRole);
    return role?.label || userRole;
  };

  return (
    
      
        
          User Management
          
            Manage users and assign multiple roles
          
        
         {
          if (!open) resetForm();
          setDialogOpen(open);
        }}>
          
            
              
              Add User
            
          
          
            
              {editingUser ? 'Edit User' : 'Create User'}
              
                {editingUser ? `Update details for ${editingUser.username}` : 'Add a new user to the system'}
              
            
            
              {editingUser && (
                
                  Leave password blank to keep current password
                
              )}
              <>
                
                  Username *
                   setUsername(e.target.value)}
                    placeholder="john.doe"
                  />
                
                
                  
                    First Name *
                     setFirstName(e.target.value)}
                      placeholder="John"
                    />
                  
                  
                    Last Name *
                     setLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  
                
                
                  Email (optional)
                   setEmail(e.target.value)}
                    placeholder="john.doe@company.com"
                  />
                
                
                  Password {editingUser ? '(optional)' : '*'}
                   setPassword(e.target.value)}
                    placeholder={editingUser ? "Leave blank to keep current" : "••••••••"}
                  />
                
              
              
              
                Roles *
                
                  {AVAILABLE_ROLES.map((role) => (
                    
                       toggleRole(role.value)}
                      />
                      
                        {role.label}
                      
                    
                  ))}
                
                
                  Select one or more roles to assign to this user
                
              
            
            
               setDialogOpen(false)} data-testid="button-cancel">
                Cancel
              
              
                {(createUserMutation.isPending || updateUserMutation.isPending) ? 'Saving...' : (editingUser ? 'Update User' : 'Create User')}
              
            
          
        
      

      
        
          System Users
          
            All users with access to the system
          
        
        
          {isLoading ? (
            
              Loading users...
            
          ) : (
            
              
                
                  Username
                  Name
                  Email
                  Roles
                  Created
                  Actions
                
              
              
                {!users || users.length === 0 ? (
                  
                    
                      No users found
                    
                  
                ) : (
                  users.map((user) => (
                    
                      
                        
                          
                          {user.username}
                        
                      
                      
                        {user.firstName || user.lastName
                          ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                          : '-'}
                      
                      {user.email}
                      
                        
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              
                                {getRoleLabel(role)}
                              
                            ))
                          ) : (
                            
                              {getRoleLabel(user.role)}
                            
                          )}
                        
                      
                      
                        {new Date(user.createdAt).toLocaleDateString()}
                      
                      
                        
                           {
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
                            
                          
                           {
                              if (confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
                                deleteUserMutation.mutate(user.id);
                              }
                            }}
                          >
                            
                          
                        
                      
                    
                  ))
                )}
              
            
          )}
        
      

      
        
          Role Permissions
          
            Overview of what each role can access
          
        
        
          
            
              Admin
              
                Full system access, user management, all settings and configurations
              
            
            
              Campaign Manager
              
                Create and manage campaigns, access contacts and accounts, view reports
              
            
            
              Quality Analyst
              
                Review and approve leads, access quality assurance tools
              
            
            
              Content Creator
              
                Create and manage content assets, social posts, and marketing materials
              
            
            
              Agent
              
                Access agent console, make calls, view assigned queue
              
            
          
        
      
    
  );
}