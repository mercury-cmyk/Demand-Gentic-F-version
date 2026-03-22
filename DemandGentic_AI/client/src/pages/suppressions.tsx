import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Mail, Phone, Upload, Trash2, Loader2, RefreshCw, TrendingUp, Filter, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  type SuppressionEmail, 
  type SuppressionPhone,
  type InsertSuppressionEmail,
  type InsertSuppressionPhone,
  insertSuppressionEmailSchema,
  insertSuppressionPhoneSchema
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import type { FilterGroup } from "@shared/filter-types";

export default function SuppressionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterGroup, setFilterGroup] = useState(undefined);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Check if user has permission to manage suppressions
  const userRoles = (user as any)?.roles || [user?.role];
  const canManageSuppressions = userRoles.includes('admin') || userRoles.includes('data_ops');

  // Fetch email suppressions with auto-refresh
  const { data: emailSuppressions = [], isLoading: emailLoading, isFetching: emailFetching, refetch: refetchEmails } = useQuery({
    queryKey: ['/api/suppressions/email'],
    refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30 seconds
  });

  // Fetch phone suppressions with auto-refresh
  const { data: phoneSuppressions = [], isLoading: phoneLoading, isFetching: phoneFetching, refetch: refetchPhones } = useQuery({
    queryKey: ['/api/suppressions/phone'],
    refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30 seconds
  });

  // Calculate statistics
  const emailStats = {
    total: emailSuppressions.length,
    today: emailSuppressions.filter(s => {
      const today = new Date();
      const created = new Date(s.createdAt);
      return created.toDateString() === today.toDateString();
    }).length,
    thisWeek: emailSuppressions.filter(s => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(s.createdAt) >= weekAgo;
    }).length,
  };

  const phoneStats = {
    total: phoneSuppressions.length,
    today: phoneSuppressions.filter(s => {
      const today = new Date();
      const created = new Date(s.createdAt);
      return created.toDateString() === today.toDateString();
    }).length,
    thisWeek: phoneSuppressions.filter(s => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(s.createdAt) >= weekAgo;
    }).length,
  };

  // Email suppression form
  const emailForm = useForm({
    resolver: zodResolver(insertSuppressionEmailSchema),
    defaultValues: {
      email: "",
      reason: undefined,
      source: undefined,
    },
  });

  // Phone suppression form
  const phoneForm = useForm({
    resolver: zodResolver(insertSuppressionPhoneSchema),
    defaultValues: {
      phoneE164: "",
      reason: undefined,
      source: undefined,
    },
  });

  // Create email suppression
  const createEmailSuppression = useMutation({
    mutationFn: async (data: InsertSuppressionEmail) => {
      return await apiRequest('POST', '/api/suppressions/email', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppressions/email'], refetchType: 'active' });
      setEmailDialogOpen(false);
      emailForm.reset();
      toast({
        title: "Success",
        description: "Email added to suppression list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add email suppression",
        variant: "destructive",
      });
    },
  });

  // Create phone suppression
  const createPhoneSuppression = useMutation({
    mutationFn: async (data: InsertSuppressionPhone) => {
      return await apiRequest('POST', '/api/suppressions/phone', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppressions/phone'], refetchType: 'active' });
      setPhoneDialogOpen(false);
      phoneForm.reset();
      toast({
        title: "Success",
        description: "Phone number added to DNC list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add phone suppression",
        variant: "destructive",
      });
    },
  });

  // Delete email suppression
  const deleteEmailSuppression = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/suppressions/email/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppressions/email'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Email removed from suppression list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove email suppression",
        variant: "destructive",
      });
    },
  });

  // Delete phone suppression
  const deletePhoneSuppression = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/suppressions/phone/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/suppressions/phone'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Phone number removed from DNC list",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove phone suppression",
        variant: "destructive",
      });
    },
  });

  const filteredEmailSuppressions = emailSuppressions.filter((s) =>
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPhoneSuppressions = phoneSuppressions.filter((s) =>
    s.phoneE164.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Manual refresh
  const handleRefresh = () => {
    refetchEmails();
    refetchPhones();
    toast({
      title: "Refreshed",
      description: "Suppression lists updated",
    });
  };

  return (
    
      
      
        
          
            
              Global DNC & Unsubscribe Management
              
                Real-time tracking and management of DNC lists and email unsubscribes for compliance
              
            
            
               setAutoRefresh(!autoRefresh)}
                data-testid="button-toggle-auto-refresh"
              >
                
                Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
              
              
                
                Refresh Now
              
            
          

          {/* Active Filters Badge */}
          {filterGroup && filterGroup.filters.length > 0 && (
            
              
                
                {filterGroup.filters.length} filter{filterGroup.filters.length !== 1 ? 's' : ''} active
              
               setFilterGroup(undefined)}
                className="h-6 px-2 text-xs"
              >
                
                Clear
              
            
          )}

          {/* Real-time Statistics Dashboard */}
      
        
          
            Email Suppressions
            
          
          
            {emailStats.total}
            
              
                
                {emailStats.today} today
              
              
                {emailStats.thisWeek} this week
              
            
          
        

        
          
            Phone DNC List
            
          
          
            {phoneStats.total}
            
              
                
                {phoneStats.today} today
              
              
                {phoneStats.thisWeek} this week
              
            
          
        
      

      
        
          
            
            Email Unsubscribes
          
          
            
            DNC (Phone)
          
        

        
          
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-email-suppressions"
              />
            
            {canManageSuppressions && (
              
                
                  
                  Import
                
                 setEmailDialogOpen(true)}
                  data-testid="button-add-email-suppression"
                >
                  
                  Add Email
                
              
            )}
          

          {emailLoading ? (
            
              
              
              
            
          ) : filteredEmailSuppressions.length > 0 ? (
            
              
                
                  
                    Email
                    Reason
                    Source
                    Date Added
                    {canManageSuppressions && Actions}
                  
                
                
                  {filteredEmailSuppressions.map((suppression) => (
                    
                      
                        {suppression.email}
                      
                      
                        {suppression.reason || "N/A"}
                      
                      
                        {suppression.source || "N/A"}
                      
                      
                        {format(new Date(suppression.createdAt), 'MMM d, yyyy')}
                      
                      {canManageSuppressions && (
                        
                           deleteEmailSuppression.mutate(suppression.id)}
                            disabled={deleteEmailSuppression.isPending}
                            data-testid={`button-remove-email-${suppression.id}`}
                          >
                            {deleteEmailSuppression.isPending ? (
                              
                            ) : (
                              
                            )}
                          
                        
                      )}
                    
                  ))}
                
              
            
          ) : (
             setEmailDialogOpen(true) : undefined}
            />
          )}
        

        
          
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-phone-suppressions"
              />
            
            {canManageSuppressions && (
              
                
                  
                  Import
                
                 setPhoneDialogOpen(true)}
                  data-testid="button-add-phone-suppression"
                >
                  
                  Add Phone
                
              
            )}
          

          {phoneLoading ? (
            
              
              
              
            
          ) : filteredPhoneSuppressions.length > 0 ? (
            
              
                
                  
                    Phone Number
                    Reason
                    Source
                    Date Added
                    {canManageSuppressions && Actions}
                  
                
                
                  {filteredPhoneSuppressions.map((suppression) => (
                    
                      
                        {suppression.phoneE164}
                      
                      
                        {suppression.reason || "N/A"}
                      
                      
                        {suppression.source || "N/A"}
                      
                      
                        {format(new Date(suppression.createdAt), 'MMM d, yyyy')}
                      
                      {canManageSuppressions && (
                        
                           deletePhoneSuppression.mutate(suppression.id)}
                            disabled={deletePhoneSuppression.isPending}
                            data-testid={`button-remove-phone-${suppression.id}`}
                          >
                            {deletePhoneSuppression.isPending ? (
                              
                            ) : (
                              
                          )}
                          
                        
                      )}
                    
                  ))}
                
              
            
          ) : (
             setPhoneDialogOpen(true) : undefined}
            />
          )}
        
      

      {/* Add Email Suppression Dialog */}
      
        
          
            Add Email Suppression
            
              Add an email address to the suppression list. This email will be excluded from all campaigns.
            
          
          
             createEmailSuppression.mutate(data))} className="space-y-4">
               (
                  
                    Email Address
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Reason (Optional)
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Source (Optional)
                    
                      
                    
                    
                  
                )}
              />
              
                 setEmailDialogOpen(false)}
                  data-testid="button-cancel-email"
                >
                  Cancel
                
                
                  {createEmailSuppression.isPending && (
                    
                  )}
                  Add Email
                
              
            
          
        
      

      {/* Add Phone Suppression Dialog */}
      
        
          
            Add Phone to DNC List
            
              Add a phone number to the Do Not Call list. This number will be excluded from all telemarketing campaigns.
            
          
          
             createPhoneSuppression.mutate(data))} className="space-y-4">
               (
                  
                    Phone Number (E.164 format)
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Reason (Optional)
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Source (Optional)
                    
                      
                    
                    
                  
                )}
              />
              
                 setPhoneDialogOpen(false)}
                  data-testid="button-cancel-phone"
                >
                  Cancel
                
                
                  {createPhoneSuppression.isPending && (
                    
                  )}
                  Add Phone
                
              
            
          
        
      
        
      
    
  );
}