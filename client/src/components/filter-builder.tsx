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
  grouped: Record<string, FilterFieldConfig[]>;
}

export function FilterBuilder({ entityType, onApplyFilter, initialFilter, includeRelatedEntities = false, inline = false, audienceScope }: FilterBuilderProps & { inline?: boolean }) {
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(
    initialFilter || {
      logic: 'AND',
      conditions: []
    }
  );
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Fetch dynamic filter fields from API - include related entities if flag is set
  const { data: filterFieldsData } = useQuery<FilterFieldsResponse>({
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
  const { data: countData, isLoading: isCountLoading } = useQuery<{ count: number }>({
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
  }, {} as Record<string, FilterFieldConfig[]>);

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchTerm) {
      const newExpanded: Record<string, boolean> = {};
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

  const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
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
        <Select
          value={condition.value ? 'true' : 'false'}
          onValueChange={(val) => updateCondition(condition.id, { value: val === 'true' ? 'true' : 'false' })}
        >
          <SelectTrigger data-testid={`select-value-${condition.id}`}>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
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
        <Select
          value={condition.value as string || ''}
          onValueChange={(val) => updateCondition(condition.id, { value: val })}
        >
          <SelectTrigger data-testid={`select-value-${condition.id}`}>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {enumValues.map((val) => (
              <SelectItem key={val} value={val}>
                {val}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (operator === 'between' as any) {
      const rangeValue = (condition.value as any) || { from: '', to: '' };
      const isNumber = fieldType === 'number';
      return (
        <div className="flex gap-2">
          <Input
            type={isNumber ? 'number' : 'text'}
            placeholder="From"
            value={rangeValue.from}
            onChange={(e) => updateCondition(condition.id, {
              value: { 
                ...rangeValue, 
                from: isNumber ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value 
              }
            })}
            data-testid={`input-value-from-${condition.id}`}
          />
          <Input
            type={isNumber ? 'number' : 'text'}
            placeholder="To"
            value={rangeValue.to}
            onChange={(e) => updateCondition(condition.id, {
              value: { 
                ...rangeValue, 
                to: isNumber ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value 
              }
            })}
            data-testid={`input-value-to-${condition.id}`}
          />
        </div>
      );
    }

    if (operator === 'is_empty' || operator === 'has_any_value') {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-muted rounded">
          <span className="font-medium">
            {operator === 'is_empty' ? 'Will find empty/null values' : 'Will find non-empty values'}
          </span>
        </div>
      );
    }

    if (fieldType === 'array' && (operator === 'contains' || operator === 'not_contains')) {
      const arrayValue = Array.isArray(condition.value) ? condition.value.join(', ') : '';
      return (
        <Input
          placeholder="Enter values separated by commas"
          value={arrayValue}
          onChange={(e) => {
            const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
            updateCondition(condition.id, { value: values });
          }}
          data-testid={`input-value-${condition.id}`}
        />
      );
    }

    const isNumber = fieldType === 'number';
    return (
      <Input
        type={isNumber ? 'number' : 'text'}
        placeholder="Enter value"
        value={condition.value as string}
        onChange={(e) => updateCondition(condition.id, {
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative" data-testid="button-open-filters">
          <Filter className="mr-2 h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="default" className="ml-2 h-5 px-1.5 text-xs" data-testid="badge-filter-count">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-3">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">Advanced Filters</SheetTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold">Advanced Filter Options</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><strong>Equals (=)</strong>: Exact match</li>
                      <li><strong>Contains</strong>: Partial match</li>
                      <li><strong>Has Value</strong>: Not empty</li>
                      <li><strong>Is Empty</strong>: No value</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <SheetDescription className="text-xs">
            Build complex filters using AND/OR logic
          </SheetDescription>
          {filterGroup.conditions.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium">
                {isCountLoading ? (
                  <span className="text-muted-foreground">Counting...</span>
                ) : (
                  <span className="text-primary">
                    {resultsCount.toLocaleString()} {resultsCount === 1 ? 'result' : 'results'}
                  </span>
                )}
              </span>
            </div>
          )}
        </SheetHeader>

        <div className="space-y-3 py-3">
          {/* Logic Selector */}
          <div className="flex items-center gap-3">
            <Label className="text-xs">Match</Label>
            <Select
              value={filterGroup.logic}
              onValueChange={(val: 'AND' | 'OR') => setFilterGroup({ ...filterGroup, logic: val })}
            >
              <SelectTrigger className="w-28 h-8" data-testid="select-logic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">All (AND)</SelectItem>
                <SelectItem value="OR">Any (OR)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">of the conditions</span>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            {filterGroup.conditions.map((condition, index) => {
              const fieldConfig = getFieldConfig(condition.field);
              return (
                <div key={condition.id} className="border rounded-md p-2.5 space-y-2" data-testid={`filter-condition-${condition.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Condition {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeCondition(condition.id)}
                      data-testid={`button-remove-condition-${condition.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    {/* Field Selector with Categories */}
                    <div>
                      <Label className="text-xs">Field</Label>
                      <Select
                        value={condition.field}
                        onValueChange={(val) => {
                          const operators = getOperatorsForField(val);
                          updateCondition(condition.id, {
                            field: val,
                            operator: operators[0] as any,
                            value: ''
                          });
                        }}
                      >
                        <SelectTrigger data-testid={`select-field-${condition.id}`}>
                          <SelectValue>
                            {fieldConfig?.label || condition.field}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px]">
                          <div className="px-2 py-2 sticky top-0 bg-background z-10">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search fields..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-9"
                                data-testid="input-search-fields"
                              />
                            </div>
                          </div>
                          
                          <div className="mt-2">
                            {Object.entries(filteredGroupedFields).map(([category, fields]) => (
                              <Collapsible
                                key={category}
                                open={expandedCategories[category]}
                                onOpenChange={() => toggleCategory(category)}
                              >
                                <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-sm font-medium hover:bg-accent rounded-sm">
                                  {expandedCategories[category] ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                  {category}
                                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-xs">
                                    {fields.length}
                                  </Badge>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pl-4">
                                  {fields.map((field) => (
                                    <SelectItem key={field.key} value={field.key}>
                                      {field.label}
                                    </SelectItem>
                                  ))}
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                            
                            {Object.keys(filteredGroupedFields).length === 0 && (
                              <div className="text-center py-4 text-sm text-muted-foreground">
                                No fields match "{searchTerm}"
                              </div>
                            )}
                          </div>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Operator Selector */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label className="text-xs">Operator</Label>
                        {operatorDescriptions[condition.operator] && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">{operatorDescriptions[condition.operator]}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <Select
                        value={condition.operator}
                        onValueChange={(val) => updateCondition(condition.id, { operator: val as any, value: '' })}
                      >
                        <SelectTrigger data-testid={`select-operator-${condition.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getOperatorsForField(condition.field).map((op) => (
                            <SelectItem key={op} value={op}>
                              {operatorLabels[op] || op.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Value Input */}
                    <div>
                      <Label className="text-xs">Value</Label>
                      {renderValueInput(condition)}
                    </div>
                  </div>
                </div>
              );
            })}

            {filterGroup.conditions.length === 0 && (
              <div className="text-center py-4 text-xs text-muted-foreground">
                No filters added. Click below to add your first filter.
              </div>
            )}
          </div>

          {/* Add Condition Button */}
          <Button
            variant="outline"
            onClick={addCondition}
            className="w-full h-8"
            size="sm"
            data-testid="button-add-condition"
            disabled={filterFields.length === 0}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Condition
          </Button>
        </div>

        <SheetFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClear} size="sm" data-testid="button-clear-filters">
            Clear All
          </Button>
          <Button onClick={handleApply} size="sm" data-testid="button-apply-filters">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
