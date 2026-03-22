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
  const [conditions, setConditions] = useState(
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
    
      
        Queue Filters
        
          
          Add Filter
        
      

      {conditions.length === 0 ? (
        
          No filters applied - all contacts will be queued
        
      ) : (
        
          {conditions.map((condition) => (
             handleConditionChange(condition.id, updated)}
              onRemove={() => handleRemoveCondition(condition.id)}
            />
          ))}
        
      )}

      {hasIncompleteFilters && (
        
          
          Some filters are incomplete. Press Enter to add values
        
      )}
    
  );
}