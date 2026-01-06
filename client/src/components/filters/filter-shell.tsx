import { useState, useEffect, useMemo, useCallback } from "react";
import { Filter, Save, FolderOpen, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  FilterValues,
  getAllowedFields,
  getFieldConfig,
  getFieldsByCategory,
  UserRole,
  MODULE_FILTERS,
  type FieldRule,
  isNullCheckOperator
} from "@shared/filterConfig";
import { MultiSelectFilter } from "./multi-select-filter";
import { AsyncTypeaheadFilter } from "./async-typeahead-filter";
import { DateRangeFilter } from "./date-range-filter";
import { OperatorBasedFilter } from "./operator-based-filter";
import { ChipsBar } from "./chips-bar";
import type { Segment } from "@shared/schema";

interface FilterShellProps {
  module: keyof typeof MODULE_FILTERS;
  onApplyFilters: (filters: FilterValues) => void;
  initialFilters?: FilterValues;
  userRole?: UserRole;
  className?: string;
}

export function FilterShell({
  module,
  onApplyFilters,
  initialFilters = {},
  userRole = "Agent",
  className
}: FilterShellProps) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(initialFilters);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [optionLabels, setOptionLabels] = useState<Record<string, Record<string, string>>>({});
  const { toast } = useToast();

  // Helper to register option labels from child components (memoized to prevent render loops)
  const registerOptionLabels = useCallback((field: string, labels: Record<string, string>) => {
    setOptionLabels(prev => ({
      ...prev,
      [field]: { ...prev[field], ...labels }
    }));
  }, []);

  // Get allowed fields for this module and user role
  const allowedFields = useMemo(() => {
    return getAllowedFields(module, userRole);
  }, [module, userRole]);

  // Group fields by category for organized display
  const fieldsByCategory = useMemo(() => {
    return getFieldsByCategory(allowedFields);
  }, [allowedFields]);

  // Fetch segments for this module
  const { data: segments = [] } = useQuery<Segment[]>({
    queryKey: [`/api/segments`],
  });

  const moduleSegments = segments.filter(seg => seg.entityType === module);

  // Save segment mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; filters: FilterValues }) => {
      const res = await apiRequest("POST", `/api/segments`, {
        name: data.name,
        description: `Saved filters for ${module}`,
        entityType: module,
        definitionJson: data.filters
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/segments'] });
      toast({
        title: "Segment saved",
        description: "Your filter configuration has been saved"
      });
      setSaveDialogOpen(false);
      setSegmentName("");
    },
    onError: (error: any) => {
      toast({
        title: "Error saving segment",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete segment mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/segments/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/segments'] });
      toast({
        title: "Segment deleted",
        description: "The saved segment has been removed"
      });
    }
  });

  // Update filter values
  const updateFilter = (field: keyof FilterValues, value: any) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Remove specific filter value
  const removeFilterValue = (field: keyof FilterValues, value?: string) => {
    if (value && Array.isArray(filters[field])) {
      const arr = filters[field];
      const firstItem = arr[0];
      
      // Check if this is a FieldRule array
      if (firstItem && typeof firstItem === 'object' && 'operator' in firstItem) {
        const rules = arr as FieldRule[];
        const newRules = rules.map(rule => {
          // Handle value-based rules (chip selections)
          if (rule.values && rule.values.includes(value)) {
            return {
              ...rule,
              values: rule.values.filter(v => v !== value)
            };
          }
          // Handle query-based rules (text operators)
          // If the value matches the query, clear it
          if (rule.query && rule.query === value) {
            return {
              ...rule,
              query: undefined
            };
          }
          return rule;
        }).filter(rule => {
          // Remove empty rules
          if (rule.values && rule.values.length > 0) return true;
          if (rule.query && rule.query.trim()) return true;
          return false;
        });
        updateFilter(field, newRules.length > 0 ? newRules : []);
      } else {
        // Legacy string array
        updateFilter(field, arr.filter(v => v !== value));
      }
    } else {
      // Clear entire filter
      const config = getFieldConfig(field);
      if (config && config.operatorSupport && config.operatorSupport !== 'none') {
        updateFilter(field, []);
      } else {
        updateFilter(field, field === 'search' ? '' : field.includes('Date') || field.includes('Activity') ? { from: undefined, to: undefined } : []);
      }
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    const emptyFilters: any = {};
    allowedFields.forEach(field => {
      const config = getFieldConfig(field);
      if (config.type === 'date-range') {
        emptyFilters[field] = { from: undefined, to: undefined };
      } else if (config.type === 'multi' || config.type === 'typeahead') {
        // Check if field supports operators
        if (config.operatorSupport && config.operatorSupport !== 'none') {
          // Initialize as empty FieldRule array
          emptyFilters[field] = [];
        } else {
          // Legacy string array
          emptyFilters[field] = [];
        }
      } else {
        emptyFilters[field] = '';
      }
    });
    setFilters(emptyFilters as FilterValues);
  };

  // Apply filters
  const handleApply = () => {
    onApplyFilters(filters);
    setOpen(false);
  };

  // Load segment
  const loadSegment = (segment: Segment) => {
    const savedFilters = segment.definitionJson as FilterValues;
    setFilters(savedFilters);
    setLoadDialogOpen(false);
    toast({
      title: "Segment loaded",
      description: `Loaded filters from "${segment.name}"`
    });
  };

  // Save segment
  const handleSaveSegment = () => {
    if (!segmentName.trim()) {
      toast({
        title: "Segment name required",
        description: "Please enter a name for this segment",
        variant: "destructive"
      });
      return;
    }
    saveMutation.mutate({ name: segmentName, filters });
  };

  // Count active filters (total)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'search' && value) count++;
      
      // Handle FieldRule arrays (operator-based filters)
      if (Array.isArray(value) && value.length > 0) {
        const firstItem = value[0];
        if (firstItem && typeof firstItem === 'object' && 'operator' in firstItem) {
          // This is a FieldRule array
          const rules = value as FieldRule[];
          rules.forEach(rule => {
            if (isNullCheckOperator(rule.operator)) {
              // Null-check operators count as 1 active filter
              count++;
            } else if (rule.values && rule.values.length > 0) {
              count += rule.values.length;
            } else if (rule.query && rule.query.trim()) {
              count++;
            }
          });
        } else {
          // Legacy string array
          count += value.length;
        }
      }
      
      if (value && typeof value === 'object' && 'from' in value) {
        if (value.from || value.to) count++;
      }
    });
    return count;
  }, [filters]);

  // Count active filters per category
  const getActiveCategoryCount = useCallback((categoryFields: (keyof FilterValues)[]) => {
    let count = 0;
    categoryFields.forEach(field => {
      const value = filters[field];
      if (field === 'search' && value) count++;
      
      // Handle FieldRule arrays (operator-based filters)
      if (Array.isArray(value) && value.length > 0) {
        const firstItem = value[0];
        if (firstItem && typeof firstItem === 'object' && 'operator' in firstItem) {
          // This is a FieldRule array
          const rules = value as FieldRule[];
          rules.forEach(rule => {
            if (isNullCheckOperator(rule.operator)) {
              // Null-check operators count as 1 active filter
              count++;
            } else if (rule.values && rule.values.length > 0) {
              count += rule.values.length;
            } else if (rule.query && rule.query.trim()) {
              count++;
            }
          });
        } else {
          // Legacy string array
          count += value.length;
        }
      }
      
      if (value && typeof value === 'object' && 'from' in value) {
        if (value.from || value.to) count++;
      }
    });
    return count;
  }, [filters]);

  // Render filter component based on field type
  const renderFilterField = (field: keyof FilterValues) => {
    const config = getFieldConfig(field);
    if (!config) return null;

    switch (config.type) {
      case 'text':
        return (
          <div key={field} className="space-y-2">
            <Label>{config.label}</Label>
            <Input
              placeholder={config.placeholder}
              value={(filters[field] as string) || ''}
              onChange={(e) => updateFilter(field, e.target.value)}
              data-testid={`input-${field}`}
            />
          </div>
        );

      case 'multi':
        // Check if field supports operators
        if (config.operatorSupport && config.operatorSupport !== 'none') {
          return (
            <OperatorBasedFilter
              key={field}
              field={field}
              rules={(filters[field] as FieldRule[]) || []}
              onChange={(rules) => updateFilter(field, rules)}
              onOptionsLoaded={(labels) => registerOptionLabels(field as string, labels)}
            />
          );
        }
        
        // Legacy multi-select (no operators)
        return (
          <div key={field} className="space-y-2">
            <Label>{config.label}</Label>
            <MultiSelectFilter
              label={config.label}
              source={config.source || field}
              value={(filters[field] as string[]) || []}
              onChange={(value) => updateFilter(field, value)}
              max={config.max}
              placeholder={config.placeholder}
              testId={`filter-${field}`}
              onOptionsLoaded={(labels) => registerOptionLabels(field as string, labels)}
            />
          </div>
        );

      case 'typeahead':
        const parents: Record<string, string[]> = {};
        if (config.parents) {
          config.parents.forEach(parentField => {
            parents[parentField as keyof FilterValues] = (filters[parentField as keyof FilterValues] as string[]) || [];
          });
        }

        return (
          <div key={field} className="space-y-2">
            <Label>{config.label}</Label>
            <AsyncTypeaheadFilter
              label={config.label}
              source={config.source || field}
              value={(filters[field] as string[]) || []}
              onChange={(value) => updateFilter(field, value)}
              max={config.max}
              placeholder={config.placeholder}
              parents={parents}
              testId={`filter-${field}`}
              onOptionsLoaded={(labels) => registerOptionLabels(field as string, labels)}
            />
          </div>
        );

      case 'date-range':
        return (
          <div key={field} className="space-y-2">
            <Label>{config.label}</Label>
            <DateRangeFilter
              label={config.label}
              value={filters[field] as { from?: string; to?: string } || {}}
              onChange={(value) => updateFilter(field, value)}
              placeholder={config.placeholder}
              testId={`filter-${field}`}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className={className}>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" data-testid="button-open-filters">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[500px] sm:w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filter {module.charAt(0).toUpperCase() + module.slice(1)}</SheetTitle>
              <SheetDescription>
                Refine your results using the filters below
              </SheetDescription>
            </SheetHeader>

            <div className="py-6">
              {/* Render filters in collapsible accordion categories */}
              <Accordion 
                type="multiple" 
                defaultValue={Object.keys(fieldsByCategory)}
                className="space-y-2"
              >
                {Object.entries(fieldsByCategory).map(([category, fields]) => {
                  const activeCategoryCount = getActiveCategoryCount(fields as (keyof FilterValues)[]);
                  
                  return (
                    <AccordionItem key={category} value={category} className="border rounded-md px-4">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center justify-between w-full pr-2">
                          <span className="text-sm font-medium">{category}</span>
                          {activeCategoryCount > 0 && (
                            <Badge variant="secondary" className="ml-2">
                              {activeCategoryCount}
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 pt-2">
                        <div className="space-y-4">
                          {fields.map(field => renderFilterField(field as keyof FilterValues))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>

            <SheetFooter className="flex flex-row items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoadDialogOpen(true)}
                  data-testid="button-load-segment"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Load
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveDialogOpen(true)}
                  disabled={activeFilterCount === 0}
                  data-testid="button-save-segment"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearAllFilters}
                  data-testid="button-clear-filters"
                >
                  Clear
                </Button>
                <Button onClick={handleApply} data-testid="button-apply-filters">
                  Apply Filters
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Active Filters Chips */}
        {activeFilterCount > 0 && (
          <div className="mt-4">
            <ChipsBar
              filters={filters}
              optionLabels={optionLabels}
              onRemove={removeFilterValue}
              onClearAll={clearAllFilters}
            />
          </div>
        )}
      </div>

      {/* Save Segment Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Filter Segment</DialogTitle>
            <DialogDescription>
              Save your current filter configuration for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="segment-name">Segment Name</Label>
              <Input
                id="segment-name"
                placeholder="e.g., High-value Enterprise Leads"
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                data-testid="input-segment-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveSegment}
              disabled={saveMutation.isPending}
              data-testid="button-confirm-save-segment"
            >
              {saveMutation.isPending ? "Saving..." : "Save Segment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Segment Dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Saved Segment</DialogTitle>
            <DialogDescription>
              Select a saved filter configuration to load
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {moduleSegments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No saved segments found for {module}
              </p>
            ) : (
              <div className="space-y-2">
                {moduleSegments.map((segment) => (
                  <div
                    key={segment.id}
                    className="flex items-center justify-between p-3 border rounded-md hover:bg-accent"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{segment.name}</p>
                      {segment.description && (
                        <p className="text-sm text-muted-foreground">{segment.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadSegment(segment)}
                        data-testid={`button-load-${segment.id}`}
                      >
                        Load
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(segment.id)}
                        data-testid={`button-delete-${segment.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
