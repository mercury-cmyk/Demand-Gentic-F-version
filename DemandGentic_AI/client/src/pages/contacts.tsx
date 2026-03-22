import { useState, useEffect as React_useEffect } from "react";
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Download, Upload, Users, Trash2, ShieldAlert, Phone as PhoneIcon, Mail as MailIcon, Building2 } from "lucide-react";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import { FilterValues, type UserRole, convertFilterValuesToFilterGroup } from "@shared/filterConfig";
import type { FilterGroup } from "@shared/filter-types";
import { useAuth } from "@/contexts/AuthContext";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { exportContactsToCSV, downloadCSV, generateContactsTemplate } from "@/lib/csv-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { useSelection } from "@/hooks/use-selection";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { BulkActionsToolbar } from "@/components/bulk-actions-toolbar";
import { BulkUpdateDialog } from "@/components/bulk-update-dialog";
import { AddToListDialog } from "@/components/add-to-list-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  insertContactSchema, 
  type InsertContact, 
  type Contact, 
  type Account,
  type SuppressionEmail,
  type SuppressionPhone 
} from "@shared/schema";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";

function ContactsPage() {
  const { canExportData } = useExportAuthority();

  const [searchQuery, setSearchQuery] = useState("");
  const [campaignId, setCampaignId] = useState(null);
  const [eventType, setEventType] = useState(null);
  const [filteredContacts, setFilteredContacts] = useState(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [location, setLocation] = useLocation();
    // Parse query params for campaignId and event
    React.useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get('campaignId');
      const evt = params.get('event');
      setCampaignId(cid);
      setEventType(evt);
    }, [location]);

    // Fetch contacts by campaign/event if params present
    React.useEffect(() => {
      if (campaignId && eventType) {
        setContactsLoading(true);
        fetch(`/api/campaigns/${campaignId}/contacts-by-event?event=${eventType}`)
          .then(res => res.json())
          .then(data => {
            setFilteredContacts(data.contacts || []);
            setContactsLoading(false);
          })
          .catch(() => setContactsLoading(false));
      } else {
        setFilteredContacts(null);
      }
    }, [campaignId, eventType]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [addToListDialogOpen, setAddToListDialogOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({});
  const [filterGroup, setFilterGroup] = useState(() => {
    // Check if there's a filter in sessionStorage (legacy support)
    const savedFilter = sessionStorage.getItem('contactsFilter');
    if (savedFilter) {
      sessionStorage.removeItem('contactsFilter'); // Clear after reading
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
  // Removed duplicate setLocation declaration
  const { toast } = useToast();
  const { user } = useAuth();

  const ITEMS_PER_PAGE = 50;

  // Normalize user role for filter RBAC (capitalize first letter)
  const normalizeRole = (role: string): UserRole => {
    const normalized = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    return (normalized as UserRole) || "Agent";
  };

  const { data: contacts, isLoading: contactsLoadingQuery, refetch: refetchContacts } = useQuery({
    queryKey: ['/api/contacts', JSON.stringify(filterGroup), JSON.stringify(appliedFilters)],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const params = new URLSearchParams();
      
      console.log('[CONTACTS] Query params:', {
        filterGroup,
        appliedFilters,
        hasFilterGroup: filterGroup && filterGroup.conditions.length > 0,
        hasAppliedFilters: Object.keys(appliedFilters).length > 0
      });
      
      // Priority: Use new SidebarFilters filterGroup first, then fall back to legacy appliedFilters
      if (filterGroup && filterGroup.conditions.length > 0) {
        console.log('[CONTACTS] Using filterGroup:', filterGroup);
        params.set('filters', JSON.stringify(filterGroup));
      } else if (Object.keys(appliedFilters).length > 0) {
        console.log('[CONTACTS] Using appliedFilters:', appliedFilters);
        const convertedFilterGroup = convertFilterValuesToFilterGroup(appliedFilters, 'contacts');
        if (convertedFilterGroup) {
          params.set('filters', JSON.stringify(convertedFilterGroup));
        }
      }
      
      const response = await fetch(`/api/contacts?${params.toString()}`, {
        headers,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[CONTACTS] Loaded contacts from server:', {
        count: data.length,
        sample: data.slice(0, 2),
        filterGroup,
        appliedFilters
      });
    },
    onError: (error) => {
      console.error('[CONTACTS] Error loading contacts:', error);
    }
  });

  const { data: accounts } = useQuery({
    queryKey: ['/api/accounts'],
  });

  // Fetch suppression lists for validation
  const { data: emailSuppressions = [] } = useQuery({
    queryKey: ['/api/suppressions/email'],
  });

  const { data: phoneSuppressions = [] } = useQuery({
    queryKey: ['/api/suppressions/phone'],
  });

  // Helper functions to check suppressions
  const isEmailSuppressed = (email: string) => {
    return emailSuppressions.some(s => s.email.toLowerCase() === email.toLowerCase());
  };

  const isPhoneSuppressed = (phone: string) => {
    return phoneSuppressions.some(s => s.phoneE164 === phone);
  };

  const createForm = useForm({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      fullName: "",
      firstName: "",
      lastName: "",
      email: "",
      directPhone: "",
      jobTitle: "",
      accountId: "",
    },
  });

  // Watch email and phone for real-time suppression checks
  const watchedEmail = createForm.watch("email");
  const watchedPhone = createForm.watch("directPhone");

  const emailIsSuppressed = watchedEmail ? isEmailSuppressed(watchedEmail) : false;
  // Note: Assuming phone is entered in E.164 format for suppression check
  const phoneIsSuppressed = watchedPhone ? isPhoneSuppressed(watchedPhone) : false;

  const createMutation = useMutation({
    mutationFn: async (data: InsertContact) => {
      // Compute fullName from firstName + lastName if not provided
      const fullName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
      await apiRequest('POST', '/api/contacts', { ...data, fullName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      setCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Success",
        description: "Contact created successfully",
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
      await apiRequest('DELETE', `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: "Success",
        description: "Contact deleted successfully",
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

  const filteredContactsDefault = contacts?.filter(contact =>
    searchQuery === "" ||
    contact.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.jobTitle?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  const filteredContactsToShow = filteredContacts !== null ? filteredContacts : filteredContactsDefault;

  // Pagination calculations
  const totalPages = Math.ceil(filteredContactsToShow.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedContacts = filteredContactsToShow.slice(startIndex, endIndex);

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
  } = useSelection(selectAllPages ? filteredContactsToShow : paginatedContacts);

  // Handle select all pages toggle
  const handleSelectAllPages = () => {
    if (selectAllPages) {
      setSelectAllPages(false);
      clearSelection();
    } else {
      setSelectAllPages(true);
      // Select all filtered contacts across all pages
      clearSelection();
      filteredContactsToShow.forEach(contact => selectItem(contact.id));
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest('DELETE', `/api/contacts/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Deleted ${selectedCount} contacts`,
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
    const selectedContacts = filteredContactsToShow.filter(c => selectedIds.has(c.id));
    const csv = exportContactsToCSV(selectedContacts);
    downloadCSV(csv, `contacts_bulk_export_${new Date().toISOString().split('T')[0]}.csv`);
    toast({
      title: "Export Complete",
      description: `Exported ${selectedCount} contacts to CSV`,
    });
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} contacts? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string }) => {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          apiRequest('PATCH', `/api/contacts/${id}`, { [field]: value })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Updated ${selectedCount} contacts`,
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

  // State for bulk job tracking
  const [bulkJobId, setBulkJobId] = React.useState(null);
  const [isPollingJob, setIsPollingJob] = React.useState(false);
  const [jobProgress, setJobProgress] = React.useState(null);
  const [pollRetries, setPollRetries] = React.useState(0);

  const addToListMutation = useMutation({
    mutationFn: async (listId: string) => {
      // If selecting all across pages, always use bulk API (backend decides processing method)
      if (selectAllPages) {
        const response = await apiRequest('POST', `/api/lists/${listId}/contacts/bulk`, {
          filterCriteria: {
            searchQuery,
            filterGroup,
            appliedFilters,
          }
        });
        const data = await response.json();
        return { jobId: data.jobId, usedBulk: data.useBackgroundJob !== false };
      } else {
        // Direct API for page-level selections
        await apiRequest('POST', `/api/lists/${listId}/contacts`, {
          contactIds: Array.from(selectedIds)
        });
        return { usedBulk: false };
      }
    },
    onSuccess: (data: any) => {
      if (data.usedBulk) {
        // Start polling for job status
        setBulkJobId(data.jobId);
        setIsPollingJob(true);
        setPollRetries(0);
        setJobProgress(null);
        toast({ 
          title: "Processing", 
          description: "Adding contacts in background. This may take a moment..." 
        });
      } else {
        // Immediate success (no background job needed)
        queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
        
        if (data.totalAdded !== undefined) {
          toast({ 
            title: "Success", 
            description: `Added ${data.totalAdded} contacts to list (${data.totalProcessed} matched your filters)` 
          });
        } else {
          toast({ title: "Success", description: `Added ${selectedCount} contacts to list` });
        }
        
        clearSelection();
        setSelectAllPages(false);
        setAddToListDialogOpen(false);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add contacts to list", variant: "destructive" });
    },
  });

  // Poll for bulk job status with retry logic
  React.useEffect(() => {
    if (!isPollingJob || !bulkJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await apiRequest('GET', `/api/jobs/bulk-list/${bulkJobId}`);
        const status = await response.json();
        
        // Reset retry counter on successful poll
        setPollRetries(0);
        
        // Update progress
        if (status.progress) {
          setJobProgress(status.progress);
        }

        if (status.state === 'completed') {
          setIsPollingJob(false);
          setBulkJobId(null);
          setJobProgress(null);
          queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
          
          if (status.result?.success) {
            toast({ 
              title: "Success", 
              description: `Added ${status.result.totalAdded} contacts to list (${status.result.totalProcessed} matched your filters)` 
            });
          } else {
            toast({ 
              title: "Error", 
              description: status.result?.error || "Failed to add contacts",
              variant: "destructive"
            });
          }
          
          clearSelection();
          setSelectAllPages(false);
          setAddToListDialogOpen(false);
        } else if (status.state === 'failed') {
          setIsPollingJob(false);
          setBulkJobId(null);
          setJobProgress(null);
          toast({ 
            title: "Error", 
            description: status.error || "Job failed",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error polling job status:', error);
        setPollRetries(prev => prev + 1);
        
        // Stop polling after 5 consecutive failures
        if (pollRetries >= 5) {
          setIsPollingJob(false);
          setBulkJobId(null);
          setJobProgress(null);
          toast({
            title: "Error",
            description: "Lost connection to background job. The operation may still complete successfully.",
            variant: "destructive"
          });
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [isPollingJob, bulkJobId, queryClient, clearSelection, pollRetries]);

  const createListMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const list = await apiRequest('POST', '/api/lists', {
        name,
        description,
        entityType: 'contact',
        sourceType: 'selection',
        recordIds: Array.from(selectedIds),
      });
      return list.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      clearSelection();
      toast({
        title: "Success",
        description: `Created list and added ${selectedCount} contacts`,
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
    
      {/* Filter banner for campaign/event */}
      {campaignId && eventType && (
        
          
            Showing contacts for campaign {campaignId} with event {eventType}.
          
           {
            setCampaignId(null); setEventType(null); setFilteredContacts(null); setLocation('/contacts');
          }}>Clear filter
        
      )}
      {/* Left Sidebar - Filters */}
       {
          setFilterGroup(filter);
          setCurrentPage(1); // Reset to first page on filter change
        }}
        initialFilter={filterGroup}
      />

      {/* Main Content */}
      
        
          
            
              Contacts
              
                Manage your contact database with advanced filtering
              
            
        
          {canExportData && (
             {
                const csv = exportContactsToCSV(filteredContactsToShow);
                downloadCSV(csv, `contacts_export_${new Date().toISOString().split('T')[0]}.csv`);
                toast({
                  title: "Export Complete",
                  description: `Exported ${filteredContactsToShow.length} contacts to CSV`,
                });
              }}
              data-testid="button-export-contacts"
            >
              
              Export
            
          )}
           setImportDialogOpen(true)}
            data-testid="button-import-contacts"
          >
            
            Import
          
          
            
              
                
                Create Contact
              
            
            
              
                Create Contact
                
                  Add a new contact to your database
                
              
              
                 createMutation.mutate(data))} className="space-y-4">
                  
                     (
                        
                          First Name
                          
                            
                          
                          
                        
                      )}
                    />
                     (
                        
                          Last Name
                          
                            
                          
                          
                        
                      )}
                    />
                  
                   (
                      
                        Email
                        
                          
                        
                        {emailIsSuppressed && (
                          
                            
                            Warning: This email is on the suppression list
                          
                        )}
                        
                      
                    )}
                  />
                   (
                      
                        Direct Work Phone
                        
                          
                        
                        {phoneIsSuppressed && (
                          
                            
                            Warning: This phone is on the DNC list
                          
                        )}
                        
                          Will be formatted based on country
                        
                        
                      
                    )}
                  />
                   (
                      
                        Mobile Direct (Optional)
                        
                          
                        
                        
                          Will be formatted based on country
                        
                        
                      
                    )}
                  />
                   (
                      
                        Title
                        
                          
                        
                        
                      
                    )}
                  />
                   (
                      
                        Account
                        
                          
                            
                              
                            
                          
                          
                            {accounts?.map((account) => (
                              
                                {account.name}
                              
                            ))}
                          
                        
                        
                      
                    )}
                  />
                  
                    
                      {createMutation.isPending ? "Creating..." : "Create Contact"}
                    
                  
                
              
            
          
        
      

      
        
          
           setSearchQuery(e.target.value)}
            data-testid="input-search-contacts"
          />
        
        {(filterGroup?.conditions.length || Object.keys(appliedFilters).length > 0) && (
           {
              setFilterGroup(undefined);
              setAppliedFilters({});
              setCurrentPage(1);
              toast({
                title: "Filters Cleared",
                description: "Showing all contacts",
              });
            }}
          >
            
            Clear Filters ({filteredContactsToShow.length} shown)
          
        )}
      

      {selectedCount > 0 && (
        
          
            
              
                
                  {selectAllPages 
                    ? `All ${filteredContactsToShow.length} contacts selected (smart mode - processes in background)` 
                    : `${selectedCount} contact${selectedCount !== 1 ? 's' : ''} selected on this page`}
                
                {!selectAllPages && filteredContactsToShow.length > paginatedContacts.length && (
                  
                    Select all {filteredContactsToShow.length} contacts across all pages (recommended for 1000+)
                  
                )}
                {selectAllPages && filteredContactsToShow.length > 1000 && (
                  
                    Large selections will be processed in the background without performance impact
                  
                )}
                {isPollingJob && jobProgress && (
                  
                    
                      Processing: {jobProgress.processed || 0} contacts...
                      {jobProgress.percent && ({jobProgress.percent}%)}
                    
                  
                )}
              
            
            
              {canExportData && (
                
                  
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

      {contactsLoading ? (
        
          
            
              
                Contact
                Title
                Account
                Phone
                Actions
              
            
            
              {(contactsLoading ? Array.from({ length: ITEMS_PER_PAGE }) : paginatedContacts).map((contact: any, idx: number) => (
                
                  {/* ...existing code... */}
                
              ))}
            
          
        
      ) : filteredContactsToShow.length > 0 ? (
        <>
          
            
              
                
                  
                     isAllSelected ? clearSelection() : selectAll()}
                      aria-label="Select all on page"
                      data-testid="checkbox-select-all"
                    />
                  
                  Contact
                  Title
                  Account
                  Phone
                  Actions
                
              
              
                {paginatedContacts.map((contact) => {
                const account = accounts?.find(a => a.id === contact.accountId);
                const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
                const contactEmailSuppressed = isEmailSuppressed(contact.email);
                const contactPhoneSuppressed = contact.directPhoneE164 ? isPhoneSuppressed(contact.directPhoneE164) : false;

                return (
                   setLocation(`/contacts/${contact.id}`)}
                    data-testid={`row-contact-${contact.id}`}
                  >
                     e.stopPropagation()}>
                       selectItem(contact.id)}
                        aria-label={`Select ${fullName || contact.email}`}
                        data-testid={`checkbox-contact-${contact.id}`}
                      />
                    
                    
                      
                        
                          {initials}
                        
                        
                          {fullName || "No name"}
                          
                            {contact.email}
                            {contactEmailSuppressed && (
                              
                                
                                Suppressed
                              
                            )}
                          
                        
                      
                    
                    {contact.jobTitle || "-"}
                    
                      {account ? (
                        
                          
                          {account.name}
                        
                      ) : (
                        -
                      )}
                    
                    
                      
                        {contact.directPhoneE164 ? (
                           e.stopPropagation()}
                          >
                            {contact.directPhone}
                          
                        ) : (
                          -
                        )}
                        {contactPhoneSuppressed && (
                          
                            
                            DNC
                          
                        )}
                      
                    
                    
                      
                         {
                            e.stopPropagation();
                            setLocation(`/contacts/${contact.id}`);
                          }}
                          data-testid={`button-view-contact-${contact.id}`}
                        >
                          View
                        
                         {
                            e.stopPropagation();
                            deleteMutation.mutate(contact.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-contact-${contact.id}`}
                        >
                          
                        
                      
                    
                  
                );
              })}
            
            
          

          {/* Pagination */}
          {totalPages > 1 && (
            
              
                Showing {startIndex + 1} to {Math.min(endIndex, filteredContactsToShow.length)} of {filteredContactsToShow.length} contacts
              
              
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

      {/* CSV Import Dialog */}
       {
          // Clear any applied filters to show all contacts including newly imported ones
          setFilterGroup(undefined);
          setAppliedFilters({});
          setCurrentPage(1);
          setSelectAllPages(false);
          clearSelection();
          
          // Remove all cached contact queries to force fresh data
          queryClient.removeQueries({ queryKey: ['/api/contacts'] });
          queryClient.removeQueries({ queryKey: ['/api/accounts'] });
          
          // Wait a moment for the backend to finish processing
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Force an immediate refetch with fresh data
          await refetchContacts();
          
          toast({
            title: "Import Complete",
            description: "Showing all contacts including newly imported ones",
          });
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

export default ContactsPage;