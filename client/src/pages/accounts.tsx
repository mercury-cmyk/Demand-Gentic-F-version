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
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [addToListDialogOpen, setAddToListDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(() => {
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

  const { data: accounts, isLoading } = useQuery<Account[]>({
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

  const createForm = useForm<InsertAccount>({
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
    <div className="flex min-h-screen flex-col xl:flex-row overflow-hidden">
      <SidebarFilters
        entityType="account"
        onApplyFilter={setFilterGroup}
        initialFilter={filterGroup}
      />
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
             <div>
                <h1 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
                  Client Management
                </h1>
                <p className="text-slate-500 mt-1">
                  Manage your accounts, track revenue, and monitor growth.
                </p>
             </div>
             <div className="flex items-center gap-3">
                  <Button
                      variant="outline"
                      className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                      onClick={() => {
                        const csv = exportAccountsToCSV(filteredAccounts);
                        downloadCSV(csv, `accounts_export_${new Date().toISOString().split('T')[0]}.csv`);
                        toast({
                          title: "Export Complete",
                          description: `Exported ${filteredAccounts.length} accounts to CSV`,
                        });
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                      onClick={() => setImportDialogOpen(true)}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Import
                    </Button>
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New Account
                    </Button>
             </div>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
             <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-sm font-medium text-slate-500">Total Accounts</p>
                        <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                            <Building2 className="h-4 w-4" />
                        </div>
                    </div>
                    <div>
                         <h3 className="text-2xl font-semibold text-slate-900">{totalAccounts}</h3>
                         <p className="text-xs text-slate-400 mt-1">Active clients</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-sm font-medium text-slate-500">New This Month</p>
                        <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                            <TrendingUp className="h-4 w-4" />
                        </div>
                    </div>
                    <div>
                         <h3 className="text-2xl font-semibold text-slate-900">{accounts?.filter(a => new Date(a.createdAt).getMonth() === new Date().getMonth()).length || 0}</h3>
                         <div className="flex items-center mt-1 text-xs text-emerald-600 font-medium">
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                            <span>Growing</span>
                         </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-sm font-medium text-slate-500">Top Industry</p>
                        <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                            <Globe className="h-4 w-4" />
                        </div>
                    </div>
                    <div>
                         <h3 className="text-2xl font-semibold text-slate-900 truncate">Technology</h3>
                         <p className="text-xs text-slate-400 mt-1">Most common sector</p>
                    </div>
                </CardContent>
            </Card>
            <Card className="shadow-sm border-slate-200 bg-white">
                <CardContent className="p-5 flex flex-col justify-between h-full">
                    <div className="flex justify-between items-start">
                        <p className="text-sm font-medium text-slate-500">Avg Revenue</p>
                        <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
                            <BarChart3 className="h-4 w-4" />
                        </div>
                    </div>
                    <div>
                         <h3 className="text-2xl font-semibold text-slate-900">$2.4M</h3>
                         <p className="text-xs text-slate-400 mt-1">Est. annual revenue</p>
                    </div>
                </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">All Accounts</h2>
                    <p className="text-sm text-slate-500">View and manage your client list.</p>
                  </div>
                  <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle>Create Account</DialogTitle>
                          <DialogDescription>
                            Add a new B2B account to your database
                          </DialogDescription>
                        </DialogHeader>
                        <Form {...createForm}>
                          <form onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                            <FormField
                              control={createForm.control}
                              name="name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Company Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Acme Corporation" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={createForm.control}
                              name="domain"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Domain</FormLabel>
                                  <FormControl>
                                    <Input placeholder="acme.com" {...field} value={field.value || ""} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={createForm.control}
                              name="industryStandardized"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Industry</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Technology" {...field} value={field.value || ""} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={createForm.control}
                                name="employeesSizeRange"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Staff Count Range</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-employees-size-range">
                                          <SelectValue placeholder="Select range" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {STAFF_COUNT_RANGE_VALUES.map((value) => (
                                          <SelectItem key={value} value={value}>
                                            {value}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={createForm.control}
                                name="revenueRange"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Revenue Range</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-revenue-range">
                                          <SelectValue placeholder="Select range" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {REVENUE_RANGE_VALUES.map((value) => (
                                          <SelectItem key={value} value={value}>
                                            {value}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <DialogFooter>
                              <Button type="submit" disabled={createMutation.isPending}>
                                {createMutation.isPending ? "Creating..." : "Create Account"}
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search by name, domain, industry..."
                      className="pl-10 h-11 bg-background/80 border-border/60 shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-search-accounts"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "table" | "cards")} className="flex-shrink-0">
                      <TabsList className="grid grid-cols-2 w-[150px] bg-background/80 border border-border/60 shadow-sm">
                        <TabsTrigger value="cards" data-testid="view-cards">
                          <LayoutGrid className="size-4 mr-1.5" />
                          Cards
                        </TabsTrigger>
                        <TabsTrigger value="table" data-testid="view-table">
                          <List className="size-4 mr-1.5" />
                          Table
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {viewMode === "cards" && paginatedAccounts.length > 0 && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Checkbox
                          checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                          onCheckedChange={() => isAllSelected ? clearSelection() : selectAll()}
                          aria-label="Select all on page"
                          data-testid="checkbox-select-all-cards"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Select all</span>
                      </div>
                    )}
                    {filterGroup && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-background/70 border-border/60 hover:bg-background"
                        onClick={() => setFilterGroup(undefined)}
                        data-testid="button-clear-filters"
                      >
                        <Filter className="mr-2 h-4 w-4" />
                        Clear Filters ({filterGroup.conditions.length})
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedCount > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div>
                <p className="font-medium">
                  {selectAllPages 
                    ? `All ${selectedCount} accounts selected across all pages` 
                    : `${selectedCount} account${selectedCount !== 1 ? 's' : ''} selected on this page`}
                </p>
                {!selectAllPages && filteredAccounts.length > paginatedAccounts.length && (
                  <button
                    onClick={handleSelectAllPages}
                    className="text-sm text-primary hover:underline mt-1"
                  >
                    Select all {filteredAccounts.length} accounts across all pages
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {user?.role !== 'agent' && (
                <Button variant="outline" size="sm" onClick={handleBulkExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setBulkUpdateDialogOpen(true)}>
                Update
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAddToListDialogOpen(true)}>
                Add to List
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { clearSelection(); setSelectAllPages(false); }}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="rounded-2xl">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-12 rounded-xl" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Skeleton className="h-4 w-4" />
                  </TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : filteredAccounts.length > 0 ? (
        <>
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedAccounts.map((account, index) => (
                <AccountCardPremium
                  key={account.id}
                  account={account}
                  onCardClick={(id) => setLocation(`/accounts/${id}`)}
                  index={index}
                  isSelected={isSelected(account.id)}
                  onToggleSelect={selectItem}
                />
              ))}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                      onCheckedChange={() => isAllSelected ? clearSelection() : selectAll()}
                      aria-label="Select all on page"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAccounts.map((account) => (
                <TableRow 
                  key={account.id} 
                  className="hover-elevate cursor-pointer" 
                  onClick={() => setLocation(`/accounts/${account.id}`)}
                  data-testid={`row-account-${account.id}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected(account.id)}
                      onCheckedChange={() => selectItem(account.id)}
                      aria-label={`Select ${account.name}`}
                      data-testid={`checkbox-account-${account.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      {account.name}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{account.domain || "-"}</TableCell>
                  <TableCell>
                    {account.industryStandardized ? (
                      <Badge variant="outline">{account.industryStandardized}</Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell>{account.employeesSizeRange || "-"}</TableCell>
                  <TableCell>
                    {account.annualRevenue ? formatRevenue(account.annualRevenue) : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/accounts/${account.id}`);
                        }}
                        data-testid={`button-view-account-${account.id}`}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(account.id);
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-account-${account.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredAccounts.length)} of {filteredAccounts.length} accounts
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Building2}
          title="No accounts found"
          description={searchQuery ? "Try adjusting your search query" : "Get started by creating your first account"}
          actionLabel={!searchQuery ? "Create Account" : undefined}
          onAction={!searchQuery ? () => setCreateDialogOpen(true) : undefined}
        />
      )}

      <CSVImportAccountsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
        }}
      />

      {/* Bulk Update Dialog */}
      <BulkUpdateDialog
        open={bulkUpdateDialogOpen}
        onOpenChange={setBulkUpdateDialogOpen}
        entityType="account"
        selectedCount={selectedCount}
        onUpdate={(field, value) => bulkUpdateMutation.mutate({ field, value })}
      />

      {/* Add to List Dialog */}
      <AddToListDialog
        open={addToListDialogOpen}
        onOpenChange={setAddToListDialogOpen}
        entityType="account"
        selectedCount={selectedCount}
        onAddToList={(listId) => addToListMutation.mutate(listId)}
        onCreateList={(name, description) => createListMutation.mutate({ name, description })}
      />
        </div>
      </div>
    </div>
  );
}
