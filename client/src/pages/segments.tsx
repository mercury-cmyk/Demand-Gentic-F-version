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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSegmentSchema, insertListSchema, type InsertSegment, type InsertList, type Segment, type List, type DomainSet } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { FilterGroup } from "@shared/filter-types";

export default function SegmentsPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [createSegmentDialogOpen, setCreateSegmentDialogOpen] = useState(false);
  const [createListDialogOpen, setCreateListDialogOpen] = useState(false);
  const [segmentFilterGroup, setSegmentFilterGroup] = useState<FilterGroup | undefined>();
  const [segmentEntityType, setSegmentEntityType] = useState<'contact' | 'account'>('contact');
  const [pageFilterGroup, setPageFilterGroup] = useState<FilterGroup | undefined>();
  // Copy To List dialog state
  const [copyToDialogOpen, setCopyToDialogOpen] = useState(false);
  const [copySourceList, setCopySourceList] = useState<List | null>(null);
  const [selectedTargetListId, setSelectedTargetListId] = useState<string>("");
  // Assign to Campaign dialog state
  const [assignCampaignDialogOpen, setAssignCampaignDialogOpen] = useState(false);
  const [assignSourceList, setAssignSourceList] = useState<List | null>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: segments, isLoading: segmentsLoading } = useQuery<Segment[]>({
    queryKey: ['/api/segments'],
  });

  const { data: lists, isLoading: listsLoading } = useQuery<List[]>({
    queryKey: ['/api/lists'],
  });

  const { data: domainSets, isLoading: domainSetsLoading } = useQuery<DomainSet[]>({
    queryKey: ['/api/domain-sets'],
  });

  const segmentForm = useForm<InsertSegment>({
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

  const listForm = useForm<InsertList>({
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
  const { data: campaignsData = [], isLoading: campaignsLoading } = useQuery<any[]>({
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
    <div className="flex min-h-screen flex-col xl:flex-row overflow-hidden">
      <SidebarFilters
        entityType="segment"
        onApplyFilter={setPageFilterGroup}
        initialFilter={pageFilterGroup}
        includeRelatedEntities={false}
      />
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Segments & Lists</h1>
              <p className="text-muted-foreground mt-1">
                Build dynamic segments, create static lists, and manage domain sets
              </p>
            </div>
          </div>

          {/* Active Filters Badge */}
          {pageFilterGroup && pageFilterGroup.filters.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                {pageFilterGroup.filters.length} filter{pageFilterGroup.filters.length !== 1 ? 's' : ''} active
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setPageFilterGroup(undefined)}
                className="h-6 px-2 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          )}

          <Tabs defaultValue="segments" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="segments" data-testid="tab-segments">Segments</TabsTrigger>
          <TabsTrigger value="lists" data-testid="tab-lists">Lists</TabsTrigger>
          <TabsTrigger value="domains" data-testid="tab-domains">Domain Sets</TabsTrigger>
        </TabsList>

        <TabsContent value="segments" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search segments..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-segments"
              />
            </div>
            <Dialog open={createSegmentDialogOpen} onOpenChange={setCreateSegmentDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-segment">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Segment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Create Dynamic Segment</DialogTitle>
                  <DialogDescription>
                    Build a dynamic segment with custom filters
                  </DialogDescription>
                </DialogHeader>
                <Form {...segmentForm}>
                  <form onSubmit={segmentForm.handleSubmit((data) => {
                    const submitData = {
                      ...data,
                      definitionJson: segmentFilterGroup || { logic: 'AND' as const, conditions: [] }
                    };
                    createSegmentMutation.mutate(submitData);
                  })} className="space-y-4">
                    <FormField
                      control={segmentForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Segment Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enterprise Decision Makers" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={segmentForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Target segment description..." {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={segmentForm.control}
                        name="entityType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entity Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="contact">Contact</SelectItem>
                                <SelectItem value="account">Account</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={segmentForm.control}
                        name="visibilityScope"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Visibility</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select visibility" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="private">Private</SelectItem>
                                <SelectItem value="team">Team</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={segmentForm.control}
                      name="tags"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tags (comma-separated)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="enterprise, high-value, priority" 
                              value={field.value?.join(", ") || ""}
                              onChange={(e) => field.onChange(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={segmentForm.control}
                      name="entityType"
                      render={({ field }) => (
                        <div className="space-y-2">
                          <FormLabel className="text-base font-medium">Segment Filters</FormLabel>
                          <FilterBuilder
                            entityType={(field.value as 'contact' | 'account') || 'contact'}
                            onApplyFilter={(filter) => {
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
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                              <Users className="h-4 w-4" />
                              <span>Preview: {previewSegmentMutation.data.count} {field.value || 'contact'}s match this filter</span>
                            </div>
                          )}
                          {previewSegmentMutation.isPending && (
                            <div className="text-sm text-muted-foreground mt-2">Calculating preview...</div>
                          )}
                        </div>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit" disabled={createSegmentMutation.isPending}>
                        {createSegmentMutation.isPending ? "Creating..." : "Create Segment"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {segmentsLoading ? (
            <div className="grid gap-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-full mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredSegments.length > 0 ? (
            <div className="grid gap-4">
              {filteredSegments.map((segment) => (
                <Card 
                  key={segment.id} 
                  className="hover-elevate cursor-pointer transition-shadow" 
                  data-testid={`card-segment-${segment.id}`}
                  onClick={() => setLocation(`/segments/${segment.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle>{segment.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{segment.entityType || 'contact'}</Badge>
                        <Badge variant="outline">{segment.visibilityScope || 'private'}</Badge>
                      </div>
                    </div>
                    <CardDescription>
                      {segment.description || "No description"}
                    </CardDescription>
                    {segment.definitionJson && (segment.definitionJson as any).conditions?.length > 0 && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <ListFilter className="h-4 w-4" />
                        <span>{(segment.definitionJson as any).conditions.length} filter condition(s)</span>
                        <Badge variant="secondary" className="text-xs">
                          {(segment.definitionJson as any).logic || 'AND'}
                        </Badge>
                      </div>
                    )}
                    {segment.tags && segment.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {segment.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span data-testid={`segment-contacts-${segment.id}`}>
                          {segment.recordCountCache || 0} records
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const name = prompt("Enter name for the new list:", `${segment.name} (Static)`);
                            if (name) convertToListMutation.mutate({ segmentId: segment.id, name });
                          }}
                          disabled={convertToListMutation.isPending}
                          data-testid={`button-convert-segment-${segment.id}`}
                        >
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                          To List
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteSegmentMutation.mutate(segment.id)}
                          disabled={deleteSegmentMutation.isPending}
                          data-testid={`button-delete-segment-${segment.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ListFilter}
              title="No segments found"
              description={searchQuery ? "Try adjusting your search query" : "Create your first dynamic segment to start targeting contacts"}
              actionLabel={!searchQuery ? "Create Segment" : undefined}
              onAction={!searchQuery ? () => setCreateSegmentDialogOpen(true) : undefined}
            />
          )}
        </TabsContent>

        <TabsContent value="lists" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search lists..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-lists"
              />
            </div>
            <Dialog open={createListDialogOpen} onOpenChange={setCreateListDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-list">
                  <Plus className="mr-2 h-4 w-4" />
                  Create List
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create Static List</DialogTitle>
                  <DialogDescription>
                    Create a static snapshot list of contacts
                  </DialogDescription>
                </DialogHeader>
                <Form {...listForm}>
                  <form onSubmit={listForm.handleSubmit((data) => createListMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={listForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>List Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Q1 2024 Trade Show Leads" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={listForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="List description..." {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={listForm.control}
                        name="entityType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entity Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="contact">Contact</SelectItem>
                                <SelectItem value="account">Account</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={listForm.control}
                        name="visibilityScope"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Visibility</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select visibility" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="private">Private</SelectItem>
                                <SelectItem value="team">Team</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={listForm.control}
                      name="tags"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tags (comma-separated)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="outbound, q1-2024, priority" 
                              value={field.value?.join(", ") || ""}
                              onChange={(e) => field.onChange(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit" disabled={createListMutation.isPending}>
                        {createListMutation.isPending ? "Creating..." : "Create List"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {listsLoading ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Contacts</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2].map((i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-6 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-64" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : filteredLists.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLists.map((list) => (
                    <TableRow 
                      key={list.id} 
                      className="hover-elevate cursor-pointer transition-colors" 
                      data-testid={`row-list-${list.id}`}
                      onClick={() => setLocation(`/segments/lists/${list.id}`)}
                    >
                      <TableCell className="font-medium">{list.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{list.entityType || 'contact'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{list.sourceType || 'manual'}</Badge>
                      </TableCell>
                      <TableCell>{list.recordIds?.length || 0}</TableCell>
                      <TableCell>
                        {list.tags && list.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {list.tags.slice(0, 2).map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                            {list.tags.length > 2 && (
                              <Badge variant="outline" className="text-xs">+{list.tags.length - 2}</Badge>
                            )}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => exportListMutation.mutate({ listId: list.id, format: 'csv' })}
                                disabled={exportListMutation.isPending}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Export CSV
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setCopySourceList(list);
                                  setSelectedTargetListId("");
                                  setCopyToDialogOpen(true);
                                }}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copy To List...
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setAssignSourceList(list);
                                  setSelectedCampaignIds([]);
                                  setAssignCampaignDialogOpen(true);
                                }}
                              >
                                <Megaphone className="mr-2 h-4 w-4" />
                                Assign to Campaign...
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteListMutation.mutate(list.id)}
                                disabled={deleteListMutation.isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No lists found"
              description={searchQuery ? "Try adjusting your search query" : "Create your first static list"}
              actionLabel={!searchQuery ? "Create List" : undefined}
              onAction={!searchQuery ? () => setCreateListDialogOpen(true) : undefined}
            />
          )}

          {/* Copy To List Dialog */}
          <Dialog open={copyToDialogOpen} onOpenChange={setCopyToDialogOpen}>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle>Copy Contacts To List</DialogTitle>
                <DialogDescription>
                  Copy all {copySourceList?.recordIds?.length?.toLocaleString() || 0} records from "{copySourceList?.name}" into another list. Duplicates will be automatically skipped.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target List</label>
                  <Select value={selectedTargetListId} onValueChange={setSelectedTargetListId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a target list..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lists
                        ?.filter(l => l.id !== copySourceList?.id && l.entityType === copySourceList?.entityType)
                        .map(l => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} ({l.recordIds?.length?.toLocaleString() || 0} records)
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCopyToDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
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
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Assign to Campaign Dialog */}
          <Dialog open={assignCampaignDialogOpen} onOpenChange={setAssignCampaignDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Assign List to Campaign</DialogTitle>
                <DialogDescription>
                  Add "{assignSourceList?.name}" ({assignSourceList?.recordIds?.length?.toLocaleString() || 0} records) to one or more campaigns.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
                {campaignsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : campaignsData && campaignsData.filter((c: any) => c.status !== 'completed' && c.status !== 'cancelled').length > 0 ? (
                  campaignsData
                    .filter((c: any) => c.status !== 'completed' && c.status !== 'cancelled')
                    .map((campaign: any) => (
                      <div
                        key={campaign.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/50 ${
                          selectedCampaignIds.includes(campaign.id) ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => {
                          setSelectedCampaignIds(prev =>
                            prev.includes(campaign.id)
                              ? prev.filter((id: string) => id !== campaign.id)
                              : [...prev, campaign.id]
                          );
                        }}
                      >
                        <Checkbox
                          checked={selectedCampaignIds.includes(campaign.id)}
                          onCheckedChange={() => {
                            setSelectedCampaignIds(prev =>
                              prev.includes(campaign.id)
                                ? prev.filter((id: string) => id !== campaign.id)
                                : [...prev, campaign.id]
                            );
                          }}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{campaign.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{campaign.type}</Badge>
                            <Badge variant="secondary" className="text-xs">{campaign.status}</Badge>
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No campaigns available</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignCampaignDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
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
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="domains" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search domain sets..."
                className="pl-10"
                data-testid="input-search-domains"
              />
            </div>
            <Button data-testid="button-create-domain-set">
              <Upload className="mr-2 h-4 w-4" />
              Upload Domain Set
            </Button>
          </div>

          {domainSetsLoading ? (
            <div className="grid gap-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : domainSets && domainSets.length > 0 ? (
            <div className="grid gap-4">
              {domainSets.map((domainSet) => (
                <Card key={domainSet.id} className="hover-elevate" data-testid={`card-domain-set-${domainSet.id}`}>
                  <CardHeader>
                    <CardTitle>{domainSet.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold">{domainSet.domains?.length || 0}</div>
                        <div className="text-sm text-muted-foreground">Domains</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">-</div>
                        <div className="text-sm text-muted-foreground">Match Rate</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">-</div>
                        <div className="text-sm text-muted-foreground">Contacts</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Upload}
              title="No domain sets found"
              description="Upload your first domain set to start matching accounts"
              actionLabel="Upload Domain Set"
              onAction={() => {}}
            />
          )}
        </TabsContent>
      </Tabs>
        </div>
      </div>
    </div>
  );
}
