import { useState, useEffect } from "react";
import { Filter, Plus, X, Search, ChevronDown, ChevronRight, HelpCircle, Hash } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { 
  FilterGroup, 
  FilterCondition, 
  textOperators,
  numberOperators,
  arrayOperators,
  booleanOperators,
  enumOperators,
  operatorLabels,
  operatorDescriptions,
  type TextOperator,
  type NumberOperator,
  type ArrayOperator,
  type BooleanOperator,
  type EntityType
} from "@shared/filter-types";
import { REVENUE_RANGE_VALUES, STAFF_COUNT_RANGE_VALUES } from "@shared/schema";

interface AudienceScope {
  listIds?: string[];
  segmentIds?: string[];
  campaignId?: string;
}

interface FilterBuilderProps {
  entityType: EntityType;
  onApplyFilter: (filterGroup: FilterGroup | undefined) => void;
  initialFilter?: FilterGroup;
  includeRelatedEntities?: boolean;
  audienceScope?: AudienceScope;
}

interface FilterFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'array' | 'boolean' | 'enum';
  operators: string[];
  category: string;
}

interface FilterFieldsResponse {
  fields: FilterFieldConfig[];
  grouped: Record;
}

export function FilterBuilder({ entityType, onApplyFilter, initialFilter, includeRelatedEntities = false, inline = false, audienceScope }: FilterBuilderProps & { inline?: boolean }) {
  const [filterGroup, setFilterGroup] = useState(
    initialFilter || {
      logic: 'AND',
      conditions: []
    }
  );
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState>({});

  // Fetch dynamic filter fields from API - include related entities if flag is set
  const { data: filterFieldsData } = useQuery({
    queryKey: [`/api/filters/fields/entity/${entityType}`, includeRelatedEntities],
    queryFn: async () => {
      const url = includeRelatedEntities 
        ? `/api/filters/fields/entity/${entityType}?includeRelated=true`
        : `/api/filters/fields/entity/${entityType}`;
      const response = await apiRequest("GET", url);
      const data = await response.json();
      console.log('Filter fields loaded:', data); // Debug log
      return data;
    }
  });

  // Auto-expand first category on load
  useEffect(() => {
    if (filterFieldsData?.grouped && Object.keys(expandedCategories).length === 0) {
      const firstCategory = Object.keys(filterFieldsData.grouped)[0];
      if (firstCategory) {
        setExpandedCategories({ [firstCategory]: true });
      }
    }
  }, [filterFieldsData]);

  const filterFields = filterFieldsData?.fields || [];
  const groupedFields = filterFieldsData?.grouped || {};

  // Fetch filter count in real-time (scoped to audience if audienceScope provided)
  const { data: countData, isLoading: isCountLoading } = useQuery({
    queryKey: [`/api/filters/count/${entityType}`, filterGroup, audienceScope],
    queryFn: async () => {
      if (filterGroup.conditions.length === 0) {
        return { count: 0 };
      }
      const requestBody: { filterGroup: FilterGroup; audienceScope?: AudienceScope } = { filterGroup };
      if (audienceScope) {
        requestBody.audienceScope = audienceScope;
      }
      const response = await apiRequest('POST', `/api/filters/count/${entityType}`, requestBody);
      return response.json();
    },
    enabled: open && filterGroup.conditions.length > 0,
    refetchOnWindowFocus: false
  });

  const resultsCount = countData?.count ?? 0;

  // Filter fields by search term
  const filteredGroupedFields = Object.entries(groupedFields).reduce((acc, [category, fields]) => {
    if (!searchTerm) {
      acc[category] = fields;
      return acc;
    }
    
    const matchingFields = fields.filter(field => 
      field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      field.key.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (matchingFields.length > 0) {
      acc[category] = matchingFields;
    }
    
    return acc;
  }, {} as Record);

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchTerm) {
      const newExpanded: Record = {};
      Object.keys(filteredGroupedFields).forEach(cat => {
        newExpanded[cat] = true;
      });
      setExpandedCategories(newExpanded);
    }
  }, [searchTerm]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const addCondition = () => {
    const firstField = filterFields[0];
    const newCondition: FilterCondition = {
      id: `${Date.now()}-${Math.random()}`,
      field: firstField?.key || 'name',
      operator: 'equals',
      value: '',
      values: []
    };
    setFilterGroup({
      ...filterGroup,
      conditions: [...filterGroup.conditions, newCondition]
    });
  };

  const removeCondition = (id: string) => {
    setFilterGroup({
      ...filterGroup,
      conditions: filterGroup.conditions.filter(c => c.id !== id)
    });
  };

  const updateCondition = (id: string, updates: Partial) => {
    setFilterGroup({
      ...filterGroup,
      conditions: filterGroup.conditions.map(c =>
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };

  const getFieldConfig = (fieldKey: string): FilterFieldConfig | undefined => {
    return filterFields.find(f => f.key === fieldKey);
  };

  const getOperatorsForField = (field: string) => {
    const fieldConfig = getFieldConfig(field);
    const fieldType = fieldConfig?.type;
    switch (fieldType) {
      case 'text':
        return textOperators;
      case 'number':
        return numberOperators;
      case 'array':
        return arrayOperators;
      case 'boolean':
        return booleanOperators;
      case 'enum':
        return enumOperators;
      default:
        return textOperators;
    }
  };

  const renderValueInput = (condition: FilterCondition) => {
    const fieldConfig = getFieldConfig(condition.field);
    const fieldType = fieldConfig?.type || 'text';
    const operator = condition.operator;

    if (fieldType === 'boolean') {
      return (
         updateCondition(condition.id, { value: val === 'true' ? 'true' : 'false' })}
        >
          
            
          
          
            Yes
            No
          
        
      );
    }

    if (fieldType === 'enum') {
      // Get enum values based on field
      const getEnumValues = (field: string) => {
        if (field === 'revenueRange') {
          return REVENUE_RANGE_VALUES;
        }
        if (field === 'employeesSizeRange') {
          return STAFF_COUNT_RANGE_VALUES;
        }
        return [];
      };

      const enumValues = getEnumValues(condition.field);
      
      return (
         updateCondition(condition.id, { value: val })}
        >
          
            
          
          
            {enumValues.map((val) => (
              
                {val}
              
            ))}
          
        
      );
    }

    if (operator === 'between' as any) {
      const rangeValue = (condition.value as any) || { from: '', to: '' };
      const isNumber = fieldType === 'number';
      return (
        
           updateCondition(condition.id, {
              value: { 
                ...rangeValue, 
                from: isNumber ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value 
              }
            })}
            data-testid={`input-value-from-${condition.id}`}
          />
           updateCondition(condition.id, {
              value: { 
                ...rangeValue, 
                to: isNumber ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value 
              }
            })}
            data-testid={`input-value-to-${condition.id}`}
          />
        
      );
    }

    if (operator === 'is_empty' || operator === 'has_any_value') {
      return (
        
          
            {operator === 'is_empty' ? 'Will find empty/null values' : 'Will find non-empty values'}
          
        
      );
    }

    if (fieldType === 'array' && (operator === 'contains' || operator === 'not_contains')) {
      const arrayValue = Array.isArray(condition.value) ? condition.value.join(', ') : '';
      return (
         {
            const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
            updateCondition(condition.id, { value: values });
          }}
          data-testid={`input-value-${condition.id}`}
        />
      );
    }

    const isNumber = fieldType === 'number';
    return (
       updateCondition(condition.id, {
          value: isNumber ? Number(e.target.value) : e.target.value
        })}
        data-testid={`input-value-${condition.id}`}
      />
    );
  };

  const handleApply = () => {
    console.log('[FilterBuilder] Applying filter group:', filterGroup);
    
    // Call the callback first
    const filterToApply = filterGroup.conditions.length === 0 ? undefined : filterGroup;
    onApplyFilter(filterToApply);
    
    // Then close the sheet after a brief delay to ensure callback completes
    setTimeout(() => {
      setOpen(false);
    }, 0);
  };

  const handleClear = () => {
    setFilterGroup({
      logic: 'AND',
      conditions: []
    });
    
    // Call the callback first
    onApplyFilter(undefined);
    
    // Then close the sheet after a brief delay to ensure callback completes
    setTimeout(() => {
      setOpen(false);
    }, 0);
  };

  const activeFilterCount = filterGroup.conditions.length;

  return (
    
      
        
          
          Filters
          {activeFilterCount > 0 && (
            
              {activeFilterCount}
            
          )}
        
      
      
        
          
            Advanced Filters
            
              
                
                  
                
                
                  
                    Advanced Filter Options
                    
                      Equals (=): Exact match
                      Contains: Partial match
                      Has Value: Not empty
                      Is Empty: No value
                    
                  
                
              
            
          
          
            Build complex filters using AND/OR logic
          
          {filterGroup.conditions.length > 0 && (
            
              
              
                {isCountLoading ? (
                  Counting...
                ) : (
                  
                    {resultsCount.toLocaleString()} {resultsCount === 1 ? 'result' : 'results'}
                  
                )}
              
            
          )}
        

        
          {/* Logic Selector */}
          
            Match
             setFilterGroup({ ...filterGroup, logic: val })}
            >
              
                
              
              
                All (AND)
                Any (OR)
              
            
            of the conditions
          

          {/* Conditions */}
          
            {filterGroup.conditions.map((condition, index) => {
              const fieldConfig = getFieldConfig(condition.field);
              return (
                
                  
                    Condition {index + 1}
                     removeCondition(condition.id)}
                      data-testid={`button-remove-condition-${condition.id}`}
                    >
                      
                    
                  

                  
                    {/* Field Selector with Categories */}
                    
                      Field
                       {
                          const operators = getOperatorsForField(val);
                          updateCondition(condition.id, {
                            field: val,
                            operator: operators[0] as any,
                            value: ''
                          });
                        }}
                      >
                        
                          
                            {fieldConfig?.label || condition.field}
                          
                        
                        
                          
                            
                              
                               setSearchTerm(e.target.value)}
                                className="pl-8 h-9"
                                data-testid="input-search-fields"
                              />
                            
                          
                          
                          
                            {Object.entries(filteredGroupedFields).map(([category, fields]) => (
                               toggleCategory(category)}
                              >
                                
                                  {expandedCategories[category] ? (
                                    
                                  ) : (
                                    
                                  )}
                                  {category}
                                  
                                    {fields.length}
                                  
                                
                                
                                  {fields.map((field) => (
                                    
                                      {field.label}
                                    
                                  ))}
                                
                              
                            ))}
                            
                            {Object.keys(filteredGroupedFields).length === 0 && (
                              
                                No fields match "{searchTerm}"
                              
                            )}
                          
                        
                      
                    

                    {/* Operator Selector */}
                    
                      
                        Operator
                        {operatorDescriptions[condition.operator] && (
                          
                            
                              
                                
                              
                              
                                {operatorDescriptions[condition.operator]}
                              
                            
                          
                        )}
                      
                       updateCondition(condition.id, { operator: val as any, value: '' })}
                      >
                        
                          
                        
                        
                          {getOperatorsForField(condition.field).map((op) => (
                            
                              {operatorLabels[op] || op.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                            
                          ))}
                        
                      
                    

                    {/* Value Input */}
                    
                      Value
                      {renderValueInput(condition)}
                    
                  
                
              );
            })}

            {filterGroup.conditions.length === 0 && (
              
                No filters added. Click below to add your first filter.
              
            )}
          

          {/* Add Condition Button */}
          
            
            Add Condition
          
        

        
          
            Clear All
          
          
            Apply Filters
          
        
      
    
  );
}