import { useState, useEffect as React_useEffect } from "react";
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Download, Upload, Building2, Trash2, LayoutGrid, List, Zap, TrendingUp, Users, Globe, BarChart3, ArrowUpRight } from "lucide-react";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import { BulkActionsToolbar } from "@/components/bulk-actions-toolbar";
import { BulkUpdateDialog } from "@/components/bulk-update-dialog";
import { AddToListDialog } from "@/components/add-to-list-dialog";
import { useSelection } from "@/hooks/use-selection";
import type { FilterGroup } from "@shared/filter-types";
import { exportAccountsToCSV, downloadCSV, generateAccountsTemplate } from "@/lib/csv-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAccountSchema, type InsertAccount, type Account, REVENUE_RANGE_VALUES, STAFF_COUNT_RANGE_VALUES } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CSVImportAccountsDialog } from "@/components/csv-import-accounts-dialog";
import { AccountCardPremium } from "@/components/accounts/account-card-premium";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { formatRevenue } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export default function AccountsPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [addToListDialogOpen, setAddToListDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState("cards");
  const [filterGroup, setFilterGroup] = useState(() => {
    // Check if there's a filter in sessionStorage
    const savedFilter = sessionStorage.getItem('accountsFilter');
    if (savedFilter) {
      sessionStorage.removeItem('accountsFilter'); // Clear after reading
      try {
        return JSON.parse(savedFilter);
      } catch {
        return undefined;
      }
    }
    return undefined;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 50;

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['/api/accounts', filterGroup],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const params = new URLSearchParams();
      if (filterGroup) {
        params.set('filters', JSON.stringify(filterGroup));
      }
      const response = await fetch(`/api/accounts?${params.toString()}`, {
        headers,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return response.json();
    },
  });

  const createForm = useForm({
    resolver: zodResolver(insertAccountSchema),
    defaultValues: {
      name: "",
      domain: "",
      industryStandardized: "",
      employeesSizeRange: undefined,
      revenueRange: undefined,
      annualRevenue: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertAccount) => {
      await apiRequest('POST', '/api/accounts', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      setCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Success",
        description: "Account created successfully",
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      toast({
        title: "Success",
        description: "Account deleted successfully",
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

  const filteredAccounts = accounts?.filter(account =>
    searchQuery === "" ||
    account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.domain?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    account.industryStandardized?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  const totalAccounts = accounts?.length ?? 0;
  const filteredCount = filteredAccounts.length;
  const activeFilterCount = filterGroup?.conditions.length ?? 0;

  // Pagination calculations
  const totalPages = Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);

  // Reset to page 1 when search or filter changes
  React.useEffect(() => {
    setCurrentPage(1);
    setSelectAllPages(false);
  }, [searchQuery, filterGroup]);

  const {
    selectedIds,
    selectedCount,
    selectItem,
    selectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected,
  } = useSelection(selectAllPages ? filteredAccounts : paginatedAccounts);

  // Handle select all pages toggle
  const handleSelectAllPages = () => {
    if (selectAllPages) {
      setSelectAllPages(false);
      clearSelection();
    } else {
      setSelectAllPages(true);
      // Select all filtered accounts across all pages
      clearSelection();
      filteredAccounts.forEach(account => selectItem(account.id));
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest('DELETE', `/api/accounts/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Deleted ${selectedCount} accounts`,
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

  const handleBulkExport = () => {
    const selectedAccounts = filteredAccounts.filter(a => selectedIds.includes(a.id));
    const csv = exportAccountsToCSV(selectedAccounts);
    downloadCSV(csv, `accounts_bulk_export_${new Date().toISOString().split('T')[0]}.csv`);
    toast({
      title: "Export Complete",
      description: `Exported ${selectedCount} accounts to CSV`,
    });
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} accounts? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      await Promise.all(
        selectedIds.map(id =>
          apiRequest('PATCH', `/api/accounts/${id}`, { [field]: value })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Updated ${selectedCount} accounts`,
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

  const addToListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const response = await apiRequest('POST', `/api/lists/${listId}/accounts`, {
        accountIds: selectedIds,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Added ${selectedCount} accounts to list`,
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

  const createListMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const list = await apiRequest('POST', '/api/lists', {
        name,
        description,
        entityType: 'account',
        sourceType: 'selection',
        recordIds: selectedIds,
      });
      return list.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Created list and added ${selectedCount} accounts`,
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

  return (
    
      
      
        
          {/* Header Section */}
          
             
                
                  Client Management
                
                
                  Manage your accounts, track revenue, and monitor growth.
                
             
             
                   {
                        const csv = exportAccountsToCSV(filteredAccounts);
                        downloadCSV(csv, `accounts_export_${new Date().toISOString().split('T')[0]}.csv`);
                        toast({
                          title: "Export Complete",
                          description: `Exported ${filteredAccounts.length} accounts to CSV`,
                        });
                      }}
                    >
                      
                      Export
                    
                     setImportDialogOpen(true)}
                    >
                      
                      Import
                    
                     setCreateDialogOpen(true)}
                    >
                      
                      New Account
                    
             
          

          {/* Stats Overview */}
          
             
                
                    
                        Total Accounts
                        
                            
                        
                    
                    
                         {totalAccounts}
                         Active clients
                    
                
            
            
                
                    
                        New This Month
                        
                            
                        
                    
                    
                         {accounts?.filter(a => new Date(a.createdAt).getMonth() === new Date().getMonth()).length || 0}
                         
                            
                            Growing
                         
                    
                
            
            
                
                    
                        Top Industry
                        
                            
                        
                    
                    
                         Technology
                         Most common sector
                    
                
            
            
                
                    
                        Avg Revenue
                        
                            
                        
                    
                    
                         $2.4M
                         Est. annual revenue
                    
                
            
          

          
            
              
                
                  
                    All Accounts
                    View and manage your client list.
                  
                  
                      
                        
                          Create Account
                          
                            Add a new B2B account to your database
                          
                        
                        
                           createMutation.mutate(data))} className="space-y-4">
                             (
                                
                                  Company Name
                                  
                                    
                                  
                                  
                                
                              )}
                            />
                             (
                                
                                  Domain
                                  
                                    
                                  
                                  
                                
                              )}
                            />
                             (
                                
                                  Industry
                                  
                                    
                                  
                                  
                                
                              )}
                            />
                            
                               (
                                  
                                    Staff Count Range
                                    
                                      
                                        
                                          
                                        
                                      
                                      
                                        {STAFF_COUNT_RANGE_VALUES.map((value) => (
                                          
                                            {value}
                                          
                                        ))}
                                      
                                    
                                    
                                  
                                )}
                              />
                               (
                                  
                                    Revenue Range
                                    
                                      
                                        
                                          
                                        
                                      
                                      
                                        {REVENUE_RANGE_VALUES.map((value) => (
                                          
                                            {value}
                                          
                                        ))}
                                      
                                    
                                    
                                  
                                )}
                              />
                            
                            
                              
                                {createMutation.isPending ? "Creating..." : "Create Account"}
                              
                            
                          
                        
                      
                    
                

                
                  
                    
                     setSearchQuery(e.target.value)}
                      data-testid="input-search-accounts"
                    />
                  
                  
                     setViewMode(v as "table" | "cards")} className="flex-shrink-0">
                      
                        
                          
                          Cards
                        
                        
                          
                          Table
                        
                      
                    
                    {viewMode === "cards" && paginatedAccounts.length > 0 && (
                      
                         isAllSelected ? clearSelection() : selectAll()}
                          aria-label="Select all on page"
                          data-testid="checkbox-select-all-cards"
                        />
                        Select all
                      
                    )}
                    {filterGroup && (
                       setFilterGroup(undefined)}
                        data-testid="button-clear-filters"
                      >
                        
                        Clear Filters ({filterGroup.conditions.length})
                      
                    )}
                  
                
              
            
          

          {selectedCount > 0 && (
        
          
            
              
                
                  {selectAllPages 
                    ? `All ${selectedCount} accounts selected across all pages` 
                    : `${selectedCount} account${selectedCount !== 1 ? 's' : ''} selected on this page`}
                
                {!selectAllPages && filteredAccounts.length > paginatedAccounts.length && (
                  
                    Select all {filteredAccounts.length} accounts across all pages
                  
                )}
              
            
            
              {user?.role !== 'agent' && (
                
                  
                  Export
                
              )}
               setBulkUpdateDialogOpen(true)}>
                Update
              
               setAddToListDialogOpen(true)}>
                Add to List
              
              
                
                Delete
              
               { clearSelection(); setSelectAllPages(false); }}>
                Clear
              
            
          
        
      )}

      {isLoading ? (
        viewMode === "cards" ? (
          
            {[1, 2, 3, 4, 5, 6].map((i) => (
              
                
                  
                    
                    
                      
                      
                    
                  
                  
                    
                    
                  
                
              
            ))}
          
        ) : (
          
            
              
                
                  
                    
                  
                  Account Name
                  Domain
                  Industry
                  Employees
                  Revenue
                  Actions
                
              
              
                {[1, 2, 3].map((i) => (
                  
                    
                    
                    
                    
                    
                    
                    
                  
                ))}
              
            
          
        )
      ) : filteredAccounts.length > 0 ? (
        <>
          {viewMode === "cards" ? (
            
              {paginatedAccounts.map((account, index) => (
                 setLocation(`/accounts/${id}`)}
                  index={index}
                  isSelected={isSelected(account.id)}
                  onToggleSelect={selectItem}
                />
              ))}
            
          ) : (
            
              
              
                
                  
                     isAllSelected ? clearSelection() : selectAll()}
                      aria-label="Select all on page"
                      data-testid="checkbox-select-all"
                    />
                  
                  Account Name
                  Domain
                  Industry
                  Employees
                  Revenue
                  Actions
                
              
              
                {paginatedAccounts.map((account) => (
                 setLocation(`/accounts/${account.id}`)}
                  data-testid={`row-account-${account.id}`}
                >
                   e.stopPropagation()}>
                     selectItem(account.id)}
                      aria-label={`Select ${account.name}`}
                      data-testid={`checkbox-account-${account.id}`}
                    />
                  
                  
                    
                      
                        
                      
                      {account.name}
                    
                  
                  {account.domain || "-"}
                  
                    {account.industryStandardized ? (
                      {account.industryStandardized}
                    ) : "-"}
                  
                  {account.employeesSizeRange || "-"}
                  
                    {account.annualRevenue ? formatRevenue(account.annualRevenue) : "-"}
                  
                  
                    
                       {
                          e.stopPropagation();
                          setLocation(`/accounts/${account.id}`);
                        }}
                        data-testid={`button-view-account-${account.id}`}
                      >
                        View
                      
                       {
                          e.stopPropagation();
                          deleteMutation.mutate(account.id);
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-account-${account.id}`}
                      >
                        
                      
                    
                  
                
              ))}
              
            
          
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            
              
                Showing {startIndex + 1} to {Math.min(endIndex, filteredAccounts.length)} of {filteredAccounts.length} accounts
              
              
                 setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                

                
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages = totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                       setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      
                    );
                  })}
                

                 setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                
              
            
          )}
        
      ) : (
         setCreateDialogOpen(true) : undefined}
        />
      )}

       {
          queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
        }}
      />

      {/* Bulk Update Dialog */}
       bulkUpdateMutation.mutate({ field, value })}
      />

      {/* Add to List Dialog */}
       addToListMutation.mutate(listId)}
        onCreateList={(name, description) => createListMutation.mutate({ name, description })}
      />
        
      
    
  );
}