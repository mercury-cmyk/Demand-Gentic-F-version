import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Filter, List, Globe, Eye, Save, X, Loader2, ChevronDown, ChevronUp, SlidersHorizontal, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  // Organization ID for AI-powered filter generation from Organization Intelligence
  organizationId?: string;
}

export function CampaignAudienceSelector({ value, onChange, hideSummary = false, organizationId }: CampaignAudienceSelectorProps) {

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [showExclusions, setShowExclusions] = useState(false);
  const [showRefineFilters, setShowRefineFilters] = useState(false);
  const [aiReasoning, setAiReasoning] = useState(null);

  const { toast } = useToast();

  // AI audience filter generation mutation
  const aiGenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/generate-audience-filters", {
        organizationId,
      });
      return res.json();
    },
    onSuccess: (data: { filterGroup: FilterGroup; reasoning: string; confidence: number }) => {
      onChange({ ...value, filterGroup: data.filterGroup });
      setAiReasoning(data.reasoning);
      toast({
        title: "AI Filters Generated",
        description: `${data.filterGroup.conditions.length} filter conditions created (${Math.round(data.confidence * 100)}% confidence)`,
      });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to generate filters with AI";
      toast({
        title: "AI Generation Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  // Convenience getters for current value
  const audienceSource = value.source || "filters";
  const selectedSegments = value.selectedSegments || [];
  const selectedLists = value.selectedLists || [];
  const selectedDomainSets = value.selectedDomainSets || [];
  const excludedSegments = value.excludedSegments || [];
  const excludedLists = value.excludedLists || [];
  const filterGroup = value.filterGroup;

  // Fetch segments
  const { data: segments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: ['/api/segments'],
  });

  // Fetch lists
  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['/api/lists'],
  });

  // Fetch domain sets
  const { data: domainSets = [], isLoading: domainSetsLoading } = useQuery({
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
  const { data: filterCountData } = useQuery({
    queryKey: [`/api/filters/count/contact`, JSON.stringify(filterGroup)],
    enabled: audienceSource === "filters" && !!filterGroup && (filterGroup.conditions?.length ?? 0) > 0,
    refetchOnWindowFocus: false,
  });

  // Fetch scoped count when list/segment has additional filters applied (intersection count)
  const { data: scopedCountData, isLoading: scopedCountLoading } = useQuery({
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
  const updateState = (updates: Partial) => {
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
    key: keyof Pick
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
    
      {/* Step 1: Choose Audience Source */}
      
        
          
            
            Audience Source
          
          Choose how to define your campaign audience
        
        
           setAudienceSource(v as AudienceSelection['source'])}>
            
              
                
                Static List
              
              
                
                Segment
              
              
                
                Advanced Filters
              
              
                
                Domain Set
              
            

            {/* Static List Tab */}
            
              
                 setSearchQuery(e.target.value)}
                  data-testid="input-search-lists"
                  className="h-9"
                />
              

              {selectedLists.length > 0 && (
                
                  {selectedLists.map(id => {
                    const list = lists.find(l => l.id === id);
                    return list ? (
                      
                        {list.name}
                         toggleSelection(selectedLists, id, 'selectedLists')} />
                      
                    ) : null;
                  })}
                
              )}

              
                {listsLoading ? (
                  
                    
                    Loading lists...
                  
                ) : filteredLists.length === 0 ? (
                  
                    
                    
                      {searchQuery ? "No lists match your search" : "No lists available"}
                    
                  
                ) : (
                  filteredLists.map((list) => (
                     toggleSelection(selectedLists, list.id, 'selectedLists')}
                    >
                       toggleSelection(selectedLists, list.id, 'selectedLists')}
                      />
                      
                        {list.name}
                        {list.recordIds?.length?.toLocaleString() || 0} contacts
                      
                      Static
                    
                  ))
                )}
              
            

            {/* Segment Tab */}
            
              
                 setSearchQuery(e.target.value)}
                  data-testid="input-search-segments"
                  className="h-9"
                />
              

              {selectedSegments.length > 0 && (
                
                  {selectedSegments.map(id => {
                    const seg = segments.find(s => s.id === id);
                    return seg ? (
                      
                        {seg.name}
                         toggleSelection(selectedSegments, id, 'selectedSegments')} />
                      
                    ) : null;
                  })}
                
              )}

              
                {segmentsLoading ? (
                  
                    
                    Loading segments...
                  
                ) : filteredSegments.length === 0 ? (
                  
                    
                    
                      {searchQuery ? "No segments match your search" : "No segments available"}
                    
                  
                ) : (
                  filteredSegments.map((seg) => (
                     toggleSelection(selectedSegments, seg.id, 'selectedSegments')}
                    >
                       toggleSelection(selectedSegments, seg.id, 'selectedSegments')}
                      />
                      
                        {seg.name}
                        {seg.recordCountCache?.toLocaleString() || 0} contacts
                      
                      Dynamic
                    
                  ))
                )}
              
            

            {/* Advanced Filters Tab */}
            
              {organizationId && (
                
                  
                  
                    AI-Powered Targeting
                    
                      Auto-generate filters from your Organization Intelligence ICP data
                    
                  
                   aiGenerateMutation.mutate()}
                    disabled={aiGenerateMutation.isPending}
                  >
                    {aiGenerateMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    {aiGenerateMutation.isPending ? "Generating..." : "Generate with AI"}
                  
                
              )}

              {aiReasoning && filterGroup && filterGroup.conditions.length > 0 && (
                
                  
                  
                    {aiReasoning}
                  
                   setAiReasoning(null)}>
                    
                  
                
              )}

              

              {filterGroup && filterGroup.conditions.length > 0 && (
                
                  
                    Match {filterGroup.logic} of {filterGroup.conditions.length} condition{filterGroup.conditions.length !== 1 ? 's' : ''}
                  
                
              )}

              
                
                  Estimated Audience
                  
                    {currentEstimatedCount.toLocaleString()} contacts
                  
                
                
                  
                    
                    Preview
                  
                  
                    
                    Save Segment
                  
                
              
            

            {/* Domain Set Tab */}
            
              
                 setSearchQuery(e.target.value)}
                  data-testid="input-search-domain-sets"
                  className="h-9"
                />
              

              {selectedDomainSets.length > 0 && (
                
                  {selectedDomainSets.map(id => {
                    const ds = domainSets.find(d => d.id === id);
                    return ds ? (
                      
                        {ds.name}
                         toggleSelection(selectedDomainSets, id, 'selectedDomainSets')} />
                      
                    ) : null;
                  })}
                
              )}

              
                {domainSetsLoading ? (
                  
                    
                    Loading domain sets...
                  
                ) : filteredDomainSets.length === 0 ? (
                  
                    
                    
                      {searchQuery ? "No domain sets match your search" : "No domain sets available"}
                    
                  
                ) : (
                  filteredDomainSets.map((ds) => (
                     toggleSelection(selectedDomainSets, ds.id, 'selectedDomainSets')}
                    >
                       toggleSelection(selectedDomainSets, ds.id, 'selectedDomainSets')}
                      />
                      
                        {ds.name}
                        
                          {ds.matchedAccounts ?? ds.totalUploaded ?? 0} accounts
                        
                      
                      ABM
                    
                  ))
                )}
              
            
          
        
      

      {/* Step 2: Refine with Filters (shown when list/segment is selected with items) */}
      {hasSourceSelections && audienceSource !== "filters" && (
        
          
            
              
                
                  
                  Refine Audience
                
                
                  Apply filters to narrow down contacts within your selected {audienceSource === 'list' ? 'lists' : 'segments'}
                
              
              
                {organizationId && (
                   {
                      setShowRefineFilters(true);
                      aiGenerateMutation.mutate();
                    }}
                    disabled={aiGenerateMutation.isPending}
                  >
                    {aiGenerateMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    {aiGenerateMutation.isPending ? "Generating..." : "AI Filters"}
                  
                )}
                 setShowRefineFilters(!showRefineFilters)}
                >
                  
                  {showRefineFilters ? 'Hide Filters' : 'Add Filters'}
                
              
            
          
          {showRefineFilters && (
            
              

              {isIntersectionMode && (
                
                  
                  
                    
                      {scopedCountLoading ? (
                        
                          
                          Calculating...
                        
                      ) : (
                        <>
                          {currentEstimatedCount.toLocaleString()} of {baseCount.toLocaleString()} contacts match your filters
                        
                      )}
                    
                    
                      {filterGroup?.conditions.length} filter{filterGroup?.conditions.length !== 1 ? 's' : ''} applied to narrow down {audienceSource === 'list' ? 'list' : 'segment'} audience
                    
                  
                   handleApplyFilter(undefined)}
                  >
                    Clear Filters
                  
                
              )}
            
          )}
        
      )}

      {/* Step 3: Exclusions (collapsible, for list/segment sources) */}
      {hasSourceSelections && (
        
           setShowExclusions(!showExclusions)}
          >
            
              
                Exclusions
              
              {totalExclusions > 0 && (
                {totalExclusions} active
              )}
            
            {showExclusions ?  : }
          

          {showExclusions && (
            
              {/* Exclude Segments */}
              {audienceSource === 'segment' && (
                
                  Exclude Segments
                  {excludedSegments.length > 0 && (
                    
                      {excludedSegments.map(id => {
                        const seg = segments.find(s => s.id === id);
                        return seg ? (
                          
                            {seg.name}
                             toggleSelection(excludedSegments, id, 'excludedSegments')} />
                          
                        ) : null;
                      })}
                    
                  )}
                  
                    {segments.filter(s => !selectedSegments.includes(s.id)).slice(0, 5).map((seg) => (
                       toggleSelection(excludedSegments, seg.id, 'excludedSegments')}
                      >
                         toggleSelection(excludedSegments, seg.id, 'excludedSegments')}
                        />
                        {seg.name}
                      
                    ))}
                  
                
              )}

              {/* Exclude Lists */}
              {audienceSource === 'list' && (
                
                  Exclude Lists
                  {excludedLists.length > 0 && (
                    
                      {excludedLists.map(id => {
                        const list = lists.find(l => l.id === id);
                        return list ? (
                          
                            {list.name}
                             toggleSelection(excludedLists, id, 'excludedLists')} />
                          
                        ) : null;
                      })}
                    
                  )}
                  
                    {lists.filter(l => !selectedLists.includes(l.id)).slice(0, 5).map((list) => (
                       toggleSelection(excludedLists, list.id, 'excludedLists')}
                      >
                         toggleSelection(excludedLists, list.id, 'excludedLists')}
                        />
                        {list.name}
                      
                    ))}
                  
                
              )}
            
          )}
        
      )}

      {/* Audience Summary */}
      {!hideSummary && (
        
          
            
              
                {currentEstimatedCount.toLocaleString()}
                
                  {isIntersectionMode ? 'Filtered Total' : 'Estimated Total'}
                
              
              
                
                  {audienceSource === "segment" ? selectedSegments.length :
                   audienceSource === "list" ? selectedLists.length :
                   audienceSource === "domain_set" ? selectedDomainSets.length :
                   (filterGroup?.conditions?.length || 0)}
                
                
                  {audienceSource === "filters" ? 'Filter Conditions' : 'Sources Selected'}
                
              
              
                
                  {totalExclusions + (isIntersectionMode ? (filterGroup?.conditions?.length || 0) : 0)}
                
                
                  {isIntersectionMode ? 'Filters & Exclusions' : 'Exclusions'}
                
              
            
          
        
      )}
    
  );
}