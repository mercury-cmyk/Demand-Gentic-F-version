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
  grouped: Record;
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
 * - Persistent left sidebar (≥1280px) or drawer ((
    initialFilter || {
      logic: "AND",
      conditions: [],
    }
  );
  const [isApplying, setIsApplying] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Build fallback fields from hardcoded configs (used when API fails or loading)
  const fallbackData = useMemo(() => {
    const getFieldsFromConfig = (fieldConfigs: Record) => {
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
    
    const grouped = fields.reduce((acc: Record, field) => {
      if (!acc[field.category]) {
        acc[field.category] = [];
      }
      acc[field.category].push(field);
      return acc;
    }, {});
    
    return { fields, grouped };
  }, [entityType, includeRelatedEntities]);

  // Fetch dynamic filter fields from API (includes custom fields)
  const { data: filterFieldsData, isLoading: isFieldsLoading, isError } = useQuery({
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
  const { data: countData, isLoading: isCountLoading } = useQuery({
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
    
      {/* Header - Hidden when embedded since parent provides header */}
      {!embedded && (
        
          
            Filters
            {activeFilterCount > 0 && (
              
                {activeFilterCount}
              
            )}
          
          
          {/* Result Count */}
          {filterGroup.conditions.length > 0 && (
            
              {isCountLoading ? (
                "Counting..."
              ) : (
                <>
                  Showing{" "}
                  
                    {resultsCount.toLocaleString()}
                  {" "}
                  {resultsCount === 1 ? "result" : "results"}
                
              )}
            
          )}
        
      )}

      {/* Result Count & Logic Toggle - Compact version for embedded mode */}
      {embedded && (
        
          
            {/* Result Count */}
            
              {isCountLoading ? (
                
                  
                  Counting results...
                
              ) : campaignId ? (
                
                  
                    
                      {resultsCount.toLocaleString()}
                    {" "}
                    
                      of {campaignAudienceCount.toLocaleString()} in audience
                    
                  
                  {filterGroup.conditions.length === 0 && (
                    
                      Add filters to narrow down campaign audience
                    
                  )}
                
              ) : (
                <>
                  {filterGroup.conditions.length > 0 ? (
                    
                      
                        {resultsCount.toLocaleString()}
                      {" "}
                      
                        {resultsCount === 1 ? "contact found" : "contacts found"}
                      
                    
                  ) : (
                    
                      Add filters to narrow down contacts
                    
                  )}
                
              )}
            
            
            {/* AND/OR Logic Toggle */}
            {activeFilterCount > 1 && (
              
                Match:
                 {
                    if (value === "AND" || value === "OR") {
                      setFilterGroup({ ...filterGroup, logic: value });
                    }
                  }}
                  className="bg-slate-200 dark:bg-slate-800 rounded-md p-0.5"
                >
                  
                    ALL
                  
                  
                    ANY
                  
                
              
            )}
          
        
      )}

      {/* Loading state for fields - only show if no fallback available */}
      {isFieldsLoading && dynamicFields.length === 0 && (
        
          
          Loading filter fields...
        
      )}

      {/* Body - Filter Conditions (always show since we have fallback fields) */}
      {dynamicFields.length > 0 && (
        
          
            
              {filterGroup.conditions.map((condition) => (
                
                   updateCondition(condition.id, updated)}
                    onRemove={() => removeCondition(condition.id)}
                    dynamicFields={dynamicFields}
                    groupedFields={groupedFields}
                  />
                
              ))}

              {/* Empty State */}
              {filterGroup.conditions.length === 0 && (
                
                  
                  No filters added
                
              )}
            
          
          
          {/* Add Condition Button */}
          
            
              
              Add Filter
            
          
        
      )}

      {/* Footer - Actions */}
      
        
          
            
            Clear All
          
          
            
              {isApplying ? (
                <>
                  
                  Applying...
                
              ) : validFilterCount === 0 && activeFilterCount > 0 ? (
                "Add values to apply"
              ) : (
                "Apply Filters"
              )}
            
          
        
      
    
  );

  // If embedded mode, just return the content without Sheet wrapper
  if (embedded) {
    return ;
  }

  return (
    <>
      {/* Desktop: Persistent Sidebar (≥1280px) */}
      
        
      

      {/* Mobile: Drawer (
        
          
            
              
              Filters
              {activeFilterCount > 0 && (
                
                  {activeFilterCount}
                
              )}
            
          
          
            
          
        
      
    
  );
}