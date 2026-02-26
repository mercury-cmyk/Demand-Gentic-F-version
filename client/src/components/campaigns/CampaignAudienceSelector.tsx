import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Filter, List, Globe, Eye, Save, X, Loader2, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [showExclusions, setShowExclusions] = useState(false);
  const [showRefineFilters, setShowRefineFilters] = useState(false);

  // Convenience getters for current value
  const audienceSource = value.source || "filters";
  const selectedSegments = value.selectedSegments || [];
  const selectedLists = value.selectedLists || [];
  const selectedDomainSets = value.selectedDomainSets || [];
  const excludedSegments = value.excludedSegments || [];
  const excludedLists = value.excludedLists || [];
  const filterGroup = value.filterGroup;

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

  // Determine if filters are narrowing a list/segment (intersection mode)
  const hasSourceSelections = (audienceSource === 'list' && selectedLists.length > 0) ||
    (audienceSource === 'segment' && selectedSegments.length > 0);
  const hasRefineFilters = !!filterGroup && (filterGroup.conditions?.length ?? 0) > 0;
  const isIntersectionMode = hasSourceSelections && hasRefineFilters;

  // Build audienceScope for scoped queries
  const audienceScope = audienceSource === 'list' && selectedLists.length > 0
    ? { listIds: selectedLists }
    : audienceSource === 'segment' && selectedSegments.length > 0
      ? { segmentIds: selectedSegments }
      : undefined;

  // Calculate base count from selected sources (without filters applied)
  const calculateBaseCount = () => {
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

  // Fetch real-time count for standalone filter mode
  const { data: filterCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/filters/count/contact`, JSON.stringify(filterGroup)],
    enabled: audienceSource === "filters" && !!filterGroup && (filterGroup.conditions?.length ?? 0) > 0,
    refetchOnWindowFocus: false,
  });

  // Fetch scoped count when list/segment has additional filters applied (intersection count)
  const { data: scopedCountData, isLoading: scopedCountLoading } = useQuery<{ count: number }>({
    queryKey: [
      `/api/filters/count/contact`,
      'scoped',
      JSON.stringify(filterGroup),
      JSON.stringify(audienceScope),
    ],
    queryFn: async () => {
      const response = await apiRequest('POST', '/api/filters/count/contact', {
        filterGroup,
        audienceScope,
      });
      return response.json();
    },
    enabled: isIntersectionMode && !!audienceScope,
    refetchOnWindowFocus: false,
  });

  const baseCount = calculateBaseCount();
  const currentEstimatedCount = audienceSource === "filters"
    ? (filterCountData?.count ?? 0)
    : isIntersectionMode
      ? (scopedCountData?.count ?? baseCount)
      : baseCount;

  // Helper to update state
  const updateState = (updates: Partial<AudienceSelection>) => {
    onChange({ ...value, ...updates });
  };

  const setAudienceSource = (source: AudienceSelection['source']) => {
    // Clear filter group when switching sources to avoid stale filters
    updateState({ source, filterGroup: undefined });
    setShowRefineFilters(false);
  };

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

  // Filtering for display
  const filteredSegments = segments.filter(seg =>
    searchQuery === "" || seg.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredLists = lists.filter(list =>
    searchQuery === "" || list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredDomainSets = domainSets.filter(ds =>
    searchQuery === "" || ds.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Exclusion counts
  const totalExclusions = excludedSegments.length + excludedLists.length;

  return (
    <div className="space-y-4">
      {/* Step 1: Choose Audience Source */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Audience Source
          </CardTitle>
          <CardDescription>Choose how to define your campaign audience</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={audienceSource} onValueChange={(v) => setAudienceSource(v as AudienceSelection['source'])}>
            <TabsList className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border/60 bg-card/60 p-1.5 mb-4">
              <TabsTrigger value="list" data-testid="tab-list" className="gap-2">
                <List className="w-4 h-4" />
                Static List
              </TabsTrigger>
              <TabsTrigger value="segment" data-testid="tab-segment" className="gap-2">
                <Users className="w-4 h-4" />
                Segment
              </TabsTrigger>
              <TabsTrigger value="filters" data-testid="tab-advanced-filters" className="gap-2">
                <Filter className="w-4 h-4" />
                Advanced Filters
              </TabsTrigger>
              <TabsTrigger value="domain_set" data-testid="tab-domain-set" className="gap-2">
                <Globe className="w-4 h-4" />
                Domain Set
              </TabsTrigger>
            </TabsList>

            {/* Static List Tab */}
            <TabsContent value="list" className="space-y-3 mt-0">
              <div className="space-y-2">
                <Input
                  placeholder="Search lists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-lists"
                  className="h-9"
                />
              </div>

              {selectedLists.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedLists.map(id => {
                    const list = lists.find(l => l.id === id);
                    return list ? (
                      <Badge key={id} variant="default" className="gap-1 text-xs">
                        {list.name}
                        <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(selectedLists, id, 'selectedLists')} />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {listsLoading ? (
                  <div className="text-center py-6">
                    <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground mt-2">Loading lists...</p>
                  </div>
                ) : filteredLists.length === 0 ? (
                  <div className="text-center py-6">
                    <List className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? "No lists match your search" : "No lists available"}
                    </p>
                  </div>
                ) : (
                  filteredLists.map((list) => (
                    <div
                      key={list.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${selectedLists.includes(list.id) ? 'border-primary bg-primary/5' : 'border-border/60'}`}
                      data-testid={`list-card-${list.id}`}
                      onClick={() => toggleSelection(selectedLists, list.id, 'selectedLists')}
                    >
                      <Checkbox
                        checked={selectedLists.includes(list.id)}
                        onCheckedChange={() => toggleSelection(selectedLists, list.id, 'selectedLists')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{list.name}</p>
                        <p className="text-xs text-muted-foreground">{list.recordIds?.length?.toLocaleString() || 0} contacts</p>
                      </div>
                      <Badge variant="outline" className="text-xs flex-shrink-0">Static</Badge>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Segment Tab */}
            <TabsContent value="segment" className="space-y-3 mt-0">
              <div className="space-y-2">
                <Input
                  placeholder="Search segments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-segments"
                  className="h-9"
                />
              </div>

              {selectedSegments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSegments.map(id => {
                    const seg = segments.find(s => s.id === id);
                    return seg ? (
                      <Badge key={id} variant="default" className="gap-1 text-xs">
                        {seg.name}
                        <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(selectedSegments, id, 'selectedSegments')} />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {segmentsLoading ? (
                  <div className="text-center py-6">
                    <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground mt-2">Loading segments...</p>
                  </div>
                ) : filteredSegments.length === 0 ? (
                  <div className="text-center py-6">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? "No segments match your search" : "No segments available"}
                    </p>
                  </div>
                ) : (
                  filteredSegments.map((seg) => (
                    <div
                      key={seg.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${selectedSegments.includes(seg.id) ? 'border-primary bg-primary/5' : 'border-border/60'}`}
                      data-testid={`segment-card-${seg.id}`}
                      onClick={() => toggleSelection(selectedSegments, seg.id, 'selectedSegments')}
                    >
                      <Checkbox
                        checked={selectedSegments.includes(seg.id)}
                        onCheckedChange={() => toggleSelection(selectedSegments, seg.id, 'selectedSegments')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{seg.name}</p>
                        <p className="text-xs text-muted-foreground">{seg.recordCountCache?.toLocaleString() || 0} contacts</p>
                      </div>
                      <Badge className="text-xs flex-shrink-0">Dynamic</Badge>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Advanced Filters Tab */}
            <TabsContent value="filters" className="space-y-3 mt-0">
              <SidebarFilters
                entityType="contact"
                onApplyFilter={handleApplyFilter}
                initialFilter={filterGroup}
              />

              {filterGroup && filterGroup.conditions.length > 0 && (
                <div className="border border-border/60 rounded-lg p-3 bg-card/60">
                  <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                    <span>Match</span> <Badge variant="outline" className="text-xs">{filterGroup.logic}</Badge> <span>of {filterGroup.conditions.length} condition{filterGroup.conditions.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-card/60 border border-border/60 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Estimated Audience</p>
                  <p className="text-xl font-bold text-primary">
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
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-save-segment"
                    disabled={!filterGroup || filterGroup.conditions.length === 0}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save Segment
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Domain Set Tab */}
            <TabsContent value="domain_set" className="space-y-3 mt-0">
              <div className="space-y-2">
                <Input
                  placeholder="Search domain sets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-domain-sets"
                  className="h-9"
                />
              </div>

              {selectedDomainSets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedDomainSets.map(id => {
                    const ds = domainSets.find(d => d.id === id);
                    return ds ? (
                      <Badge key={id} variant="default" className="gap-1 text-xs">
                        {ds.name}
                        <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(selectedDomainSets, id, 'selectedDomainSets')} />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {domainSetsLoading ? (
                  <div className="text-center py-6">
                    <Loader2 className="h-6 w-6 mx-auto text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground mt-2">Loading domain sets...</p>
                  </div>
                ) : filteredDomainSets.length === 0 ? (
                  <div className="text-center py-6">
                    <Globe className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? "No domain sets match your search" : "No domain sets available"}
                    </p>
                  </div>
                ) : (
                  filteredDomainSets.map((ds) => (
                    <div
                      key={ds.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${selectedDomainSets.includes(ds.id) ? 'border-primary bg-primary/5' : 'border-border/60'}`}
                      data-testid={`domain-set-card-${ds.id}`}
                      onClick={() => toggleSelection(selectedDomainSets, ds.id, 'selectedDomainSets')}
                    >
                      <Checkbox
                        checked={selectedDomainSets.includes(ds.id)}
                        onCheckedChange={() => toggleSelection(selectedDomainSets, ds.id, 'selectedDomainSets')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{ds.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ds.matchedAccounts ?? ds.totalUploaded ?? 0} accounts
                        </p>
                      </div>
                      <Badge className="text-xs flex-shrink-0">ABM</Badge>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Step 2: Refine with Filters (shown when list/segment is selected with items) */}
      {hasSourceSelections && audienceSource !== "filters" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Refine Audience
                </CardTitle>
                <CardDescription>
                  Apply filters to narrow down contacts within your selected {audienceSource === 'list' ? 'lists' : 'segments'}
                </CardDescription>
              </div>
              <Button
                variant={showRefineFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRefineFilters(!showRefineFilters)}
              >
                <Filter className="w-3.5 h-3.5 mr-1.5" />
                {showRefineFilters ? 'Hide Filters' : 'Add Filters'}
              </Button>
            </div>
          </CardHeader>
          {showRefineFilters && (
            <CardContent className="pt-0 space-y-3">
              <SidebarFilters
                entityType="contact"
                onApplyFilter={handleApplyFilter}
                initialFilter={filterGroup}
                audienceScope={audienceScope}
              />

              {isIntersectionMode && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <Filter className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {scopedCountLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Calculating...
                        </span>
                      ) : (
                        <>
                          {currentEstimatedCount.toLocaleString()} of {baseCount.toLocaleString()} contacts match your filters
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filterGroup?.conditions.length} filter{filterGroup?.conditions.length !== 1 ? 's' : ''} applied to narrow down {audienceSource === 'list' ? 'list' : 'segment'} audience
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleApplyFilter(undefined)}
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Step 3: Exclusions (collapsible, for list/segment sources) */}
      {hasSourceSelections && (
        <div className="border border-border/60 rounded-lg">
          <button
            className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
            onClick={() => setShowExclusions(!showExclusions)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Exclusions
              </span>
              {totalExclusions > 0 && (
                <Badge variant="secondary" className="text-xs">{totalExclusions} active</Badge>
              )}
            </div>
            {showExclusions ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showExclusions && (
            <div className="px-3 pb-3 space-y-3">
              {/* Exclude Segments */}
              {audienceSource === 'segment' && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Exclude Segments</Label>
                  {excludedSegments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {excludedSegments.map(id => {
                        const seg = segments.find(s => s.id === id);
                        return seg ? (
                          <Badge key={id} variant="destructive" className="gap-1 text-xs">
                            {seg.name}
                            <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(excludedSegments, id, 'excludedSegments')} />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {segments.filter(s => !selectedSegments.includes(s.id)).slice(0, 5).map((seg) => (
                      <div
                        key={seg.id}
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm transition-colors ${excludedSegments.includes(seg.id) ? 'border-destructive/50 bg-destructive/5' : 'hover:bg-muted/30'}`}
                        onClick={() => toggleSelection(excludedSegments, seg.id, 'excludedSegments')}
                      >
                        <Checkbox
                          checked={excludedSegments.includes(seg.id)}
                          onCheckedChange={() => toggleSelection(excludedSegments, seg.id, 'excludedSegments')}
                        />
                        <span className="truncate">{seg.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exclude Lists */}
              {audienceSource === 'list' && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Exclude Lists</Label>
                  {excludedLists.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {excludedLists.map(id => {
                        const list = lists.find(l => l.id === id);
                        return list ? (
                          <Badge key={id} variant="destructive" className="gap-1 text-xs">
                            {list.name}
                            <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSelection(excludedLists, id, 'excludedLists')} />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {lists.filter(l => !selectedLists.includes(l.id)).slice(0, 5).map((list) => (
                      <div
                        key={list.id}
                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm transition-colors ${excludedLists.includes(list.id) ? 'border-destructive/50 bg-destructive/5' : 'hover:bg-muted/30'}`}
                        onClick={() => toggleSelection(excludedLists, list.id, 'excludedLists')}
                      >
                        <Checkbox
                          checked={excludedLists.includes(list.id)}
                          onCheckedChange={() => toggleSelection(excludedLists, list.id, 'excludedLists')}
                        />
                        <span className="truncate">{list.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audience Summary */}
      {!hideSummary && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{currentEstimatedCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">
                  {isIntersectionMode ? 'Filtered Total' : 'Estimated Total'}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">
                  {audienceSource === "segment" ? selectedSegments.length :
                   audienceSource === "list" ? selectedLists.length :
                   audienceSource === "domain_set" ? selectedDomainSets.length :
                   (filterGroup?.conditions?.length || 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {audienceSource === "filters" ? 'Filter Conditions' : 'Sources Selected'}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-500">
                  {totalExclusions + (isIntersectionMode ? (filterGroup?.conditions?.length || 0) : 0)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isIntersectionMode ? 'Filters & Exclusions' : 'Exclusions'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
