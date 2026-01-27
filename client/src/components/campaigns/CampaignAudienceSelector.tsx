import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Filter, List, Globe, Eye, Save, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { FilterGroup } from "@shared/filter-types";
import type { Segment, List as ListType, DomainSet } from "@shared/schema";

export interface AudienceSelection {
  source: "filters" | "segment" | "list" | "domain_set";
  selectedSegments?: string[];
  selectedLists?: string[];
  selectedDomainSets?: string[];
  excludedSegments?: string[];
  excludedLists?: string[];
  filterGroup?: FilterGroup;
  estimatedCount?: number;
}

interface CampaignAudienceSelectorProps {
  value: AudienceSelection;
  onChange: (value: AudienceSelection) => void;
  // Optional flag to hide the summary card if the parent wants to display it differently
  hideSummary?: boolean;
}

export function CampaignAudienceSelector({ value, onChange, hideSummary = false }: CampaignAudienceSelectorProps) {

  // Local state for search query (UI only)
  const [searchQuery, setSearchQuery] = useState("");

  // Convenience getters for current value
  const audienceSource = value.source || "filters";
  const selectedSegments = value.selectedSegments || [];
  const selectedLists = value.selectedLists || [];
  const selectedDomainSets = value.selectedDomainSets || [];
  const excludedSegments = value.excludedSegments || [];
  const excludedLists = value.excludedLists || [];
  const filterGroup = value.filterGroup;
  const appliedFilterGroup = value.filterGroup; // In this unified component, filterGroup is treated as applied

  // Fetch segments
  const { data: segments = [], isLoading: segmentsLoading } = useQuery<Segment[]>({
    queryKey: ['/api/segments'],
  });
  
  // Fetch lists
  const { data: lists = [], isLoading: listsLoading } = useQuery<ListType[]>({
    queryKey: ['/api/lists'],
  });

  // Fetch domain sets
  const { data: domainSets = [], isLoading: domainSetsLoading } = useQuery<DomainSet[]>({
    queryKey: ['/api/domain-sets'],
  });

  // Calculate counts locally based on API cached counts
  // Note: For advanced filters, we ideally want the dynamic count from API like in original step
  const calculateEstimatedCount = () => {
    if (audienceSource === "filters") {
       // Ideally this would be passed in or fetched. 
       // For now returning stored estimate or 0, logic for fetching is in parent or handled via side-effect query if needed
       // But to keep this component clean, we might want to fetch count here if it's specific to the filter state.
       return value.estimatedCount ?? 0;
    }
    if (audienceSource === "segment" && selectedSegments.length) {
      return selectedSegments.reduce((sum, id) => {
        const seg = segments.find(s => s.id === id);
        return sum + (seg?.recordCountCache || 0);
      }, 0);
    }
    if (audienceSource === "list" && selectedLists.length) {
      return selectedLists.reduce((sum, id) => {
        const list = lists.find(l => l.id === id);
        return sum + (list?.recordIds?.length || 0);
      }, 0);
    }
    if (audienceSource === "domain_set" && selectedDomainSets.length) {
      return selectedDomainSets.reduce((sum, id) => {
        const ds = domainSets.find(d => d.id === id);
        return sum + (ds?.matchedAccounts ?? ds?.totalUploaded ?? 0); 
      }, 0);
    }
    return 0;
  };

  // Fetch real-time count for applied filters if in filter mode
  const { data: filterCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/filters/count/contact`, JSON.stringify(appliedFilterGroup)],
    enabled: audienceSource === "filters" && !!appliedFilterGroup && (appliedFilterGroup.conditions?.length ?? 0) > 0,
    refetchOnWindowFocus: false,
  });

  // update estimated count if filter count changes
  if (audienceSource === "filters" && filterCountData && filterCountData.count !== value.estimatedCount) {
     // We avoid calling onChange in render. 
     // For this display-only value, we can just use filterCountData.count in the UI
  }

  const currentEstimatedCount = audienceSource === "filters" 
    ? (filterCountData?.count ?? 0) 
    : calculateEstimatedCount();

  // Helper to update state
  const updateState = (updates: Partial<AudienceSelection>) => {
    const newState = { ...value, ...updates };
    // Recalculate count if selection changed (for non-filter sources)
    // For filters, the count query will update and we can use that.
    // We'll update the estimatedCount in the object just for consistency if we can calculate it sync
    
    // Note: We don't strictly need to store estimatedCount in the value if we calculate it on the fly,
    // but preserving it is helpful for parent submit.
    
    onChange(newState);
  };

  const setAudienceSource = (source: AudienceSelection['source']) => updateState({ source });

  const toggleSelection = (
    currentList: string[], 
    id: string, 
    key: keyof Pick<AudienceSelection, 'selectedSegments' | 'selectedLists' | 'selectedDomainSets' | 'excludedSegments' | 'excludedLists'>
  ) => {
    const newList = currentList.includes(id) 
      ? currentList.filter(item => item !== id) 
      : [...currentList, id];
    updateState({ [key]: newList });
  };
  
  const handleApplyFilter = (newFilterGroup: FilterGroup | undefined) => {
    updateState({ filterGroup: newFilterGroup });
  };

  // Filtering lists for display
  const filteredSegments = segments.filter(seg =>
    searchQuery === "" || seg.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredLists = lists.filter(list =>
    searchQuery === "" || list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredDomainSets = domainSets.filter(ds =>
    searchQuery === "" || ds.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Tabs value={audienceSource} onValueChange={(v) => setAudienceSource(v as any)}>
        <TabsList className="grid w-full grid-cols-4 rounded-xl border border-border/60 bg-card/60 p-1.5">
          <TabsTrigger value="filters" data-testid="tab-advanced-filters">
            <Filter className="w-4 h-4 mr-2" />
            Advanced Filters
          </TabsTrigger>
          <TabsTrigger value="segment" data-testid="tab-segment">
            <Users className="w-4 h-4 mr-2" />
            Segment
          </TabsTrigger>
          <TabsTrigger value="list" data-testid="tab-list">
            <List className="w-4 h-4 mr-2" />
            Static List
          </TabsTrigger>
          <TabsTrigger value="domain_set" data-testid="tab-domain-set">
            <Globe className="w-4 h-4 mr-2" />
            Domain Set
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Audience Filters</CardTitle>
              <CardDescription>
                Build custom audience using multi-criteria filters across Contact, Account, and Campaign data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <SidebarFilters
                    entityType="contact"
                    onApplyFilter={handleApplyFilter}
                    initialFilter={filterGroup}
                  />
                </div>
              </div>

              {filterGroup && filterGroup.conditions.length > 0 && (
                <div className="border border-border/60 rounded-xl p-4 bg-card/60">
                  <p className="text-sm font-medium mb-2">Active Filters:</p>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                      <span>Match</span> <Badge variant="outline">{filterGroup.logic}</Badge> <span>of {filterGroup.conditions.length} condition{filterGroup.conditions.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-card/60 border border-border/60 rounded-xl">
                <div>
                  <p className="font-medium">Estimated Audience Size</p>
                  <p className="text-2xl font-bold text-primary">
                    {currentEstimatedCount.toLocaleString()} contacts
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-preview-audience"
                    disabled={!filterGroup || filterGroup.conditions.length === 0}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview Sample
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-save-segment"
                    disabled={!filterGroup || filterGroup.conditions.length === 0}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save as Segment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Segments</CardTitle>
              <CardDescription>Choose one or more dynamic segments for this campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Segments</Label>
                <Input 
                  placeholder="Search by segment name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-segments" 
                />
              </div>

              {selectedSegments.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Selected Segments ({selectedSegments.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedSegments.map(id => {
                      const seg = segments.find(s => s.id === id);
                      return seg ? (
                        <Badge key={id} variant="default" className="gap-1">
                          {seg.name}
                          <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(selectedSegments, id, 'selectedSegments')} />
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {segmentsLoading ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/30">
                    <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-3 animate-spin" />
                    <p className="text-muted-foreground">Loading segments...</p>
                  </div>
                ) : filteredSegments.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/30">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-medium">No segments found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {searchQuery 
                        ? "Try a different search term" 
                        : "Create segments from the Segments page to use them here"}
                    </p>
                  </div>
                ) : (
                  filteredSegments.map((seg) => (
                    <Card 
                      key={seg.id} 
                      className={`hover-elevate cursor-pointer transition-all ${selectedSegments.includes(seg.id) ? 'border-primary' : ''}`}
                      data-testid={`segment-card-${seg.id}`}
                      onClick={() => toggleSelection(selectedSegments, seg.id, 'selectedSegments')}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={selectedSegments.includes(seg.id)}
                            onCheckedChange={() => toggleSelection(selectedSegments, seg.id, 'selectedSegments')}
                          />
                          <div>
                            <p className="font-medium">{seg.name}</p>
                            <p className="text-sm text-muted-foreground">{seg.recordCountCache?.toLocaleString() || 0} contacts</p>
                          </div>
                        </div>
                        <Badge>Dynamic</Badge>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {selectedSegments.length > 0 && (
                <>
                  <div className="border-t pt-4 mt-4">
                    <Label className="text-sm font-medium mb-2 block">Additional Filters (Optional)</Label>
                    <p className="text-sm text-muted-foreground mb-3">Apply additional filters to refine the selected segments</p>
                    <SidebarFilters
                      entityType="contact"
                      onApplyFilter={handleApplyFilter}
                      initialFilter={filterGroup}
                    />
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <Label className="text-sm font-medium mb-2 block">Exclude Segments (Optional)</Label>
                    <p className="text-sm text-muted-foreground mb-3">Remove contacts from these segments</p>
                    {excludedSegments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {excludedSegments.map(id => {
                          const seg = segments.find(s => s.id === id);
                          return seg ? (
                            <Badge key={id} variant="destructive" className="gap-1">
                              {seg.name}
                              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(excludedSegments, id, 'excludedSegments')} />
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                    <div className="space-y-2">
                      {segments.filter(s => !selectedSegments.includes(s.id)).slice(0, 3).map((seg) => (
                        <Card 
                          key={seg.id} 
                          className={`cursor-pointer transition-all ${excludedSegments.includes(seg.id) ? 'border-destructive' : ''}`}
                          onClick={() => toggleSelection(excludedSegments, seg.id, 'excludedSegments')}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <Checkbox 
                              checked={excludedSegments.includes(seg.id)}
                              onCheckedChange={() => toggleSelection(excludedSegments, seg.id, 'excludedSegments')}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{seg.name}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Static Lists</CardTitle>
              <CardDescription>Choose one or more static list snapshots for this campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Lists</Label>
                <Input 
                  placeholder="Search by list name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-lists" 
                />
              </div>

              {selectedLists.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Selected Lists ({selectedLists.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedLists.map(id => {
                      const list = lists.find(l => l.id === id);
                      return list ? (
                        <Badge key={id} variant="default" className="gap-1">
                          {list.name}
                          <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(selectedLists, id, 'selectedLists')} />
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {filteredLists.map((list) => (
                  <Card 
                    key={list.id} 
                    className={`hover-elevate cursor-pointer transition-all ${selectedLists.includes(list.id) ? 'border-primary' : ''}`}
                    data-testid={`list-card-${list.id}`}
                    onClick={() => toggleSelection(selectedLists, list.id, 'selectedLists')}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={selectedLists.includes(list.id)}
                          onCheckedChange={() => toggleSelection(selectedLists, list.id, 'selectedLists')}
                        />
                        <div>
                          <p className="font-medium">{list.name}</p>
                          <p className="text-sm text-muted-foreground">{list.recordIds?.length?.toLocaleString() || 0} contacts</p>
                        </div>
                      </div>
                      <Badge variant="outline">Static</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedLists.length > 0 && (
                <>
                  <div className="border-t pt-4 mt-4">
                    <Label className="text-sm font-medium mb-2 block">Additional Filters (Optional)</Label>
                    <p className="text-sm text-muted-foreground mb-3">Apply additional filters to refine the selected lists</p>
                    <SidebarFilters
                      entityType="contact"
                      onApplyFilter={handleApplyFilter}
                      initialFilter={filterGroup}
                    />
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <Label className="text-sm font-medium mb-2 block">Exclude Lists (Optional)</Label>
                    <p className="text-sm text-muted-foreground mb-3">Remove contacts from these lists</p>
                    {excludedLists.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {excludedLists.map(id => {
                          const list = lists.find(l => l.id === id);
                          return list ? (
                            <Badge key={id} variant="destructive" className="gap-1">
                              {list.name}
                              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(excludedLists, id, 'excludedLists')} />
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                    <div className="space-y-2">
                      {lists.filter(l => !selectedLists.includes(l.id)).slice(0, 3).map((list) => (
                        <Card 
                          key={list.id} 
                          className={`cursor-pointer transition-all ${excludedLists.includes(list.id) ? 'border-destructive' : ''}`}
                          onClick={() => toggleSelection(excludedLists, list.id, 'excludedLists')}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <Checkbox 
                              checked={excludedLists.includes(list.id)}
                              onCheckedChange={() => toggleSelection(excludedLists, list.id, 'excludedLists')}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{list.name}</p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domain_set" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Domain Sets</CardTitle>
              <CardDescription>Target accounts from domain sets with matched contacts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Domain Sets</Label>
                <Input 
                  placeholder="Search by domain set name..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-domain-sets" 
                />
              </div>

              {selectedDomainSets.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Selected Domain Sets ({selectedDomainSets.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedDomainSets.map(id => {
                      const ds = domainSets.find(d => d.id === id);
                      return ds ? (
                        <Badge key={id} variant="default" className="gap-1">
                          {ds.name}
                          <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(selectedDomainSets, id, 'selectedDomainSets')} />
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {filteredDomainSets.map((ds) => (
                  <Card 
                    key={ds.id} 
                    className={`hover-elevate cursor-pointer transition-all ${selectedDomainSets.includes(ds.id) ? 'border-primary' : ''}`}
                    data-testid={`domain-set-card-${ds.id}`}
                    onClick={() => toggleSelection(selectedDomainSets, ds.id, 'selectedDomainSets')}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={selectedDomainSets.includes(ds.id)}
                          onCheckedChange={() => toggleSelection(selectedDomainSets, ds.id, 'selectedDomainSets')}
                        />
                        <div>
                          <p className="font-medium">{ds.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {ds.matchedAccounts ?? ds.totalUploaded ?? 0} accounts
                          </p>
                        </div>
                      </div>
                      <Badge>ABM</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!hideSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Audience Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{currentEstimatedCount.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Estimated Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">
                  {audienceSource === "segment" ? selectedSegments.length : 
                   audienceSource === "list" ? selectedLists.length :
                   audienceSource === "domain_set" ? selectedDomainSets.length : 0}
                </div>
                <div className="text-sm text-muted-foreground">Sources Selected</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-500">
                  {excludedSegments.length + excludedLists.length}
                </div>
                <div className="text-sm text-muted-foreground">Exclusions</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
