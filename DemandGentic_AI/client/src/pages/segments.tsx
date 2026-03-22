import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ListFilter, Users, Upload, Trash2, Download, ArrowRightLeft, Filter, X, MoreVertical, Copy, Megaphone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBuilder } from "@/components/filter-builder";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSegmentSchema, insertListSchema, type InsertSegment, type InsertList, type Segment, type List, type DomainSet } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { FilterGroup } from "@shared/filter-types";

export default function SegmentsPage() {
  const [, setLocation] = useLocation();
  const { canExportData } = useExportAuthority();
  const [searchQuery, setSearchQuery] = useState("");
  const [createSegmentDialogOpen, setCreateSegmentDialogOpen] = useState(false);
  const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
  const [segmentFilterGroup, setSegmentFilterGroup] = useState();
  const [segmentEntityType, setSegmentEntityType] = useState('contact');
  const [pageFilterGroup, setPageFilterGroup] = useState();
  // Copy To List dialog state
  const [copyToDialogOpen, setCopyToDialogOpen] = useState(false);
  const [copySourceList, setCopySourceList] = useState(null);
  const [selectedTargetListId, setSelectedTargetListId] = useState("");
  // Assign to Campaign dialog state
  const [assignCampaignDialogOpen, setAssignCampaignDialogOpen] = useState(false);
  const [assignSourceList, setAssignSourceList] = useState(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const { toast } = useToast();

  const { data: segments, isLoading: segmentsLoading } = useQuery({
    queryKey: ['/api/segments'],
  });

  const { data: lists, isLoading: listsLoading } = useQuery({
    queryKey: ['/api/lists'],
  });

  const { data: domainSets, isLoading: domainSetsLoading } = useQuery({
    queryKey: ['/api/domain-sets'],
  });

  const segmentForm = useForm({
    resolver: zodResolver(insertSegmentSchema),
    defaultValues: {
      name: "",
      description: "",
      entityType: "contact",
      definitionJson: {},
      tags: [],
      visibilityScope: "private",
      isActive: true,
    },
  });

  const listForm = useForm({
    resolver: zodResolver(insertListSchema),
    defaultValues: {
      name: "",
      description: "",
      entityType: "contact",
      sourceType: "manual_upload",
      recordIds: [],
      tags: [],
      visibilityScope: "private",
    },
  });

  const previewSegmentMutation = useMutation({
    mutationFn: async (data: { definitionJson: FilterGroup; entityType: string }) => {
      const response = await apiRequest('POST', '/api/segments/preview', data);
      return await response.json();
    },
  });

  const createSegmentMutation = useMutation({
    mutationFn: async (data: InsertSegment) => {
      await apiRequest('POST', '/api/segments', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/segments'] });
      setCreateSegmentDialogOpen(false);
      segmentForm.reset();
      setSegmentFilterGroup(undefined);
      toast({
        title: "Success",
        description: "Segment created successfully",
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
    mutationFn: async (data: InsertList) => {
      await apiRequest('POST', '/api/lists', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      setCreateListDialogOpen(false);
      listForm.reset();
      toast({
        title: "Success",
        description: "List created successfully",
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

  const deleteSegmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/segments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/segments'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Segment deleted successfully",
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

  const deleteListMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "List deleted successfully",
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

  const convertToListMutation = useMutation({
    mutationFn: async ({ segmentId, name }: { segmentId: string; name: string }) => {
      await apiRequest('POST', `/api/segments/${segmentId}/convert-to-list`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      toast({
        title: "Success",
        description: "Segment converted to list successfully",
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

  const exportListMutation = useMutation({
    mutationFn: async ({ listId, format }: { listId: string; format: 'csv' | 'json' }) => {
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/lists/${listId}/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ format }),
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'export.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "List exported successfully",
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

  // Campaigns query (only fetched when assign dialog is open)
  const { data: campaignsData = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/campaigns', 'for-list-assignment'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns');
      return await res.json();
    },
    enabled: assignCampaignDialogOpen,
    staleTime: 0,
  });

  const mergeListMutation = useMutation({
    mutationFn: async ({ targetListId, sourceListId }: { targetListId: string; sourceListId: string }) => {
      const response = await apiRequest('POST', `/api/lists/${targetListId}/merge`, { sourceListId });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lists'] });
      setCopyToDialogOpen(false);
      setCopySourceList(null);
      setSelectedTargetListId("");
      toast({
        title: "Success",
        description: data.message,
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

  const assignToCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, listIds }: { campaignId: string; listIds: string[] }) => {
      const response = await apiRequest('POST', `/api/campaigns/${campaignId}/add-audience-lists`, { listIds });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      setAssignCampaignDialogOpen(false);
      setAssignSourceList(null);
      setSelectedCampaignIds([]);
      toast({
        title: "Success",
        description: data.message,
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

  const filteredSegments = segments?.filter(seg =>
    searchQuery === "" ||
    seg.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredLists = lists?.filter(list =>
    searchQuery === "" ||
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    
      
      
        
          
            
              Segments & Lists
              
                Build dynamic segments, create static lists, and manage domain sets
              
            
          

          {/* Active Filters Badge */}
          {pageFilterGroup && pageFilterGroup.filters.length > 0 && (
            
              
                
                {pageFilterGroup.filters.length} filter{pageFilterGroup.filters.length !== 1 ? 's' : ''} active
              
               setPageFilterGroup(undefined)}
                className="h-6 px-2 text-xs"
              >
                
                Clear
              
            
          )}

          
        
          Segments
          Lists
          Domain Sets
        

        
          
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-segments"
              />
            
            
              
                
                  
                  Create Segment
                
              
              
                
                  Create Dynamic Segment
                  
                    Build a dynamic segment with custom filters
                  
                
                
                   {
                    const submitData = {
                      ...data,
                      definitionJson: segmentFilterGroup || { logic: 'AND' as const, conditions: [] }
                    };
                    createSegmentMutation.mutate(submitData);
                  })} className="space-y-4">
                     (
                        
                          Segment Name
                          
                            
                          
                          
                        
                      )}
                    />
                     (
                        
                          Description
                          
                            
                          
                          
                        
                      )}
                    />
                    
                       (
                          
                            Entity Type
                            
                              
                                
                                  
                                
                              
                              
                                Contact
                                Account
                              
                            
                            
                          
                        )}
                      />
                       (
                          
                            Visibility
                            
                              
                                
                                  
                                
                              
                              
                                Private
                                Team
                                Global
                              
                            
                            
                          
                        )}
                      />
                    
                     (
                        
                          Tags (comma-separated)
                          
                             field.onChange(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                            />
                          
                          
                        
                      )}
                    />
                     (
                        
                          Segment Filters
                           {
                              setSegmentFilterGroup(filter);
                              // Trigger preview if filter has conditions
                              if (filter && filter.conditions.length > 0) {
                                previewSegmentMutation.mutate({
                                  definitionJson: filter,
                                  entityType: field.value || 'contact'
                                });
                              }
                            }}
                            initialFilter={segmentFilterGroup}
                          />
                          {previewSegmentMutation.data && (
                            
                              
                              Preview: {previewSegmentMutation.data.count} {field.value || 'contact'}s match this filter
                            
                          )}
                          {previewSegmentMutation.isPending && (
                            Calculating preview...
                          )}
                        
                      )}
                    />
                    
                      
                        {createSegmentMutation.isPending ? "Creating..." : "Create Segment"}
                      
                    
                  
                
              
            
          

          {segmentsLoading ? (
            
              {[1, 2].map((i) => (
                
                  
                    
                    
                  
                  
                    
                  
                
              ))}
            
          ) : filteredSegments.length > 0 ? (
            
              {filteredSegments.map((segment) => (
                 setLocation(`/segments/${segment.id}`)}
                >
                  
                    
                      {segment.name}
                      
                        {segment.entityType || 'contact'}
                        {segment.visibilityScope || 'private'}
                      
                    
                    
                      {segment.description || "No description"}
                    
                    {segment.definitionJson && (segment.definitionJson as any).conditions?.length > 0 && (
                      
                        
                        {(segment.definitionJson as any).conditions.length} filter condition(s)
                        
                          {(segment.definitionJson as any).logic || 'AND'}
                        
                      
                    )}
                    {segment.tags && segment.tags.length > 0 && (
                      
                        {segment.tags.map((tag, i) => (
                          {tag}
                        ))}
                      
                    )}
                  
                  
                    
                      
                        
                        
                          {segment.recordCountCache || 0} records
                        
                      
                      
                         {
                            const name = prompt("Enter name for the new list:", `${segment.name} (Static)`);
                            if (name) convertToListMutation.mutate({ segmentId: segment.id, name });
                          }}
                          disabled={convertToListMutation.isPending}
                          data-testid={`button-convert-segment-${segment.id}`}
                        >
                          
                          To List
                        
                         deleteSegmentMutation.mutate(segment.id)}
                          disabled={deleteSegmentMutation.isPending}
                          data-testid={`button-delete-segment-${segment.id}`}
                        >
                          
                        
                      
                    
                  
                
              ))}
            
          ) : (
             setCreateSegmentDialogOpen(true) : undefined}
            />
          )}
        

        
          
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-lists"
              />
            
            
              
                
                  
                  Create List
                
              
              
                
                  Create Static List
                  
                    Create a static snapshot list of contacts
                  
                
                
                   createListMutation.mutate(data))} className="space-y-4">
                     (
                        
                          List Name
                          
                            
                          
                          
                        
                      )}
                    />
                     (
                        
                          Description
                          
                            
                          
                          
                        
                      )}
                    />
                    
                       (
                          
                            Entity Type
                            
                              
                                
                                  
                                
                              
                              
                                Contact
                                Account
                              
                            
                            
                          
                        )}
                      />
                       (
                          
                            Visibility
                            
                              
                                
                                  
                                
                              
                              
                                Private
                                Team
                                Global
                              
                            
                            
                          
                        )}
                      />
                    
                     (
                        
                          Tags (comma-separated)
                          
                             field.onChange(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                            />
                          
                          
                        
                      )}
                    />
                    
                      
                        {createListMutation.isPending ? "Creating..." : "Create List"}
                      
                    
                  
                
              
            
          

          {listsLoading ? (
            
              
                
                  
                    Name
                    Description
                    Contacts
                    Actions
                  
                
                
                  {[1, 2].map((i) => (
                    
                      
                      
                      
                      
                    
                  ))}
                
              
            
          ) : filteredLists.length > 0 ? (
            
              
                
                  
                    Name
                    Type
                    Source
                    Records
                    Tags
                    Actions
                  
                
                
                  {filteredLists.map((list) => (
                     setLocation(`/segments/lists/${list.id}`)}
                    >
                      {list.name}
                      
                        {list.entityType || 'contact'}
                      
                      
                        {list.sourceType || 'manual'}
                      
                      {list.recordIds?.length || 0}
                      
                        {list.tags && list.tags.length > 0 ? (
                          
                            {list.tags.slice(0, 2).map((tag, i) => (
                              {tag}
                            ))}
                            {list.tags.length > 2 && (
                              +{list.tags.length - 2}
                            )}
                          
                        ) : '-'}
                      
                      
                         e.stopPropagation()}>
                          
                            
                              
                                
                              
                            
                            
                              {canExportData && (
                                 exportListMutation.mutate({ listId: list.id, format: 'csv' })}
                                  disabled={exportListMutation.isPending}
                                >
                                  
                                  Export CSV
                                
                              )}
                               {
                                  setCopySourceList(list);
                                  setSelectedTargetListId("");
                                  setCopyToDialogOpen(true);
                                }}
                              >
                                
                                Copy To List...
                              
                               {
                                  setAssignSourceList(list);
                                  setSelectedCampaignIds([]);
                                  setAssignCampaignDialogOpen(true);
                                }}
                              >
                                
                                Assign to Campaign...
                              
                              
                               deleteListMutation.mutate(list.id)}
                                disabled={deleteListMutation.isPending}
                              >
                                
                                Delete
                              
                            
                          
                        
                      
                    
                  ))}
                
              
            
          ) : (
             setCreateListDialogOpen(true) : undefined}
            />
          )}

          {/* Copy To List Dialog */}
          
            
              
                Copy Contacts To List
                
                  Copy all {copySourceList?.recordIds?.length?.toLocaleString() || 0} records from "{copySourceList?.name}" into another list. Duplicates will be automatically skipped.
                
              
              
                
                  Target List
                  
                    
                      
                    
                    
                      {lists
                        ?.filter(l => l.id !== copySourceList?.id && l.entityType === copySourceList?.entityType)
                        .map(l => (
                          
                            {l.name} ({l.recordIds?.length?.toLocaleString() || 0} records)
                          
                        ))
                      }
                    
                  
                
              
              
                 setCopyToDialogOpen(false)}>
                  Cancel
                
                 {
                    if (copySourceList && selectedTargetListId) {
                      mergeListMutation.mutate({
                        targetListId: selectedTargetListId,
                        sourceListId: copySourceList.id,
                      });
                    }
                  }}
                  disabled={!selectedTargetListId || mergeListMutation.isPending}
                >
                  {mergeListMutation.isPending ? "Copying..." : "Copy Records"}
                
              
            
          

          {/* Assign to Campaign Dialog */}
          
            
              
                Assign List to Campaign
                
                  Add "{assignSourceList?.name}" ({assignSourceList?.recordIds?.length?.toLocaleString() || 0} records) to one or more campaigns.
                
              
              
                {campaignsLoading ? (
                  
                    
                    
                    
                  
                ) : campaignsData && campaignsData.filter((c: any) => c.status !== 'completed' && c.status !== 'cancelled').length > 0 ? (
                  campaignsData
                    .filter((c: any) => c.status !== 'completed' && c.status !== 'cancelled')
                    .map((campaign: any) => (
                       {
                          setSelectedCampaignIds(prev =>
                            prev.includes(campaign.id)
                              ? prev.filter((id: string) => id !== campaign.id)
                              : [...prev, campaign.id]
                          );
                        }}
                      >
                         {
                            setSelectedCampaignIds(prev =>
                              prev.includes(campaign.id)
                                ? prev.filter((id: string) => id !== campaign.id)
                                : [...prev, campaign.id]
                            );
                          }}
                        />
                        
                          {campaign.name}
                          
                            {campaign.type}
                            {campaign.status}
                          
                        
                      
                    ))
                ) : (
                  No campaigns available
                )}
              
              
                 setAssignCampaignDialogOpen(false)}>
                  Cancel
                
                 {
                    if (assignSourceList && selectedCampaignIds.length > 0) {
                      selectedCampaignIds.forEach(campaignId => {
                        assignToCampaignMutation.mutate({
                          campaignId,
                          listIds: [assignSourceList.id],
                        });
                      });
                    }
                  }}
                  disabled={selectedCampaignIds.length === 0 || assignToCampaignMutation.isPending}
                >
                  {assignToCampaignMutation.isPending
                    ? "Assigning..."
                    : `Assign to ${selectedCampaignIds.length} Campaign${selectedCampaignIds.length !== 1 ? 's' : ''}`}
                
              
            
          
        

        
          
            
              
              
            
            
              
              Upload Domain Set
            
          

          {domainSetsLoading ? (
            
              {[1, 2].map((i) => (
                
                  
                    
                  
                  
                    
                      
                      
                      
                    
                  
                
              ))}
            
          ) : domainSets && domainSets.length > 0 ? (
            
              {domainSets.map((domainSet) => (
                
                  
                    {domainSet.name}
                  
                  
                    
                      
                        {domainSet.domains?.length || 0}
                        Domains
                      
                      
                        -
                        Match Rate
                      
                      
                        -
                        Contacts
                      
                    
                  
                
              ))}
            
          ) : (
             {}}
            />
          )}
        
      
        
      
    
  );
}