import { useState, useEffect } from "react"; // Added useEffect import
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Filter, List, Globe, Eye, Save, ChevronRight, X, Loader2, FileText, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineOrgCreator } from "@/components/campaigns/inline-org-creator";
import type { FilterGroup } from "@shared/filter-types";
import type { Segment, List as ListType, DomainSet } from "@shared/schema";

interface Organization {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  isDefault: boolean;
}

interface Step1Props {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  campaignType: "email" | "telemarketing";
}

interface AudienceSelection {
  source: "filters" | "segment" | "list" | "domain_set";
  selectedSegments?: string[];
  selectedLists?: string[];
  selectedDomainSets?: string[];
  excludedSegments?: string[];
  excludedLists?: string[];
  filterGroup?: FilterGroup;
  estimatedCount?: number;
}

// Renamed Step1AudienceSelection to match the original component name and updated prop type.
export function Step1AudienceSelection({ data, onNext, campaignType }: Step1Props) {
  // Campaign Name
  const [campaignName, setCampaignName] = useState(data.name || "");

  // Organization selection for problem intelligence
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(data.organizationId || null);

  // Fetch organizations for dropdown
  const { data: orgsData } = useQuery<{ organizations: Organization[] }>({
    queryKey: ["/api/organizations/dropdown"],
  });

  // Auto-select default org on first load
  useEffect(() => {
    if (orgsData?.organizations && !selectedOrgId && !data.organizationId) {
      const defaultOrg = orgsData.organizations.find((o) => o.isDefault);
      if (defaultOrg) {
        setSelectedOrgId(defaultOrg.id);
      } else if (orgsData.organizations.length > 0) {
        setSelectedOrgId(orgsData.organizations[0].id);
      }
    }
  }, [orgsData?.organizations, selectedOrgId, data.organizationId]);

  const [audienceSource, setAudienceSource] = useState<"filters" | "segment" | "list" | "domain_set">(
    data.audience?.source || "filters"
  );

  const [selectedSegments, setSelectedSegments] = useState<string[]>(data.audience?.selectedSegments || []);
  const [selectedLists, setSelectedLists] = useState<string[]>(data.audience?.selectedLists || []);
  const [selectedDomainSets, setSelectedDomainSets] = useState<string[]>(data.audience?.selectedDomainSets || []);
  const [excludedSegments, setExcludedSegments] = useState<string[]>(data.audience?.excludedSegments || []);
  const [excludedLists, setExcludedLists] = useState<string[]>(data.audience?.excludedLists || []);
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(data.audience?.filterGroup);
  const [appliedFilterGroup, setAppliedFilterGroup] = useState<FilterGroup | undefined>(data.audience?.filterGroup);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch segments
  const { data: segments = [], isLoading: segmentsLoading } = useQuery<Segment[]>({
    queryKey: ['/api/segments'],
  });
  
  // Fetch real-time count for applied filters
  const { data: filterCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/filters/count/contact`, JSON.stringify(appliedFilterGroup)],
    enabled: audienceSource === "filters" && !!appliedFilterGroup && (appliedFilterGroup.conditions?.length ?? 0) > 0,
    refetchOnWindowFocus: false,
  });

  // Fetch lists
  const { data: lists = [], isLoading: listsLoading } = useQuery<ListType[]>({
    queryKey: ['/api/lists'],
  });

  // Fetch domain sets
  const { data: domainSets = [], isLoading: domainSetsLoading } = useQuery<DomainSet[]>({
    queryKey: ['/api/domain-sets'],
  });

  const handleNext = () => {
    const audienceData: AudienceSelection = {
      source: audienceSource,
      selectedSegments,
      selectedLists,
      selectedDomainSets,
      excludedSegments,
      excludedLists,
      filterGroup,
      estimatedCount: calculateEstimatedCount(),
    };

    console.log('Campaign audience data:', audienceData); // Debug log

    onNext({
      name: campaignName,
      organizationId: selectedOrgId,
      audience: audienceData,
    });
  };

  const calculateEstimatedCount = () => {
    // Use real-time filtered count from API
    if (audienceSource === "filters") {
      return filterCountData?.count ?? 0;
    }
    if (audienceSource === "segment" && selectedSegments.length) {
      const totalCount = selectedSegments.reduce((sum, id) => {
        const seg = segments.find(s => s.id === id);
        return sum + (seg?.recordCountCache || 0);
      }, 0);
      return totalCount;
    }
    if (audienceSource === "list" && selectedLists.length) {
      const totalCount = selectedLists.reduce((sum, id) => {
        const list = lists.find(l => l.id === id);
        return sum + (list?.recordIds?.length || 0);
      }, 0);
      return totalCount;
    }
    if (audienceSource === "domain_set" && selectedDomainSets.length) {
      return 543; // Placeholder - would need API endpoint for domain set counts
    }
    return 0;
  };

  const toggleSegment = (id: string) => {
    setSelectedSegments(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const toggleList = (id: string) => {
    setSelectedLists(prev => 
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const toggleDomainSet = (id: string) => {
    setSelectedDomainSets(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const toggleExcludedSegment = (id: string) => {
    setExcludedSegments(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const toggleExcludedList = (id: string) => {
    setExcludedLists(prev => 
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const filteredSegments = segments.filter(seg =>
    searchQuery === "" ||
    seg.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLists = lists.filter(list =>
    searchQuery === "" ||
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDomainSets = domainSets.filter(ds =>
    searchQuery === "" ||
    ds.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Handle filter application - sets both editing and applied filter groups
  const handleApplyFilter = (newFilterGroup: FilterGroup | undefined) => {
    setFilterGroup(newFilterGroup);
    setAppliedFilterGroup(newFilterGroup);
  };

  return (
    <div className="space-y-6">
      {/* Campaign Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Campaign Name
          </CardTitle>
          <CardDescription>Give your campaign a descriptive name</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Name</Label>
              <Input
                id="campaign-name"
                data-testid="input-campaign-name"
                placeholder={campaignType === "email" ? "e.g., Q4 Product Launch Email" : "e.g., Q4 Outbound Dialer Campaign"}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization-select" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Organization
              </Label>
              <div className="flex gap-2">
                <Select
                  value={selectedOrgId || ""}
                  onValueChange={(value) => setSelectedOrgId(value)}
                >
                  <SelectTrigger id="organization-select" data-testid="select-organization" className="flex-1">
                    <SelectValue placeholder="Select organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orgsData?.organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          <span>{org.name}</span>
                          {org.isDefault && (
                            <Badge variant="secondary" className="text-[10px] h-4">
                              Default
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InlineOrgCreator
                  onOrgCreated={(orgId) => setSelectedOrgId(orgId)}
                  triggerVariant="button"
                  triggerSize="default"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for problem intelligence and service catalog matching
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                    {filterGroup && filterGroup.conditions.length > 0 ? calculateEstimatedCount().toLocaleString() : '0'} contacts
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
                          <X className="w-3 h-3 cursor-pointer" onClick={() => toggleSegment(id)} />
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
                      onClick={() => toggleSegment(seg.id)}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={selectedSegments.includes(seg.id)}
                            onCheckedChange={() => toggleSegment(seg.id)}
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
                              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleExcludedSegment(id)} />
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
                          onClick={() => toggleExcludedSegment(seg.id)}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <Checkbox 
                              checked={excludedSegments.includes(seg.id)}
                              onCheckedChange={() => toggleExcludedSegment(seg.id)}
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
                          <X className="w-3 h-3 cursor-pointer" onClick={() => toggleList(id)} />
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
                    onClick={() => toggleList(list.id)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={selectedLists.includes(list.id)}
                          onCheckedChange={() => toggleList(list.id)}
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
                              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleExcludedList(id)} />
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
                          onClick={() => toggleExcludedList(list.id)}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <Checkbox 
                              checked={excludedLists.includes(list.id)}
                              onCheckedChange={() => toggleExcludedList(list.id)}
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
                          <X className="w-3 h-3 cursor-pointer" onClick={() => toggleDomainSet(id)} />
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
                    onClick={() => toggleDomainSet(ds.id)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={selectedDomainSets.includes(ds.id)}
                          onCheckedChange={() => toggleDomainSet(ds.id)}
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

      {/* Audience Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Audience Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">{calculateEstimatedCount().toLocaleString()}</div>
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

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          size="lg"
          data-testid="button-next-step"
          disabled={
            !campaignName.trim() ||
            (audienceSource === "segment" && selectedSegments.length === 0) ||
            (audienceSource === "list" && selectedLists.length === 0) ||
            (audienceSource === "domain_set" && selectedDomainSets.length === 0) ||
            (audienceSource === "filters" && (!filterGroup || filterGroup.conditions.length === 0))
          }
        >
          Continue to Content Setup
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
