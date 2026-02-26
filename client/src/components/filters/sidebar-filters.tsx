import { useState, useEffect, useMemo } from "react";
import { Filter, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FilterGroup, FilterCondition, filterFieldsByEntity, type EntityType } from "@shared/filter-types";
import { UnifiedFilterRow } from "./unified-filter-row";

interface DynamicFieldConfig {
  key: string;
  label: string;
  type: string;
  operators: string[];
  category: string;
  typeAhead?: boolean;
  typeAheadSource?: string;
}

interface FilterFieldsResponse {
  fields: DynamicFieldConfig[];
  grouped: Record<string, DynamicFieldConfig[]>;
  categories: string[];
}

interface SidebarFiltersProps {
  entityType: EntityType;
  onApplyFilter: (filterGroup: FilterGroup | undefined) => void;
  initialFilter?: FilterGroup;
  embedded?: boolean;
  campaignId?: string;
  includeRelatedEntities?: boolean;
  /** Scope filter count to specific lists/segments (intersection filtering) */
  audienceScope?: {
    listIds?: string[];
    segmentIds?: string[];
  };
}

/**
 * Beautiful Left Sidebar Filter Panel
 * 
 * Enterprise-grade filter UI with:
 * - Persistent left sidebar (≥1280px) or drawer (<1280px)
 * - Dynamic fields from API including custom fields
 * - Unified 8-operator model
 * - Multi-value chips input
 * - Real-time result count
 * - Smooth animations
 */
export function SidebarFilters({
  entityType,
  onApplyFilter,
  initialFilter,
  embedded = false,
  campaignId,
  includeRelatedEntities = true,
  audienceScope,
}: SidebarFiltersProps) {
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(
    initialFilter || {
      logic: "AND",
      conditions: [],
    }
  );
  const [isApplying, setIsApplying] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Build fallback fields from hardcoded configs (used when API fails or loading)
  const fallbackData = useMemo(() => {
    const getFieldsFromConfig = (fieldConfigs: Record<string, any>) => {
      return Object.entries(fieldConfigs).map(([key, config]) => ({
        key,
        label: config.label,
        type: config.type || 'text',
        operators: config.applicableOperators || ['equals', 'not_equals', 'contains', 'is_empty', 'has_any_value'],
        category: config.category || 'Other',
        typeAhead: config.typeAhead,
        typeAheadSource: config.typeAheadSource
      }));
    };
    
    // Get fields from the filterFieldsByEntity map for the current entity type
    const entityFields = filterFieldsByEntity[entityType];
    let fields: DynamicFieldConfig[] = entityFields ? getFieldsFromConfig(entityFields) : [];
    
    // For contacts, optionally include account fields
    if (entityType === 'contact' && includeRelatedEntities && filterFieldsByEntity.account) {
      const accountFields = getFieldsFromConfig(filterFieldsByEntity.account);
      const existingKeys = new Set(fields.map(field => field.key));
      const uniqueAccountFields = accountFields.filter(field => !existingKeys.has(field.key));
      fields = [...fields, ...uniqueAccountFields];
    }
    
    const grouped = fields.reduce((acc: Record<string, DynamicFieldConfig[]>, field) => {
      if (!acc[field.category]) {
        acc[field.category] = [];
      }
      acc[field.category].push(field);
      return acc;
    }, {});
    
    return { fields, grouped };
  }, [entityType, includeRelatedEntities]);

  // Fetch dynamic filter fields from API (includes custom fields)
  const { data: filterFieldsData, isLoading: isFieldsLoading, isError } = useQuery<FilterFieldsResponse>({
    queryKey: [`/api/filters/fields/entity/${entityType}`, includeRelatedEntities],
    queryFn: async () => {
      const url = includeRelatedEntities 
        ? `/api/filters/fields/entity/${entityType}?includeRelated=true`
        : `/api/filters/fields/entity/${entityType}`;
      const response = await apiRequest("GET", url);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Use API fields if available, otherwise use fallback
  const dynamicFields = (filterFieldsData?.fields && filterFieldsData.fields.length > 0) 
    ? filterFieldsData.fields 
    : fallbackData.fields;
  const groupedFields = (filterFieldsData?.grouped && Object.keys(filterFieldsData.grouped).length > 0) 
    ? filterFieldsData.grouped 
    : fallbackData.grouped;
  
  // Fields are ready if API loaded successfully or we're using fallback
  const fieldsReady = !isFieldsLoading || fallbackData.fields.length > 0;

  // Sync local filterGroup with initialFilter prop changes
  useEffect(() => {
    if (initialFilter) {
      setFilterGroup(initialFilter);
    } else {
      setFilterGroup({
        logic: "AND",
        conditions: [],
      });
    }
  }, [initialFilter]);

  // Fetch filter count in real-time (with optional audience scope for intersection filtering)
  const { data: countData, isLoading: isCountLoading } = useQuery<{
    count?: number;
    campaign_audience_count?: number;
    filter_match_count?: number;
  }>({
    queryKey: campaignId
      ? ['/api/campaigns', campaignId, 'queues/filter-count', JSON.stringify(filterGroup)]
      : [`/api/filters/count/${entityType}`, JSON.stringify(filterGroup), JSON.stringify(audienceScope)],
    queryFn: async () => {
      if (campaignId) {
        const response = await apiRequest(
          "POST",
          `/api/campaigns/${campaignId}/queues/filter-count`,
          { filters: filterGroup }
        );
        return response.json();
      } else {
        if (filterGroup.conditions.length === 0) {
          return { count: 0 };
        }
        const body: any = { filterGroup };
        if (audienceScope && (audienceScope.listIds?.length || audienceScope.segmentIds?.length)) {
          body.audienceScope = audienceScope;
        }
        const response = await apiRequest(
          "POST",
          `/api/filters/count/${entityType}`,
          body
        );
        return response.json();
      }
    },
    enabled: campaignId ? true : filterGroup.conditions.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const campaignAudienceCount = countData?.campaign_audience_count ?? 0;
  const resultsCount = countData?.filter_match_count ?? countData?.count ?? 0;

  // Get default field for new conditions
  const getDefaultField = () => {
    if (dynamicFields.length > 0) {
      if (entityType === "contact") {
        const fullNameField = dynamicFields.find(f => f.key === "fullName");
        if (fullNameField) return fullNameField.key;
      } else {
        const nameField = dynamicFields.find(f => f.key === "name");
        if (nameField) return nameField.key;
      }
      return dynamicFields[0].key;
    }
    return entityType === "account" ? "name" : "fullName";
  };

  // Add new condition
  const addCondition = () => {
    const defaultField = getDefaultField();
    const newCondition: FilterCondition = {
      id: `${Date.now()}-${Math.random()}`,
      field: defaultField,
      operator: "equals",
      values: [],
    };
    setFilterGroup({
      ...filterGroup,
      conditions: [...filterGroup.conditions, newCondition],
    });
  };

  // Remove condition
  const removeCondition = (id: string) => {
    setFilterGroup({
      ...filterGroup,
      conditions: filterGroup.conditions.filter((c) => c.id !== id),
    });
  };

  // Update condition
  const updateCondition = (id: string, updatedCondition: FilterCondition) => {
    setFilterGroup({
      ...filterGroup,
      conditions: filterGroup.conditions.map((c) =>
        c.id === id ? updatedCondition : c
      ),
    });
  };

  // Apply filters with animation
  const handleApply = async () => {
    setIsApplying(true);
    
    const validConditions = filterGroup.conditions.filter(condition => {
      const needsValues = condition.operator !== 'is_empty' && condition.operator !== 'has_any_value';
      const hasValues = condition.values && condition.values.length > 0;
      return !needsValues || hasValues;
    });
    
    const filterToApply = validConditions.length === 0 ? undefined : {
      ...filterGroup,
      conditions: validConditions
    };
    
    if (validConditions.length !== filterGroup.conditions.length) {
      setFilterGroup({
        ...filterGroup,
        conditions: validConditions
      });
    }
    
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    onApplyFilter(filterToApply);
    setIsApplying(false);
    setMobileOpen(false);
  };

  // Clear all filters
  const handleClear = () => {
    setFilterGroup({
      logic: "AND",
      conditions: [],
    });
    onApplyFilter(undefined);
  };

  const activeFilterCount = filterGroup.conditions.length;
  
  const validFilterCount = filterGroup.conditions.filter(condition => {
    const needsValues = condition.operator !== 'is_empty' && condition.operator !== 'has_any_value';
    return !needsValues || condition.values.length > 0;
  }).length;

  // Sidebar Content Component (reused for both desktop and mobile)
  const SidebarContent = () => (
    <div className={`flex flex-col ${embedded ? 'h-auto' : 'h-full'} bg-white dark:bg-slate-900`}>
      {/* Header - Hidden when embedded since parent provides header */}
      {!embedded && (
        <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">Filters</h2>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          
          {/* Result Count */}
          {filterGroup.conditions.length > 0 && (
            <p
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
              data-testid="text-result-count"
            >
              {isCountLoading ? (
                "Counting..."
              ) : (
                <>
                  Showing{" "}
                  <span className="font-bold text-slate-950 dark:text-white">
                    {resultsCount.toLocaleString()}
                  </span>{" "}
                  {resultsCount === 1 ? "result" : "results"}
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* Result Count & Logic Toggle - Compact version for embedded mode */}
      {embedded && (
        <div className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30 mb-3">
          <div className="flex items-center justify-between gap-4">
            {/* Result Count */}
            <div className="flex-1">
              {isCountLoading ? (
                <span className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <div className="h-3 w-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                  Counting results...
                </span>
              ) : campaignId ? (
                <div className="space-y-1" data-testid="text-result-count">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-lg text-slate-950 dark:text-white">
                      {resultsCount.toLocaleString()}
                    </span>{" "}
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      of {campaignAudienceCount.toLocaleString()} in audience
                    </span>
                  </p>
                  {filterGroup.conditions.length === 0 && (
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Add filters to narrow down campaign audience
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {filterGroup.conditions.length > 0 ? (
                    <p
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                      data-testid="text-result-count"
                    >
                      <span className="font-bold text-lg text-slate-950 dark:text-white">
                        {resultsCount.toLocaleString()}
                      </span>{" "}
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {resultsCount === 1 ? "contact found" : "contacts found"}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Add filters to narrow down contacts
                    </p>
                  )}
                </>
              )}
            </div>
            
            {/* AND/OR Logic Toggle */}
            {activeFilterCount > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Match:</span>
                <ToggleGroup
                  type="single"
                  value={filterGroup.logic}
                  onValueChange={(value) => {
                    if (value === "AND" || value === "OR") {
                      setFilterGroup({ ...filterGroup, logic: value });
                    }
                  }}
                  className="bg-slate-200 dark:bg-slate-800 rounded-md p-0.5"
                >
                  <ToggleGroupItem
                    value="AND"
                    className="px-2.5 py-0.5 text-xs font-medium data-[state=on]:bg-blue-600 data-[state=on]:text-white"
                    data-testid="toggle-logic-and"
                  >
                    ALL
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="OR"
                    className="px-2.5 py-0.5 text-xs font-medium data-[state=on]:bg-blue-600 data-[state=on]:text-white"
                    data-testid="toggle-logic-or"
                  >
                    ANY
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading state for fields - only show if no fallback available */}
      {isFieldsLoading && dynamicFields.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Loading filter fields...</span>
        </div>
      )}

      {/* Body - Filter Conditions (always show since we have fallback fields) */}
      {dynamicFields.length > 0 && (
        <div className="flex-shrink-0">
          <ScrollArea className={embedded ? "max-h-[50vh]" : "max-h-[calc(100vh-280px)]"}>
            <div className={`${embedded ? 'px-0' : 'px-2'} pt-2 pb-2 space-y-2`}>
              {filterGroup.conditions.map((condition) => (
                <div key={condition.id}>
                  <UnifiedFilterRow
                    condition={condition}
                    entityType={entityType}
                    onChange={(updated) => updateCondition(condition.id, updated)}
                    onRemove={() => removeCondition(condition.id)}
                    dynamicFields={dynamicFields}
                    groupedFields={groupedFields}
                  />
                </div>
              ))}

              {/* Empty State */}
              {filterGroup.conditions.length === 0 && (
                <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400">
                  <Filter className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs font-medium">No filters added</p>
                </div>
              )}
            </div>
          </ScrollArea>
          
          {/* Add Condition Button */}
          <div className={`${embedded ? 'px-0' : 'px-2'} pb-2 pt-1`}>
            <Button
              variant="outline"
              onClick={addCondition}
              disabled={dynamicFields.length === 0}
              className="w-full border-dashed border-2 hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors h-10"
              data-testid="button-add-condition"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Filter
            </Button>
          </div>
        </div>
      )}

      {/* Footer - Actions */}
      <div className={`${embedded ? 'p-0 pt-3' : 'p-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'} flex-shrink-0`}>
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={handleClear}
            disabled={activeFilterCount === 0 || isApplying}
            className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 h-10"
            data-testid="button-clear-filters"
          >
            <X className="mr-2 h-4 w-4" />
            Clear All
          </Button>
          <div className="flex-1">
            <Button
              onClick={handleApply}
              disabled={isApplying || validFilterCount === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed h-10"
              data-testid="button-apply-filters"
            >
              {isApplying ? (
                <>
                  <div className="mr-2 h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Applying...
                </>
              ) : validFilterCount === 0 && activeFilterCount > 0 ? (
                "Add values to apply"
              ) : (
                "Apply Filters"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // If embedded mode, just return the content without Sheet wrapper
  if (embedded) {
    return <SidebarContent />;
  }

  return (
    <>
      {/* Desktop: Persistent Sidebar (≥1280px) */}
      <aside className="hidden xl:block w-[320px] shrink-0 border-r border-slate-200 dark:border-slate-700 h-screen overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile: Drawer (<1280px) */}
      <div className="xl:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="relative"
              data-testid="button-open-mobile-filters"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="default"
                  className="ml-2 h-5 px-1.5 text-xs"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] p-0 overflow-y-auto">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
