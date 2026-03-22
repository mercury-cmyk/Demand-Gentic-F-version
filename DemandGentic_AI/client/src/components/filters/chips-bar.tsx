import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FilterValues, type FieldRule, getOperatorLabel, isTextOperator, isNullCheckOperator } from "@shared/filterConfig";
import { format } from "date-fns";

interface ChipsBarProps {
  filters: FilterValues;
  optionLabels?: Record>; // field -> id -> label mapping
  onRemove: (field: keyof FilterValues, value?: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function ChipsBar({
  filters,
  optionLabels = {},
  onRemove,
  onClearAll,
  className
}: ChipsBarProps) {
  // Helper to get display label for a field value
  const getLabel = (field: string, id: string): string => {
    return optionLabels[field]?.[id] || id;
  };

  // Helper to check if array contains FieldRule objects
  const isFieldRuleArray = (arr: unknown[]): arr is FieldRule[] => {
    return arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'operator' in arr[0];
  };

  // Count total active filters
  const totalFilters = Object.entries(filters).reduce((count, [key, value]) => {
    if (key === 'search' && value) return count + 1;
    if (Array.isArray(value) && value.length > 0) {
      if (isFieldRuleArray(value)) {
        // Count chips from FieldRule array
        return count + value.reduce((ruleCount, rule) => {
          if (isNullCheckOperator(rule.operator)) return ruleCount + 1;
          if (rule.values && rule.values.length > 0) return ruleCount + rule.values.length;
          if (rule.query && rule.query.trim()) return ruleCount + 1;
          return ruleCount;
        }, 0);
      }
      return count + value.length;
    }
    if (value && typeof value === 'object' && 'from' in value) {
      if (value.from || value.to) return count + 1;
    }
    return count;
  }, 0);

  // Helper to render chips for a field (handles both legacy string[] and new FieldRule[])
  const renderFieldChips = (field: keyof FilterValues, fieldLabel: string) => {
    const value = filters[field];
    if (!Array.isArray(value) || value.length === 0) return null;

    // Check if it's a FieldRule array
    if (isFieldRuleArray(value)) {
      // Render chips from FieldRule array
      return value.flatMap((rule, ruleIndex) => {
        const chips: JSX.Element[] = [];
        
        if (isNullCheckOperator(rule.operator)) {
          // Null-check operators: render operator label as chip
          chips.push(
            
              {fieldLabel}: {getOperatorLabel(rule.operator)}
               onRemove(field)}
              />
            
          );
        } else if (isTextOperator(rule.operator) && rule.query && rule.query.trim()) {
          // Text operators: render query as chip
          chips.push(
            
              {fieldLabel} {getOperatorLabel(rule.operator)}: "{rule.query}"
               onRemove(field)}
              />
            
          );
        } else if (rule.values && rule.values.length > 0) {
          // Value operators: render each value as chip
          rule.values.forEach((val, valIndex) => {
            chips.push(
              
                {fieldLabel}: {getLabel(field, val)}
                 onRemove(field, val)}
                />
              
            );
          });
        }
        
        return chips;
      });
    }

    // Legacy string[] format
    return value.map((val) => (
      
        {fieldLabel}: {getLabel(field, val as string)}
         onRemove(field, val as string)}
        />
      
    ));
  };

  if (totalFilters === 0) {
    return null;
  }

  return (
    
      
        Active Filters ({totalFilters}):
      

      {/* Search Filter */}
      {filters.search && (
        
          Search: {filters.search}
           onRemove('search')}
          />
        
      )}

      {/* Multi-select Array Filters - use helper to handle both legacy and FieldRule arrays */}
      {renderFieldChips('industries', 'Industry')}
      {renderFieldChips('companySizes', 'Company Size')}
      {renderFieldChips('companyRevenue', 'Revenue')}
      {renderFieldChips('seniorityLevels', 'Seniority')}
      {renderFieldChips('countries', 'Country')}
      {renderFieldChips('states', 'State')}
      {renderFieldChips('cities', 'City')}
      {renderFieldChips('technologies', 'Technology')}
      {/* {renderFieldChips('jobFunctions', 'Job Function')} */}
      {renderFieldChips('departments', 'Department')}
      {renderFieldChips('accountOwners', 'Owner')}

      {/* Date Range Filters */}
      {filters.createdDate && (filters.createdDate.from || filters.createdDate.to) && (
        
          Created: {filters.createdDate.from && format(new Date(filters.createdDate.from), 'MMM d, yyyy')}
          {filters.createdDate.from && filters.createdDate.to && ' - '}
          {filters.createdDate.to && format(new Date(filters.createdDate.to), 'MMM d, yyyy')}
           onRemove('createdDate')}
          />
        
      )}

      {filters.lastActivity && (filters.lastActivity.from || filters.lastActivity.to) && (
        
          Last Activity: {filters.lastActivity.from && format(new Date(filters.lastActivity.from), 'MMM d, yyyy')}
          {filters.lastActivity.from && filters.lastActivity.to && ' - '}
          {filters.lastActivity.to && format(new Date(filters.lastActivity.to), 'MMM d, yyyy')}
           onRemove('lastActivity')}
          />
        
      )}

      {/* Clear All Button */}
      
        Clear All
      
    
  );
}