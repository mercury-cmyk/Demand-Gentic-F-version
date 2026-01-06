import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, AlertCircle } from "lucide-react";
import type { FilterGroup, FilterCondition } from "@shared/filter-types";
import { UnifiedFilterRow } from "@/components/filters/unified-filter-row";

interface QueueFilterComposerProps {
  entityType: "contact" | "account";
  onChange?: (filters: FilterGroup | null, hasIncomplete?: boolean) => void;
  initialFilters?: FilterGroup | null;
}

export function QueueFilterComposer({ 
  entityType, 
  onChange,
  initialFilters 
}: QueueFilterComposerProps) {
  const [conditions, setConditions] = useState<FilterCondition[]>(
    initialFilters?.conditions || []
  );

  // Reset conditions when initialFilters changes (e.g., dialog reopens with campaign defaults)
  useEffect(() => {
    setConditions(initialFilters?.conditions || []);
  }, [initialFilters]);

  // Check if any filters are incomplete
  const hasIncompleteFilters = conditions.some(condition => {
    const needsValues = condition.operator !== 'is_empty' && condition.operator !== 'has_any_value';
    const hasValues = condition.values && condition.values.length > 0;
    return needsValues && !hasValues;
  });

  useEffect(() => {
    if (onChange) {
      if (conditions.length === 0) {
        onChange(null, false);
      } else {
        // Only emit valid filters - strip out incomplete ones
        const validConditions = conditions.filter(condition => {
          const needsValues = condition.operator !== 'is_empty' && condition.operator !== 'has_any_value';
          const hasValues = condition.values && condition.values.length > 0;
          return !needsValues || hasValues;
        });

        if (validConditions.length > 0) {
          onChange({
            logic: "AND",
            conditions: validConditions
          }, hasIncompleteFilters);
        } else {
          // All filters are incomplete - don't emit any filters
          onChange(null, hasIncompleteFilters);
        }
      }
    }
  }, [conditions, onChange, hasIncompleteFilters]);

  const handleAddCondition = () => {
    const newCondition: FilterCondition = {
      id: `${Date.now()}-${Math.random()}`,
      field: "jobTitle",
      operator: "contains",
      values: []
    };
    setConditions([...conditions, newCondition]);
  };

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const handleConditionChange = (id: string, updatedCondition: FilterCondition) => {
    setConditions(conditions.map(c => 
      c.id === id ? updatedCondition : c
    ));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Queue Filters</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddCondition}
          data-testid="button-add-filter"
          className="h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Filter
        </Button>
      </div>

      {conditions.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-md">
          No filters applied - all contacts will be queued
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition) => (
            <UnifiedFilterRow
              key={condition.id}
              entityType={entityType}
              condition={condition}
              onChange={(updated) => handleConditionChange(condition.id, updated)}
              onRemove={() => handleRemoveCondition(condition.id)}
            />
          ))}
        </div>
      )}

      {hasIncompleteFilters && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-2.5">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Some filters are incomplete. Press <kbd className="px-1.5 py-0.5 text-xs bg-background border rounded">Enter</kbd> to add values</span>
        </div>
      )}
    </div>
  );
}
